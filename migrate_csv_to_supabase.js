const fs = require('fs');
const path = require('path');

// 1. config.js 또는 환경 변수에서 Supabase 설정 가져오기
function loadConfig() {
    const urlFromEnv = process.env.SUPABASE_URL;
    const keyFromEnv = process.env.SUPABASE_KEY;
    if (urlFromEnv && keyFromEnv) {
        return { supabaseURL: urlFromEnv, supabaseKey: keyFromEnv };
    }

    try {
        const configPath = path.join(__dirname, 'config.js');
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            const urlMatch = content.match(/supabaseURL\s*:\s*["']([^"']*)["']/);
            const keyMatch = content.match(/supabaseKey\s*:\s*["']([^"']*)["']/);
            return {
                supabaseURL: urlMatch ? urlMatch[1] : "",
                supabaseKey: keyMatch ? keyMatch[1] : ""
            };
        }
    } catch (e) {
        console.error('config.js 로드 중 에러 발생:', e.message);
    }
    return { supabaseURL: "", supabaseKey: "" };
}

const { supabaseURL, supabaseKey } = loadConfig();

if (!supabaseURL || !supabaseKey) {
    console.error('❌ Supabase URL 또는 Key가 설정되지 않았습니다.');
    console.error('config.js에 설정하거나 환경 변수(SUPABASE_URL, SUPABASE_KEY)를 지정해주세요.');
    process.exit(1);
}

// CSV 한 줄 스마트 파싱 (따옴표 내 쉼표 처리)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

// 날짜 포맷 표준화 (YYYY-MM-DD)
function formatDate(dateStr) {
    if (!dateStr) return '';
    // YYYY.MM.DD 또는 YYYY/MM/DD 형식 변환
    const clean = dateStr.replace(/[\.\/]/g, '-');
    const parts = clean.split('-');
    if (parts.length === 3) {
        const y = parts[0].padStart(4, '20'); // 2자리 연도 예방
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return dateStr;
}

async function migrate() {
    const recordDir = path.join(__dirname, 'record');
    if (!fs.existsSync(recordDir)) {
        console.error('❌ record 폴더를 찾을 수 없습니다.');
        return;
    }

    const files = fs.readdirSync(recordDir).filter(file => file.endsWith('.csv'));
    if (files.length === 0) {
        console.log('ℹ️ record 폴더가 비어 있습니다. 마이그레이션할 CSV 파일이 없습니다.');
        return;
    }

    console.log(`📂 record 폴더에서 ${files.length}개의 CSV 파일 발견. 마이그레이션을 시작합니다...`);

    for (const file of files) {
        const accountName = path.basename(file, '.csv');
        const filePath = path.join(recordDir, file);
        console.log(`\n--------------------------------------------`);
        console.log(`📄 계좌 [${accountName}] 마이그레이션 시작 (파일: ${file})`);

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

        if (lines.length <= 1) {
            console.log(`⚠️ 데이터 행이 없습니다.`);
            continue;
        }

        // 헤더 인덱스 매핑 찾기
        const headerLine = lines[0];
        const headers = parseCSVLine(headerLine);
        console.log(`📋 감지된 헤더:`, headers.join(' | '));

        const colIndex = {
            date: headers.findIndex(h => h.includes('날짜') || h.includes('일자')),
            stockName: headers.findIndex(h => h.includes('종목명')),
            stockCode: headers.findIndex(h => h.includes('종목코드') || h.includes('티커') || h.includes('Ticker')),
            currency: headers.findIndex(h => h.includes('통화') || h.includes('화폐')),
            type: headers.findIndex(h => h.includes('종류') || h.includes('구분')),
            priceKrw: headers.findIndex(h => h.includes('가격원') || h.includes('원화단가')),
            priceForeign: headers.findIndex(h => h.includes('가격외') || h.includes('외화단가')),
            qty: headers.findIndex(h => h.includes('수량')),
            rate: headers.findIndex(h => h.includes('환율'))
        };

        // 필수 컬럼 확인
        if (colIndex.date === -1 || colIndex.stockName === -1 || colIndex.stockCode === -1 || colIndex.type === -1) {
            console.error(`❌ 필수 헤더(날짜/일자, 종목명, 종목코드, 종류/구분)를 찾을 수 없습니다. 파싱을 중단합니다.`);
            continue;
        }

        const transactions = [];

        for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i]);
            if (row.length < 4) continue;

            const dateStr = formatDate(row[colIndex.date]);
            const stockName = row[colIndex.stockName];
            const stockCode = row[colIndex.stockCode];
            const currency = colIndex.currency !== -1 ? (row[colIndex.currency] || 'KRW').toUpperCase() : 'KRW';
            const type = row[colIndex.type];
            
            let quantity = colIndex.qty !== -1 ? parseFloat(row[colIndex.qty].replace(/,/g, '')) : 0;
            let price = 0;
            let rate = colIndex.rate !== -1 ? parseFloat(row[colIndex.rate].replace(/,/g, '')) : 1.0;

            if (isNaN(quantity)) quantity = 0;
            if (isNaN(rate) || rate <= 0) rate = currency === 'USD' ? 1300.0 : 1.0; // USD 기본 환율 방어코드

            if (currency === 'KRW') {
                price = colIndex.priceKrw !== -1 ? parseFloat(row[colIndex.priceKrw].replace(/,/g, '')) : 0;
                rate = 1.0;
            } else {
                price = colIndex.priceForeign !== -1 ? parseFloat(row[colIndex.priceForeign].replace(/,/g, '')) : 0;
                if (isNaN(price) || price === 0) {
                    // 원화 가격이 있을 경우 역산 시도
                    const priceKrwVal = colIndex.priceKrw !== -1 ? parseFloat(row[colIndex.priceKrw].replace(/,/g, '')) : 0;
                    if (!isNaN(priceKrwVal) && priceKrwVal > 0 && rate > 0) {
                        price = priceKrwVal / rate;
                    }
                }
            }

            if (isNaN(price)) price = 0;

            // GAS.js 매칭 로직과 동일화:
            // 현금입금, 현금출금, 배당금 유형의 수량/가격 보정
            let finalType = type;
            let finalStockName = stockName;
            let finalStockCode = stockCode;
            let finalQty = quantity;
            let finalPrice = price;

            if (finalType === "현금입금" || finalType === "현금출금" || finalType === "배당금") {
                const originalName = finalStockName;
                finalStockName = "현금";
                finalStockCode = finalType === "배당금" ? originalName : "현금";
            }
            if (finalType.includes("매도") || finalType.includes("출금")) {
                finalQty = -Math.abs(finalQty);
            }
            if (["현금입금", "현금출금", "배당금"].includes(finalType)) {
                if (finalPrice === 0) {
                    finalPrice = Math.abs(finalQty);
                    finalQty = finalQty < 0 ? -1 : 1;
                }
            }

            transactions.push({
                date: dateStr,
                stock_name: finalStockName,
                stock_code: finalStockCode,
                currency: currency,
                type: finalType,
                quantity: finalQty,
                price: finalPrice,
                account: accountName,
                usd_krw_rate: rate
            });
        }

        console.log(`➡️ ${transactions.length}개의 거래 데이터 추출 완료. Supabase에 적재 중...`);

        // Supabase REST API 호출 (Bulk Insert)
        try {
            const response = await fetch(`${supabaseURL}/rest/v1/transactions`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(transactions)
            });

            if (response.ok) {
                console.log(`✅ 계좌 [${accountName}]의 거래 ${transactions.length}개 업로드 성공!`);
            } else {
                const errText = await response.text();
                console.error(`❌ 업로드 실패! 상태 코드: ${response.status}, 사유: ${errText}`);
            }
        } catch (fetchErr) {
            console.error(`❌ HTTP 요청 에러 발생:`, fetchErr.message);
        }
    }
}

migrate();

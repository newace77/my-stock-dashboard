// 🐶 바둑이의 주식 데이터 처리 스크립트
// 업데이트: 2026-04-09 (탭 인터페이스 및 MDD 분석 기능 추가)

const CONFIG = {
    summaryURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=0&single=true&output=csv",
    holdingsURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=58859590&single=true&output=csv",
    historyURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=1345768416&single=true&output=csv",
    snapshotURL: "data_snapshot.json",
    gasURL: "https://script.google.com/macros/s/AKfycbzTwfRBu2L2EA4r_-9MZVYgwyxmray_Q-qOANo0pkaLEY5Gr8LgIV9h52DxR_7ZfxSZEA/exec"
};

const PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

let globalHoldings = [];
let sortState = { column: 'weight', direction: 'desc' };
let summaryChart = null;
let historyChart = null;
let bubbleChart = null;
let mddChart = null;
let recoveryChart = null;

// 📑 탭 전환 함수
function openTab(evt, tabName) {
    const tabContents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove("active");
    }

    const tabButtons = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove("active");
    }

    document.getElementById(tabName).classList.add("active");
    evt.currentTarget.classList.add("active");

    window.dispatchEvent(new Event('resize'));
}

document.addEventListener('DOMContentLoaded', () => {
    fetchData();

    // 📅 기본 날짜 설정
    const dateInput = document.getElementById('input-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    // 📅 MDD 분석용 날짜 설정 (최근 10년)
    const mddStartInput = document.getElementById('mdd-start-date');
    const mddEndInput = document.getElementById('mdd-end-date');
    if (mddStartInput && mddEndInput) {
        const now = new Date();
        const tenYearsAgo = new Date();
        tenYearsAgo.setFullYear(now.getFullYear() - 10);
        mddEndInput.value = now.toISOString().split('T')[0];
        mddStartInput.value = tenYearsAgo.toISOString().split('T')[0];
    }

    // 🔄 거래 종류에 따라 입력 필드 토글
    document.getElementById('type-select')?.addEventListener('change', (e) => {
        const type = e.target.value;
        const tickerGroup = document.getElementById('ticker-group');
        const priceGroup = document.getElementById('price-group');
        const tickerLabel = tickerGroup?.querySelector('label');
        const tickerInput = document.getElementById('input-ticker');

        if (['현금입금', '현금출금'].includes(type)) {
            tickerGroup.style.display = 'none';
            priceGroup.style.display = 'none';
        } else if (type === '배당금') {
            tickerGroup.style.display = 'flex';
            priceGroup.style.display = 'none';
            if (tickerLabel) tickerLabel.textContent = '배당 종목 선택';
            if (tickerInput) tickerInput.placeholder = '배당 종목 티커 (예: QQQM)';
        } else {
            // 매수 / 매도
            tickerGroup.style.display = 'flex';
            priceGroup.style.display = 'flex';
            if (tickerLabel) tickerLabel.textContent = '종목 선택';
            if (tickerInput) tickerInput.placeholder = '종목명 입력 (예: SCHD)';
        }
    });

    // 폼 제출 이벤트
    document.getElementById('transaction-form')?.addEventListener('submit', handleTransactionSubmit);

    // MDD 분석 버튼
    document.getElementById('mdd-analyze-btn')?.addEventListener('click', analyzeMDD);

    // 10분마다 자동 새로고침
    setInterval(() => {
        fetchData();
    }, 10 * 60 * 1000);

    const refreshBtn = document.getElementById('refresh-fab');
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
        // 버튼 로딩 상태 표시
        refreshBtn.classList.add('loading');
        fetchData().finally(() => {
            setTimeout(() => refreshBtn.classList.remove('loading'), 1000);
        });
    });
});

async function fetchData(shouldRefreshMarket = true) {
    updateTimestamp(null, "⏳ 데이터 확인 중...");
    
    try {
        // 1. 데이터 병렬 로드 시도
        const [summaryRes, holdingsRes, historyRes] = await Promise.all([
            fetchWithFallback(CONFIG.summaryURL),
            fetchWithFallback(CONFIG.holdingsURL),
            fetchWithFallback(CONFIG.historyURL)
        ]);

        // 최소한 요약 데이터나 보유 종목 데이터 중 하나는 있어야 함
        if (!summaryRes && !holdingsRes) {
            throw new Error("실시간 데이터를 가져올 수 없습니다.");
        }

        if (summaryRes && summaryRes.data) {
            renderSummary(summaryRes.data, document.querySelector('#summary-table tbody'));
        }
        
        if (holdingsRes && holdingsRes.data) {
            processHoldingsData(holdingsRes.data);
        }

        if (historyRes && historyRes.data) {
            renderHistoryChart(historyRes.data);
        }

        updateTimestamp(true, "Live");
        console.log("실시간 데이터 로드 완료");

    } catch (err) {
        console.error("실시간 데이터 로드 실패, 스냅샷 시도:", err);
        
        try {
            const response = await fetch(CONFIG.snapshotURL);
            const snapshot = await response.json();
            
            if (snapshot.summary) {
                renderSummary(snapshot.summary, document.querySelector('#summary-table tbody'));
            }
            if (snapshot.holdings) {
                processHoldingsData(snapshot.holdings);
            }
            
            updateTimestamp(false, "Snapshot (오프라인)");
        } catch (snapErr) {
            console.error("스냅샷 로드도 실패:", snapErr);
            updateTimestamp(null, "❌ 데이터 로드 실패");
        }
    }

    // 시장 지수 데이터 업데이트 (S&P 500 등)
    if (shouldRefreshMarket) {
        fetchSP500Data();
    }
}

/**
 * 🇺🇸 S&P 500 시가총액 상위 100 종목 데이터 수집 및 분석
 */
async function fetchSP500Data() {
    const tableBody = document.querySelector('#sp500-table tbody');
    const statusText = document.getElementById('sp500-status');
    if (!tableBody) return;

    try {
        statusText.textContent = "⏳ 시가총액 상위 100 순위 확인 중...";
        
        // 1. S&P 500 시가총액 상위 100 목록 가져오기 (야후 스크리너 API)
        // query2와 query1 두 곳을 순차적으로 시도합니다.
        const endpoints = [
            `https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=sp500&count=100`,
            `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=sp500&count=100`
        ];

        let screenerResult = null;
        for (const url of endpoints) {
            try {
                screenerResult = await fetchWithFallback(url, true);
                if (screenerResult && screenerResult.data && (screenerResult.data.finance || screenerResult.data.quoteResponse)) break;
            } catch (e) { console.warn(`Endpoint failed: ${url}`); }
        }

        if (!screenerResult || !screenerResult.data) {
            throw new Error("야후 서버 응답 없음");
        }

        // 데이터 경로가 다를 수 있으므로 유연하게 추출
        const resultObj = screenerResult.data.finance?.result?.[0] || screenerResult.data.quoteResponse?.result;
        const quotes = resultObj?.quotes || resultObj;

        if (!quotes || !Array.isArray(quotes)) {
            throw new Error("종목 정보를 찾을 수 없습니다.");
        }

        const top100Tickers = quotes.slice(0, 100).map(q => q.symbol);
        statusText.textContent = `⏳ 100개 종목 분석 중... (RSI 및 하락률 계산)`;
        tableBody.innerHTML = '';

        // 가격/변동률 정보 매핑
        const quoteMap = {};
        quotes.forEach(q => {
            quoteMap[q.symbol] = {
                name: q.shortName || q.longName || q.symbol,
                price: q.regularMarketPrice || 0,
                change: q.regularMarketChangePercent || 0,
                high52: q.fiftyTwoWeekHigh || q.regularMarketPrice || 1
            };
        });

        // 뼈대 생성
        top100Tickers.forEach((ticker, index) => {
            const data = quoteMap[ticker];
            const drawdown = data.high52 ? ((data.price / data.high52 - 1) * 100).toFixed(2) : "0.00";
            
            const tr = document.createElement('tr');
            tr.onclick = () => window.open(`https://finance.yahoo.com/quote/${ticker}`, '_blank');
            tr.innerHTML = `
                <td style="text-align:center;">${index + 1}</td>
                <td><strong>${data.name}</strong> <span style="color:#888;">(${ticker})</span></td>
                <td>$${data.price ? data.price.toFixed(2) : "-"}</td>
                <td class="${getColorClass(data.change)}">${data.change ? data.change.toFixed(2) : "0"}%</td>
                <td id="rsi-${ticker.replace(/[^a-zA-Z]/g, '')}" style="text-align:center;">-</td>
                <td>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="drawdown-text">${drawdown}%</span>
                    </div>
                    <div class="drawdown-bar-container">
                        <div class="drawdown-bar" style="width: ${Math.min(Math.abs(parseFloat(drawdown)) * 2, 100)}%;"></div>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // RSI 계산 (Batch 처리)
        const batchSize = 10;
        for (let i = 0; i < top100Tickers.length; i += batchSize) {
            const batch = top100Tickers.slice(i, i + batchSize);
            statusText.textContent = `⏳ 기술 분석 중... (${i + batch.length}/100)`;
            
            await Promise.all(batch.map(async (ticker) => {
                try {
                    // RSI용 데이터는 최근 1개월치만 가져옴
                    const chartURL = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`;
                    const result = await fetchWithFallback(chartURL, true);
                    const history = parseYahooData(result, ticker);
                    
                    if (history && history.length >= 14) {
                        const rsiValue = calculateRSIValue(history.map(h => h.close));
                        const rsiCell = document.getElementById(`rsi-${ticker.replace(/[^a-zA-Z]/g, '')}`);
                        if (rsiCell) {
                            let rsiClass = 'rsi-neutral';
                            if (rsiValue >= 70) rsiClass = 'rsi-overbought';
                            else if (rsiValue <= 30) rsiClass = 'rsi-oversold';
                            rsiCell.innerHTML = `<span class="rsi-tag ${rsiClass}">${rsiValue.toFixed(1)}</span>`;
                        }
                    }
                } catch (e) { }
            }));
            // API 차단 방지를 위한 짧은 휴식 (50ms)
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        statusText.textContent = `✅ S&P 500 Top 100 업데이트 완료 (${new Date().toLocaleTimeString()})`;

    } catch (err) {
        console.error("SP500 데이터 로드 실패:", err);
        statusText.textContent = "❌ 업데이트 실패 (야후 API 응답 지연 또는 차단)";
    }
}

/**
 * RSI (Relative Strength Index) 계산 함수 (14일 기준)
 */
function calculateRSIValue(closes, period = 14) {
    if (closes.length <= period) return 50;
    
    let gains = 0;
    let losses = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
}

async function fetchWithFallback(targetUrl, isYahoo = false) {
    // 1. [우선순위] GAS 프록시 사용 (Google Sheets CSV 및 Yahoo Finance 데이터 모두에 적용)
    if (CONFIG.gasURL && CONFIG.gasURL.startsWith('https://script.google.com')) {
        try {
            console.log("GAS 프록시 시도 중: " + targetUrl);
            const response = await fetch(CONFIG.gasURL, {
                method: 'POST',
                // GAS.js의 proxy_yahoo 명령은 범용 URL 프록시로 동작합니다.
                body: JSON.stringify({ command: "proxy_yahoo", url: targetUrl })
            });

            if (response.ok) {
                const text = await response.text();
                
                if (text.startsWith("GAS Error:")) {
                    console.warn("GAS 내부 오류:", text);
                } else if (text.includes('"chart"') || text.includes('"result"')) {
                    // JSON 형식 (Yahoo Finance 등)
                    return { type: 'json', data: JSON.parse(text) };
                } else if (text.length > 20 && !text.includes("<!DOCTYPE") && !text.includes("<html")) {
                    // CSV 또는 텍스트 형식 (Google Sheets 데이터 등)
                    const result = Papa.parse(text, { header: false, skipEmptyLines: true });
                    if (result.data && result.data.length > 0) {
                        console.log("GAS 프록시를 통해 데이터 로드 성공!");
                        return { type: 'csv', data: result.data };
                    }
                }
            }
        } catch (e) {
            console.error("GAS 프록시 호출 실패:", e);
        }
    }

    // 2. 공용 프록시 (GAS 실패 시 백업)
    console.log("백업용 공용 프록시 시도 중...");
    const backupProxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
    ];

    for (const proxyUrl of backupProxies) {
        try {
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const text = await response.text();
                if (text && text.length > 20 && !text.includes("<!DOCTYPE") && !text.includes("<html")) {
                    if (text.includes('"chart"') || text.includes('"result"')) {
                        return { type: 'json', data: JSON.parse(text) };
                    }
                    const result = Papa.parse(text, { header: false, skipEmptyLines: true });
                    if (result.data && result.data.length > 0) return { type: 'csv', data: result.data };
                }
            }
        } catch (e) {
            console.warn("공용 프록시 실패: " + proxyUrl);
        }
    }
    return null;
}

// Yahoo Finance v8 JSON 또는 구형 CSV 데이터를 통일된 형식으로 파싱
function parseYahooData(result, ticker) {
    if (!result) return [];

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.getFullYear().toString().slice(-2) + '-' +
            ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
            ('0' + d.getDate()).slice(-2);
    };

    if (result.type === 'json') {
        try {
            const chart = result.data.chart;
            if (!chart || !chart.result || chart.result.length === 0) return [];
            const item = chart.result[0];
            const timestamps = item.timestamp;
            const closes = item.indicators.quote[0].close;
            return timestamps.map((ts, i) => ({
                date: formatDate(new Date(ts * 1000)),
                close: closes[i]
            })).filter(d => d.close !== null && !isNaN(d.close));
        } catch (e) { return []; }
    } else if (result.type === 'csv') {
        return result.data.slice(1).map(row => ({
            date: formatDate(row[0]),
            close: parseFloat(row[4])
        })).filter(d => !isNaN(d.close));
    }
    return [];
}
// 📉 MDD 분석 로직
async function analyzeMDD() {
    const tickerInput = document.getElementById('mdd-ticker').value.trim().toUpperCase();
    const startDate = document.getElementById('mdd-start-date').value;
    const endDate = document.getElementById('mdd-end-date').value;
    const analyzeBtn = document.getElementById('mdd-analyze-btn');

    if (!tickerInput) { alert("티커를 입력해주세요!"); return; }

    let ticker = tickerInput;
    if (/^\d{6}$/.test(ticker)) ticker += ".KS";

    try {
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = "⏳ 데이터 로드 중...";

        const p1 = Math.floor(new Date(startDate).getTime() / 1000);
        const p2 = Math.floor(new Date(endDate).getTime() / 1000);
        // v8 API 사용 (v7은 인증 필요로 변경됨)
        const yahooURL = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${p1}&period2=${p2}&interval=1d&events=history`;

        // isYahoo 매개변수 true 추가
        const data = await fetchWithFallback(yahooURL, true);

        if (!data) throw new Error(`데이터를 가져오지 못했습니다. 티커 '${ticker}'를 확인하거나 잠시 후 다시 시도해주세요.`);

        // v8 API는 JSON 반환 → 파싱 처리
        const history = parseYahooData(data, ticker);

        if (history.length === 0) throw new Error("분석할 수 있는 주가 데이터가 없습니다.");

        analyzeBtn.textContent = "📊 통계 계산 중...";

        let runningMax = -Infinity;
        let mdd = 0;
        const processedData = history.map(d => {
            if (d.close > runningMax) runningMax = d.close;
            const drawdown = (d.close / runningMax - 1);
            if (drawdown < mdd) mdd = drawdown;
            return { ...d, runningMax, drawdown: drawdown * 100 };
        });

        const stats = calculateRecoveryStats(processedData);
        const currentDrawdown = processedData[processedData.length - 1].drawdown;
        
        renderMDDCharts(ticker, processedData, stats, currentDrawdown);
        renderMDDTable(stats, currentDrawdown);
        updateMDDSummary(ticker, mdd, processedData, currentDrawdown);

    } catch (err) {
        alert("분석 실패: " + err.message);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "🐾 분석 실행";
    }
}

function calculateRecoveryStats(data) {
    const levels = Array.from({ length: 20 }, (_, i) => (i + 1) * 5); // 5, 10, ..., 100
    const totalDays = data.length;
    const latestPeak = data[data.length - 1].runningMax;

    return levels.map(level => {
        // MDD 값이 -level% ~ 0% 사이에 있는 날짜 수 카운트 (누적 확률)
        // 예: -5% 수준에서의 확률 = MDD가 0 ~ -5% 사이였던 날짜 수 / 전체 날짜 수
        const count = data.filter(d => d.drawdown >= -level && d.drawdown <= 0).length;
        const prob = ((count / totalDays) * 100).toFixed(1);

        // 해당 주가 계산: 최고가 * (1 - 낙폭%)
        const targetPrice = latestPeak * (1 - level / 100);

        return {
            level,
            count,
            prob,
            price: targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        };
    });
}

function renderMDDCharts(ticker, data, stats, currentDrawdown = 0) {
    const ctxMdd = document.getElementById('mddChart').getContext('2d');
    if (mddChart) mddChart.destroy();
    mddChart = new Chart(ctxMdd, {
        data: {
            labels: data.map(d => d.date),
            datasets: [
                { type: 'line', label: '주가', data: data.map(d => d.close), borderColor: '#4a90e2', borderWidth: 2, pointRadius: 0, yAxisID: 'y' },
                { type: 'line', label: '낙폭(%)', data: data.map(d => d.drawdown), backgroundColor: 'rgba(229, 57, 53, 0.2)', borderColor: 'rgba(229, 57, 53, 0.8)', fill: true, pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y1: { position: 'right', min: -100, max: 0 } } }
    });

    const ctxRec = document.getElementById('recoveryChart').getContext('2d');
    if (recoveryChart) recoveryChart.destroy();

    // 현재 낙폭이 속한 레벨 계산 (5% 단위)
    // 예: -7.2% -> 10, -12% -> 15
    const currentLevel = Math.ceil(Math.abs(currentDrawdown) / 5) * 5;

    // 복귀 확률에 따른 색상 및 테두리 배열 생성
    const backgroundColors = stats.map(s => {
        const prob = parseFloat(s.prob);
        if (prob >= 100) return 'rgba(255, 107, 107, 0.6)';
        if (prob >= 90) return 'rgba(255, 159, 64, 0.6)';
        return 'rgba(74, 144, 226, 0.6)';
    });

    const borderColors = stats.map(s => (s.level === currentLevel) ? '#000000' : 'transparent');
    const borderWidths = stats.map(s => (s.level === currentLevel) ? 2 : 0);

    // 복귀 확률 그래프 (바 차트)
    recoveryChart = new Chart(ctxRec, {
        type: 'bar',
        data: {
            labels: stats.map(s => `-${s.level}%`),
            datasets: [{ 
                label: '복귀 확률 (%)', 
                data: stats.map(s => s.prob), 
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: borderWidths
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: '확률 (%)' } } },
            plugins: { tooltip: { callbacks: { label: (ctx) => `복귀 확률: ${ctx.raw}% (MDD 0 ~ ${ctx.label} 구간)` } } }
        }
    });
}

function renderMDDTable(stats, currentDrawdown = 0) {
    const tbody = document.querySelector('#recovery-table tbody');
    tbody.innerHTML = '';
    
    // 현재 낙폭이 속한 레벨 계산
    const currentLevel = Math.ceil(Math.abs(currentDrawdown) / 5) * 5;

    stats.forEach(s => {
        const prob = parseFloat(s.prob);
        let styles = [];
        
        // 1. 확률에 따른 배경색 설정
        if (prob >= 100) styles.push('background-color: rgba(255, 107, 107, 0.15)');
        else if (prob >= 90) styles.push('background-color: rgba(255, 159, 64, 0.15)');

        // 2. 현재 낙폭 레벨인 경우 굵게 표시
        if (s.level === currentLevel) {
            styles.push('font-weight: bold');
            styles.push('border: 2px solid #000'); // 테두리도 추가하여 더 명확히 강조
        }

        const tr = document.createElement('tr');
        if (styles.length > 0) tr.setAttribute('style', styles.join('; '));
        
        tr.innerHTML = `<td>-${s.level}%</td><td>${s.prob}%</td><td>${s.count}일</td><td>$${s.price}</td>`;
        tbody.appendChild(tr);
    });
}

function updateMDDSummary(ticker, mdd, data, currentDrawdown = 0) {
    const summary = document.getElementById('mdd-summary-content');
    const lastPrice = data[data.length - 1].close;
    const totalReturn = ((lastPrice / data[0].close - 1) * 100).toFixed(2);
    summary.innerHTML = `
        <div class="mdd-summary-item"><span class="label">종목</span><span class="value">${ticker}</span></div>
        <div class="mdd-summary-item"><span class="label">최대 낙폭</span><span class="value" style="color:var(--negative)">${(mdd * 100).toFixed(2)}%</span></div>
        <div class="mdd-summary-item"><span class="label">현재 낙폭</span><span class="value" style="color:var(--negative)">${currentDrawdown.toFixed(2)}%</span></div>
        <div class="mdd-summary-item"><span class="label">누적 수익률</span><span class="value">${totalReturn}%</span></div>
        <div class="mdd-summary-item"><span class="label">현재가</span><span class="value">$${lastPrice.toFixed(2)}</span></div>
    `;
}

// -------------------------------------------------------------------------
// 기존 포트폴리오 기능 (Summary, Holdings, History, Charts)
// -------------------------------------------------------------------------

function updateTimestamp(isLive, method) {
    const lastUpdated = document.getElementById('last-updated');
    if (!lastUpdated) return;
    const timeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    lastUpdated.innerHTML = isLive === null ? method : `Last Update: ${timeStr} (${method})`;
    lastUpdated.style.color = isLive ? "#2e7d32" : (isLive === false ? "#d84315" : "#888");
}

function parseSafeFloat(val) {
    if (val === undefined || val === null) return 0;
    const num = parseFloat(String(val).replace(/,/g, '').replace(/%/g, '').trim());
    return isNaN(num) ? 0 : num;
}

function getColorClass(value) {
    const num = parseSafeFloat(value);
    return num > 0 ? "value-up" : (num < 0 ? "value-down" : "");
}

function renderSummary(data, tableElement) {
    if (!tableElement || !data) return;
    tableElement.innerHTML = '';
    try {
        if (data.length >= 9) {
            const row9 = data[8];
            document.getElementById('card-eval-val').textContent = row9[1] || "-";
            document.getElementById('card-invest-val').textContent = row9[2] || "-";
            const profitElem = document.getElementById('card-profit-val');
            profitElem.textContent = row9[3] || "0";
            profitElem.className = 'value ' + getColorClass(row9[3]);
            const rateElem = document.getElementById('card-rate-val');
            rateElem.textContent = row9[4] || "0%";
            rateElem.className = 'value ' + getColorClass(row9[4]);
            document.getElementById('card-dividend-val').textContent = row9[11] || "0";
        }
        if (data.length >= 10) document.getElementById('card-usd-val').textContent = data[9][2] || "0%";

        const marketMappings = [
            { id: 'snp', row: 13 },
            { id: 'nasdaq', row: 14 },
            { id: 'kospi', row: 15 },
            { id: 'ex-rate', row: 16 },
            { id: 'gold', row: 17 },
            { id: 'btc', row: 18 }
        ];
        marketMappings.forEach(m => {
            if (data && data.length > m.row) {
                const row = data[m.row];
                if (row && row.length > 17) { // 데이터가 충분히 있는지 확인 (R열까지)
                    document.getElementById(`card-${m.id}-val`).textContent = row[15] || "-";
                    const diffElem = document.getElementById(`card-${m.id}-diff`);
                    if (diffElem) {
                        const val = row[16];
                        diffElem.textContent = (parseFloat(val) > 0 ? "+" : "") + val;
                        diffElem.className = getColorClass(val);
                    }
                    const changeElem = document.getElementById(`card-${m.id}-change`);
                    if (changeElem) {
                        changeElem.textContent = `(${row[17]})`;
                        changeElem.className = getColorClass(row[17]);
                    }
                }
            }
        });
    } catch (e) { console.warn("Summary parsing error", e); }

    const labels = [], invests = [], evals = [];
    data.forEach((row, i) => {
        if (i >= 9 || !row[0] || row[0].includes("계좌명") || row[0].includes("합산")) return;
        const name = row[0].trim(); if (name === "") return;
        const isTotal = name.includes("합계");
        const evalNum = parseSafeFloat(row[1]), investNum = parseSafeFloat(row[2]);
        if (!isTotal) { labels.push(name); invests.push(investNum); evals.push(evalNum); }
        const tr = document.createElement('tr');
        if (isTotal) tr.classList.add("account-total");
        tr.innerHTML = `<td>${name}</td><td>${row[1]}</td><td>${row[2]}</td><td class="${getColorClass(row[3])}">${row[3]}</td><td>${investNum ? (evalNum / investNum * 100 - 100).toFixed(2) + '%' : '0%'}</td><td class="${getColorClass(row[6])}">${row[6]}</td>`;
        tableElement.appendChild(tr);
    });
    renderSummaryChart(labels, invests, evals);
}

function processHoldingsData(data) {
    if (!data) return;
    globalHoldings = [];
    const tickerSelect = document.getElementById('ticker-select');
    if (tickerSelect) tickerSelect.innerHTML = '<option value="">종목을 선택하세요</option><option value="DIRECT">직접 입력 (신규 종목)</option>';

    data.forEach((row, i) => {
        if (i === 0 || !row[0] || ["종목명", "환율"].includes(row[0])) return;
        if (tickerSelect && row[1]) {
            const opt = document.createElement('option');
            opt.value = row[1]; opt.dataset.name = row[0]; opt.textContent = row[0];
            tickerSelect.appendChild(opt);
        }
        const weight = parseSafeFloat(row[9]), evalKRW = parseSafeFloat(row[8]);
        if (weight === 0 && evalKRW === 0) return;
        globalHoldings.push({
            name: row[0], ticker: row[1], weight, returnRate: parseSafeFloat(row[7]), eval: evalKRW,
            profit: parseSafeFloat(row[14]), dailyChange: parseSafeFloat(row[10]),
            display: { weight: row[9], returnRate: row[7], evalKRW: row[8], profitKRW: row[14], dailyChange: row[10] }
        });
    });
    sortHoldings(sortState.column, false);
    renderBubbleChart(globalHoldings);
}

function sortHoldings(column, toggle = true) {
    if (toggle) {
        if (sortState.column === column) sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        else { sortState.column = column; sortState.direction = 'desc'; }
    }
    globalHoldings.sort((a, b) => sortState.direction === 'asc' ? a[column] - b[column] : b[column] - a[column]);
    renderHoldingsTable();
}

function renderHoldingsTable() {
    const tbody = document.querySelector('#holdings-table tbody');
    if (!tbody) return; tbody.innerHTML = '';
    globalHoldings.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${item.name}</td><td>${item.display.weight}%</td><td class="${getColorClass(item.display.returnRate)}">${item.display.returnRate}%</td><td class="${getColorClass(item.display.profitKRW)}">${item.display.profitKRW}</td><td>${item.display.evalKRW}</td><td class="${getColorClass(item.display.dailyChange)}">${item.display.dailyChange}</td>`;
        tbody.appendChild(tr);
    });
}

function renderSummaryChart(labels, investData, evalData) {
    const canvas = document.getElementById('summaryChart'); if (!canvas) return;
    if (summaryChart) summaryChart.destroy();
    summaryChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets: [{ label: '투자원금', data: investData, backgroundColor: 'rgba(54, 162, 235, 0.6)' }, { label: '평가금액', data: evalData, backgroundColor: 'rgba(255, 99, 132, 0.6)' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderHistoryChart(data) {
    const canvas = document.getElementById('historyChart'); if (!canvas || !data) return;
    const dates = [], evals = [], invests = [];
    
    // 데이터 파싱 및 단위 변환 (원 -> 천만원)
    data.slice(1).forEach(row => {
        if (!row[0]) return;
        dates.push(row[0]); 
        // 10,000,000으로 나누어 천만원 단위로 변환
        evals.push(parseSafeFloat(row[1]) / 10000000); 
        invests.push(parseSafeFloat(row[2]) / 10000000);
    });

    if (historyChart) historyChart.destroy();
    historyChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { 
            labels: dates, 
            datasets: [
                { label: '평가금 (천만)', data: evals, borderColor: '#e53935', backgroundColor: 'rgba(229, 57, 53, 0.1)', fill: false, tension: 0.1, pointRadius: 2 }, 
                { label: '투자금 (천만)', data: invests, borderColor: '#1e88e5', backgroundColor: 'rgba(30, 136, 229, 0.1)', fill: false, tension: 0.1, pointRadius: 2 }
            ] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: {
                y: {
                    title: { display: true, text: '단위: 천만원', font: { weight: 'bold' } },
                    ticks: { callback: (value) => value.toLocaleString() }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label.split(' ')[0] || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(1) + '천만원';
                                // 억 단위 보조 표시 (예: 1.5억)
                                if (context.parsed.y >= 10) {
                                    label += ` (${(context.parsed.y / 10).toFixed(2)}억원)`;
                                }
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function renderBubbleChart(holdings) {
    const canvas = document.getElementById('bubbleChart'); if (!canvas) return;
    const bubbleData = holdings.map(item => ({
        label: item.name,
        data: [{ x: item.dailyChange, y: item.returnRate, r: Math.sqrt(item.eval / 100000) * 0.8, eval: item.eval }]
    }));
    if (bubbleChart) bubbleChart.destroy();
    bubbleChart = new Chart(canvas.getContext('2d'), {
        type: 'bubble',
        data: { datasets: bubbleData },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: {
                x: {
                    title: { display: true, text: '일일 변동률 (%)', font: { weight: 'bold' } },
                    grid: {
                        color: (context) => context.tick.value === 0 ? '#666' : 'rgba(0,0,0,0.1)',
                        lineWidth: (context) => context.tick.value === 0 ? 2 : 1
                    }
                },
                y: {
                    title: { display: true, text: '전체 수익률 (%)', font: { weight: 'bold' } },
                    grid: {
                        color: (context) => context.tick.value === 0 ? '#666' : 'rgba(0,0,0,0.1)',
                        lineWidth: (context) => context.tick.value === 0 ? 2 : 1
                    }
                }
            },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const item = context.raw;
                            return `${context.dataset.label}: 수익률 ${item.y.toFixed(2)}%, 일변동 ${item.x.toFixed(2)}%`;
                        }
                    }
                }
            }
        }
    });
}

async function handleTransactionSubmit(e) {
    e.preventDefault();
    const tickerSelect = document.getElementById('ticker-select');
    const inputTicker = document.getElementById('input-ticker');
    const type = document.getElementById('type-select').value;

    // 거래 종류에 따라 B열(종목명)과 C열(종목코드) 결정
    // 시트 구조: A=날짜, B=종목(종목명), C=종목코드, D=거래통화, E=거래종류, ...
    let stockName, stockCode;

    if (['현금입금', '현금출금'].includes(type)) {
        // 현금 거래: B=현금(고정), C=비워둠
        stockName = '현금';
        stockCode = '';
    } else if (type === '배당금') {
        // 배당금: B=현금(고정), C=배당을 준 종목명
        stockName = '현금';
        if (tickerSelect.value === 'DIRECT') {
            stockCode = inputTicker.value.trim();
        } else {
            const selectedOpt = tickerSelect.options[tickerSelect.selectedIndex];
            stockCode = selectedOpt.dataset.name || tickerSelect.value; // 종목명 (예: QQQM 이름)
        }
    } else {
        // 매수/매도: B=종목명, C=종목코드
        if (tickerSelect.value === 'DIRECT') {
            // 직접 입력: 종목명=입력값, 종목코드=비워둠
            stockName = inputTicker.value.trim();
            stockCode = '';
        } else {
            // 선택된 종목: B=종목명(data-name), C=티커(value)
            const selectedOpt = tickerSelect.options[tickerSelect.selectedIndex];
            stockName = selectedOpt.dataset.name || tickerSelect.value;
            stockCode = tickerSelect.value; // 예: QQQM, SPYM 등
        }
    }

    const submitBtn = document.getElementById('submit-btn');
    const statusDiv = document.getElementById('form-status');

    const formData = {
        date: document.getElementById('input-date').value,
        stockName,   // B열: 종목명 또는 '현금'
        stockCode,   // C열: 종목코드 또는 배당 종목 티커
        currency: document.getElementById('currency-select').value,
        type,
        quantity: document.getElementById('input-quantity').value,
        price: document.getElementById('input-price').value || 0,
        account: document.getElementById('account-select').value
    };

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ 저장 중...';
        await fetch(CONFIG.gasURL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(formData) });
        statusDiv.textContent = '✅ 기록 완료! 멍!';
        statusDiv.style.color = '#2e7d32';
        document.getElementById('transaction-form').reset();
        document.getElementById('input-date').value = new Date().toISOString().split('T')[0];
        setTimeout(() => { statusDiv.textContent = ''; fetchData(false); }, 2000);
    } catch (err) {
        statusDiv.textContent = '❌ 실패: ' + err.message;
        statusDiv.style.color = '#c62828';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '🐾 기록 저장';
    }
}

async function requestMarketRefresh() {
    try { fetch(CONFIG.gasURL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ command: "refresh_market" }) }); } catch (e) { }
}

// 🐶 바둑이의 주식 데이터 처리 스크립트
// 업데이트: 2026-03-25 (초고속 로딩 및 데이터 파싱 강화)

const CONFIG = {
    summaryURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=0&single=true&output=csv",
    holdingsURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=58859590&single=true&output=csv",
    historyURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=1345768416&single=true&output=csv",
    snapshotURL: "data_snapshot.json",
    // 💡 아래 URL을 본인의 Google Apps Script 배포 URL로 교체하세요!
    gasURL: "https://script.google.com/macros/s/AKfycby_w2P7Bb66X5bhtSIffnH6QIIQDqiWZGfrNdEDlQZlIDA1sbXVtbdxIPOHByAJamlg1w/exec"
};

const PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

const BACKUP_DATA = {
    summary: [["", "0", "0", "0", "0", "0", "0"]],
    holdings: [],
    history: [["26.03.25", 0, 0]]
};

let globalHoldings = [];
let sortState = { column: 'weight', direction: 'desc' };
let summaryChart = null;
let historyChart = null;
let bubbleChart = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchData();

    // 📅 기본 날짜를 오늘로 설정
    const dateInput = document.getElementById('input-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    // 🔄 거래 종류에 따라 입력 필드 토글 (예: 현금 입출금 시 종목명 숨김)
    document.getElementById('type-select')?.addEventListener('change', (e) => {
        const type = e.target.value;
        const tickerGroup = document.getElementById('ticker-group');
        const priceGroup = document.getElementById('price-group');

        // "배당금", "현금입금", "현금출금"인 경우 종목명 또는 가격 필드 숨김
        if (['현금입금', '현금출금'].includes(type)) {
            tickerGroup.style.display = 'none';
            priceGroup.style.display = 'none';
        } else if (type === '배당금') {
            tickerGroup.style.display = 'flex'; // 배당금은 어떤 종목인지 입력
            priceGroup.style.display = 'none'; // 배당금은 단가 대신 총액만 입력
        } else {
            tickerGroup.style.display = 'flex';
            priceGroup.style.display = 'flex';
        }
    });

    // 폼 제출 이벤트 등록
    document.getElementById('transaction-form')?.addEventListener('submit', handleTransactionSubmit);

    // 10분마다 자동 새로고침
    setInterval(() => {
        console.log("자동 새로고침 실행 중...");
        fetchData();
    }, 10 * 60 * 1000);

    const refreshBtn = document.getElementById('refresh-fab');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => fetchData());
    }
});

async function fetchData(shouldRefreshMarket = true) {
    const summaryTable = document.querySelector('#summary-table tbody');
    const holdingsTable = document.querySelector('#holdings-table tbody');

    updateTimestamp(null, "업데이트 확인 중...");

    // 📈 [추가] 홈페이지 로드/갱신 버튼 클릭 시 시장 지수 강제 업데이트 요청 (매개변수가 true일 때만)
    if (shouldRefreshMarket) {
        requestMarketRefresh();
    }

    // 1. [Fastest] 로컬 스냅샷 먼저 로드
    fetch(CONFIG.snapshotURL + '?t=' + Date.now())
        .then(response => response.json())
        .then(json => {
            if (json.summary) renderSummary(json.summary, summaryTable);
            if (json.holdings) { processHoldingsData(json.holdings); renderHoldingsTable(); }
            if (json.history) renderHistoryChart(json.history);
            updateTimestamp(true, "Snapshot (Fast)");
        })
        .catch(err => console.warn("Snapshot load failed", err));

    // 2. [Live] 구글 시트 데이터 개별 로드 (하나가 실패해도 나머지는 표시)
    const fetchTasks = [
        { key: 'summary', url: CONFIG.summaryURL, render: (d) => renderSummary(d, summaryTable) },
        { key: 'holdings', url: CONFIG.holdingsURL, render: (d) => { processHoldingsData(d); renderHoldingsTable(); } },
        { key: 'history', url: CONFIG.historyURL, render: (d) => renderHistoryChart(d) }
    ];

    let successCount = 0;

    for (const task of fetchTasks) {
        fetchWithFallback(task.url).then(data => {
            if (data) {
                task.render(data);
                successCount++;
                updateTimestamp(true, `Live 🟢 (${successCount}/3)`);
            } else {
                throw new Error(`${task.key} data is empty`);
            }
        }).catch(err => {
            console.error(`${task.key} fetch failed:`, err);
            const statusElement = document.getElementById('last-updated');
            if (statusElement) {
                statusElement.innerHTML = `⚠️ ${task.key} 로드 실패 (URL/CORS 확인)`;
                statusElement.style.color = "#d32f2f";
            }
        });
    }
}
async function fetchWithFallback(targetUrl) {
    const urlsToTry = [
        targetUrl + '&t=' + Date.now(),
        PROXIES[0](targetUrl + '&t=' + Date.now()),
        PROXIES[1](targetUrl + '&t=' + Date.now())
    ];

    for (const url of urlsToTry) {
        try {
            const result = await new Promise((resolve, reject) => {
                Papa.parse(url, {
                    download: true, header: false,
                    complete: (res) => resolve(res),
                    error: (err) => reject(err),
                    timeout: 5000 // 5초 타임아웃
                });
            });
            if (result.data && result.data.length > 0) return result.data;
        } catch (e) { continue; }
    }
    return null;
}

function updateTimestamp(isLive, method) {
    const lastUpdated = document.getElementById('last-updated');
    if (!lastUpdated) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', { hour12: false });

    if (isLive === null) {
        lastUpdated.innerHTML = method;
        lastUpdated.style.color = "#888";
    } else {
        lastUpdated.innerHTML = `Last Update: ${timeStr} (${method})`;
        lastUpdated.style.color = isLive ? "#2e7d32" : "#d84315";
    }
}

function parseSafeFloat(val) {
    if (val === undefined || val === null) return 0;
    const str = String(val).replace(/,/g, '').replace(/%/g, '').trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

function getColorClass(value) {
    const num = parseSafeFloat(value);
    if (num > 0) return "value-up";
    if (num < 0) return "value-down";
    return "";
}

function renderSummary(data, tableElement) {
    if (!tableElement || !data) return;
    tableElement.innerHTML = '';

    // 📊 상단 요약 카드 업데이트 (지정된 셀 위치에서 데이터 추출)
    // 9행(index 8): B=1, C=2, D=3, E=4, L=11
    // 10~11행(index 9,10): C=2
    try {
        if (data.length >= 9) {
            const row9 = data[8];
            document.getElementById('card-eval-val').textContent = row9[1] || "-";
            document.getElementById('card-invest-val').textContent = row9[2] || "-";

            // 수익액 (D9)
            const profitVal = row9[3] || "0";
            const profitElem = document.getElementById('card-profit-val');
            profitElem.textContent = profitVal;
            profitElem.className = 'value ' + getColorClass(profitVal);

            // 수익률 (E9)
            const rateVal = row9[4] || "0%";
            const rateElem = document.getElementById('card-rate-val');
            rateElem.textContent = rateVal;
            rateElem.className = 'value ' + getColorClass(rateVal);

            // 배당금 (L9)
            document.getElementById('card-dividend-val').textContent = row9[11] || "0";
        }

        // 달러 비중 (C10)
        if (data.length >= 10) {
            document.getElementById('card-usd-val').textContent = data[9][2] || "0%";
        }

        // 📈 시장 지수 카드 업데이트 (14행~19행, P~R열 기준)
        const marketMappings = [
            { id: 'snp', row: 13 },    // 14행
            { id: 'nasdaq', row: 14 }, // 15행
            { id: 'kospi', row: 15 },  // 16행
            { id: 'ex-rate', row: 16 },// 17행
            { id: 'gold', row: 17 },   // 18행
            { id: 'btc', row: 18 }     // 19행
        ];

        marketMappings.forEach(m => {
            if (data.length > m.row) {
                const row = data[m.row];
                const valElem = document.getElementById(`card-${m.id}-val`);
                const diffElem = document.getElementById(`card-${m.id}-diff`);
                const changeElem = document.getElementById(`card-${m.id}-change`);

                if (valElem) valElem.textContent = row[15] || "-"; // P열: 현재가

                const diffVal = row[16] || "0"; // Q열: 변화량
                const changeVal = row[17] || "0%"; // R열: 변화율 (ex: 1.23%)

                if (diffElem) {
                    diffElem.textContent = (parseFloat(diffVal) > 0 ? "+" : "") + diffVal;
                    diffElem.className = getColorClass(diffVal);
                }
                if (changeElem) {
                    changeElem.textContent = `(${changeVal})`;
                    changeElem.className = getColorClass(changeVal);
                }
            }
        });
    } catch (e) {
        console.warn("요약 카드 데이터 파싱 오류:", e);
    }

    const chartLabels = [];
    const chartInvest = [];
    const chartEval = [];

    data.forEach((row, i) => {
        if (!row || row.length < 2) return;
        let name = String(row[0] || "").trim();

        // 💡 필터링 강화: 헤더, 공백, 지수 관련 행 제외
        if (name === "" && i === 0) return;
        if (["계좌명", "종목명", "Ticker", ""].includes(name)) return;
        if (name.includes("합산")) return;

        // 💡 9행(index 8) 이후의 데이터는 표에 표시하지 않음 (지수 데이터 등 제외)
        if (i >= 9) return;

        if (name === "" && i > 0 && row[1]) name = "계좌 " + (i + 1);
        const isTotalRow = name.includes("합계");
        const evalNum = parseSafeFloat(row[1]);
        const investNum = parseSafeFloat(row[2]);
        const income = row[3] || "0";
        const daily = row[6] || "0";

        let rateStr = "0.00%";
        if (investNum !== 0) rateStr = (((evalNum / investNum) - 1) * 100).toFixed(2) + "%";

        if (!isTotalRow) {
            chartLabels.push(name);
            chartInvest.push(investNum);
            chartEval.push(evalNum);
        }

        const tr = document.createElement('tr');
        if (isTotalRow) tr.classList.add("account-total");
        tr.innerHTML = `
            <td>${name}</td>
            <td>${row[1] || "0"}</td>
            <td>${row[2] || "0"}</td>
            <td class="${getColorClass(income)}">${income}</td>
            <td class="${getColorClass(rateStr)}">${rateStr}</td>
            <td class="${getColorClass(daily)}">${daily}</td>
        `;
        tableElement.appendChild(tr);
    });
    renderSummaryChart(chartLabels, chartInvest, chartEval);
}

function processHoldingsData(data) {
    if (!data) return;
    globalHoldings = [];
    const tickerSelect = document.getElementById('ticker-select');

    // 드롭다운 초기화 (기본 옵션 제외)
    if (tickerSelect) {
        tickerSelect.innerHTML = '<option value="">종목을 선택하세요</option><option value="DIRECT">직접 입력 (신규 종목)</option>';
    }

    data.forEach((row, i) => {
        if (i === 0 || !row || !row[0] || ["종목명", "환율"].includes(row[0])) return;
        const name = row[0];
        const ticker = row[1] || ""; // 구글 파이낸스 티커
        const weight = parseSafeFloat(row[9]);
        const evalKRW = parseSafeFloat(row[8]);

        // 드롭다운에 추가
        if (tickerSelect && ticker) {
            const opt = document.createElement('option');
            opt.value = ticker;
            opt.dataset.name = name;
            opt.textContent = name;
            tickerSelect.appendChild(opt);
        }

        if (weight === 0 && evalKRW === 0) return;

        globalHoldings.push({
            name: name,
            ticker: ticker,
            weight: weight,
            returnRate: parseSafeFloat(row[7]),
            eval: evalKRW,
            profit: parseSafeFloat(row[14]),
            dailyChange: parseSafeFloat(row[10]),
            display: {
                weight: row[9] || "0",
                returnRate: row[7] || "0",
                evalKRW: row[8] || "0",
                profitKRW: row[14] || "0",
                dailyChange: row[10] || "0"
            }
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
    updateSortIcons();
}

function updateSortIcons() {
    document.querySelectorAll('#holdings-table th').forEach(th => {
        const onclick = th.getAttribute('onclick');
        if (onclick && onclick.includes('sortHoldings')) {
            let text = th.textContent.replace(/[↕↑↓]/g, '').trim();
            if (onclick.includes(`'${sortState.column}'`)) {
                text += sortState.direction === 'asc' ? ' ↑' : ' ↓';
                th.style.color = "#333";
            } else { text += ' ↕'; th.style.color = "#999"; }
            th.textContent = text;
        }
    });
}

function renderHoldingsTable() {
    const tbody = document.querySelector('#holdings-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    globalHoldings.forEach(item => {
        const tr = document.createElement('tr');
        let dc = item.display.dailyChange;
        if (!dc.includes('%')) dc += '%';
        tr.innerHTML = `<td>${item.name}</td><td>${item.display.weight}%</td><td class="${getColorClass(item.display.returnRate)}">${item.display.returnRate}%</td><td class="${getColorClass(item.display.profitKRW)}">${item.display.profitKRW}</td><td>${item.display.evalKRW}</td><td class="${getColorClass(item.display.dailyChange)}">${dc}</td>`;
        tbody.appendChild(tr);
    });
}

function renderSummaryChart(labels, investData, evalData) {
    const canvas = document.getElementById('summaryChart');
    if (!canvas) return;
    if (summaryChart) summaryChart.destroy();
    summaryChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: '투자원금', data: investData, backgroundColor: 'rgba(54, 162, 235, 0.6)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1 }, { label: '평가금액', data: evalData, backgroundColor: 'rgba(255, 99, 132, 0.6)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: v => new Intl.NumberFormat('ko-KR', { notation: "compact" }).format(v) } } } }
    });
}

function renderHistoryChart(data) {
    if (!data) return;
    const dates = [], evals = [], invests = [];
    const startIdx = (data[0] && (data[0][0] === "일자" || data[0][0] === "날짜")) ? 1 : 0;
    data.slice(startIdx).forEach(row => {
        if (!row || !row[0]) return;
        const e = parseSafeFloat(row[1]), i = parseSafeFloat(row[2]);
        if (e === 0 && i === 0) return;
        dates.push(row[0]); evals.push(e); invests.push(i);
    });
    const canvas = document.getElementById('historyChart');
    if (!canvas) return;
    if (historyChart) historyChart.destroy();
    historyChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: dates, datasets: [{ label: '총 평가금', data: evals, borderColor: 'rgba(255, 99, 132, 1)', backgroundColor: 'rgba(255, 99, 132, 0.1)', fill: true, tension: 0.3 }, { label: '총 투자금', data: invests, borderColor: 'rgba(54, 162, 235, 1)', backgroundColor: 'rgba(54, 162, 235, 0.1)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: '자산 변동 추이' } }, scales: { y: { beginAtZero: false, ticks: { callback: v => new Intl.NumberFormat('ko-KR', { notation: "compact" }).format(v) } } } }
    });
}

function renderBubbleChart(holdings) {
    const canvas = document.getElementById('bubbleChart');
    if (!canvas || !holdings || holdings.length === 0) return;

    const bubbleData = holdings.map(item => ({
        label: item.name,
        data: [{
            x: item.dailyChange,
            y: item.returnRate,
            r: Math.sqrt(item.eval / 100000) * 0.8,
            eval: item.eval // 툴팁 표시용 원본 데이터 보존
        }]
    }));

    if (bubbleChart) bubbleChart.destroy();
    bubbleChart = new Chart(canvas.getContext('2d'), {
        type: 'bubble',
        data: { datasets: bubbleData },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.dataset.label || '';
                            const d = context.raw;
                            const evalStr = new Intl.NumberFormat('ko-KR').format(Math.round(d.eval)) + '원';
                            return [
                                `${label}`,
                                ` 평가액: ${evalStr}`,
                                ` 일 변동률: ${d.x}%`,
                                ` 총 수익률: ${d.y}%`
                            ];
                        }
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    title: { display: true, text: '일일 변동률 (%)' },
                    grid: {
                        color: (ctx) => ctx.tick && ctx.tick.value === 0 ? 'rgba(0, 0, 0, 0.4)' : 'rgba(200, 200, 200, 0.2)',
                        lineWidth: (ctx) => ctx.tick && ctx.tick.value === 0 ? 2 : 1
                    }
                },
                y: {
                    title: { display: true, text: '전체 수익률 (%)' },
                    grid: {
                        color: (ctx) => ctx.tick && ctx.tick.value === 0 ? 'rgba(0, 0, 0, 0.4)' : 'rgba(200, 200, 200, 0.2)',
                        lineWidth: (ctx) => ctx.tick && ctx.tick.value === 0 ? 2 : 1
                    }
                }
            }
        }
    });
}

async function requestMarketRefresh() {
    if (!CONFIG.gasURL || CONFIG.gasURL.includes('AKfycb...')) return; // 기본값인 경우 생략
    try {
        fetch(CONFIG.gasURL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ command: "refresh_market" })
        });
    } catch (e) { console.warn("시장 지수 갱신 요청 실패", e); }
}

// ✍️ 매매 기록 제출 처리 함수
async function handleTransactionSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-btn');
    const tickerSelect = document.getElementById('ticker-select');
    const inputTicker = document.getElementById('input-ticker');

    let finalTicker = "";
    let finalStockName = "";

    // 1. 드롭다운 또는 직접 입력에서 데이터 추출
    if (tickerSelect && tickerSelect.value && tickerSelect.value !== 'DIRECT') {
        finalTicker = tickerSelect.value;
        const selectedOption = tickerSelect.options[tickerSelect.selectedIndex];
        finalStockName = selectedOption.dataset.name || "";
    } else if (inputTicker) {
        finalTicker = inputTicker.value.trim();
        finalStockName = finalTicker;
    }

    // 2. 유효성 검사 (현금 입출금인 경우 종목 선택 제외)
    const type = document.getElementById('type-select').value;
    if (!['현금입금', '현금출금'].includes(type) && !finalTicker) {
        showStatus('⚠️ 종목을 선택하거나 직접 입력해주세요!', 'error');
        return;
    }

    const formData = {
        account: document.getElementById('account-select').value,
        type: type,
        currency: document.getElementById('currency-select').value,
        date: document.getElementById('input-date').value,
        ticker: finalTicker,
        stockName: finalStockName, // 종목명 따로 전송
        quantity: document.getElementById('input-quantity').value,
        price: document.getElementById('input-price').value
    };

    if (CONFIG.gasURL.includes('YOUR_DEPLOYED_SCRIPT_ID')) {
        showStatus('⚠️ Google Apps Script URL이 설정되지 않았습니다. (script.js 상단 확인)', 'error');
        return;
    }

    try {
        showStatus('⏳ 구글 시트에 기록 중입니다...', 'loading');
        submitBtn.disabled = true;

        // 구글 시트로 데이터 전송 (POST)
        const response = await fetch(CONFIG.gasURL, {
            method: 'POST',
            mode: 'no-cors',
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        showStatus('✅ 성공적으로 기록되었습니다! 멍!', 'success');

        // 3. 폼 초기화
        if (tickerSelect) tickerSelect.selectedIndex = 0;
        if (inputTicker) {
            inputTicker.value = '';
            inputTicker.style.display = 'none';
        }
        const qtyField = document.getElementById('input-quantity');
        const priceField = document.getElementById('input-price');

        if (qtyField) qtyField.value = '';
        if (priceField) priceField.value = '';

        // 데이터 갱신을 위해 3초 후 새로고침 호출 (시장 지수 새로고침은 제외)
        setTimeout(() => fetchData(false), 3000);
    } catch (err) {
        console.error('Submission error:', err);
        showStatus('❌ 기록 실패: ' + err.message, 'error');
    } finally {
        submitBtn.disabled = false;
    }
}

function showStatus(msg, type) {
    const statusMsg = document.getElementById('form-status');
    if (!statusMsg) return;
    statusMsg.textContent = msg;
    statusMsg.className = 'status-message status-' + type;
}
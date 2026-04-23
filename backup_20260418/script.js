// 🐶 바둑이의 주식 데이터 처리 스크립트
// 업데이트: 2026-04-09 (탭 인터페이스 및 MDD 분석 기능 추가)

// Chart.js Global Defaults for Dark Theme
if (window.Chart) {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
    Chart.defaults.font.family = "'Pretendard', 'Inter', sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
    Chart.defaults.plugins.tooltip.titleColor = '#f1f5f9';
    Chart.defaults.plugins.tooltip.bodyColor = '#f1f5f9';
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
}

const CONFIG = {
    summaryURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=0&single=true&output=csv",
    holdingsURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=58859590&single=true&output=csv",
    historyURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSyAvQcej4ON8V6_bjKeqDwbYP9SQL7gGWf9JPREaA5xzoFK3xrwqb4u1IL6lJYjUz5e0IZ9hGRkCKn/pub?gid=1345768416&single=true&output=csv",
    snapshotURL: "data_snapshot.json",
    gasURL: "https://script.google.com/macros/s/AKfycbzG5kiJsXFUghWs46b672yIPUr-E5a9oH_DwTMeWYz6LEtN1DHq_ZKCJGMIlV_jZKCNiA/exec"
};

const PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

let globalHoldings = [];
let usdKrwRate = 1400; // USD/KRW 환율 (기본값, Summary 시트에서 갱신)

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
    const analyzeBtn = document.getElementById('mdd-analyze-btn');

    if (!tickerInput) { alert("티커를 입력해주세요!"); return; }

    let ticker = tickerInput;
    if (/^\d{6}$/.test(ticker)) ticker += ".KS";

    // 기간 설정 (최근 10년)
    const p2 = Math.floor(Date.now() / 1000);
    const p1 = p2 - (10 * 365 * 24 * 60 * 60);

    try {
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = "⏳ 데이터 로드 중...";

        const yahooURL = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${p1}&period2=${p2}&interval=1d&events=history`;
        const data = await fetchWithFallback(yahooURL, true);

        if (!data) throw new Error(`데이터를 가져오지 못했습니다. 티커 '${ticker}'를 확인해주세요.`);

        analyzeBtn.innerHTML = "📊 통계 계산 중...";
        const history = parseYahooData(data, ticker);

        if (history.length === 0) throw new Error("분석할 수 있는 주가 데이터가 없습니다.");

        let runningMax = -Infinity;
        let mdd = 0;
        const processedData = history.map(d => {
            if (d.close > runningMax) runningMax = d.close;
            const drawdown = (d.close / runningMax - 1);
            if (drawdown < mdd) mdd = drawdown;
            return { ...d, runningMax, drawdown: drawdown };
        });

        const stats = calculateRecoveryStats(processedData);
        const currentDrawdown = (processedData[processedData.length - 1].drawdown * 100);

        renderMDDCharts(ticker, processedData, stats, currentDrawdown);
        updateMDDSummary(ticker, mdd, processedData, currentDrawdown);

    } catch (err) {
        console.error(err);
        alert(`분석 중 오류 발생: ${err.message}`);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = "분석 🔍";
    }
}

function calculateRecoveryStats(data) {
    const levels = Array.from({ length: 20 }, (_, i) => (i + 1) * 5); // 5, 10, ..., 100
    const totalDays = data.length;
    const latestPeak = data[data.length - 1].runningMax;

    return levels.map(level => {
        // 특정 MDD 레벨보다 높은(0%에 가까운) 위치에 있었던 날수 계산
        // 예: level이 100이면 drawdown >= -1.0 이므로 모든 날이 해당됨
        const threshold = -(level / 100);
        const count = data.filter(d => d.drawdown >= threshold).length;
        const prob = ((count / totalDays) * 100).toFixed(1);

        // 해당 주가 계산: 최근 최고가 * (1 - 하락폭%)
        const targetPrice = latestPeak * (1 - level / 100);

        return {
            level,
            count: count,
            prob,
            price: targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        };
    });
}

function renderMDDCharts(ticker, data, stats, currentDrawdown = 0) {
    const ctxMdd = document.getElementById('mddChart').getContext('2d');
    const dates = data.map(d => d.date);
    const prices = data.map(d => d.close);
    const drawdowns = data.map(d => d.drawdown * 100);

    if (mddChart) mddChart.destroy();

    const gradient = ctxMdd.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(251, 113, 133, 0.3)');
    gradient.addColorStop(1, 'rgba(251, 113, 133, 0)');

    mddChart = new Chart(ctxMdd, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Price ($)',
                    data: prices,
                    borderColor: '#38bdf8',
                    borderWidth: 2,
                    pointRadius: 0,
                    yAxisID: 'y'
                },
                {
                    label: 'Drawdown (%)',
                    data: drawdowns,
                    borderColor: '#fb7185',
                    backgroundColor: gradient,
                    fill: true,
                    borderWidth: 1,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { type: 'linear', position: 'left', grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                y1: { 
                    type: 'linear', position: 'right', 
                    min: -100, max: 0,
                    grid: { display: false },
                    ticks: { callback: v => v + '%' }
                },
                x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 10 } }
            }
        }
    });

    const ctxRec = document.getElementById('recoveryChart').getContext('2d');
    if (recoveryChart) recoveryChart.destroy();
    
    const currentLevel = Math.ceil(Math.abs(currentDrawdown) / 5) * 5;

    const backgroundColors = stats.map(s => {
        const p = parseFloat(s.prob);
        if (p >= 90) return '#fb7185';
        if (p >= 80) return '#fb923c';
        return 'rgba(129, 140, 248, 0.6)';
    });

    const borderColors = stats.map(s => s.level === currentLevel ? '#f1f5f9' : 'transparent');
    const borderWidths = stats.map(s => s.level === currentLevel ? 3 : 0);

    recoveryChart = new Chart(ctxRec, {
        type: 'bar',
        data: {
            labels: stats.map(s => `-${s.level}%`),
            datasets: [{
                label: 'Recovery Probability (%)',
                data: stats.map(s => s.prob),
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: borderWidths,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true, max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { callback: v => v + '%' }
                },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `확률: ${ctx.raw}% (MDD 0 ~ ${ctx.label} 구간)`
                    }
                }
            }
        }
    });

    const tbody = document.getElementById('mdd-stats-tbody');
    tbody.innerHTML = '';
    stats.forEach(s => {
        const tr = document.createElement('tr');
        if (s.level === currentLevel) tr.className = 'highlight';
        tr.innerHTML = `
            <td style="color:var(--negative)">-${s.level}%</td>
            <td style="font-weight:700">${s.prob}%</td>
            <td>${s.count}일</td>
            <td style="color:var(--primary)">$${s.price}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateMDDSummary(ticker, mdd, data, currentDrawdown = 0) {
    const summary = document.getElementById('mdd-summary-content');
    if (!summary) return;
    const lastPrice = data[data.length - 1].close;
    const totalReturn = ((lastPrice / data[0].close - 1) * 100).toFixed(2);
    
    summary.innerHTML = `
        <div class="mdd-summary-item"><span class="label">종목</span><span class="value">${ticker}</span></div>
        <div class="mdd-summary-item"><span class="label">최대 낙폭</span><span class="value" style="color:var(--negative)">${(mdd * 100).toFixed(2)}%</span></div>
        <div class="mdd-summary-item"><span class="label">현재 낙폭</span><span class="value" style="color:var(--negative)">${currentDrawdown.toFixed(2)}%</span></div>
        <div class="mdd-summary-item"><span class="label">누적 수익률</span><span class="value" style="color:var(--positive)">${totalReturn}%</span></div>
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

            const dailyElem = document.getElementById('card-daily-val');
            if (dailyElem) {
                dailyElem.textContent = row9[6] || "0";
                dailyElem.className = 'value ' + getColorClass(row9[6]);
            }

            document.getElementById('card-dividend-val').textContent = row9[11] || "0";
        }

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
                    // 환율 저장 (USD/KRW)
                    if (m.id === 'ex-rate') {
                        const rate = parseSafeFloat(row[15]);
                        if (rate > 100) usdKrwRate = rate;
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
    
    // 매매 기록용 종목 선택 드롭다운 초기화
    const stockSelect = document.getElementById('stock-name-select');
    if (stockSelect) {
        stockSelect.innerHTML = '<option value="">보유 종목 선택</option><option value="DIRECT">직접 입력 (신규)</option>';
    }

    data.forEach((row, i) => {
        if (i === 0 || !row[0] || ["종목명", "환율"].includes(row[0])) return;
        
        // 드롭다운에 추가
        if (stockSelect && row[0]) {
            const opt = document.createElement('option');
            opt.value = row[0]; // 종목명
            opt.dataset.ticker = row[1]; // 티커
            opt.textContent = row[0];
            stockSelect.appendChild(opt);
        }

        const weight = parseSafeFloat(row[9]), evalKRW = parseSafeFloat(row[8]);
        if (weight === 0 && evalKRW === 0) return;
        
        const rawTicker = row[1] || '';
        const ticker = rawTicker.includes(':') ? rawTicker.split(':').pop() : rawTicker;

        globalHoldings.push({
            name: row[0], ticker: ticker, weight, returnRate: parseSafeFloat(row[7]), eval: evalKRW,
            profit: parseSafeFloat(row[14]), dailyChange: parseSafeFloat(row[10]),
            shares: row[3] || '-',       
            avgCost: row[4] || '-',      
            currentPriceKRW: row[5] || row[8] || '-',  
            display: { weight: row[9], returnRate: row[7], evalKRW: row[8], profitKRW: row[14], dailyChange: row[10], currentPrice: row[5] || row[8] }
        });
    });
    sortHoldings(sortState.column, false);
    renderBubbleChart(globalHoldings);
}

// 직접 입력 토글 로직 추가
document.addEventListener('DOMContentLoaded', () => {
    const stockSelect = document.getElementById('stock-name-select');
    const stockInput = document.getElementById('stock-name-input');
    if (stockSelect && stockInput) {
        stockSelect.addEventListener('change', (e) => {
            stockInput.style.display = e.target.value === 'DIRECT' ? 'block' : 'none';
        });
    }
});

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
        tr.style.cursor = 'pointer';
        tr.onclick = () => openStockModal(item);
        
        // 한국 주식 여부 (6자리 숫자 티커)
        const isKR = /^\d{6}/.test(item.ticker);
        const formattedProfit = item.display.profitKRW + '원';
        const formattedEval = item.display.evalKRW + '원';
        
        tr.innerHTML = `<td>${item.name}</td><td>${item.display.weight}%</td><td class="${getColorClass(item.display.returnRate)}">${item.display.returnRate}%</td><td class="${getColorClass(item.display.profitKRW)}">${formattedProfit}</td><td>${formattedEval}</td><td class="${getColorClass(item.display.dailyChange)}">${item.display.dailyChange}%</td>`;
        tbody.appendChild(tr);
    });

    // Also render the card view
    renderHoldingsCards();
}

// ===== Holdings Cards View =====

// Store for mini sparkline chart instances (prevent duplicate canvas issues)
const sparklineCharts = {};
let intradayChart = null;

// Current sort key for holdings cards (default: weight descending)
let currentHoldingsSort = 'weight';

function setHoldingsSort(key) {
    currentHoldingsSort = key;
    // Update button active states
    document.querySelectorAll('.sort-btn').forEach(btn => btn.classList.remove('active'));
    const map = { weight: 'sort-btn-weight', returnRate: 'sort-btn-return', profit: 'sort-btn-profit', dailyChange: 'sort-btn-change' };
    if (map[key]) document.getElementById(map[key])?.classList.add('active');
    renderHoldingsCards();
}

function renderHoldingsCards() {
    const grid = document.getElementById('holdings-cards-view');
    if (!grid) return;
    grid.innerHTML = '';

    // Destroy existing sparkline charts
    Object.values(sparklineCharts).forEach(c => { try { c.destroy(); } catch(e) {} });

    // --- 상승/하락 카운터 ---
    const upCount   = globalHoldings.filter(h => h.dailyChange >= 0).length;
    const downCount = globalHoldings.filter(h => h.dailyChange < 0).length;
    const upEl   = document.getElementById('holdings-up-count');
    const downEl = document.getElementById('holdings-down-count');
    if (upEl)   upEl.textContent   = `▲ ${upCount}`;
    if (downEl) downEl.textContent = `▼ ${downCount}`;

    // --- 정렬 ---
    const sortKey = currentHoldingsSort;
    const sorted = [...globalHoldings].sort((a, b) => {
        let va, vb;
        if (sortKey === 'weight')      { va = a.weight;      vb = b.weight; }
        else if (sortKey === 'returnRate') { va = a.returnRate;  vb = b.returnRate; }
        else if (sortKey === 'profit')  { va = a.profit || 0; vb = b.profit || 0; }
        else if (sortKey === 'dailyChange') { va = a.dailyChange; vb = b.dailyChange; }
        else { va = a.weight; vb = b.weight; }
        return vb - va; // 내림차순
    });

    sorted.forEach((item, idx) => {
        const isPositive = item.dailyChange >= 0;
        const posClass = isPositive ? 'positive' : 'negative';
        const trendSvgUp = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`;
        const trendSvgDown = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/></svg>`;
        const trendSvg = isPositive ? trendSvgUp : trendSvgDown;
        const changeSign = isPositive ? '+' : '';
        const currencyIsKRW = item.ticker && /^\d{6}/.test(item.ticker);
        
        // 현재가 포맷팅: 한국 주식은 소수점 제거 및 콤마 추가
        let displayPrice = item.display.currentPrice;
        if (currencyIsKRW) {
            const priceNum = Math.round(parseSafeFloat(item.display.currentPrice));
            displayPrice = priceNum.toLocaleString() + '원';
        } else {
            displayPrice = '$' + item.display.currentPrice;
        }

        const currencyLabel = currencyIsKRW ? 'KRW' : 'USD';
        const currencyClass = currencyIsKRW ? 'krw' : '';

        // 비중 표시
        const weightText = item.weight != null && item.weight !== '' ? `${parseFloat(item.weight).toFixed(1)}%` : '';

        const cardId = `stock-card-${idx}`;
        const sparkId = `sparkline-${idx}`;

        const card = document.createElement('div');
        card.className = `stock-card ${posClass}`;
        card.id = cardId;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `${item.name} 상세보기`);

        card.innerHTML = `
            <div class="card-top">
                <div class="card-ticker-section">
                    <div class="card-ticker-row">
                        <span class="card-ticker">${item.ticker || item.name}</span>
                        <span class="card-currency-badge ${currencyClass}">${currencyLabel}</span>
                        ${weightText ? `<span class="card-weight-badge">${weightText}</span>` : ''}
                    </div>
                    <div class="card-company">${item.name}</div>
                </div>
                <div class="card-trend-icon ${posClass}">${trendSvg}</div>
            </div>

            <div class="card-price-section">
                <div class="card-price">${displayPrice}</div>
                <div class="card-change ${posClass}">${changeSign}${item.display.dailyChange}%</div>
            </div>

            <div class="card-sparkline">
                <canvas id="${sparkId}"></canvas>
            </div>

            <div class="card-bottom">
                <div class="card-bottom-row">
                    <span class="label">Shares</span>
                    <span class="value">${item.shares || '-'}</span>
                </div>
                <div class="card-bottom-row">
                    <span class="label">Total Value</span>
                    <span class="value">${item.display.evalKRW || '-'}원</span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => openStockModal(item));
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openStockModal(item); });
        grid.appendChild(card);

        // Draw mini sparkline after appending
        requestAnimationFrame(() => drawSparkline(sparkId, item, isPositive));
    });
}


function drawSparkline(canvasId, item, isPositive) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Generate a representative sparkline based on returnRate and dailyChange
    const points = generateSparklineData(item.returnRate, item.dailyChange, 20);
    const color = isPositive ? '#4ade80' : '#fb7185';

    if (sparklineCharts[canvasId]) {
        try { sparklineCharts[canvasId].destroy(); } catch(e) {}
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 40);
    gradient.addColorStop(0, isPositive ? 'rgba(74,222,128,0.25)' : 'rgba(251,113,133,0.25)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    sparklineCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(points.length).fill(''),
            datasets: [{
                data: points,
                borderColor: color,
                borderWidth: 1.5,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: { duration: 600 },
            scales: {
                x: { display: false },
                y: { display: false }
            },
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function generateSparklineData(returnRate, dailyChange, count = 20) {
    const points = [];
    let val = 100;
    // Simulate a rough path ending at today's change direction
    for (let i = 0; i < count; i++) {
        const noise = (Math.random() - 0.48) * 1.2;
        const trend = dailyChange / count;
        val += trend + noise;
        points.push(val);
    }
    return points;
}

// ===== View Toggle =====
function switchHoldingsView(view) {
    const cardsView = document.getElementById('holdings-cards-view');
    const tableView = document.getElementById('holdings-table-view');
    const cardsBtn = document.getElementById('view-cards-btn');
    const tableBtn = document.getElementById('view-table-btn');

    if (view === 'cards') {
        cardsView.style.display = 'grid';
        tableView.style.display = 'none';
        cardsBtn.classList.add('active');
        tableBtn.classList.remove('active');
    } else {
        cardsView.style.display = 'none';
        tableView.style.display = 'block';
        cardsBtn.classList.remove('active');
        tableBtn.classList.add('active');
    }
}


// ===== Stock Detail Modal =====
async function openStockModal(item) {
    const overlay = document.getElementById('stock-modal-overlay');
    if (!overlay) return;

    const isPositive = item.dailyChange >= 0;
    const posClass   = isPositive ? 'positive' : 'negative';
    const changeSign = isPositive ? '+' : '';
    const currencyIsKRW = item.ticker && /^\d{6}/.test(item.ticker);
    const currencyLabel = currencyIsKRW ? 'KRW' : 'USD';

    // 헬퍼 함수
    const fmtKRW  = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
    const fmtUSD  = (n) => (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtUSDabs = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtKRWS = (n) => (n >= 0 ? '+' : '') + Math.round(n).toLocaleString('ko-KR') + '원';

    // Header
    const modalIcon = document.getElementById('modal-icon');
    modalIcon.className = `modal-icon ${posClass}`;
    modalIcon.textContent = isPositive ? '↗' : '↘';

    document.getElementById('modal-ticker').textContent = item.ticker || item.name;
    const currBadge = document.getElementById('modal-currency');
    currBadge.textContent = currencyLabel;
    currBadge.className = `modal-currency-badge ${currencyIsKRW ? 'krw' : ''}`;
    document.getElementById('modal-company').textContent = item.name;

    // Price Section
    document.getElementById('modal-current-price').textContent = item.display.evalKRW || '-';
    const diffElem = document.getElementById('modal-price-diff');
    const pctElem  = document.getElementById('modal-price-pct');

    const evalKRWNum   = item.eval || 0;
    const dailyAmtKRW  = evalKRWNum * item.dailyChange / 100;
    diffElem.textContent = fmtKRWS(dailyAmtKRW);
    diffElem.className   = isPositive ? 'positive' : 'negative';
    pctElem.textContent  = `(${changeSign}${item.dailyChange}%)`;
    pctElem.className    = isPositive ? 'positive' : 'negative';

    // --- Stats Cards ---
    document.getElementById('modal-shares').textContent = item.shares || '-';

    const avgCostNum    = parseSafeFloat(item.avgCost);
    const avgCostEl     = document.getElementById('modal-avg-cost');
    const avgCostSubEl  = document.getElementById('modal-avg-cost-sub');
    const totalValEl    = document.getElementById('modal-total-value');
    const totalValSubEl = document.getElementById('modal-total-value-sub');
    const todayPLEl     = document.getElementById('modal-today-pl');
    const todayPLSubEl  = document.getElementById('modal-today-pl-sub');

    if (!currencyIsKRW && usdKrwRate > 100) {
        // USD 종목: 달러(메인) + 원화(보조)
        const avgCostUSD = avgCostNum > 0 ? avgCostNum / usdKrwRate : 0;
        avgCostEl.textContent    = avgCostUSD > 0 ? fmtUSDabs(avgCostUSD) : (item.avgCost || '-');
        avgCostSubEl.textContent = avgCostNum  > 0 ? fmtKRW(avgCostNum)   : '';

        const evalUSD = evalKRWNum / usdKrwRate;
        totalValEl.textContent    = evalKRWNum > 0 ? fmtUSDabs(evalUSD)  : (item.display.evalKRW || '-');
        totalValSubEl.textContent = evalKRWNum > 0 ? fmtKRW(evalKRWNum)  : '';

        const todayUSD = dailyAmtKRW / usdKrwRate;
        todayPLEl.textContent    = (todayUSD >= 0 ? '+$' : '-$') + Math.abs(todayUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        todayPLEl.className      = isPositive ? 'value-up' : 'value-down';
        todayPLSubEl.textContent = fmtKRWS(dailyAmtKRW);
        todayPLSubEl.className   = isPositive ? 'sub-up' : 'sub-down';
    } else {
        // KRW 종목: 원화만
        avgCostEl.textContent    = item.avgCost || '-';
        avgCostSubEl.textContent = '';
        totalValEl.textContent    = item.display.evalKRW || '-';
        totalValSubEl.textContent = '';
        todayPLEl.textContent    = fmtKRWS(dailyAmtKRW);
        todayPLEl.className      = isPositive ? 'value-up' : 'value-down';
        todayPLSubEl.textContent = '';
    }

    const hlCard = todayPLEl.closest('.modal-stat-card');
    if (hlCard) hlCard.classList.toggle('negative-pl', !isPositive);

    // Trading Info
    document.getElementById('modal-open').textContent   = item.display.evalKRW || '-';
    document.getElementById('modal-high').textContent   = item.display.evalKRW || '-';
    document.getElementById('modal-low').textContent    = item.display.evalKRW || '-';
    document.getElementById('modal-volume').textContent = '-';

    // Your Position — 모두 원화
    const profitKRW    = parseSafeFloat(item.display.profitKRW);
    const costBasisKRW = evalKRWNum - profitKRW;

    document.getElementById('modal-market-value').textContent = evalKRWNum > 0 ? fmtKRW(evalKRWNum) : (item.display.evalKRW || '-');
    document.getElementById('modal-cost-basis').textContent   = evalKRWNum > 0 ? fmtKRW(costBasisKRW) : '-';

    const totalGainElem = document.getElementById('modal-total-gain');
    totalGainElem.textContent = profitKRW !== 0
        ? (profitKRW >= 0 ? '+' : '') + Math.round(profitKRW).toLocaleString('ko-KR') + '원'
        : (item.display.profitKRW || '-');
    totalGainElem.className = getColorClass(item.display.profitKRW);

    const returnElem = document.getElementById('modal-return');
    returnElem.textContent = `${item.display.returnRate}%`;
    returnElem.className   = getColorClass(item.display.returnRate);

    // Show modal
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Draw intraday chart
    drawIntradayChart(item);

    // Fetch real intraday data if available
    if (item.ticker) {
        fetchIntradayData(item);
    }
}



function closeStockModal(event) {
    // If called with a click event (overlay click), only close if clicking the overlay itself
    if (event instanceof Event && event.target !== document.getElementById('stock-modal-overlay')) return;
    const overlay = document.getElementById('stock-modal-overlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// ESC key to close
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('stock-modal-overlay');
        if (overlay && overlay.classList.contains('active')) {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
});

function drawIntradayChart(item, labels = null, prices = null) {
    const canvas = document.getElementById('modal-intraday-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (intradayChart) { try { intradayChart.destroy(); } catch(e) {} }

    const isPositive = item.dailyChange >= 0;
    const color = isPositive ? '#4ade80' : '#fb7185';

    // Use real data if provided, otherwise simulate
    const chartLabels = labels || generateIntradayLabels();
    const chartPrices = prices || generateIntradayPrices(item.dailyChange, chartLabels.length);

    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, isPositive ? 'rgba(74,222,128,0.25)' : 'rgba(251,113,133,0.25)');
    gradient.addColorStop(0.6, isPositive ? 'rgba(74,222,128,0.05)' : 'rgba(251,113,133,0.05)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    intradayChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                data: chartPrices,
                borderColor: color,
                borderWidth: 2,
                fill: true,
                backgroundColor: gradient,
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: color
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 7, autoSkip: true }
                },
                y: {
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#64748b', font: { size: 10 }, callback: v => v.toFixed(0) }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.95)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    padding: 10,
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.y.toFixed(2)}`
                    }
                }
            }
        }
    });
}

function generateIntradayLabels() {
    const labels = [];
    for (let h = 9; h <= 16; h++) {
        for (let m = 0; m < 60; m += 15) {
            if (h === 16 && m > 0) break;
            labels.push(`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`);
        }
    }
    return labels;
}

function generateIntradayPrices(dailyChange, count) {
    const prices = [];
    let price = 100;
    const totalChange = dailyChange / 100;
    for (let i = 0; i < count; i++) {
        const progress = i / (count - 1);
        const trend = totalChange * progress;
        const noise = (Math.random() - 0.48) * 0.4;
        price = 100 + (trend * 100) + noise;
        prices.push(parseFloat(price.toFixed(2)));
    }
    return prices;
}

async function fetchIntradayData(item) {
    try {
        let ticker = item.ticker;
        if (/^\d{6}$/.test(ticker)) ticker += '.KS';

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=15m&range=1d`;
        const result = await fetchWithFallback(url, true);

        if (!result || result.type !== 'json') return;

        const chart = result.data.chart;
        if (!chart || !chart.result || chart.result.length === 0) return;

        const chartResult = chart.result[0];
        const timestamps = chartResult.timestamp;
        const closes = chartResult.indicators.quote[0].close;
        const opens = chartResult.indicators.quote[0].open;
        const highs = chartResult.indicators.quote[0].high;
        const lows = chartResult.indicators.quote[0].low;
        const volumes = chartResult.indicators.quote[0].volume;
        const meta = chartResult.meta;

        if (!timestamps || !closes) return;

        const labels = timestamps.map(ts => {
            const d = new Date(ts * 1000);
            return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        });

        const prices = closes.map((c, i) => c || closes[i-1] || closes[0]);
        const validPrices = prices.filter(p => p !== null && !isNaN(p));
        if (validPrices.length < 2) return;

        // Update intraday chart with real data
        drawIntradayChart(item, labels, prices);

        // Update trading info with real Yahoo data
        const currentPrice = meta.regularMarketPrice;
        const openPrice = meta.regularMarketOpen || meta.chartPreviousClose;
        const highPrice = meta.regularMarketDayHigh;
        const lowPrice = meta.regularMarketDayLow;
        const volume = meta.regularMarketVolume;

        const formatter = val => val ? val.toFixed(2) : '-';
        document.getElementById('modal-open').textContent = openPrice ? formatter(openPrice) : '-';
        document.getElementById('modal-high').textContent = highPrice ? formatter(highPrice) : '-';
        document.getElementById('modal-low').textContent = lowPrice ? formatter(lowPrice) : '-';
        document.getElementById('modal-volume').textContent = volume ? formatVolume(volume) : '-';

    } catch(e) {
        console.warn('Intraday data fetch failed:', e);
    }
}

function formatVolume(vol) {
    if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
    if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
    if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
    return vol.toLocaleString();
}



function renderSummaryChart(labels, investData, evalData) {
    const canvas = document.getElementById('summaryChart'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (summaryChart) summaryChart.destroy();
    
    summaryChart = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels, 
            datasets: [
                { 
                    label: '투자원금', 
                    data: investData, 
                    backgroundColor: 'rgba(129, 140, 248, 0.6)', 
                    borderColor: '#818cf8',
                    borderWidth: 1,
                    borderRadius: 6
                }, 
                { 
                    label: '평가금액', 
                    data: evalData, 
                    backgroundColor: 'rgba(56, 189, 248, 0.6)', 
                    borderColor: '#38bdf8',
                    borderWidth: 1,
                    borderRadius: 6
                }
            ] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { position: 'top', align: 'end', labels: { boxWidth: 12, padding: 20 } }
            }
        }
    });
}

function renderHistoryChart(data) {
    const canvas = document.getElementById('historyChart'); if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    const dates = [], evals = [], invests = [], incomes = [], dividends = [];

    data.slice(1).forEach(row => {
        if (!row[0]) return;
        dates.push(row[0]);
        evals.push(parseSafeFloat(row[1]) / 10000000);
        invests.push(parseSafeFloat(row[2]) / 10000000);
        incomes.push(parseSafeFloat(row[3]) / 10000000);
        dividends.push(parseSafeFloat(row[11]) / 10000000);
    });

    if (historyChart) historyChart.destroy();
    
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                { 
                    label: '평가금 (천만)', 
                    data: evals, 
                    borderColor: '#38bdf8', 
                    backgroundColor: 'transparent',
                    fill: false, 
                    tension: 0.4, 
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    borderWidth: 3
                },
                { 
                    label: '투자금 (천만)', 
                    data: invests, 
                    borderColor: '#818cf8', 
                    backgroundColor: 'transparent',
                    fill: false, 
                    tension: 0.4, 
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    borderWidth: 2,
                    borderDash: [5, 5]
                },
                { 
                    label: '수입금 (천만)', 
                    data: incomes, 
                    borderColor: '#4ade80', 
                    backgroundColor: 'transparent',
                    fill: false, 
                    tension: 0.4, 
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    borderWidth: 2
                },
                { 
                    label: '배당금 (천만)', 
                    data: dividends, 
                    borderColor: '#facc15', 
                    backgroundColor: 'transparent',
                    fill: false, 
                    tension: 0.4, 
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    title: { display: false },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { callback: (value) => value.toLocaleString() }
                },
                x: {
                    grid: { display: false },
                    ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }
                }
            },
            plugins: {
                legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, padding: 20 } },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label.split(' ')[0] || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(1) + '천만원';
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
    const ctx = canvas.getContext('2d');
    
    // 수익액 절대값 중 최대값 찾기 (색상 농도 계산용)
    const maxAbsProfit = Math.max(...holdings.map(h => Math.abs(h.profit || 0)), 1);

    const bubbleData = holdings.map(item => {
        const profit = item.profit || 0;
        const absProfit = Math.abs(profit);
        
        // 농도 계산 (최소 0.3에서 최대 0.9까지)
        const intensity = 0.3 + (absProfit / maxAbsProfit) * 0.6;
        
        // 색상 결정 (수익: 빨강, 손실: 파랑)
        const color = profit >= 0 
            ? `rgba(251, 113, 133, ${intensity})` // Reddish
            : `rgba(56, 189, 248, ${intensity})`; // Bluish
            
        const borderColor = profit >= 0 ? '#fb7185' : '#38bdf8';

        return {
            label: item.name,
            data: [{ 
                x: item.dailyChange, 
                y: item.returnRate, 
                r: Math.min(40, Math.sqrt(item.eval / 500000) * 2), // 크기 약간 조정
                eval: item.eval,
                name: item.name // 플러그인에서 사용
            }],
            backgroundColor: color,
            borderColor: borderColor,
            borderWidth: 1
        };
    });

    if (bubbleChart) bubbleChart.destroy();
    bubbleChart = new Chart(ctx, {
        type: 'bubble',
        data: { datasets: bubbleData },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: '일일 변동률 (%)', color: '#94a3b8' },
                    grid: {
                        color: (context) => context.tick.value === 0 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                        lineWidth: (context) => context.tick.value === 0 ? 2 : 1
                    }
                },
                y: {
                    title: { display: true, text: '전체 수익률 (%)', color: '#94a3b8' },
                    grid: {
                        color: (context) => context.tick.value === 0 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                        lineWidth: (context) => context.tick.value === 0 ? 2 : 1
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const name = context.dataset.label;
                            const d = context.raw;
                            return `${name}: 수익률 ${d.y.toFixed(2)}%, 일변동 ${d.x.toFixed(2)}%`;
                        }
                    }
                }
            }
        },
        plugins: [{
            id: 'bubbleLabels',
            afterDatasetsDraw: (chart) => {
                const {ctx} = chart;
                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    if (!meta.hidden) {
                        meta.data.forEach((element, index) => {
                            const {x, y} = element.getProps(['x', 'y'], true);
                            const data = dataset.data[index];
                            const radius = element.options.radius;
                            
                            // 버블이 일정 크기 이상일 때만 이름 표시
                            if (radius > 10) {
                                ctx.fillStyle = '#ffffff';
                                ctx.font = `bold ${Math.min(radius/2, 12)}px Pretendard`;
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                // 텍스트 그림자 효과 (가독성 증대)
                                ctx.shadowBlur = 4;
                                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                                ctx.fillText(data.name, x, y);
                                ctx.shadowBlur = 0;
                            }
                        });
                    }
                });
            }
        }]
    });
}

async function handleTransactionSubmit(e) {
    e.preventDefault();
    const stockSelect = document.getElementById('stock-name-select');
    const stockInput = document.getElementById('stock-name-input');
    const type = document.getElementById('type-select').value;

    let stockName, stockCode;

    if (['현금입금', '현금출금'].includes(type)) {
        stockName = '현금';
        stockCode = '';
    } else if (type === '배당금') {
        stockName = '현금';
        if (stockSelect.value === 'DIRECT') {
            stockCode = stockInput.value.trim();
        } else {
            const selectedOpt = stockSelect.options[stockSelect.selectedIndex];
            stockCode = selectedOpt.value; // 선택된 종목명
        }
    } else {
        // 매수/매도
        if (stockSelect.value === 'DIRECT') {
            stockName = stockInput.value.trim();
            stockCode = '';
        } else {
            const selectedOpt = stockSelect.options[stockSelect.selectedIndex];
            stockName = selectedOpt.value;
            stockCode = selectedOpt.dataset.ticker || '';
        }
    }

    const submitBtn = document.querySelector('.submit-btn');
    const formData = {
        date: document.getElementById('date-input').value,
        stockName: stockName,
        stockCode: stockCode,
        currency: document.getElementById('currency-select').value,
        type: type,
        quantity: parseFloat(document.getElementById('quantity-input').value) || 0,
        price: parseFloat(document.getElementById('price-input').value) || 0,
        account: document.getElementById('account-select').value
    };

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ 전송 중...';

        await fetch(CONFIG.gasURL, {
            method: 'POST',
            mode: 'no-cors',
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        // 성공 알림 (간단하게 버튼 텍스트 변경)
        submitBtn.textContent = '✅ 저장 완료!';
        
        // 특정 필드만 초기화 (수량, 단가, 종목명)
        document.getElementById('quantity-input').value = '';
        document.getElementById('price-input').value = '';
        // 신규 입력창 숨기기
        if (stockInput) {
            stockInput.value = '';
            stockInput.style.display = 'none';
        }
        if (stockSelect) stockSelect.selectedIndex = 0;

        setTimeout(() => {
            submitBtn.disabled = false;
            submitBtn.textContent = '기록하기 🐕';
            fetchData(false);
        }, 1500);

    } catch (err) {
        console.error('GAS transaction failed:', err);
        alert('전송 실패: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = '기록하기 🐕';
    }
}

async function requestMarketRefresh() {
    try {
        const params = new URLSearchParams({ command: "refresh_market" });
        fetch(CONFIG.gasURL, { method: 'POST', mode: 'no-cors', body: params });
    } catch (e) {
        console.warn('Market refresh request failed:', e);
    }
}

// ===== Market Detail Modal =====
let marketChart = null;
let currentMarketTicker = '';
let currentMarketTitle = '';

async function openMarketModal(ticker, title) {
    const overlay = document.getElementById('market-modal-overlay');
    if (!overlay) return;

    currentMarketTicker = ticker;
    currentMarketTitle = title;
    
    document.getElementById('market-modal-title').textContent = title;
    document.getElementById('market-modal-subtitle').textContent = `${ticker} 상세 분석`;
    document.getElementById('market-stats-summary').innerHTML = '<div style="text-align:center; padding:1rem;">⏳ 데이터를 불러오는 중...</div>';

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // 기본적으로 YTD 데이터 로드
    updateMarketRange('ytd');
}

function closeMarketModal(event) {
    if (event instanceof Event && event.target !== document.getElementById('market-modal-overlay')) return;
    const overlay = document.getElementById('market-modal-overlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

async function updateMarketRange(range) {
    // 버튼 활성화 상태 변경
    document.querySelectorAll('[id^="market-range-"]').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`market-range-${range}`).classList.add('active');

    let period = range === 'ytd' ? 'ytd' : (range === '1y' ? '1y' : '3y');

    // query1과 query2 두 서버를 순차적으로 시도
    const hostnames = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
    let result = null;
    let lastError = null;

    for (const hostname of hostnames) {
        try {
            const url = `https://${hostname}/v8/finance/chart/${currentMarketTicker}?interval=1d&range=${period}`;
            console.log(`시장 데이터 시도 (${hostname}): ${url}`);
            result = await fetchWithFallback(url, true);
            
            if (result && result.data && result.data.chart && result.data.chart.result && result.data.chart.result[0]) {
                break; // 성공하면 중단
            }
        } catch (err) {
            lastError = err;
            console.warn(`${hostname} 시도 실패:`, err);
        }
    }

    try {
        if (!result || !result.data || !result.data.chart || !result.data.chart.result || !result.data.chart.result[0]) {
            throw new Error("데이터를 가져오지 못했습니다. (서버 응답 없음)");
        }
        
        const chartData = result.data.chart.result[0];
        const timestamps = chartData.timestamp;
        const indicators = chartData.indicators.quote[0];
        const prices = indicators.close;
        
        if (!timestamps || !prices || timestamps.length === 0) {
            throw new Error("해당 기간의 가격 데이터가 없습니다.");
        }

        // 유효한 데이터만 필터링 (null 제외)
        const validData = timestamps.map((ts, i) => ({
            timestamp: ts,
            price: prices[i]
        })).filter(d => d.price !== null && d.price !== undefined);

        if (validData.length === 0) throw new Error("유효한 가격 데이터가 없습니다.");

        const labels = validData.map(d => {
            const date = new Date(d.timestamp * 1000);
            return date.getFullYear().toString().slice(-2) + '.' + (date.getMonth() + 1).toString().padStart(2, '0') + '.' + date.getDate().toString().padStart(2, '0');
        });
        const filteredPrices = validData.map(d => d.price);

        // 차트 그리기
        renderMarketHistoryChart(labels, filteredPrices);
        
        // 통계 업데이트
        updateMarketStats(filteredPrices, range);

    } catch (err) {
        console.error("Market data processing error:", err);
        document.getElementById('market-stats-summary').innerHTML = `<div style="text-align:center; padding:1rem; color:var(--negative);">⚠️ ${err.message}</div>`;
    }
}

function renderMarketHistoryChart(labels, prices) {
    const canvas = document.getElementById('market-history-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (marketChart) marketChart.destroy();

    const isUp = prices[prices.length - 1] >= prices[0];
    const color = isUp ? '#4ade80' : '#fb7185';
    const gradient = ctx.createLinearGradient(0, 0, 0, 350);
    gradient.addColorStop(0, isUp ? 'rgba(74, 222, 128, 0.2)' : 'rgba(251, 113, 133, 0.2)');
    gradient.addColorStop(1, 'transparent');

    marketChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Price',
                data: prices,
                borderColor: color,
                borderWidth: 2,
                fill: true,
                backgroundColor: gradient,
                pointRadius: 0,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { maxTicksLimit: 8, color: '#94a3b8' }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#f1f5f9'
                }
            }
        }
    });
}

function updateMarketStats(prices, range) {
    const startPrice = prices[0];
    const endPrice = prices[prices.length - 1];
    const highPrice = Math.max(...prices.filter(p => p !== null));
    const lowPrice = Math.min(...prices.filter(p => p !== null));
    const changePct = ((endPrice / startPrice - 1) * 100).toFixed(2);
    const drawdown = ((endPrice / highPrice - 1) * 100).toFixed(2);

    const statsSummary = document.getElementById('market-stats-summary');
    statsSummary.innerHTML = `
        <div class="mdd-summary-container" style="margin-bottom:0;">
            <div class="mdd-summary-item">
                <span class="label">기간 수익률</span>
                <span class="value ${changePct >= 0 ? 'value-up' : 'value-down'}">${changePct}%</span>
            </div>
            <div class="mdd-summary-item">
                <span class="label">최고가 (High)</span>
                <span class="value">${highPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
            <div class="mdd-summary-item">
                <span class="label">최저가 (Low)</span>
                <span class="value">${lowPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
            <div class="mdd-summary-item">
                <span class="label">고점 대비 낙폭</span>
                <span class="value value-down">${drawdown}%</span>
            </div>
        </div>
    `;
}

function goSlide(index) {
    const slider = document.getElementById('chart-slider');
    const slideWidth = slider.clientWidth;
    slider.scrollTo({ left: index * slideWidth, behavior: 'smooth' });
}

function updateSliderDots() {
    const slider = document.getElementById('chart-slider');
    if (!slider) return;
    
    // 정확한 인덱스 계산
    const index = Math.round(slider.scrollLeft / slider.offsetWidth);
    const dots = document.querySelectorAll('.slider-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });

    // 제목 업데이트
    const titleElem = document.getElementById('slider-title');
    if (titleElem) {
        titleElem.textContent = index === 0 ? "📈 자산 추이 (History)" : "📊 리스크 분석 (Bubble Chart)";
    }
    
    // 차트 리사이즈 및 업데이트 강제 실행
    if (index === 0 && historyChart) {
        historyChart.resize();
        historyChart.update('none');
    } else if (index === 1 && bubbleChart) {
        bubbleChart.resize();
        bubbleChart.update('none');
    }
}

// 스크롤 이벤트 감지하여 점 업데이트
document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('chart-slider');
    if (slider) {
        slider.addEventListener('scroll', () => {
            // 디바운싱: 성능을 위해 짧은 지연 후 실행
            clearTimeout(slider.scrollTimeout);
            slider.scrollTimeout = setTimeout(updateSliderDots, 100);
        });
    }
});

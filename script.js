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

// 💡 설정(CONFIG)은 외부 config.js 파일에서 로드됩니다.
if (typeof CONFIG === 'undefined') {
    console.warn("CONFIG is not defined. Using default values for snapshot.");
    window.CONFIG = {
        snapshotURL: "data_snapshot.json",
        summaryURL: "",
        holdingsURL: "",
        historyURL: "",
        gasURL: ""
    };
}

// Supabase 데이터 로드 예시 함수
async function fetchFromSupabase(table) {
    if (!CONFIG.supabaseURL) return null;
    try {
        const response = await fetch(`${CONFIG.supabaseURL}/rest/v1/${table}?select=*`, {
            headers: {
                "apikey": CONFIG.supabaseKey,
                "Authorization": `Bearer ${CONFIG.supabaseKey}`
            }
        });
        return await response.json();
    } catch (e) {
        console.error("Supabase fetch error:", e);
        return null;
    }
}

// 뷰 모드 설정 (auto, pc, mobile)
let globalHoldings = [];
let usdKrwRate = 1400; // USD/KRW 환율 (기본값, Summary 시트에서 갱신)
let isPrivacyMode = localStorage.getItem('privacy_mode') === 'true';
let userViewMode = localStorage.getItem('user_view_mode') || 'auto';

let rawHistoryData = [];
let currentHistoryRange = 'ALL';

let sortState = { column: 'weight', direction: 'desc' };
let summaryChart = null;
let historyChart = null;
let bubbleChart = null;
let mddChart = null;
let recoveryChart = null;

/**
 * 개인정보 마스킹 처리 함수
 * @param {string|number} val 마스킹할 값
 * @param {boolean} isName 계좌명/종목명 여부
 * @returns {string} 마스킹된 문자열
 */
function maskValue(val, isName = false) {
    if (!isPrivacyMode) return val;
    if (val === undefined || val === null || val === '') return val;

    if (isName) {
        return '●●●●●';
    }

    // 금액/숫자 마스킹 (숫자나 콤마가 포함된 문자열)
    const str = String(val);
    if (/[0-9]/.test(str)) {
        return '●●●,●●●';
    }
    return val;
}

/**
 * 큰 숫자를 모바일에서 짧게(만, 억) 표시하기 위한 HTML 생성
 * @param {string} valStr 원래 표시할 문자열 (예: "15,000,000")
 * @returns {string} 반응형 클래스가 적용된 HTML 문자열
 */
function getResponsiveValueHTML(valStr) {
    if (!valStr || valStr === "-" || typeof valStr !== 'string') return valStr;
    // 마스킹된 값이거나 비율(%)이면 그대로 반환
    if (valStr.includes('●') || valStr.includes('%')) return valStr;
    
    // 원본에서 숫자만 추출 (음수 기호 포함)
    const numStr = valStr.replace(/[^\d.-]/g, '');
    const num = Number(numStr);
    
    if (!isNaN(num) && Math.abs(num) >= 10000) {
        let shortStr = "";
        const absNum = Math.abs(num);
        const sign = num < 0 ? "-" : (valStr.startsWith("+") ? "+" : "");
        if (absNum >= 100000000) { // 1억 이상
            shortStr = sign + (absNum / 100000000).toFixed(2).replace(/\.?0+$/, '') + "억";
        } else if (absNum >= 10000) { // 1만 이상
            shortStr = sign + (absNum / 10000).toFixed(0) + "만";
        }
        
        if (shortStr) {
            return `<span class="full-val">${valStr}</span><span class="short-val">${shortStr}</span>`;
        }
    }
    return valStr;
}

/**
 * 주식 티커 포맷팅 (한국 주식 6자리 숫자 처리 등)
 */
function formatTicker(ticker) {
    if (!ticker) return ticker;
    const cleanTicker = ticker.trim().toUpperCase();
    if (/^\d{6}$/.test(cleanTicker)) {
        // 기본적으로 .KS를 붙이되, 향후 시장 구분 로직 확장 가능
        return cleanTicker + ".KS";
    }
    return cleanTicker;
}

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

    if (tabName === 'holdings-analysis-tab') {
        fetchHoldingsAnalysisData();
    }

    window.dispatchEvent(new Event('resize'));
}

/**
 * 💼 내 보유 종목 상세 분석 (실시간 데이터 연동)
 */
let holdingsAnalysisData = [];
let holdingsAnalysisSortState = { column: 'eval', direction: 'desc' };

function calculateRSIValue(closes, period = 14) {
    if (closes.length <= period) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff >= 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calculateMDDAndRecovery(closes) {
    if (closes.length === 0) return { mdd: "0.00", recoveryProb: "0.0" };
    let runningMax = -Infinity;
    let mdd = 0;
    const drawdowns = [];

    for (let i = 0; i < closes.length; i++) {
        if (closes[i] > runningMax) runningMax = closes[i];
        const drawdown = runningMax > 0 ? (closes[i] / runningMax - 1) : 0;
        if (drawdown < mdd) mdd = drawdown;
        drawdowns.push(drawdown);
    }
    const currentDrawdown = drawdowns[drawdowns.length - 1];
    let currentLevel = Math.ceil(Math.abs(currentDrawdown * 100) / 5) * 5;
    if (currentLevel === 0) currentLevel = 5;

    const threshold = -(currentLevel / 100);
    const count = drawdowns.filter(d => d >= threshold).length;
    const prob = closes.length > 0 ? ((count / closes.length) * 100).toFixed(1) : "0.0";

    return { mdd: (mdd * 100).toFixed(2), recoveryProb: prob };
}

async function fetchHoldingsAnalysisData() {
    const tableBody = document.querySelector('#holdings-analysis-table tbody');
    const statusText = document.getElementById('holdings-analysis-status');
    if (!tableBody || !globalHoldings || globalHoldings.length === 0) return;

    // 이미 데이터가 있고 분석이 완료된 상태라면 재분석하지 않음 (수동 새로고침 시에만 갱신)
    if (holdingsAnalysisData.length > 0 && holdingsAnalysisData.every(d => d.rsi !== "-")) {
        renderHoldingsAnalysisTable();
        return;
    }

    statusText.textContent = "⏳ 보유 종목 데이터를 실시간으로 분석 중입니다...";
    tableBody.innerHTML = '';

    // 초기 리스트 렌더링 (구글 시트 기반 기본 정보)
    holdingsAnalysisData = globalHoldings.map(h => ({
        ...h,
        marketCap: 0,
        price: 0,
        change: 0,
        mdd: "-",
        recoveryProb: "-",
        rsi: "-",
        dividendYield: "-"
    }));

    renderHoldingsAnalysisTable();

    // 병렬로 데이터 수집 (안정성을 위해 배치 처리)
    const batchSize = 3;
    for (let i = 0; i < holdingsAnalysisData.length; i += batchSize) {
        const batch = holdingsAnalysisData.slice(i, i + batchSize);
        await Promise.all(batch.map(async (item) => {
            try {
                const ticker = formatTicker(item.ticker);
                let divYield = "-";
                
                const sp500Item = sp500Data.find(d => formatTicker(d.ticker) === ticker);
                const kospiItem = kospi200Data.find(d => formatTicker(d.ticker) === ticker);
                
                if (sp500Item) {
                    item.marketCap = sp500Item.marketCap;
                    divYield = sp500Item.dividendYield;
                } else if (kospiItem) {
                    item.marketCap = kospiItem.marketCap;
                    divYield = kospiItem.dividendYield;
                } else {
                    // Attempt fallback to v7/finance/quote via proxy
                    try {
                        const quoteUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`;
                        const quoteRes = await fetchWithFallback(quoteUrl, true);
                        if (quoteRes && quoteRes.type === 'json' && quoteRes.data.quoteResponse && quoteRes.data.quoteResponse.result.length > 0) {
                            const q = quoteRes.data.quoteResponse.result[0];
                            item.marketCap = q.marketCap || 0;
                            if (q.dividendYield !== undefined) divYield = q.dividendYield.toFixed(2);
                            else if (q.trailingAnnualDividendYield !== undefined) divYield = (q.trailingAnnualDividendYield * 100).toFixed(2);
                        }
                    } catch (e) {}
                }
                
                // 1. 기본 정보 및 히스토리 (10년치 + 배당 정보)
                const historyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=10y&events=div`;
                const historyRes = await fetchWithFallback(historyUrl, true);
                
                if (historyRes && historyRes.type === 'json') {
                    const meta = historyRes.data.chart.result[0].meta;
                    item.price = meta.regularMarketPrice;
                    
                    // Use daily change directly from user's Google Sheet (Holdings / Summary)
                    item.change = item.display.dailyChange && item.display.dailyChange !== '-' ? item.display.dailyChange : (meta.chartPreviousClose ? ((item.price / meta.chartPreviousClose - 1) * 100).toFixed(2) : 0);
                    
                    // Calculate trailing 12 months dividend yield if missing
                    if (divYield === "-" && historyRes.data.chart.result[0].events && historyRes.data.chart.result[0].events.dividends) {
                        const divs = historyRes.data.chart.result[0].events.dividends;
                        const oneYearAgo = (Date.now() / 1000) - (365 * 24 * 60 * 60);
                        let totalDiv = 0;
                        for (const key in divs) {
                            if (divs[key].date >= oneYearAgo) totalDiv += divs[key].amount;
                        }
                        if (totalDiv > 0 && item.price > 0) divYield = ((totalDiv / item.price) * 100).toFixed(2);
                    }
                    item.dividendYield = divYield;

                    const history = parseYahooData(historyRes, ticker);
                    if (history && history.length > 0) {
                        const closes = history.map(h => h.close);
                        const mddInfo = calculateMDDAndRecovery(closes);
                        item.mdd = mddInfo.mdd;
                        item.recoveryProb = mddInfo.recoveryProb;
                        item.rsi = calculateRSIValue(closes).toFixed(1);
                    }
                }
            } catch (e) {
                console.warn(`Analysis failed for ${item.ticker}`, e);
            }
        }));
        
        renderHoldingsAnalysisTable();
        statusText.textContent = `⏳ 분석 중... (${Math.min(i + batchSize, holdingsAnalysisData.length)}/${holdingsAnalysisData.length})`;
        
        // API 차단 방지를 위한 미세한 지연
        if (i + batchSize < holdingsAnalysisData.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    statusText.textContent = `✅ 분석 완료 (${new Date().toLocaleTimeString()})`;
}

function sortHoldingsAnalysis(column) {
    if (holdingsAnalysisSortState.column === column) {
        holdingsAnalysisSortState.direction = holdingsAnalysisSortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        holdingsAnalysisSortState.column = column;
        // 숫자가 큰게 위로 오게 기본 설정 (MDD는 절대값이 큰게 위험하므로 desc)
        holdingsAnalysisSortState.direction = (column === 'name' || column === 'ticker') ? 'asc' : 'desc';
    }

    holdingsAnalysisData.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        if (column === 'mdd' || column === 'rsi' || column === 'dividendYield' || column === 'recoveryProb' || column === 'change') {
            valA = parseFloat(valA);
            valB = parseFloat(valB);
            if (isNaN(valA)) valA = -999;
            if (isNaN(valB)) valB = -999;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
            return holdingsAnalysisSortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        return holdingsAnalysisSortState.direction === 'asc' ? valA - valB : valB - valA;
    });

    renderHoldingsAnalysisTable();
}

function renderHoldingsAnalysisTable() {
    const tableBody = document.querySelector('#holdings-analysis-table tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    
    holdingsAnalysisData.forEach(data => {
        const tr = document.createElement('tr');
        tr.onclick = () => window.open(`https://finance.yahoo.com/quote/${data.ticker}`, '_blank');
        
        let rsiClass = 'rsi-neutral';
        const rsiValue = parseFloat(data.rsi);
        if (!isNaN(rsiValue)) {
            if (rsiValue >= 70) rsiClass = 'rsi-overbought';
            else if (rsiValue <= 30) rsiClass = 'rsi-oversold';
        }
        
        const pricePrefix = data.currency === 'KRW' ? '₩' : '$';
        const priceFmt = data.price ? (data.currency === 'KRW' ? data.price.toLocaleString() : data.price.toFixed(2)) : "-";
        const capFmt = data.marketCap ? (data.currency === 'KRW' ? formatKoreanCap(data.marketCap) : formatBillion(data.marketCap)) : "-";
        
        tr.innerHTML = `
            <td data-label="종목명"><strong>${data.name}</strong> <span style="color:#888; font-size:0.85em;">(${data.ticker})</span></td>
            <td data-label="시가 총액">${capFmt}</td>
            <td data-label="현재가">${pricePrefix}${priceFmt}</td>
            <td data-label="변동률" class="${getColorClass(data.change)}">${data.change}%</td>
            <td data-label="수익률" class="${getColorClass(data.returnRate)}">${data.returnRate}%</td>
            <td data-label="MDD" style="color:var(--negative)">${data.mdd === '-' ? '-' : data.mdd + '%'}</td>
            <td data-label="회복확률">
                ${data.recoveryProb === '-' ? '-' : `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="drawdown-text">${data.recoveryProb}%</span>
                </div>
                <div class="drawdown-bar-container" style="background:rgba(255,255,255,0.1); width:100%; height:4px; border-radius:2px; overflow:hidden; margin-top:4px;">
                    <div style="background:${parseFloat(data.recoveryProb) >= 80 ? '#4ade80' : '#fb7185'}; width: ${data.recoveryProb}%; height:100%;"></div>
                </div>
                `}
            </td>
            <td data-label="RSI(14)" style="text-align:center;">${data.rsi === '-' ? '-' : `<span class="rsi-tag ${rsiClass}">${data.rsi}</span>`}</td>
            <td data-label="분배율/배당률" style="text-align:center; color: var(--primary);">${data.dividendYield === '-' ? '-' : data.dividendYield + '%'}</td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * 대시보드 초기 설정 및 이벤트 리스너 등록
 */
function initDashboard() {
    // 🔒 Privacy Mode 초기화
    const privacyToggle = document.getElementById('privacy-toggle');
    if (privacyToggle) {
        privacyToggle.checked = isPrivacyMode;
        privacyToggle.addEventListener('change', (e) => {
            isPrivacyMode = e.target.checked;
            localStorage.setItem('privacy_mode', isPrivacyMode);
            // 데이터 재렌더링
            const cachedData = localStorage.getItem('dashboard_data_cache');
            if (cachedData) {
                renderFromData(JSON.parse(cachedData));
            }
        });
    }

    // 📅 기본 날짜 설정 (ID 수정: input-date -> date-input)
    const dateInput = document.getElementById('date-input');
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
        const tickerGroup = document.getElementById('stock-group');
        const priceGroup = document.getElementById('price-group');
        const qtyLabel = document.getElementById('qty-label');

        if (['현금입금', '현금출금'].includes(type)) {
            if (tickerGroup) tickerGroup.style.display = 'none';
            if (priceGroup) priceGroup.style.display = 'none';
            if (qtyLabel) qtyLabel.textContent = '금액';
        } else if (type === '배당금') {
            if (tickerGroup) tickerGroup.style.display = 'flex';
            if (priceGroup) priceGroup.style.display = 'none';
            if (qtyLabel) qtyLabel.textContent = '배당금액';
        } else {
            if (tickerGroup) tickerGroup.style.display = 'flex';
            if (priceGroup) priceGroup.style.display = 'flex';
            if (qtyLabel) qtyLabel.textContent = '수량';
        }
    });

    // 💰 통화 변경 시 종목 리스트 필터링
    document.getElementById('currency-select')?.addEventListener('change', (e) => {
        const selectedCurrency = e.target.value;
        const stockSelect = document.getElementById('stock-name-select');
        if (!stockSelect) return;

        Array.from(stockSelect.options).forEach(option => {
            if (option.value === "" || option.value === "DIRECT") {
                option.style.display = "block";
            } else {
                option.style.display = option.dataset.currency === selectedCurrency ? "block" : "none";
            }
        });
        
        // 필터링 후 현재 선택된 종목이 숨겨진 경우 초기화
        const selectedOption = stockSelect.options[stockSelect.selectedIndex];
        if (selectedOption && selectedOption.style.display === "none") {
            stockSelect.value = "";
        }
    });

    // 📈 종목 선택 시 통화 자동 변경
    document.getElementById('stock-name-select')?.addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        const currencySelect = document.getElementById('currency-select');
        if (selectedOption && selectedOption.dataset.currency && currencySelect) {
            currencySelect.value = selectedOption.dataset.currency;
        }
    });

    // 폼 제출 이벤트
    document.getElementById('transaction-form')?.addEventListener('submit', handleTransactionSubmit);

    // 1분마다 자동 새로고침 (활성 탭일 때만)
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            console.log("🔄 1분 주기 자동 새로고침 시작...");
            fetchData(false); // 자동 새로고침 시에는 구글 시트 강제 갱신 안 함
        }
    }, 1 * 60 * 1000);

    // 탭 가시성 변경 시 자동 새로고침 (1분 이상 경과 시)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const CACHE_KEY = 'dashboard_data_cache';
            const cachedData = localStorage.getItem(CACHE_KEY);
            if (cachedData) {
                const cache = JSON.parse(cachedData);
                const lastUpdate = cache.timestamp || 0;
                const now = new Date().getTime();
                // 1분(60,000ms) 이상 경과했으면 자동 새로고침
                if (now - lastUpdate > 1 * 60 * 1000) {
                    console.log("🔄 탭 활성화: 데이터가 1분 이상 경과하여 새로고침을 시작합니다.");
                    fetchData(false);
                }
            }
        }
    });

    const refreshBtn = document.getElementById('refresh-fab');
    if (refreshBtn) refreshBtn.addEventListener('click', async () => {
        if (refreshBtn.classList.contains('loading')) return;
        
        refreshBtn.classList.add('loading');
        
        const accounts = [
            "AJM", "AJMjr", "JJG-w-AJM", "JJG-w-KKO", 
            "JJG-w-AJMjr", "JJG-w-AJM-ISA", "JJG-w-KKO-ISA"
        ];
        
        // 진행 상태 표시용 토스트 생성
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
        
        const toast = document.createElement('div');
        toast.className = 'toast toast-info show';
        
        toast.innerHTML = `
            <span class="toast-icon">⏳</span>
            <div style="display:flex; flex-direction:column; flex:1;">
                <span class="toast-message">실시간 데이터 업데이트 중...</span>
                <div class="toast-progress-list">
                    ${accounts.map(acc => `
                        <div class="toast-progress-item">
                            <span>${acc}</span>
                            <span class="toast-progress-status pending" data-account="${acc}">대기 중</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        container.appendChild(toast);

        // 각 계정별 순차 업데이트
        for (const acc of accounts) {
            const statusEl = toast.querySelector(`[data-account="${acc}"]`);
            if (statusEl) {
                statusEl.textContent = '갱신 중...';
                statusEl.className = 'toast-progress-status loading';
            }
            
            try {
                await requestMarketRefresh(acc);
                if (statusEl) {
                    statusEl.textContent = '완료';
                    statusEl.className = 'toast-progress-status done';
                }
            } catch (e) {
                if (statusEl) {
                    statusEl.textContent = '실패';
                    statusEl.className = 'toast-progress-status fail';
                }
            }
        }

        toast.querySelector('.toast-message').textContent = '데이터 동기화 중 (3초)...';
        toast.querySelector('.toast-icon').textContent = '🔄';

        // 시트간 데이터 동기화 시간 대기
        await new Promise(resolve => setTimeout(resolve, 3000));

        toast.querySelector('.toast-message').textContent = '최신 데이터 불러오기 완료!';
        toast.querySelector('.toast-icon').textContent = '✅';
        toast.className = 'toast toast-success show';

        // 데이터 페치 (강제 갱신)
        await fetchData(true);
        
        refreshBtn.classList.remove('loading');
        
        // 5초 후 토스트 제거
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // 뷰 모드 표시기 초기 업데이트
    updateViewModeIndicator();
    window.addEventListener('resize', updateViewModeIndicator);

    // 초기화 로직 실행
    initDashboard();

    // 모바일 기기 감지 시 카드 뷰를 기본으로 설정
    if (window.innerWidth < 768) {
        switchHoldingsView('cards');
    }

    // 페이지 로드 시 구글 시트 데이터 갱신 요청 (Non-blocking)
    const refreshFab = document.getElementById('refresh-fab');
    if (refreshFab) refreshFab.classList.add('loading');

    console.log("🔄 대시보드 로드 시작...");

    // 시장 데이터 갱신을 백그라운드에서 요청
    requestMarketRefresh();

    // 즉시 데이터 페치 시작 (내부적으로 캐시를 먼저 보여주고 실시간 데이터를 가져옴)
    fetchData();
});

/**
 * 현재 화면 너비 및 사용자 설정을 기준으로 PC/Mobile 모드 표시기 업데이트
 */
function updateViewModeIndicator() {
    const textEl = document.getElementById('view-mode-text');
    const iconEl = document.getElementById('view-mode-icon');
    const indicatorEl = document.getElementById('view-mode-indicator');
    if (!textEl || !iconEl || !indicatorEl) return;

    // 1. 클래스 초기화
    document.body.classList.remove('force-mobile', 'force-pc');

    // 2. 현재 모드 판정
    let currentDisplayMode = '';
    let labelPrefix = '';

    if (userViewMode === 'auto') {
        currentDisplayMode = window.innerWidth <= 768 ? 'mobile' : 'pc';
        labelPrefix = 'Auto: ';
    } else {
        currentDisplayMode = userViewMode;
        labelPrefix = 'Manual: ';
        document.body.classList.add(`force-${userViewMode}`);
    }

    // 3. UI 업데이트
    if (currentDisplayMode === 'mobile') {
        textEl.textContent = labelPrefix + 'Mobile';
        iconEl.textContent = '📱';
        indicatorEl.style.color = 'var(--secondary)';
    } else {
        textEl.textContent = labelPrefix + 'PC';
        iconEl.textContent = '💻';
        indicatorEl.style.color = 'var(--primary)';
    }

    // 4. 모바일에서 PC 모드 강제 시 뷰포트 조절 (선택 사항)
    const viewport = document.querySelector('meta[name="viewport"]');
    if (userViewMode === 'pc' && window.innerWidth <= 768) {
        viewport.setAttribute('content', 'width=1200'); // 폰에서도 넓게 보이게 함
    } else {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
    }
}

/**
 * 뷰 모드 순환 전환 (Auto -> PC -> Mobile)
 */
function cycleViewMode() {
    if (userViewMode === 'auto') userViewMode = 'pc';
    else if (userViewMode === 'pc') userViewMode = 'mobile';
    else userViewMode = 'auto';

    localStorage.setItem('user_view_mode', userViewMode);
    updateViewModeIndicator();

    // 차트 크기 재조정을 위해 리사이즈 이벤트 발생
    window.dispatchEvent(new Event('resize'));

    // 보유 종목 뷰 자동 전환 (모바일 모드일 때 카드 뷰)
    if (userViewMode === 'mobile' || (userViewMode === 'auto' && window.innerWidth <= 768)) {
        switchHoldingsView('cards');
    }
}

/**
 * 사용자에게 알림 메시지를 표시하는 토스트 기능
 */
function showToast(message, type = 'info', duration = 5000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'warning') icon = '⚠️';
    if (type === 'error') icon = '❌';
    if (type === 'success') icon = '✅';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    // 서서히 나타나기
    setTimeout(() => toast.classList.add('show'), 10);

    // 일정 시간 후 삭제
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

async function fetchData(shouldRefreshMarket = true) {
    holdingsAnalysisData = []; // 보유 종목 분석 데이터 초기화
    const CACHE_KEY = 'dashboard_data_cache';

    // 1. 캐시된 데이터가 있으면 즉시 렌더링 (빈 화면 방지용)
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
        try {
            const cache = JSON.parse(cachedData);
            renderFromData(cache);
            
            // 캐시가 1분 이내라면 최신으로 간주하고 업데이트 문구 조정
            const now = new Date().getTime();
            const cacheAge = (now - (cache.timestamp || 0)) / 1000;
            if (cacheAge < 60) {
                updateTimestamp(true, "Cache");
            } else {
                updateTimestamp(false, "Cache (Old)");
            }
        } catch (e) { console.warn("Cache fail", e); }
    } else {
        updateTimestamp(null, "⏳ 데이터 로드 중...");
    }

    try {
        // 2. 실시간 데이터 및 마켓 차트 병렬 로드
        console.log("실시간 데이터 페칭 시작...");
        
        // 마켓 차트 업데이트를 즉시 시작 (await 하지 않음)
        const marketPromise = updateMarketCharts();

        // 구글 시트 캐시 방지를 위해 타임스탬프 추가
        const ts = new Date().getTime();
        const addTs = (url) => url ? (url + (url.includes('?') ? '&' : '?') + 't=' + ts) : url;

        const [summaryRes, holdingsRes, historyRes] = await Promise.all([
            fetchWithFallback(addTs(CONFIG.summaryURL)),
            fetchWithFallback(addTs(CONFIG.holdingsURL)),
            fetchWithFallback(addTs(CONFIG.historyURL))
        ]);

        if (summaryRes?.data || holdingsRes?.data) {
            const freshData = {
                summary: summaryRes?.data,
                holdings: holdingsRes?.data,
                history: historyRes?.data,
                timestamp: new Date().getTime()
            };

            renderFromData(freshData);
            localStorage.setItem(CACHE_KEY, JSON.stringify(freshData));
            updateTimestamp(true, "Live");
            console.log("Live 데이터 업데이트 완료");
        } else {
            throw new Error("Empty response from all proxies");
        }
        
        // 시트 데이터 로드 후 마켓 차트 로드 완료 대기
        await marketPromise;

    } catch (err) {
        console.warn("실시간 로드 실패, 스냅샷 시도:", err);

        try {
            const snapshotRes = await fetch(CONFIG.snapshotURL + "?v=" + new Date().getTime());
            if (snapshotRes.ok) {
                const snapshot = await snapshotRes.json();
                renderFromData(snapshot);
                updateTimestamp(false, "Snapshot");
                
                // 최신값이 아님을 사용자에게 알림
                let timeInfo = "";
                if (snapshot.updatedAt) {
                    const updateDate = new Date(snapshot.updatedAt);
                    timeInfo = ` (${updateDate.getHours()}시 ${updateDate.getMinutes()}분 기준)`;
                }
                showToast(`실시간 연결 지연으로 인해 백업 데이터를 표시합니다.${timeInfo}`, 'warning');
            } else {
                updateTimestamp(null, "❌ 데이터 로드 실패");
                showToast("데이터를 불러오는데 실패했습니다. 네트워크를 확인해주세요.", 'error');
            }
        } catch (snapshotErr) {
            console.error("최종 로드 실패", snapshotErr);
            updateTimestamp(null, "❌ 서버 연결 불가");
            showToast("서버에 연결할 수 없습니다.", 'error');
        }
    } finally {
        const refreshBtn = document.getElementById('refresh-fab');
        if (refreshBtn) refreshBtn.classList.remove('loading');
    }

    if (shouldRefreshMarket) {
        fetchSP500Data();
        fetchKOSPI200Data();
    }
}

// 데이터를 받아서 각 컴포넌트에 뿌려주는 통합 함수
function renderFromData(data) {
    if (data.summary) {
        renderSummary(data.summary, document.querySelector('#summary-table tbody'));
    }
    if (data.holdings) {
        processHoldingsData(data.holdings);
    }
    if (data.history) {
        rawHistoryData = data.history;
        renderHistoryChartWithRange();
    }
}

/**
 * 🇺🇸 S&P 500 시가총액 상위 100 종목 데이터 렌더링 (Github Actions 결과 연동)
 */
let sp500Data = [];
let sp500SortState = { column: 'rank', direction: 'asc' };

async function fetchSP500Data() {
    const tableBody = document.querySelector('#sp500-table tbody');
    const statusText = document.getElementById('sp500-status');
    if (!tableBody) return;

    try {
        statusText.textContent = "⏳ S&P 500 상위 100종목 데이터 로드 중...";
        
        // Fetch static JSON generated by GitHub Actions
        const response = await fetch('sp500_data.json?v=' + new Date().getTime());
        if (!response.ok) throw new Error("데이터를 찾을 수 없습니다.");
        
        sp500Data = await response.json();
        
        // 렌더링
        renderSP500Table();
        
        statusText.textContent = `✅ S&P 500 업데이트 완료 (${new Date().toLocaleTimeString()})`;
    } catch (err) {
        console.error("SP500 데이터 로드 실패:", err);
        statusText.textContent = "❌ 데이터 로드 실패 (업데이트 준비 중일 수 있습니다)";
    }
}

function formatBillion(num) {
    if (num >= 1e9) {
        return '$' + (num / 1e9).toFixed(1) + 'B';
    }
    return '$' + num.toLocaleString();
}

function sortSP500(column) {
    if (sp500SortState.column === column) {
        sp500SortState.direction = sp500SortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sp500SortState.column = column;
        sp500SortState.direction = column === 'rank' || column === 'ticker' || column === 'name' ? 'asc' : 'desc';
    }
    
    sp500Data.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        
        // Convert to numbers if applicable
        if (typeof valA === 'string' && typeof valB === 'string') {
            const numA = parseFloat(valA.replace(/,/g, ''));
            const numB = parseFloat(valB.replace(/,/g, ''));
            if (!isNaN(numA) && !isNaN(numB) && column !== 'ticker' && column !== 'name') {
                valA = numA; valB = numB;
            } else {
                return sp500SortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
        }
        
        return sp500SortState.direction === 'asc' ? valA - valB : valB - valA;
    });
    
    renderSP500Table();
}

function renderSP500Table() {
    const tableBody = document.querySelector('#sp500-table tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    
    sp500Data.forEach(data => {
        const tr = document.createElement('tr');
        tr.onclick = () => window.open(`https://finance.yahoo.com/quote/${data.ticker}`, '_blank');
        
        let rsiClass = 'rsi-neutral';
        const rsiValue = parseFloat(data.rsi);
        if (!isNaN(rsiValue)) {
            if (rsiValue >= 70) rsiClass = 'rsi-overbought';
            else if (rsiValue <= 30) rsiClass = 'rsi-oversold';
        }
        
        const priceFmt = data.price ? parseFloat(data.price).toFixed(2) : "-";
        
        tr.innerHTML = `
            <td data-label="순위" style="text-align:center;">${data.rank}</td>
            <td data-label="종목명"><strong>${data.name}</strong> <span style="color:#888; font-size:0.85em;">(${data.ticker})</span></td>
            <td data-label="시가 총액">${formatBillion(data.marketCap)}</td>
            <td data-label="현재가">$${priceFmt}</td>
            <td data-label="변동률" class="${getColorClass(data.change)}">${data.change}%</td>
            <td data-label="MDD" style="color:var(--negative)">${data.mdd}%</td>
            <td data-label="회복확률">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="drawdown-text">${data.recoveryProb}%</span>
                </div>
                <div class="drawdown-bar-container" style="background:rgba(255,255,255,0.1); width:100%; height:4px; border-radius:2px; overflow:hidden; margin-top:4px;">
                    <div style="background:${parseFloat(data.recoveryProb) >= 80 ? '#4ade80' : '#fb7185'}; width: ${data.recoveryProb}%; height:100%;"></div>
                </div>
            </td>
            <td data-label="RSI(14)" style="text-align:center;"><span class="rsi-tag ${rsiClass}">${data.rsi}</span></td>
            <td data-label="배당률" style="text-align:center; color: var(--primary);">${data.dividendYield}%</td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * 🇰🇷 KOSPI 200 시가총액 상위 100 종목 데이터 렌더링
 */
let kospi200Data = [];
let kospi200SortState = { column: 'rank', direction: 'asc' };

function formatKoreanCap(num) {
    if (num >= 1e12) {
        return '₩' + (num / 1e12).toFixed(1) + '조';
    }
    if (num >= 1e8) {
        return '₩' + (num / 1e8).toFixed(1) + '억';
    }
    return '₩' + num.toLocaleString();
}

async function fetchKOSPI200Data() {
    const tableBody = document.querySelector('#kospi200-table tbody');
    const statusText = document.getElementById('kospi200-status');
    if (!tableBody) return;

    try {
        statusText.textContent = "⏳ KOSPI 200 상위 100종목 데이터 로드 중...";

        const response = await fetch('kospi200_data.json?v=' + new Date().getTime());
        if (!response.ok) throw new Error("데이터를 찾을 수 없습니다.");

        kospi200Data = await response.json();

        // 렌더링
        renderKOSPI200Table();

        statusText.textContent = `✅ KOSPI 200 업데이트 완료 (${new Date().toLocaleTimeString()})`;
    } catch (err) {
        console.error("KOSPI200 데이터 로드 실패:", err);
        statusText.textContent = "❌ 데이터 로드 실패 (업데이트 준비 중일 수 있습니다)";
    }
}

function sortKOSPI200(column) {
    if (kospi200SortState.column === column) {
        kospi200SortState.direction = kospi200SortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        kospi200SortState.column = column;
        kospi200SortState.direction = column === 'rank' || column === 'ticker' || column === 'name' ? 'asc' : 'desc';
    }

    kospi200Data.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        if (typeof valA === 'string' && typeof valB === 'string') {
            const numA = parseFloat(valA.replace(/,/g, ''));
            const numB = parseFloat(valB.replace(/,/g, ''));
            if (!isNaN(numA) && !isNaN(numB) && column !== 'ticker' && column !== 'name') {
                valA = numA; valB = numB;
            } else {
                return kospi200SortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
        }

        return kospi200SortState.direction === 'asc' ? valA - valB : valB - valA;
    });

    renderKOSPI200Table();
}

function renderKOSPI200Table() {
    const tableBody = document.querySelector('#kospi200-table tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    
    kospi200Data.forEach(data => {
        const tr = document.createElement('tr');
        tr.onclick = () => window.open(`https://finance.yahoo.com/quote/${data.ticker}`, '_blank');
        
        let rsiClass = 'rsi-neutral';
        const rsiValue = parseFloat(data.rsi);
        if (!isNaN(rsiValue)) {
            if (rsiValue >= 70) rsiClass = 'rsi-overbought';
            else if (rsiValue <= 30) rsiClass = 'rsi-oversold';
        }
        
        const priceFmt = data.price ? parseFloat(data.price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "-";
        
        tr.innerHTML = `
            <td data-label="순위" style="text-align:center;">${data.rank}</td>
            <td data-label="종목명"><strong>${data.name}</strong> <span style="color:#888; font-size:0.85em;">(${data.ticker})</span></td>
            <td data-label="시가 총액">${formatKoreanCap(data.marketCap)}</td>
            <td data-label="현재가">₩${priceFmt}</td>
            <td data-label="변동률" class="${getColorClass(data.change)}">${data.change}%</td>
            <td data-label="MDD" style="color:var(--negative)">${data.mdd}%</td>
            <td data-label="회복확률">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="drawdown-text">${data.recoveryProb}%</span>
                </div>
                <div class="drawdown-bar-container" style="background:rgba(255,255,255,0.1); width:100%; height:4px; border-radius:2px; overflow:hidden; margin-top:4px;">
                    <div style="background:${parseFloat(data.recoveryProb) >= 80 ? '#4ade80' : '#fb7185'}; width: ${data.recoveryProb}%; height:100%;"></div>
                </div>
            </td>
            <td data-label="RSI(14)" style="text-align:center;"><span class="rsi-tag ${rsiClass}">${data.rsi}</span></td>
            <td data-label="배당률" style="text-align:center; color: var(--primary);">${data.dividendYield}%</td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * 프록시 레이싱(Racing) 기법을 사용하여 가장 빠른 응답을 반환하는 패치 함수
 */
async function fetchWithFallback(targetUrl, isYahoo = false) {
    if (!targetUrl) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 전체 타임아웃 10초

    const fetchTask = async (url, options = {}) => {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        
        // 유효성 검사
        if (!text || text.length < 20 || text.includes("<!DOCTYPE") || text.includes("<html")) {
            throw new Error("Invalid data received");
        }

        if (text.includes('"chart"') || text.includes('"result"')) {
            return { type: 'json', data: JSON.parse(text) };
        }
        
        const result = Papa.parse(text, { header: false, skipEmptyLines: true });
        if (result.data && result.data.length > 0) {
            return { type: 'csv', data: result.data };
        }
        throw new Error("Parsing failed");
    };

    const tasks = [];

    // 1. 직접 시도 (CORS 허용된 경우 가장 빠름)
    tasks.push(fetchTask(targetUrl).catch(() => new Promise(() => {})));

    // 2. GAS 프록시 시도
    if (CONFIG.gasURL) {
        tasks.push(fetchTask(CONFIG.gasURL, {
            method: 'POST',
            body: JSON.stringify({ command: "proxy_yahoo", url: targetUrl })
        }).catch(() => new Promise(() => {})));
    }

    // 3. 공용 프록시 시도
    const publicProxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
    ];
    publicProxies.forEach(proxy => {
        tasks.push(fetchTask(proxy).catch(() => new Promise(() => {})));
    });

    try {
        // 가장 빨리 성공하는 작업 결과 반환
        const fastestResult = await Promise.any(tasks);
        clearTimeout(timeoutId);
        return fastestResult;
    } catch (e) {
        console.error("All fetch attempts failed", e);
        clearTimeout(timeoutId);
        return null;
    }
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
            const indicators = item.indicators.quote[0];
            const closes = indicators.close || [];
            
            if (!timestamps || closes.length === 0) return [];

            return timestamps.map((ts, i) => ({
                date: formatDate(new Date(ts * 1000)),
                close: closes[i]
            })).filter(d => d.close !== null && d.close !== undefined && !isNaN(d.close));
        } catch (e) { 
            console.error("JSON 파싱 에러:", e);
            return []; 
        }
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
    const tickerInput = document.getElementById('mdd-ticker').value;
    const analyzeBtn = document.getElementById('mdd-analyze-btn');

    if (!tickerInput || !tickerInput.trim()) { alert("티커를 입력해주세요!"); return; }

    const ticker = formatTicker(tickerInput);

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

async function updateMarketCharts() {
    const markets = [
        { id: 'snp', ticker: '^GSPC' },
        { id: 'nasdaq', ticker: '^IXIC' },
        { id: 'dow', ticker: '^DJI' },
        { id: 'kospi', ticker: '^KS11' },
        { id: 'kosdaq', ticker: '^KQ11' },
        { id: 'fx', ticker: 'KRW=X' }
    ];

    console.log("📊 지수 데이터 업데이트 시작...");

    await Promise.all(markets.map(async (m) => {
        try {
            const valEl = document.getElementById(`card-${m.id}-val`);
            const chgEl = document.getElementById(`card-${m.id}-change`);
            
            const encodedTicker = encodeURIComponent(m.ticker);
            const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=1d&range=1d`;
            
            let result = await fetchViaGASProxy(targetUrl);
            if (!result) result = await fetchViaPublicProxy(targetUrl);

            if (result && result.type === 'json') {
                const meta = result.data.chart?.result?.[0]?.meta;
                if (meta) {
                    const lastPrice = meta.regularMarketPrice;
                    const prevClose = meta.chartPreviousClose || meta.previousClose;
                    
                    if (lastPrice && prevClose) {
                        const changePercent = ((lastPrice / prevClose - 1) * 100).toFixed(2);
                        const isPositive = parseFloat(changePercent) >= 0;

                        if (valEl) {
                            if (m.id === 'fx') {
                                valEl.textContent = lastPrice.toFixed(2);
                                usdKrwRate = lastPrice;
                            } else {
                                valEl.textContent = lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            }
                        }
                        
                        if (chgEl) {
                            chgEl.textContent = `${isPositive ? '+' : ''}${changePercent}%`;
                            chgEl.className = `market-change ${isPositive ? 'value-up' : 'value-down'}`;
                        }
                        return;
                    }
                }
            }

            // 폴백: 기존 파싱 로직 시도 (데이터 부족 시)
            const history = parseYahooData(result, m.ticker);
            if (history && history.length > 0) {
                const last = history[history.length - 1];
                if (valEl) valEl.textContent = last.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
        } catch (e) {
            console.error(`🚨 ${m.id} 업데이트 오류:`, e);
        }
    }));
}

// 시장 데이터 전용 프록시 함수들
async function fetchViaGASProxy(url) {
    if (!CONFIG.gasURL) return null;
    try {
        const response = await fetch(CONFIG.gasURL, {
            method: 'POST',
            body: JSON.stringify({ command: "proxy_yahoo", url: url })
        });
        if (response.ok) {
            const text = await response.text();
            if (text.includes('"chart"')) return { type: 'json', data: JSON.parse(text) };
        }
    } catch (e) { return null; }
    return null;
}

async function fetchViaPublicProxy(url) {
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];
    for (const p of proxies) {
        try {
            const response = await fetch(p);
            if (response.ok) {
                const text = await response.text();
                if (text.includes('"chart"')) return { type: 'json', data: JSON.parse(text) };
            }
        } catch (e) { console.warn("Fetch error:", e); }
    }
    return null;
}

function renderSummary(data, tableElement) {
    if (!tableElement || !data) return;
    tableElement.innerHTML = '';

    // 스켈레톤 제거
    document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));

    try {
        // "합계" 또는 "합산"이 포함된 행 중 평가액(index 1)이 숫자인 행 찾기
        let totalRow = data.find(row => {
            if (!row[0]) return false;
            const name = String(row[0]);
            const evalVal = parseSafeFloat(row[1]);
            return (name.includes("합계") || name.includes("합산")) && evalVal !== 0;
        });
        
        // 만약 못 찾으면 데이터 구조를 분석하여 가장 큰 평가액을 가진 행을 후보로 선택
        if (!totalRow) {
            const candidates = data.filter(row => row[0] && parseSafeFloat(row[1]) > 0);
            if (candidates.length > 0) {
                totalRow = candidates.reduce((prev, curr) => 
                    parseSafeFloat(curr[1]) > parseSafeFloat(prev[1]) ? curr : prev
                );
            }
        }

        if (totalRow) {
            const evalKRW = parseSafeFloat(totalRow[1]);
            const investKRW = parseSafeFloat(totalRow[2]);
            
            // 현재 평가액 카드 업데이트 (KRW + USD 병기)
            const evalValEl = document.getElementById('card-eval-val');
            if (evalValEl) {
                const evalTextKRW = maskValue(totalRow[1]);
                let evalText = getResponsiveValueHTML(evalTextKRW);
                if (usdKrwRate > 0 && evalKRW > 10000) { 
                    const evalUSD = evalKRW / usdKrwRate;
                    evalText += ` <span class="value-sub">($${evalUSD.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0})})</span>`;
                }
                evalValEl.innerHTML = evalText || "-";
            }

            document.getElementById('card-invest-val').innerHTML = getResponsiveValueHTML(maskValue(totalRow[2])) || "-";
            
            const profitElem = document.getElementById('card-profit-val');
            profitElem.innerHTML = getResponsiveValueHTML(maskValue(totalRow[3])) || "0";
            profitElem.className = 'value ' + getColorClass(totalRow[3]);
            
            const rateElem = document.getElementById('card-rate-val');
            rateElem.textContent = totalRow[4] || "0%";
            rateElem.className = 'value ' + getColorClass(totalRow[4]);

            const dailyElem = document.getElementById('card-daily-val');
            if (dailyElem) {
                dailyElem.innerHTML = getResponsiveValueHTML(maskValue(totalRow[6])) || "0";
                dailyElem.className = 'value ' + getColorClass(totalRow[6]);
            }

            document.getElementById('card-dividend-val').innerHTML = getResponsiveValueHTML(maskValue(totalRow[11])) || "0";
        }
    } catch (e) { console.warn("Summary parsing error", e); }

    const labels = [], invests = [], evals = [];
    const headerIndex = data.findIndex(row => row[0] && row[0].includes("계좌명"));
    const startIndex = headerIndex !== -1 ? headerIndex + 1 : 0;

    data.forEach((row, i) => {
        if (i < startIndex || !row[0] || row[0].includes("계좌명") || row[0].includes("합산") || row[0].includes("합계")) return;
        
        const name = row[0].trim(); 
        if (name === "") return;
        
        const evalNum = parseSafeFloat(row[1]), investNum = parseSafeFloat(row[2]);
        labels.push(maskValue(name, true)); 
        invests.push(investNum); 
        evals.push(evalNum);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="계좌명">${maskValue(name, true)}</td>
            <td data-label="평가금">${maskValue(row[1])}</td>
            <td data-label="투자금">${maskValue(row[2])}</td>
            <td data-label="수입액" class="${getColorClass(row[3])}">${maskValue(row[3])}</td>
            <td data-label="수익률">${investNum ? (evalNum / investNum * 100 - 100).toFixed(2) + '%' : '0%'}</td>
            <td data-label="일일변동" class="${getColorClass(row[6])}">${maskValue(row[6])}</td>
        `;
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

        // 한국 주식 여부 (6자리 숫자 티커 또는 특정 종목명)
        const nameValue = row[0] || '';
        const tickerValue = row[1] || '';
        const isKRW = /^\d{6}$/.test(tickerValue.replace('KRX:', '')) || nameValue.toLowerCase().includes('plus50');
        const currency = isKRW ? 'KRW' : 'USD';

        // 드롭다운에 추가
        if (stockSelect && row[0]) {
            const opt = document.createElement('option');
            opt.value = row[0]; // 종목명
            opt.dataset.ticker = tickerValue; // 티커
            opt.dataset.currency = currency; // 통화 정보 추가
            opt.textContent = row[0];
            stockSelect.appendChild(opt);
        }

        const weight = parseSafeFloat(row[9]), evalKRW = parseSafeFloat(row[8]);
        if (weight === 0 && evalKRW === 0) return;

        const rawTicker = row[1] || '';
        const ticker = rawTicker.includes(':') ? rawTicker.split(':').pop() : rawTicker;

        globalHoldings.push({
            name: row[0], ticker: ticker, currency, weight, returnRate: parseSafeFloat(row[7]), eval: evalKRW,
            profit: parseSafeFloat(row[14]), dailyChange: parseSafeFloat(row[10]),
            shares: row[3] || '-',
            avgCost: row[4] || '-',
            currentPriceKRW: row[5] || row[8] || '-',
            display: { weight: row[9], returnRate: row[7], evalKRW: row[8], profitKRW: row[14], dailyChange: row[10], currentPrice: row[5] || row[8] }
        });
    });
    // 리스크 분석 필터 초기화 (전체로 리셋)
    const bubbleFilters = document.querySelectorAll('#bubble-filter-group .sort-btn');
    bubbleFilters.forEach((btn, idx) => {
        if (idx === 0) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    sortHoldings(sortState.column, false);
    renderBubbleChart(globalHoldings);
}

// 직접 입력 토글 로직 수정
document.addEventListener('DOMContentLoaded', () => {
    const stockSelect = document.getElementById('stock-name-select');
    const directInputContainer = document.getElementById('direct-input-container');
    if (stockSelect && directInputContainer) {
        stockSelect.addEventListener('change', (e) => {
            directInputContainer.style.display = e.target.value === 'DIRECT' ? 'flex' : 'none';
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
        const formattedProfit = maskValue(item.display.profitKRW + '원');
        const formattedEval = maskValue(item.display.evalKRW + '원');

        const currencyLabel = item.currency === 'KRW' ? 'KRW' : 'USD';
        const currencyClass = item.currency === 'KRW' ? 'krw' : '';

        tr.innerHTML = `
            <td data-label="종목명">
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${maskValue(item.name, true)}
                    <span class="card-currency-badge ${currencyClass}" style="font-size: 0.6rem; padding: 1px 4px;">${currencyLabel}</span>
                </div>
            </td>
            <td data-label="비중">${item.display.weight}%</td>
            <td data-label="수익률" class="${getColorClass(item.display.returnRate)}">${item.display.returnRate}%</td>
            <td data-label="수익액" class="${getColorClass(item.display.profitKRW)}">${formattedProfit}</td>
            <td data-label="평가금">${formattedEval}</td>
            <td data-label="일일변동" class="${getColorClass(item.display.dailyChange)}">${item.display.dailyChange}%</td>
        `;
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
    Object.values(sparklineCharts).forEach(c => { try { c.destroy(); } catch (e) { console.warn("Resource cleanup/fetch error:", e); } });

    // --- 상승/하락 카운터 ---
    const upCount = globalHoldings.filter(h => h.dailyChange >= 0).length;
    const downCount = globalHoldings.filter(h => h.dailyChange < 0).length;
    const upEl = document.getElementById('holdings-up-count');
    const downEl = document.getElementById('holdings-down-count');
    if (upEl) upEl.textContent = `▲ ${upCount}`;
    if (downEl) downEl.textContent = `▼ ${downCount}`;

    // --- 정렬 ---
    const sortKey = currentHoldingsSort;
    const sorted = [...globalHoldings].sort((a, b) => {
        let va, vb;
        if (sortKey === 'weight') { va = a.weight; vb = b.weight; }
        else if (sortKey === 'returnRate') { va = a.returnRate; vb = b.returnRate; }
        else if (sortKey === 'profit') { va = a.profit || 0; vb = b.profit || 0; }
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
        const currencyIsKRW = item.currency === 'KRW';

        // 현재가 포맷팅: 한국 주식은 소수점 제거 및 콤마 추가
        let displayPrice = item.display.currentPrice;
        if (currencyIsKRW) {
            const priceNum = Math.round(parseSafeFloat(item.display.currentPrice));
            displayPrice = priceNum.toLocaleString() + '원';
        } else {
            displayPrice = '$' + item.display.currentPrice;
        }

        // Privacy Mode 적용
        displayPrice = maskValue(displayPrice);

        const currencyLabel = item.currency === 'KRW' ? 'KRW' : 'USD';
        const currencyClass = item.currency === 'KRW' ? 'krw' : '';

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
                        <span class="card-ticker">${maskValue(item.ticker || item.name, true)}</span>
                        <span class="card-currency-badge ${currencyClass}">${currencyLabel}</span>
                        ${weightText ? `<span class="card-weight-badge">${weightText}</span>` : ''}
                    </div>
                    <div class="card-company">${maskValue(item.name, true)}</div>
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
                    <span class="value">${maskValue(item.shares) || '-'}</span>
                </div>
                <div class="card-bottom-row">
                    <span class="label">Total Value</span>
                    <span class="value">${maskValue(item.display.evalKRW) || '-'}원</span>
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
        try { sparklineCharts[canvasId].destroy(); } catch (e) { console.warn("Resource cleanup/fetch error:", e); }
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
    const posClass = isPositive ? 'positive' : 'negative';
    const changeSign = isPositive ? '+' : '';
    const currencyIsKRW = item.ticker && /^\d{6}/.test(item.ticker);
    const currencyLabel = currencyIsKRW ? 'KRW' : 'USD';

    // 헬퍼 함수
    const fmtKRW = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
    const fmtUSD = (n) => (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtUSDabs = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtKRWS = (n) => (n >= 0 ? '+' : '') + Math.round(n).toLocaleString('ko-KR') + '원';

    // Header
    const modalIcon = document.getElementById('modal-icon');
    modalIcon.className = `modal-icon ${posClass}`;
    modalIcon.textContent = isPositive ? '↗' : '↘';

    document.getElementById('modal-ticker').textContent = maskValue(item.ticker || item.name, true);
    const currBadge = document.getElementById('modal-currency');
    currBadge.textContent = currencyLabel;
    currBadge.className = `modal-currency-badge ${currencyIsKRW ? 'krw' : ''}`;
    document.getElementById('modal-company').textContent = maskValue(item.name, true);

    // Price Section
    document.getElementById('modal-current-price').textContent = maskValue(item.display.evalKRW) || '-';
    const diffElem = document.getElementById('modal-price-diff');
    const pctElem = document.getElementById('modal-price-pct');

    const evalKRWNum = item.eval || 0;
    const dailyAmtKRW = evalKRWNum * item.dailyChange / 100;
    diffElem.textContent = maskValue(fmtKRWS(dailyAmtKRW));
    diffElem.className = isPositive ? 'positive' : 'negative';
    pctElem.textContent = `(${changeSign}${item.dailyChange}%)`;
    pctElem.className = isPositive ? 'positive' : 'negative';

    // --- Stats Cards ---
    document.getElementById('modal-shares').textContent = maskValue(item.shares) || '-';

    const avgCostNum = parseSafeFloat(item.avgCost);
    const avgCostEl = document.getElementById('modal-avg-cost');
    const avgCostSubEl = document.getElementById('modal-avg-cost-sub');
    const totalValEl = document.getElementById('modal-total-value');
    const totalValSubEl = document.getElementById('modal-total-value-sub');
    const todayPLEl = document.getElementById('modal-today-pl');
    const todayPLSubEl = document.getElementById('modal-today-pl-sub');

    if (!currencyIsKRW && usdKrwRate > 100) {
        // USD 종목: 달러(메인) + 원화(보조)
        const avgCostUSD = avgCostNum > 0 ? avgCostNum / usdKrwRate : 0;
        avgCostEl.textContent = maskValue(avgCostUSD > 0 ? fmtUSDabs(avgCostUSD) : (item.avgCost || '-'));
        avgCostSubEl.textContent = maskValue(avgCostNum > 0 ? fmtKRW(avgCostNum) : '');

        const evalUSD = evalKRWNum / usdKrwRate;
        totalValEl.textContent = maskValue(evalKRWNum > 0 ? fmtUSDabs(evalUSD) : (item.display.evalKRW || '-'));
        totalValSubEl.textContent = maskValue(evalKRWNum > 0 ? fmtKRW(evalKRWNum) : '');

        const todayUSD = dailyAmtKRW / usdKrwRate;
        todayPLEl.textContent = maskValue((todayUSD >= 0 ? '+$' : '-$') + Math.abs(todayUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        todayPLEl.className = isPositive ? 'value-up' : 'value-down';
        todayPLSubEl.textContent = maskValue(fmtKRWS(dailyAmtKRW));
        todayPLSubEl.className = isPositive ? 'sub-up' : 'sub-down';
    } else {
        // KRW 종목: 원화만
        avgCostEl.textContent = maskValue(item.avgCost || '-');
        avgCostSubEl.textContent = '';
        totalValEl.textContent = maskValue(item.display.evalKRW || '-');
        totalValSubEl.textContent = '';
        todayPLEl.textContent = maskValue(fmtKRWS(dailyAmtKRW));
        todayPLEl.className = isPositive ? 'value-up' : 'value-down';
        todayPLSubEl.textContent = '';
    }

    const hlCard = todayPLEl.closest('.modal-stat-card');
    if (hlCard) hlCard.classList.toggle('negative-pl', !isPositive);

    // Trading Info
    document.getElementById('modal-open').textContent = maskValue(item.display.evalKRW) || '-';
    document.getElementById('modal-high').textContent = maskValue(item.display.evalKRW) || '-';
    document.getElementById('modal-low').textContent = maskValue(item.display.evalKRW) || '-';
    document.getElementById('modal-volume').textContent = '-';

    // Your Position — 모두 원화
    const profitKRW = parseSafeFloat(item.display.profitKRW);
    const costBasisKRW = evalKRWNum - profitKRW;

    document.getElementById('modal-market-value').textContent = maskValue(evalKRWNum > 0 ? fmtKRW(evalKRWNum) : (item.display.evalKRW || '-'));
    document.getElementById('modal-cost-basis').textContent = maskValue(evalKRWNum > 0 ? fmtKRW(costBasisKRW) : '-');

    const totalGainElem = document.getElementById('modal-total-gain');
    totalGainElem.textContent = profitKRW !== 0
        ? maskValue((profitKRW >= 0 ? '+' : '') + Math.round(profitKRW).toLocaleString('ko-KR') + '원')
        : maskValue(item.display.profitKRW || '-');
    totalGainElem.className = getColorClass(item.display.profitKRW);

    const returnElem = document.getElementById('modal-return');
    returnElem.textContent = `${item.display.returnRate}%`;
    returnElem.className = getColorClass(item.display.returnRate);

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

    if (intradayChart) { try { intradayChart.destroy(); } catch (e) { console.warn("Resource cleanup/fetch error:", e); } }

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
            labels.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
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
        const ticker = formatTicker(item.ticker);

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

        const prices = closes.map((c, i) => c || closes[i - 1] || closes[0]);
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

    } catch (e) {
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
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    display: !isPrivacyMode,
                    ticks: {
                        display: !isPrivacyMode,
                        font: { size: window.innerWidth < 768 ? 10 : 12 }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: window.innerWidth < 768 ? 10 : 12 } }
                }
            },
            plugins: {
                legend: {
                    display: window.innerWidth > 480, // 아주 작은 화면에서는 범례 숨김
                    position: 'top',
                    align: 'end',
                    labels: { boxWidth: 10, padding: 10, font: { size: 11 } }
                },
                tooltip: {
                    enabled: !isPrivacyMode
                }
            }
        }
    });
}

function renderHistoryChart(data) {
    const canvas = document.getElementById('historyChart'); if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    
    // 기존 차트 객체가 있으면 완전히 파괴 (중복 렌더링 방지)
    if (historyChart) {
        historyChart.destroy();
        historyChart = null;
    }

    const dates = [], evals = [], invests = [], incomes = [], dividends = [];

    data.slice(1).forEach(row => {
        if (!row[0]) return;
        dates.push(row[0]);
        evals.push(parseSafeFloat(row[1]) / 10000000);
        invests.push(parseSafeFloat(row[2]) / 10000000);
        incomes.push(parseSafeFloat(row[3]) / 10000000);
        dividends.push(parseSafeFloat(row[11]) / 10000000);
    });

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
            animation: {
                duration: 500 // 데이터 전환 시 부드러운 애니메이션 추가
            },
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    title: { display: false },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    display: !isPrivacyMode,
                    ticks: {
                        display: !isPrivacyMode,
                        font: { size: window.innerWidth < 768 ? 10 : 12 },
                        callback: (value) => value.toLocaleString()
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: window.innerWidth < 768 ? 5 : 8,
                        font: { size: window.innerWidth < 768 ? 10 : 12 }
                    }
                }
            },
            plugins: {
                legend: {
                    display: window.innerWidth > 480,
                    position: 'top',
                    align: 'end',
                    labels: { usePointStyle: true, boxWidth: 6, padding: 10, font: { size: 10 } }
                },
                tooltip: {
                    enabled: !isPrivacyMode, // Privacy 모드 시 툴팁 비활성화
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

function updateHistoryRange(range, btn) {
    currentHistoryRange = range;
    
    // 버튼 UI 업데이트
    const buttons = document.querySelectorAll('#history-filter-group .sort-btn');
    buttons.forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    renderHistoryChartWithRange();
}

function renderHistoryChartWithRange() {
    if (!rawHistoryData || rawHistoryData.length <= 1) return;

    const headers = rawHistoryData[0];
    const dataRows = rawHistoryData.slice(1).filter(row => row && row[0] && row[0].trim() !== "");
    
    if (currentHistoryRange === 'ALL' || dataRows.length === 0) {
        renderHistoryChart(rawHistoryData);
        return;
    }

    // 헬퍼: 다양한 날짜 형식을 안전하게 Date 객체로 변환
    const parseDate = (str) => {
        if (!str) return new Date(NaN);
        const cleanStr = str.trim().replace(/\.$/, '');
        
        // 1. 점(.)으로 분리 (YY.MM.DD 또는 YYYY.MM.DD)
        const dots = cleanStr.split('.');
        if (dots.length === 3) {
            let y = parseInt(dots[0]);
            let m = parseInt(dots[1]) - 1;
            let d = parseInt(dots[2]);
            if (y < 100) y += 2000;
            return new Date(y, m, d);
        }
        
        // 2. 대시(-)로 분리 (YYYY-MM-DD)
        const dashes = cleanStr.split('-');
        if (dashes.length === 3) {
            return new Date(cleanStr);
        }

        // 3. 기타 표준 형식
        const fallback = new Date(cleanStr);
        return isNaN(fallback.getTime()) ? new Date(NaN) : fallback;
    };

    // 모든 데이터를 Date 객체와 함께 매핑
    const rowsWithDate = dataRows.map(row => ({
        date: parseDate(row[0]),
        row: row
    })).filter(item => !isNaN(item.date.getTime()));

    if (rowsWithDate.length === 0) {
        renderHistoryChart(rawHistoryData);
        return;
    }

    // 데이터 중 가장 최신 날짜 찾기
    const latestDate = new Date(Math.max(...rowsWithDate.map(item => item.date.getTime())));

    // 시작 날짜 계산
    let startDate = new Date(latestDate);
    const value = parseInt(currentHistoryRange);
    const unit = currentHistoryRange.slice(-1);

    if (currentHistoryRange === 'YTD') {
        startDate = new Date(latestDate.getFullYear(), 0, 1);
    } else if (unit === 'M') {
        startDate.setMonth(latestDate.getMonth() - value);
    } else if (unit === 'Y') {
        startDate.setFullYear(latestDate.getFullYear() - value);
    }

    // 필터링 실행
    const filteredRows = rowsWithDate
        .filter(item => item.date >= startDate)
        .map(item => item.row);

    // 필터링된 데이터로 그래프 렌더링 (헤더 포함)
    if (filteredRows.length > 0) {
        renderHistoryChart([headers, ...filteredRows]);
    } else {
        renderHistoryChart(rawHistoryData);
    }
}

function filterBubbleChart(currency, btn) {
    // 버튼 활성화 상태 변경
    const buttons = document.querySelectorAll('#bubble-filter-group .sort-btn');
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 데이터 필터링
    let filtered = globalHoldings;
    if (currency !== 'ALL') {
        filtered = globalHoldings.filter(h => h.currency === currency);
    }

    // 차트 다시 그리기
    renderBubbleChart(filtered);
}

function renderBubbleChart(holdings) {
    const canvas = document.getElementById('bubbleChart'); if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 수익액 절대값 중 최대값 찾기 (색상 농도 계산용)
    const maxAbsProfit = Math.max(...holdings.map(h => Math.abs(h.profit || 0)), 1);

    const bubbleData = holdings.map((item, idx) => {
        const profit = item.profit || 0;
        const absProfit = Math.abs(profit);

        // 농도 계산 (최소 0.3에서 최대 0.9까지)
        const intensity = 0.3 + (absProfit / maxAbsProfit) * 0.6;

        let backgroundColor, borderColor;
        
        if (profit >= 0) {
            // 수익: 빨강~주황 계열 (0 ~ 30도 사이에서 종목별로 Hue 분산)
            const hue = (idx * 137.5) % 30; // 황금각을 활용한 고른 분산
            backgroundColor = `hsla(${hue}, 80%, 60%, ${intensity})`;
            borderColor = `hsla(${hue}, 80%, 45%, 0.8)`;
        } else {
            // 손실: 파랑~보라 계열 (200 ~ 250도 사이에서 종목별로 Hue 분산)
            const hue = 200 + ((idx * 137.5) % 50);
            backgroundColor = `hsla(${hue}, 80%, 60%, ${intensity})`;
            borderColor = `hsla(${hue}, 80%, 45%, 0.8)`;
        }

        return {
            label: item.name,
            data: [{
                x: item.dailyChange,
                y: item.returnRate,
                r: Math.min(45, Math.sqrt(item.eval / 400000) * 2.5), // 크기 약간 확대
                eval: item.eval,
                profit: profit,
                name: item.name
            }],
            backgroundColor: backgroundColor,
            borderColor: borderColor,
            borderWidth: 1.5 // 테두리 두께 강화
        };
    });

    if (bubbleChart) bubbleChart.destroy();
    bubbleChart = new Chart(ctx, {
        type: 'bubble',
        data: { datasets: bubbleData },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: 20 },
            scales: {
                x: {
                    title: { display: window.innerWidth > 768, text: '일일 변동률 (%)', color: '#94a3b8' },
                    grid: {
                        color: (context) => context.tick.value === 0 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                        lineWidth: (context) => context.tick.value === 0 ? 2 : 1
                    },
                    ticks: { font: { size: window.innerWidth < 768 ? 9 : 11 } }
                },
                y: {
                    title: { display: window.innerWidth > 768, text: '전체 수익률 (%)', color: '#94a3b8' },
                    grid: {
                        color: (context) => context.tick.value === 0 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                        lineWidth: (context) => context.tick.value === 0 ? 2 : 1
                    },
                    ticks: { font: { size: window.innerWidth < 768 ? 9 : 11 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const name = context.dataset.label;
                            const d = context.raw;
                            const profitStr = d.profit ? ` / 수익: ${maskValue(d.profit.toLocaleString())}원` : '';
                            return `${maskValue(name, true)}: 수익률 ${d.y.toFixed(2)}%, 일변동 ${d.x.toFixed(2)}%${profitStr}`;
                        }
                    }
                }
            }
        },
        plugins: [{
            id: 'bubbleLabels',
            afterDatasetsDraw: (chart) => {
                const { ctx } = chart;
                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    if (!meta.hidden) {
                        meta.data.forEach((element, index) => {
                            const { x, y } = element.getProps(['x', 'y'], true);
                            const data = dataset.data[index];
                            const radius = element.options.radius;

                            // 버블이 아주 작지 않으면 이름 표시
                            if (radius > 8) {
                                const displayName = maskValue(data.name, true);
                                ctx.fillStyle = '#ffffff';
                                const fontSize = Math.max(Math.min(radius / 2.2, 13), 8);
                                ctx.font = `bold ${fontSize}px Pretendard`;
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                
                                // 가독성을 위한 강한 그림자
                                ctx.shadowBlur = 6;
                                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                                ctx.fillText(displayName, x, y);
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
    const tickerInput = document.getElementById('stock-ticker-input');
    const type = document.getElementById('type-select').value;

    let stockName, stockCode;

    if (['현금입금', '현금출금'].includes(type)) {
        stockName = '현금';
        stockCode = '';
    } else {
        // 매수, 매도, 배당금 등
        if (stockSelect.value === 'DIRECT') {
            stockName = stockInput.value.trim();
            let rawTicker = tickerInput.value.trim().toUpperCase();

            // 한국 주식 (6자리 숫자) 처리: 접두사가 없으면 KRX: 추가
            if (/^\d{6}$/.test(rawTicker)) {
                stockCode = 'KRX:' + rawTicker;
            } else {
                stockCode = rawTicker;
            }
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

        // 신규 입력창 숨기기 및 초기화
        const directInputContainer = document.getElementById('direct-input-container');
        if (directInputContainer) {
            stockInput.value = '';
            tickerInput.value = '';
            directInputContainer.style.display = 'none';
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

async function requestMarketRefresh(account = null) {
    try {
        const payload = { command: "refresh_market" };
        if (account) payload.account = account;
        
        console.log(`${account || '전체'} 시트 데이터 갱신 요청 중...`);
        // fetch promise를 반환하여 await 가능하게 함
        return fetch(CONFIG.gasURL, { 
            method: 'POST', 
            mode: 'no-cors', 
            body: JSON.stringify(payload) 
        });
    } catch (e) {
        console.warn('Market refresh request failed:', e);
        return Promise.resolve();
    }
}

// ===== Slider Controls =====
function moveSlider(direction) {
    const slider = document.getElementById('chart-slider');
    if (!slider) return;
    const slideWidth = slider.offsetWidth;
    slider.scrollBy({ left: direction * slideWidth, behavior: 'smooth' });
}

function goSlide(index) {
    const slider = document.getElementById('chart-slider');
    if (!slider) return;
    const slideWidth = slider.offsetWidth;
    slider.scrollTo({ left: index * slideWidth, behavior: 'smooth' });
}

function updateSliderDots() {
    const slider = document.getElementById('chart-slider');
    if (!slider) return;

    // 정확한 인덱스 계산
    const index = Math.round(slider.scrollLeft / (slider.offsetWidth || 1));
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

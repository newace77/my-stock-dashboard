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

// =========================================================================
// 유틸리티 모듈
// =========================================================================

/**
 * HTML 특수문자 이스케이프 (XSS 방어)
 * innerHTML 에 구글 시트 등 외부 입력을 삽입할 때 반드시 사용.
 * @param {string|number|null|undefined} val
 * @returns {string}
 */
function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 마스킹과 이스케이프를 함께 수행 (innerHTML 출력용 헬퍼)
 */
function safeValue(val, isName = false) {
    return escapeHtml(maskValue(val, isName));
}

/**
 * 한국 주식(6자리 숫자 티커) 판별
 * @param {string} ticker
 * @returns {boolean}
 */
function isKoreanStock(ticker) {
    if (!ticker) return false;
    const cleaned = String(ticker).replace('KRX:', '').trim();
    return /^\d{6}$/.test(cleaned);
}

/**
 * 구글 시트 Holdings 컬럼 인덱스 매핑
 */
const HOLDINGS_COL = {
    NAME: 0,
    TICKER: 1,
    SHARES: 3,
    COST_BASIS: 4,
    AVG_COST: 5,
    CURRENT_PRICE: 6,
    RETURN_RATE: 7,
    EVAL_KRW: 8,
    WEIGHT: 9,
    DAILY_CHANGE: 10,
    PROFIT: 14
};

/**
 * 구글 시트 Summary 컬럼 인덱스 매핑
 */
const SUMMARY_COL = {
    NAME: 0,
    EVAL_TOTAL: 1,
    INVEST_TOTAL: 2,
    PROFIT: 3,
    RETURN_RATE: 4,
    DAILY_CHANGE_PCT: 5,
    DAILY_CHANGE_AMT: 6,
    DIVIDEND: 11
};

/**
 * 구글 시트 History 컬럼 인덱스 매핑
 */
const HISTORY_COL = {
    DATE: 0,
    EVAL_TOTAL: 1,
    INVEST_TOTAL: 2,
    PROFIT: 3,
    DIVIDEND: 11
};

/**
 * 환율이 유효한지 확인 (갱신된 적 있고, 30분 이내)
 */
function isExchangeRateValid() {
    if (usdKrwRate <= 100) return false;
    if (usdKrwRateUpdatedAt === 0) return true; // 초기값 1400 사용 허용
    const THIRTY_MIN = 30 * 60 * 1000;
    return (Date.now() - usdKrwRateUpdatedAt) < THIRTY_MIN;
}

/**
 * 디버그 로거 — localStorage('debug_mode')가 'true'일 때만 출력
 */
const DEBUG = localStorage.getItem('debug_mode') === 'true';
const logger = {
    log:  (...args) => { if (DEBUG) console.log(...args); },
    warn: (...args) => console.warn(...args),
    error:(...args) => console.error(...args)
};

/**
 * Chart.js 인스턴스 레지스트리 — 생성/파괴를 중앙에서 관리하여 메모리 누수 방지
 */
const chartRegistry = {
    _charts: new Map(),
    set(id, chart) {
        this.destroy(id);
        this._charts.set(id, chart);
        return chart;
    },
    get(id) { return this._charts.get(id); },
    destroy(id) {
        const chart = this._charts.get(id);
        if (chart) {
            try { chart.destroy(); } catch (e) { /* ignore */ }
            this._charts.delete(id);
        }
    },
    destroyAll(prefix = null) {
        for (const [id, chart] of this._charts) {
            if (prefix && !id.startsWith(prefix)) continue;
            try { chart.destroy(); } catch (e) { /* ignore */ }
            this._charts.delete(id);
        }
    }
};

// =========================================================================
// 전역 상태
// =========================================================================

// 뷰 모드 설정 (auto, pc, mobile)
let globalHoldings = [];
let usdKrwRate = 1400; // USD/KRW 환율 (기본값, Summary 시트에서 갱신)
let usdKrwRateUpdatedAt = 0; // 환율 최근 갱신 시각 (ms)
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
let intradayChart = null;

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
/**
 * 금액 포맷팅 (모바일: 만/억 단위, PC: 전체 숫자)
 * @param {number|string} val 
 * @param {boolean} isKRW 
 * @returns {string}
 */
function formatValueByMode(val, isKRW = true) {
    const num = parseSafeFloat(val);
    const isMobile = userViewMode === 'mobile' || (userViewMode === 'auto' && window.innerWidth <= 768);
    
    if (!isMobile) {
        if (isKRW) return Math.round(num).toLocaleString('ko-KR') + '원';
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // 모바일 포맷팅 (만/억 단위)
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    let result = '';

    if (isKRW) {
        if (absNum >= 100000000) {
            result = sign + (absNum / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
        } else if (absNum >= 10000) {
            result = sign + (absNum / 10000).toFixed(0) + '만';
        } else {
            result = sign + Math.round(absNum).toLocaleString() + '원';
        }
    } else {
        // USD는 모바일에서도 가급적 소수점 유지하되 $ 표시
        if (absNum >= 1000) {
            result = sign + '$' + (absNum / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        } else {
            result = sign + '$' + absNum.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        }
    }
    return result;
}

/**
 * 수익률 포맷팅 (소수점 2자리 고정)
 * @param {number|string} val 
 * @returns {string}
 */
function formatPercent(val) {
    const num = parseSafeFloat(val);
    return num.toFixed(2) + '%';
}

function getResponsiveValueHTML(valStr) {
    if (!valStr || valStr === "-" || typeof valStr !== 'string') return valStr;
    // 마스킹된 값이면 그대로 반환
    if (valStr.includes('●')) return valStr;
    
    // 비율(%) 데이터면 소수점 2자리 강제 적용
    if (valStr.includes('%')) {
        return formatPercent(valStr);
    }
    
    // 원본에서 숫자만 추출 (음수 기호 포함)
    const numStr = valStr.replace(/[^\d.-]/g, '');
    const num = Number(numStr);
    
    if (!isNaN(num)) {
        const isKRW = !valStr.includes('$');
        const shortStr = formatValueByMode(num, isKRW);
        
        // PC 모드에서는 툴팁으로 원본 값을 보여주기 위해 span 래핑 (기존 호환성 유지)
        if (shortStr !== valStr) {
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
    if (isKoreanStock(cleanTicker)) {
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
        tabButtons[i].setAttribute('aria-selected', 'false');
    }

    document.getElementById(tabName).classList.add("active");
    evt.currentTarget.classList.add("active");
    evt.currentTarget.setAttribute('aria-selected', 'true');

    if (tabName === 'holdings-analysis-tab') {
        fetchHoldingsAnalysisData();
    } else if (tabName === 'heatmap-tab') {
        renderHeatmap();
    } else if (tabName === 'dividend-tab') {
        syncDividendDataAndRender();
    }
    }

    // 🎁 배당 달력 관련 변수 및 함수
    let currentDividendMonth = new Date(); // 현재 표시 중인 달
    let dividendCache = []; // { ticker, date, amount, name, qty }

    /**
    * 보유 종목을 기반으로 야후 파이낸스에서 배당 데이터를 가져와 동기화
    */
    async function syncDividendDataAndRender() {
    const statusEl = document.getElementById('selected-date-label');
    if (statusEl) statusEl.textContent = ' (배당 데이터 동기화 중...)';

    if (!globalHoldings || globalHoldings.length === 0) {
        renderDividendCalendar();
        return;
    }

    // 이미 데이터를 가져왔다면 바로 렌더링 (캐시 활용)
    if (dividendCache.length > 0) {
        renderDividendCalendar();
        if (statusEl) statusEl.textContent = ' (동기화 완료)';
        return;
    }

    try {
        const results = [];
        const holdings = globalHoldings.filter(h => h.ticker && !h.ticker.includes('=') && !h.ticker.startsWith('^'));
        
        let processedCount = 0;
        const totalCount = holdings.length;

        // 순차적으로 처리하여 프록시 과부하 및 레이트 리밋 방지
        for (const h of holdings) {
            processedCount++;
            if (statusEl) statusEl.textContent = ` (데이터 동기화 중... ${processedCount}/${totalCount})`;

            const cleanTicker = h.ticker.trim();
            const formattedTicker = formatTicker(cleanTicker);
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedTicker}?interval=1d&range=10y&events=div`;
            
            try {
                const result = await fetchWithFallback(url, true);
                
                if (result && result.type === 'json' && result.data.chart?.result?.[0]?.events?.dividends) {
                    const divs = result.data.chart.result[0].events.dividends;
                    Object.values(divs).forEach(div => {
                        const d = new Date(div.date * 1000);
                        const shares = parseSafeFloat(h.shares);
                        let totalKRW = shares * div.amount;
                        if (h.currency === 'USD') {
                            totalKRW = totalKRW * usdKrwRate;
                        }

                        results.push({
                            date: formatLocalDate(d),
                            name: h.name,
                            ticker: cleanTicker,
                            currency: h.currency,
                            qty: h.shares,
                            perShare: div.amount,
                            total: totalKRW
                        });
                    });
                }
            } catch (innerE) {
                logger.warn(`${cleanTicker} 배당 데이터 로드 실패:`, innerE);
            }
        }

        dividendCache = results;
        renderDividendCalendar();
        if (statusEl) statusEl.textContent = ' (동기화 완료)';
    } catch (e) {
        logger.error("배당 데이터 동기화 실패:", e);
        if (statusEl) statusEl.textContent = ' (동기화 실패)';
        renderDividendCalendar();
    }
    }

    /**
    * 배당 달력 월 변경
    */
    function changeDividendMonth(offset) {
    currentDividendMonth.setMonth(currentDividendMonth.getMonth() + offset);
    renderDividendCalendar();
    }

    /**
    * 배당 달력 렌더링
    */
    function renderDividendCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthLabel = document.getElementById('current-calendar-month');
    if (!grid || !monthLabel) return;

    grid.innerHTML = '';

    const year = currentDividendMonth.getFullYear();
    const month = currentDividendMonth.getMonth();

    monthLabel.textContent = `${year}년 ${month + 1}월`;

    // 달력 시작일 계산 (해당 월의 1일이 포함된 주의 일요일)
    const firstDay = new Date(year, month, 1);
    const startDay = new Date(firstDay);
    startDay.setDate(1 - firstDay.getDay());

    // 6주(42일) 표시
    const today = new Date();
    today.setHours(0,0,0,0);

    const monthlyDividends = getMonthlyDividendData(year, month);

    for (let i = 0; i < 42; i++) {
        const current = new Date(startDay);
        current.setDate(startDay.getDate() + i);

        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        if (current.getMonth() !== month) dayDiv.classList.add('other-month');
        if (current.getTime() === today.getTime()) dayDiv.classList.add('today');
        if (current.getDay() === 0) dayDiv.classList.add('sun');
        if (current.getDay() === 6) dayDiv.classList.add('sat');

        const dateStr = formatLocalDate(current);
        const dayDividends = monthlyDividends.filter(d => d.date === dateStr);

        dayDiv.innerHTML = `<span class="day-number">${current.getDate()}</span>`;

        if (dayDividends.length > 0) {
            const itemContainer = document.createElement('div');
            itemContainer.className = 'dividend-items';
            dayDividends.forEach(d => {
                const item = document.createElement('div');
                item.className = 'dividend-item';
                item.textContent = d.name;
                item.title = `${d.name}: ${d.total.toLocaleString()}원`;
                itemContainer.appendChild(item);
            });
            dayDiv.appendChild(itemContainer);
            dayDiv.onclick = () => showDividendDetail(dateStr, dayDividends);
        }

        grid.appendChild(dayDiv);
    }

    updateDividendDetailTable(monthlyDividends);
    }

    /**
    * 특정 월의 배당 데이터를 가져옴 (dividendCache 기반)
    */
    function getMonthlyDividendData(year, month) {
    return dividendCache.filter(d => {
        const date = new Date(d.date);
        return date.getFullYear() === year && date.getMonth() === month;
    });
    }
function formatLocalDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function updateDividendDetailTable(records) {
    const tbody = document.getElementById('dividend-detail-body');
    const label = document.getElementById('selected-date-label');
    if (!tbody) return;
    if (label) label.textContent = '(전체 월 내역)';
    tbody.innerHTML = '';
    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-msg" style="text-align: center; padding: 2rem; color: var(--text-muted);">해당 월의 배당 내역이 없습니다.</td></tr>';
        return;
    }
    records.sort((a,b) => a.date.localeCompare(b.date)).forEach(r => {
        const tr = document.createElement('tr');
        const currencySymbol = r.currency === 'USD' ? '$' : '₩';
        tr.innerHTML = `
            <td>${r.date}</td>
            <td>${r.name}</td>
            <td>${r.qty}</td>
            <td>${currencySymbol}${r.perShare.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="font-weight:bold; color:#4ade80;">${Math.round(r.total).toLocaleString()}원</td>
        `;
        tbody.appendChild(tr);
    });
}

function showDividendDetail(date, records) {
    const tbody = document.getElementById('dividend-detail-body');
    const label = document.getElementById('selected-date-label');
    if (!tbody) return;
    if (label) label.textContent = `(${date})`;
    tbody.innerHTML = '';
    records.forEach(r => {
        const tr = document.createElement('tr');
        const currencySymbol = r.currency === 'USD' ? '$' : '₩';
        tr.innerHTML = `
            <td>${r.date}</td>
            <td>${r.name}</td>
            <td>${r.qty}</td>
            <td>${currencySymbol}${r.perShare.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="font-weight:bold; color:#4ade80;">${Math.round(r.total).toLocaleString()}원</td>
        `;
        tbody.appendChild(tr);
    });
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

    return { mdd: (currentDrawdown * 100).toFixed(2), recoveryProb: prob };
}

async function fetchHoldingsAnalysisData(force = false) {
    const tableBody = document.querySelector('#holdings-analysis-table tbody');
    const statusText = document.getElementById('holdings-analysis-status');
    if (!tableBody || !globalHoldings || globalHoldings.length === 0) return;

    // 이미 데이터가 있고 분석이 완료된 상태라면 재분석하지 않음 (수동 새로고침 시에만 갱신)
    if (!force && holdingsAnalysisData.length > 0 && holdingsAnalysisData.every(d => d.rsi !== "-")) {
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
                }
                
                // 1. 기본 정보 및 히스토리 (10년치 + 배당 정보) - 캐시 방지 파라미터 추가
                const historyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=10y&events=div&_=${Date.now()}`;
                const historyRes = await fetchWithFallback(historyUrl, true);
                
                if (historyRes && historyRes.type === 'json') {
                    const chartResult = historyRes.data.chart.result[0];
                    const meta = chartResult.meta;
                    item.price = meta.regularMarketPrice;
                    
                    // meta에서 시가총액 정보가 오면 우선 사용 (단, sp500/kospi 캐시가 더 정확할 수 있음)
                    if (meta.marketCap && (!item.marketCap || item.marketCap === 0)) {
                        item.marketCap = meta.marketCap;
                    }
                    
                    // Use daily change directly from user's Google Sheet (Holdings / Summary)
                    item.change = item.display.dailyChange && item.display.dailyChange !== '-' ? item.display.dailyChange : (meta.chartPreviousClose ? ((item.price / meta.chartPreviousClose - 1) * 100).toFixed(2) : 0);
                    
                    // Calculate trailing 12 months dividend yield if missing
                    if (divYield === "-" && chartResult.events && chartResult.events.dividends) {
                        const divs = chartResult.events.dividends;
                        const oneYearAgo = (Date.now() / 1000) - (365 * 24 * 60 * 60);
                        let totalDiv = 0;
                        for (const key in divs) {
                            if (divs[key].date >= oneYearAgo) totalDiv += divs[key].amount;
                        }
                        if (totalDiv > 0 && item.price > 0) divYield = ((totalDiv / item.price) * 100).toFixed(2);
                    } else if (divYield === "-" && meta.dividendYield !== undefined) {
                        divYield = meta.dividendYield.toFixed(2);
                    } else if (divYield === "-" && meta.trailingAnnualDividendYield !== undefined) {
                        divYield = (meta.trailingAnnualDividendYield * 100).toFixed(2);
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
                logger.warn(`Analysis failed for ${item.ticker}`, e);
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
        tr.onclick = () => window.open(`https://finance.yahoo.com/quote/${encodeURIComponent(data.ticker)}`, '_blank');
        
        let rsiClass = 'rsi-neutral';
        const rsiValue = parseFloat(data.rsi);
        if (!isNaN(rsiValue)) {
            if (rsiValue >= 70) rsiClass = 'rsi-overbought';
            else if (rsiValue <= 30) rsiClass = 'rsi-oversold';
        }
        
        const pricePrefix = data.currency === 'KRW' ? '₩' : '$';
        const priceFmt = data.price ? (data.currency === 'KRW' ? data.price.toLocaleString() : data.price.toFixed(2)) : "-";
        const capFmt = data.marketCap ? (data.currency === 'KRW' ? formatKoreanCap(data.marketCap) : formatBillion(data.marketCap)) : "-";
        
        const weightFmt = data.weight != null && data.weight !== '' ? parseFloat(data.weight).toFixed(1) + '%' : '-';

        tr.innerHTML = `
            <td data-label="종목명"><strong>${escapeHtml(data.name)}</strong> <span style="color:#888; font-size:0.85em;">(${escapeHtml(data.ticker)})</span></td>
            <td data-label="비중">${weightFmt}</td>
            <td data-label="현재가">${pricePrefix}${escapeHtml(priceFmt)}</td>
            <td data-label="변동률" class="${getColorClass(data.change)}">${escapeHtml(data.change)}%</td>
            <td data-label="수익률" class="${getColorClass(data.returnRate)}">${escapeHtml(data.returnRate)}%</td>
            <td data-label="MDD" style="color:var(--negative)">${data.mdd === '-' ? '-' : escapeHtml(data.mdd) + '%'}</td>
            <td data-label="회복확률">
                ${data.recoveryProb === '-' ? '-' : `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="drawdown-text">${escapeHtml(data.recoveryProb)}%</span>
                </div>
                <div class="drawdown-bar-container" style="background:rgba(255,255,255,0.1); width:100%; height:4px; border-radius:2px; overflow:hidden; margin-top:4px;">
                    <div style="background:${parseFloat(data.recoveryProb) >= 80 ? '#4ade80' : '#fb7185'}; width: ${parseFloat(data.recoveryProb) || 0}%; height:100%;"></div>
                </div>
                `}
            </td>
            <td data-label="RSI(14)" style="text-align:center;">${data.rsi === '-' ? '-' : `<span class="rsi-tag ${rsiClass}">${escapeHtml(data.rsi)}</span>`}</td>
            <td data-label="분배율/배당률" style="text-align:center; color: var(--primary);">${data.dividendYield === '-' ? '-' : escapeHtml(data.dividendYield) + '%'}</td>
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
        
        const nowStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        toast.innerHTML = `
            <span class="toast-icon">⏳</span>
            <div style="display:flex; flex-direction:column; flex:1;">
                <span class="toast-message">실시간 데이터 업데이트 중 (${nowStr})...</span>
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

        // 로컬 캐시 삭제 (강제 갱신을 위해)
        localStorage.removeItem('dashboard_data_cache');

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

        const syncTimeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        toast.querySelector('.toast-message').textContent = `데이터 동기화 중 (${syncTimeStr})...`;
        toast.querySelector('.toast-icon').textContent = '🔄';

        // 시트간 데이터 동기화 시간 대기
        await new Promise(resolve => setTimeout(resolve, 3000));

        const finalTimeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        toast.querySelector('.toast-message').textContent = `최신 데이터 불러오기 완료! (${finalTimeStr})`;
        toast.querySelector('.toast-icon').textContent = '✅';
        toast.className = 'toast toast-success show';

        // 데이터 페치 (강제 갱신)
        await fetchData(true);
        
        // 현재 활성화된 탭이 서브 데이터 탭이라면 해당 탭도 즉시 갱신
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab) {
            if (activeTab.id === 'holdings-analysis-tab') fetchHoldingsAnalysisData(true);
            else if (activeTab.id === 'sp500-tab') fetchSP500Data();
            else if (activeTab.id === 'kospi200-tab') fetchKOSPI200Data();
        }
        
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

    // 페이지 로드 시 구글 시트 데이터 갱신 요청 (Non-blocking)
    const refreshFab = document.getElementById('refresh-fab');
    if (refreshFab) refreshFab.classList.add('loading');

    logger.log("🔄 대시보드 로드 시작...");

    // 시장 데이터 갱신을 백그라운드에서 요청
    requestMarketRefresh();

    // 즉시 데이터 페치 시작 (내부적으로 캐시를 먼저 보여주고 실시간 데이터를 가져옴)
    fetchData();

    // 스크롤 맨 위로 가기 버튼 로직
    const scrollTopBtn = document.getElementById('scroll-to-top');
    if (scrollTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollTopBtn.style.display = 'flex';
            } else {
                scrollTopBtn.style.display = 'none';
            }
        });
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
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

    // 5. 모바일/PC 전환에 따른 시장 데이터 포맷 즉시 갱신 (데이터가 있는 경우)
    const isMobileMode = currentDisplayMode === 'mobile';
    const markets = ['snp', 'nasdaq', 'dow', 'kospi', 'kosdaq', 'fx'];
    markets.forEach(id => {
        const valEl = document.getElementById(`card-${id}-val`);
        if (valEl && valEl.getAttribute('data-price')) {
            const lastPrice = parseFloat(valEl.getAttribute('data-price'));
            if (!isNaN(lastPrice)) {
                if (id === 'fx') {
                    valEl.textContent = isMobileMode ? Math.round(lastPrice).toLocaleString() : lastPrice.toFixed(2);
                } else {
                    if (isMobileMode) {
                        valEl.textContent = Math.round(lastPrice).toLocaleString();
                    } else {
                        valEl.textContent = lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    }
                }
            }
        }
    });
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
        <span class="toast-message">${escapeHtml(message)}</span>
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

async function fetchData(force = false) {
    holdingsAnalysisData = []; // 보유 종목 분석 데이터 초기화
    const CACHE_KEY = 'dashboard_data_cache';

    // 1. 캐시된 데이터 처리: 강제 갱신이 아니면 캐시 시도
    if (!force) {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            try {
                const cache = JSON.parse(cachedData);
                renderFromData(cache);
                
                const now = new Date().getTime();
                const cacheAge = (now - (cache.timestamp || 0)) / 1000;
                // 캐시가 30초 이내면 사용
                if (cacheAge < 30) {
                    updateTimestamp(true, "Cache");
                    return; 
                }
            } catch (e) { logger.warn("Cache fail", e); }
        } else {
            // 캐시가 없으면 스냅샷(data_snapshot.json) 시도
            try {
                const response = await fetch(CONFIG.snapshotURL + '?t=' + new Date().getTime());
                if (response.ok) {
                    const snapshot = await response.json();
                    renderFromData(snapshot);
                    updateTimestamp(false, "Snapshot");
                }
            } catch (e) { logger.warn("Snapshot load fail", e); }
        }
    }
    
    updateTimestamp(null, "⏳ 데이터 로드 중...");

    try {
        // 2. 실시간 데이터 페치 및 시장 지수 병렬 업데이트
        logger.log("실시간 데이터 페칭 시작...");
        
        // 시장 지수 업데이트 (await 하지 않고 백그라운드에서 실행)
        updateMarketCharts();

        // 구글 시트 캐시 방지를 위해 고유 타임스탬프 추가
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
            logger.log("Live 데이터 업데이트 완료");
        } else {
            throw new Error("Empty response from all proxies");
        }
    } catch (err) {
        logger.warn("실시간 로드 실패", err);
        showToast("데이터 갱신 실패. 시트의 '웹에 게시' 상태를 확인하세요.", 'error');
    }
}

// 데이터를 받아서 각 컴포넌트에 뿌려주는 통합 함수
function renderFromData(data) {
    logger.log("데이터 렌더링 시작...", Object.keys(data));
    try {
        if (data.summary) {
            renderSummary(data.summary, document.querySelector('#summary-table tbody'));
        }
    } catch (e) { logger.error("Summary rendering failed:", e); }

    try {
        if (data.holdings) {
            processHoldingsData(data.holdings);
        }
    } catch (e) { logger.error("Holdings rendering failed:", e); }

    try {
        if (data.history) {
            rawHistoryData = data.history;
            renderHistoryChartWithRange();
            renderHeatmap();
        }
    } catch (e) { logger.error("History rendering failed:", e); }
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
        
        // 백그라운드 실시간 가격 업데이트
        updateLivePrices(sp500Data, false);
        
        statusText.textContent = `✅ S&P 500 업데이트 완료 (${new Date().toLocaleTimeString()})`;
    } catch (err) {
        logger.error("SP500 데이터 로드 실패:", err);
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
        tr.onclick = () => window.open(`https://finance.yahoo.com/quote/${encodeURIComponent(data.ticker)}`, '_blank');
        
        let rsiClass = 'rsi-neutral';
        const rsiValue = parseFloat(data.rsi);
        if (!isNaN(rsiValue)) {
            if (rsiValue >= 70) rsiClass = 'rsi-overbought';
            else if (rsiValue <= 30) rsiClass = 'rsi-oversold';
        }
        
        const priceFmt = data.price ? parseFloat(data.price).toFixed(2) : "-";
        
        tr.innerHTML = `
            <td data-label="순위" style="text-align:center;">${escapeHtml(data.rank)}</td>
            <td data-label="종목명"><strong>${escapeHtml(data.name)}</strong> <span style="color:#888; font-size:0.85em;">(${escapeHtml(data.ticker)})</span></td>
            <td data-label="시가 총액">${formatBillion(data.marketCap)}</td>
            <td data-label="현재가">$${escapeHtml(priceFmt)}</td>
            <td data-label="변동률" class="${getColorClass(data.change)}">${escapeHtml(data.change)}%</td>
            <td data-label="MDD" style="color:var(--negative)">${escapeHtml(data.mdd)}%</td>
            <td data-label="회복확률">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="drawdown-text">${escapeHtml(data.recoveryProb)}%</span>
                </div>
                <div class="drawdown-bar-container" style="background:rgba(255,255,255,0.1); width:100%; height:4px; border-radius:2px; overflow:hidden; margin-top:4px;">
                    <div style="background:${parseFloat(data.recoveryProb) >= 80 ? '#4ade80' : '#fb7185'}; width: ${parseFloat(data.recoveryProb) || 0}%; height:100%;"></div>
                </div>
            </td>
            <td data-label="RSI(14)" style="text-align:center;"><span class="rsi-tag ${rsiClass}">${escapeHtml(data.rsi)}</span></td>
            <td data-label="배당률" style="text-align:center; color: var(--primary);">${escapeHtml(data.dividendYield)}%</td>
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

        // 백그라운드 실시간 가격 업데이트
        updateLivePrices(kospi200Data, true);

        statusText.textContent = `✅ KOSPI 200 업데이트 완료 (${new Date().toLocaleTimeString()})`;
    } catch (err) {
        logger.error("KOSPI200 데이터 로드 실패:", err);
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
        tr.onclick = () => window.open(`https://finance.yahoo.com/quote/${encodeURIComponent(data.ticker)}`, '_blank');
        
        let rsiClass = 'rsi-neutral';
        const rsiValue = parseFloat(data.rsi);
        if (!isNaN(rsiValue)) {
            if (rsiValue >= 70) rsiClass = 'rsi-overbought';
            else if (rsiValue <= 30) rsiClass = 'rsi-oversold';
        }
        
        const priceFmt = data.price ? parseFloat(data.price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "-";
        
        tr.innerHTML = `
            <td data-label="순위" style="text-align:center;">${escapeHtml(data.rank)}</td>
            <td data-label="종목명"><strong>${escapeHtml(data.name)}</strong> <span style="color:#888; font-size:0.85em;">(${escapeHtml(data.ticker)})</span></td>
            <td data-label="시가 총액">${formatKoreanCap(data.marketCap)}</td>
            <td data-label="현재가">₩${escapeHtml(priceFmt)}</td>
            <td data-label="변동률" class="${getColorClass(data.change)}">${escapeHtml(data.change)}%</td>
            <td data-label="MDD" style="color:var(--negative)">${escapeHtml(data.mdd)}%</td>
            <td data-label="회복확률">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="drawdown-text">${escapeHtml(data.recoveryProb)}%</span>
                </div>
                <div class="drawdown-bar-container" style="background:rgba(255,255,255,0.1); width:100%; height:4px; border-radius:2px; overflow:hidden; margin-top:4px;">
                    <div style="background:${parseFloat(data.recoveryProb) >= 80 ? '#4ade80' : '#fb7185'}; width: ${parseFloat(data.recoveryProb) || 0}%; height:100%;"></div>
                </div>
            </td>
            <td data-label="RSI(14)" style="text-align:center;"><span class="rsi-tag ${rsiClass}">${escapeHtml(data.rsi)}</span></td>
            <td data-label="배당률" style="text-align:center; color: var(--primary);">${data.dividendYield}%</td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * 각 탭별 강제 데이터 새로고침 함수
 */
function refreshHoldingsAnalysis() {
    fetchHoldingsAnalysisData(true);
}

function refreshSP500() {
    fetchSP500Data();
}

function refreshKOSPI200() {
    fetchKOSPI200Data();
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
        
        // 1. 유효성 검사 (HTML 에러 페이지 필터링)
        if (!text || text.length < 20 || text.includes("<!DOCTYPE") || text.includes("<html") || text.includes("Unauthorized")) {
            throw new Error("Invalid data received (HTML or Unauthorized)");
        }

        // 2. JSON 데이터인 경우 (야후 파이낸스 등)
        if (text.trim().startsWith('{') && (text.includes('"chart"') || text.includes('"result"'))) {
            return { type: 'json', data: JSON.parse(text) };
        }
        
        // 3. CSV 데이터인 경우 (구글 시트)
        if (text.includes(',') || text.includes('\t')) {
            const result = Papa.parse(text, { header: false, skipEmptyLines: true });
            if (result.data && result.data.length > 1) { // 최소 헤더 + 1개 행 이상
                return { type: 'csv', data: result.data };
            }
        }
        
        throw new Error("Parsing failed: Not a valid JSON chart or CSV");
    };

    const tasks = [];

    // 1. GAS 프록시 우선 시도 (CORS 및 레이트 리밋 우회)
    if (CONFIG.gasURL) {
        tasks.push(fetchTask(CONFIG.gasURL, {
            method: 'POST',
            body: JSON.stringify({ command: "proxy_yahoo", url: targetUrl, apiKey: CONFIG.gasApiKey || '' })
        }));
    }

    // 2. 공용 프록시 시도 (인코딩된 URL 사용)
    const encodedTarget = encodeURIComponent(targetUrl);
    const publicProxies = [
        `https://api.allorigins.win/raw?url=${encodedTarget}`,
        `https://corsproxy.io/?url=${encodedTarget}`,
        `https://api.codetabs.com/v1/proxy?url=${encodedTarget}`
    ];
    publicProxies.forEach(proxy => {
        tasks.push(fetchTask(proxy));
    });

    // 3. 직접 호출 시도 (CORS 허용된 경우 대비, 짧은 타임아웃)
    tasks.push(fetchTask(targetUrl, { signal: AbortSignal.timeout(3000) }));

    try {
        // 가장 빨리 성공하는 작업 결과 반환
        const fastestResult = await Promise.any(tasks);
        clearTimeout(timeoutId);
        return fastestResult;
    } catch (e) {
        logger.error("All fetch attempts failed", e);
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
            logger.error("JSON 파싱 에러:", e);
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
        logger.error(err);
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
        <div class="mdd-summary-item"><span class="label">종목</span><span class="value">${escapeHtml(ticker)}</span></div>
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

    logger.log("📊 지수 데이터 업데이트 시작...");

    await Promise.all(markets.map(async (m) => {
        try {
            const valEl = document.getElementById(`card-${m.id}-val`);
            const chgEl = document.getElementById(`card-${m.id}-change`);
            
            // 티커 중복 인코딩 방지: fetchWithFallback에서 전체 URL을 인코딩하므로 여기서는 원본 유지
            const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${m.ticker}?interval=1d&range=1d&_=${Date.now()}`;
            
            const result = await fetchWithFallback(targetUrl, true);

            if (result && result.type === 'json') {
                const meta = result.data.chart?.result?.[0]?.meta;
                if (meta) {
                    const lastPrice = meta.regularMarketPrice;
                    
                    // 우선적으로 API에서 제공하는 공식 변화율 사용 (더 정확함)
                    let changePercent = null;
                    if (meta.regularMarketChangePercent !== undefined && meta.regularMarketChangePercent !== null) {
                        changePercent = meta.regularMarketChangePercent.toFixed(2);
                    } else {
                        const prevClose = meta.chartPreviousClose || meta.previousClose;
                        if (lastPrice && prevClose) {
                            changePercent = ((lastPrice / prevClose - 1) * 100).toFixed(2);
                        }
                    }
                    
                    if (lastPrice !== undefined && changePercent !== null) {
                        const isPositive = parseFloat(changePercent) >= 0;

                        if (valEl) {
                            // 모바일 모드 여부 확인 (화면 너비 768px 이하 또는 사용자 설정이 모바일인 경우)
                            const isMobileMode = userViewMode === 'mobile' || (userViewMode === 'auto' && window.innerWidth <= 768);
                            
                            if (m.id === 'fx') {
                                // 환율 표시: 모바일은 소수점 없이, PC는 소수점 2자리
                                valEl.textContent = isMobileMode ? Math.round(lastPrice).toLocaleString() : lastPrice.toFixed(2);
                                valEl.setAttribute('data-price', lastPrice);
                                usdKrwRate = lastPrice;
                                usdKrwRateUpdatedAt = Date.now();
                            } else {
                                // 지수 표시: 모바일은 소수점 없이, PC는 소수점 2자리(천단위 구분자 포함)
                                valEl.setAttribute('data-price', lastPrice);
                                if (isMobileMode) {
                                    valEl.textContent = Math.round(lastPrice).toLocaleString();
                                } else {
                                    valEl.textContent = lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                }
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
        } catch (e) {
            logger.error(`🚨 ${m.id} 업데이트 오류:`, e);
        }
    }));
}

function renderSummary(data, tableElement) {
    if (!data || !Array.isArray(data)) {
        logger.warn("Invalid summary data format:", data);
        return;
    }
    if (!tableElement) {
        logger.warn("Summary table element not found");
        return;
    }
    
    logger.log(`요약 데이터 렌더링 시작: ${data.length}행 발견`);
    tableElement.innerHTML = '';

    // 스켈레톤 제거
    document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));

    try {
        // "합계" 또는 "합산"이 포함된 행 중 평가액(index 1)이 숫자인 행 찾기
        let totalRow = data.find(row => {
            if (!row[SUMMARY_COL.NAME]) return false;
            const name = String(row[SUMMARY_COL.NAME]);
            const evalVal = parseSafeFloat(row[SUMMARY_COL.EVAL_TOTAL]);
            return (name.includes("합계") || name.includes("합산")) && evalVal !== 0;
        });
        
        // 만약 못 찾으면 데이터 구조를 분석하여 가장 큰 평가액을 가진 행을 후보로 선택
        if (!totalRow) {
            const candidates = data.filter(row => row[SUMMARY_COL.NAME] && parseSafeFloat(row[SUMMARY_COL.EVAL_TOTAL]) > 0);
            if (candidates.length > 0) {
                totalRow = candidates.reduce((prev, curr) => 
                    parseSafeFloat(curr[SUMMARY_COL.EVAL_TOTAL]) > parseSafeFloat(prev[SUMMARY_COL.EVAL_TOTAL]) ? curr : prev
                );
            }
        }

        if (totalRow) {
            const evalKRW = parseSafeFloat(totalRow[SUMMARY_COL.EVAL_TOTAL]);
            const investKRW = parseSafeFloat(totalRow[SUMMARY_COL.INVEST_TOTAL]);
            
            // 현재 평가액 카드 업데이트 (KRW + USD 병기)
            const evalValEl = document.getElementById('card-eval-val');
            if (evalValEl) {
                const evalTextKRW = maskValue(totalRow[SUMMARY_COL.EVAL_TOTAL]);
                let evalText = getResponsiveValueHTML(evalTextKRW);
                if (isExchangeRateValid() && evalKRW > 10000) { 
                    const evalUSD = evalKRW / usdKrwRate;
                    evalText += ` <span class="value-sub">($${evalUSD.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0})})</span>`;
                }
                evalValEl.innerHTML = evalText || "-";
            }

            document.getElementById('card-invest-val').innerHTML = getResponsiveValueHTML(maskValue(totalRow[SUMMARY_COL.INVEST_TOTAL])) || "-";
            
            const profitElem = document.getElementById('card-profit-val');
            profitElem.innerHTML = getResponsiveValueHTML(maskValue(totalRow[SUMMARY_COL.PROFIT])) || "0";
            profitElem.className = 'value ' + getColorClass(totalRow[SUMMARY_COL.PROFIT]);
            
            const rateElem = document.getElementById('card-rate-val');
            rateElem.textContent = totalRow[SUMMARY_COL.RETURN_RATE] || "0%";
            rateElem.className = 'value ' + getColorClass(totalRow[SUMMARY_COL.RETURN_RATE]);

            const dailyElem = document.getElementById('card-daily-val');
            if (dailyElem) {
                const changePct = totalRow[SUMMARY_COL.DAILY_CHANGE_PCT] || "0%";
                const changeAmt = getResponsiveValueHTML(maskValue(totalRow[SUMMARY_COL.DAILY_CHANGE_AMT])) || "0";
                dailyElem.innerHTML = `${changePct} <span style="font-size:0.6em; opacity:0.8;">(${changeAmt})</span>`;
                dailyElem.className = 'value ' + getColorClass(totalRow[SUMMARY_COL.DAILY_CHANGE_PCT]);
            }

            document.getElementById('card-dividend-val').innerHTML = getResponsiveValueHTML(maskValue(totalRow[SUMMARY_COL.DIVIDEND])) || "0";
        }
    } catch (e) { logger.warn("Summary parsing error", e); }

    const labels = [], invests = [], evals = [];
    const headerIndex = data.findIndex(row => row[SUMMARY_COL.NAME] && row[SUMMARY_COL.NAME].includes("계좌명"));
    const startIndex = headerIndex !== -1 ? headerIndex + 1 : 0;

    data.forEach((row, i) => {
        if (i < startIndex || !row[SUMMARY_COL.NAME] || row[SUMMARY_COL.NAME].includes("계좌명") || row[SUMMARY_COL.NAME].includes("합산") || row[SUMMARY_COL.NAME].includes("합계")) return;
        
        const name = row[SUMMARY_COL.NAME].trim(); 
        if (name === "") return;
        
        const evalNum = parseSafeFloat(row[SUMMARY_COL.EVAL_TOTAL]), investNum = parseSafeFloat(row[SUMMARY_COL.INVEST_TOTAL]);
        labels.push(maskValue(name, true)); 
        invests.push(investNum); 
        evals.push(evalNum);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="계좌명"><span>${safeValue(name, true)}</span></td>
            <td data-label="평가금"><span>${safeValue(row[SUMMARY_COL.EVAL_TOTAL])}</span></td>
            <td data-label="투자금"><span>${safeValue(row[SUMMARY_COL.INVEST_TOTAL])}</span></td>
            <td data-label="수입액" class="${getColorClass(row[SUMMARY_COL.PROFIT])}"><span>${safeValue(row[SUMMARY_COL.PROFIT])}</span></td>
            <td data-label="수익률" class="${getColorClass(row[SUMMARY_COL.RETURN_RATE])}"><span>${safeValue(row[SUMMARY_COL.RETURN_RATE])}</span></td>
            <td data-label="일일변동" class="${getColorClass(row[SUMMARY_COL.DAILY_CHANGE_PCT])}"><span>${safeValue(row[SUMMARY_COL.DAILY_CHANGE_PCT])} <span style="font-size:0.85em; opacity:0.8;">(${safeValue(row[SUMMARY_COL.DAILY_CHANGE_AMT])})</span></span></td>
        `;
        tableElement.appendChild(tr);
    });
    renderSummaryChart(labels, invests, evals);
}

function processHoldingsData(data) {
    if (!data || !Array.isArray(data)) {
        logger.warn("Invalid holdings data format:", data);
        return;
    }
    
    logger.log(`보유 종목 데이터 처리 시작: ${data.length}행 발견`);
    globalHoldings = [];

    // 매매 기록용 종목 선택 드롭다운 초기화
    const stockSelect = document.getElementById('stock-name-select');
    if (stockSelect) {
        stockSelect.innerHTML = '<option value="">보유 종목 선택</option><option value="DIRECT">직접 입력 (신규)</option>';
    }

    const addedStocks = new Set();
    data.forEach((row, i) => {
        const nameValue = row[HOLDINGS_COL.NAME] || '';
        // 헤더 및 메타데이터 행 건너뛰기
        if (i === 0 || !nameValue || ["종목명", "환율", "Ticker", "화폐단위"].includes(nameValue) || nameValue.startsWith('(')) return;

        // 한국 주식 여부 (6자리 숫자 티커 또는 특정 종목명)
        const tickerValue = row[HOLDINGS_COL.TICKER] || '';
        const isKRW = isKoreanStock(tickerValue) || nameValue.toLowerCase().includes('plus50');
        const currency = isKRW ? 'KRW' : 'USD';

        // 드롭다운에 추가 (중복 제거)
        if (stockSelect && row[HOLDINGS_COL.NAME] && !addedStocks.has(row[HOLDINGS_COL.NAME])) {
            addedStocks.add(row[HOLDINGS_COL.NAME]);
            const opt = document.createElement('option');
            opt.value = row[HOLDINGS_COL.NAME]; // 종목명
            opt.dataset.ticker = tickerValue; // 티커
            opt.dataset.currency = currency; // 통화 정보 추가
            opt.textContent = row[HOLDINGS_COL.NAME];
            stockSelect.appendChild(opt);
        }

        const weight = parseSafeFloat(row[HOLDINGS_COL.WEIGHT]);
        const evalKRW = parseSafeFloat(row[HOLDINGS_COL.EVAL_KRW]);
        
        // 데이터 로드 중인 행이거나 유효하지 않은 데이터 건너뛰기
        if ((weight === 0 && evalKRW === 0) || String(row[HOLDINGS_COL.WEIGHT]).includes('로드')) return;

        const rawTicker = row[HOLDINGS_COL.TICKER] || '';
        const ticker = rawTicker.includes(':') ? rawTicker.split(':').pop() : rawTicker;

        globalHoldings.push({
            name: row[HOLDINGS_COL.NAME],
            ticker: ticker,
            currency,
            weight,
            returnRate: parseSafeFloat(row[HOLDINGS_COL.RETURN_RATE]),
            eval: evalKRW,
            profit: parseSafeFloat(row[HOLDINGS_COL.PROFIT]),
            dailyChange: parseSafeFloat(row[HOLDINGS_COL.DAILY_CHANGE]),
            shares: row[HOLDINGS_COL.SHARES] || '-',
            avgCost: row[HOLDINGS_COL.AVG_COST] || '-',
            currentPriceKRW: row[HOLDINGS_COL.CURRENT_PRICE] || row[HOLDINGS_COL.EVAL_KRW] || '-',
            display: {
                weight: row[HOLDINGS_COL.WEIGHT],
                returnRate: row[HOLDINGS_COL.RETURN_RATE],
                evalKRW: row[HOLDINGS_COL.EVAL_KRW],
                profitKRW: row[HOLDINGS_COL.PROFIT],
                dailyChange: row[HOLDINGS_COL.DAILY_CHANGE],
                currentPrice: row[HOLDINGS_COL.CURRENT_PRICE] || row[HOLDINGS_COL.EVAL_KRW]
            }
        });
    });
    
    logger.log(`보유 종목 처리 완료: ${globalHoldings.length}종목 추출됨`);
    
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
    
    globalHoldings.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        // 문자열 정렬 (종목명 등)
        if (typeof valA === 'string' && typeof valB === 'string') {
            return sortState.direction === 'asc' 
                ? valA.localeCompare(valB, 'ko') 
                : valB.localeCompare(valA, 'ko');
        }

        // 숫자 정렬 (비중, 수익률 등)
        return sortState.direction === 'asc' ? valA - valB : valB - valA;
    });
    
    renderHoldingsTable();
}

function renderHoldingsTable() {
    const table = document.getElementById('holdings-table');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    const thead = table.querySelector('thead');
    if (!tbody) return; 
    tbody.innerHTML = '';

    // 헤더 아이콘 업데이트
    if (thead) {
        const headers = thead.querySelectorAll('th');
        const headerMap = { name: 0, weight: 1, returnRate: 2, profit: 3, eval: 4, dailyChange: 5 };
        headers.forEach((th, idx) => {
            let text = th.textContent.replace(/[▲▼↕]/g, '');
            if (idx === headerMap[sortState.column]) {
                th.textContent = text + (sortState.direction === 'asc' ? '▲' : '▼');
            } else {
                th.textContent = text + '↕';
            }
        });
    }

    globalHoldings.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = () => openStockModal(item);

        const weightFmt = formatPercent(item.display.weight);
        const returnRateFmt = formatPercent(item.display.returnRate);
        const dailyChangeFmt = formatPercent(item.display.dailyChange);
        const formattedProfit = getResponsiveValueHTML(maskValue(item.display.profitKRW + '원'));
        const formattedEval = getResponsiveValueHTML(maskValue(item.display.evalKRW + '원'));

        const currencyLabel = item.currency === 'KRW' ? 'KRW' : 'USD';
        const currencyClass = item.currency === 'KRW' ? 'krw' : '';

        tr.innerHTML = `
            <td data-label="종목명">
                <div style="display: flex; align-items: center; gap: 8px; justify-content: flex-end;">
                    ${safeValue(item.name, true)}
                    <span class="card-currency-badge ${currencyClass}" style="font-size: 0.6rem; padding: 1px 4px;">${currencyLabel}</span>
                </div>
            </td>
            <td data-label="비중"><span>${weightFmt}</span></td>
            <td data-label="수익률" class="${getColorClass(item.display.returnRate)}"><span>${returnRateFmt}</span></td>
            <td data-label="수익액" class="${getColorClass(item.display.profitKRW)}"><span>${formattedProfit}</span></td>
            <td data-label="평가금"><span>${formattedEval}</span></td>
            <td data-label="일일변동" class="${getColorClass(item.display.dailyChange)}"><span>${dailyChangeFmt}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Global variable to keep track of the current item in the modal for chart range updates
let currentModalItem = null;

// ===== Stock Detail Modal =====
async function openStockModal(item) {
    const overlay = document.getElementById('stock-modal-overlay');
    if (!overlay) return;

    currentModalItem = item;
    const isPositive = item.dailyChange >= 0;
    const posClass = isPositive ? 'positive' : 'negative';
    const changeSign = isPositive ? '+' : '';
    const currencyIsKRW = isKoreanStock(item.ticker);
    const currencyLabel = currencyIsKRW ? 'KRW' : 'USD';

    // 헬퍼 함수
    const fmtKRW = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
    const fmtUSD = (n) => (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

    // Price Section (Market Value & Change)
    const evalKRWNum = item.eval || 0;
    const dailyAmtKRW = evalKRWNum * item.dailyChange / 100;
    
    // 3. 가장 위 마켓 밸류: 원화(달러) 형식
    let displayEval = fmtKRW(evalKRWNum);
    if (!currencyIsKRW && isExchangeRateValid()) {
        displayEval += `(${fmtUSDabs(evalKRWNum / usdKrwRate)})`;
    }
    document.getElementById('modal-current-price').textContent = maskValue(displayEval);

    // 4. 가장 위 변동액: 변동액 원화(달러) - 변동률(%) 형식
    const diffElem = document.getElementById('modal-price-diff');
    const pctElem = document.getElementById('modal-price-pct');
    
    let displayDiff = fmtKRWS(dailyAmtKRW);
    if (!currencyIsKRW && isExchangeRateValid()) {
        displayDiff += `(${fmtUSD(dailyAmtKRW / usdKrwRate)})`;
    }
    diffElem.textContent = maskValue(displayDiff);
    diffElem.className = isPositive ? 'positive' : 'negative';
    
    pctElem.textContent = `${changeSign}${item.dailyChange}%`;
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

    if (!currencyIsKRW && isExchangeRateValid()) {
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

    // 2. 주식/ETF 정보 업데이트 (시총, 52주 최고가, 현재 MDD, RSI)
    // 분석 테이블에 이미 있는 데이터(MDD, RSI) 활용 시도
    let analysisData = holdingsAnalysisData.find(d => d.ticker === item.ticker);
    document.getElementById('modal-mdd').textContent = analysisData && analysisData.mdd !== '-' ? analysisData.mdd + '%' : (item.mdd ? item.mdd + '%' : '-');
    document.getElementById('modal-rsi').textContent = analysisData && analysisData.rsi !== '-' ? analysisData.rsi : '-';
    
    // 시총과 52주 최고가 활용
    document.getElementById('modal-market-cap').textContent = analysisData && analysisData.marketCap ? (currencyIsKRW ? formatKoreanCap(analysisData.marketCap) : formatBillion(analysisData.marketCap)) : '-';
    document.getElementById('modal-52w-high').textContent = '-';

    // Your Position — 모두 원화
    const profitKRW = parseSafeFloat(item.display.profitKRW);
    const costBasisKRW = evalKRWNum - profitKRW;

    document.getElementById('modal-market-value').textContent = maskValue(evalKRWNum > 0 ? fmtKRW(evalKRWNum) : (item.display.evalKRW || '-'));
    document.getElementById('modal-cost-basis').textContent = maskValue(evalKRWNum > 0 ? fmtKRW(costBasisKRW) : '-');

    const totalGainElem = document.getElementById('modal-total-gain');
    totalGainElem.textContent = profitKRW !== 0 ? maskValue(fmtKRWS(profitKRW)) : '-';
    totalGainElem.className = profitKRW > 0 ? 'value-up' : (profitKRW < 0 ? 'value-down' : '');

    const returnElem = document.getElementById('modal-return');
    returnElem.textContent = item.display.returnRate ? `${item.display.returnRate}%` : '-';
    returnElem.className = getColorClass(item.display.returnRate);

    // Show modal
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Load and render chart
    fetchModalChartData(item.ticker, '1mo');
}

function closeStockModal(e) {
    if (e && e.target !== e.currentTarget && e.target.className !== 'modal-close') return;
    const overlay = document.getElementById('stock-modal-overlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = 'auto';
    if (intradayChart) { intradayChart.destroy(); intradayChart = null; }
}

async function fetchModalChartData(ticker, range) {
    const ctx = document.getElementById('modal-intraday-chart').getContext('2d');
    if (intradayChart) intradayChart.destroy();

    // Placeholder animation while loading
    intradayChart = new Chart(ctx, { type: 'line', data: { labels: [], datasets: [] }, options: { plugins: { title: { display: true, text: 'Loading historical data...' } } } });

    try {
        const formattedTicker = formatTicker(ticker);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedTicker}?interval=${range === '5d' ? '30m' : '1d'}&range=${range}`;
        const res = await fetchWithFallback(url, true);

        if (res && res.type === 'json') {
            const chartData = res.data.chart.result[0];
            const meta = chartData.meta;
            const timestamps = chartData.timestamp;
            const prices = chartData.indicators.quote[0].close;

            // Update meta info in modal if available
            if (meta.marketCap) {
                const isKRW = isKoreanStock(ticker);
                document.getElementById('modal-market-cap').textContent = isKRW ? formatKoreanCap(meta.marketCap) : formatBillion(meta.marketCap);
            }
            if (meta.fiftyTwoWeekHigh) {
                const isKRW = isKoreanStock(ticker);
                document.getElementById('modal-52w-high').textContent = isKRW ? Math.round(meta.fiftyTwoWeekHigh).toLocaleString() + '원' : '$' + meta.fiftyTwoWeekHigh.toFixed(2);
            }

            const labels = timestamps.map(ts => {
                const date = new Date(ts * 1000);
                return range === '5d' ? `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00` : `${date.getMonth() + 1}/${date.getDate()}`;
            });

            const isPositive = (prices[prices.length - 1] >= prices[0]);
            const color = isPositive ? '#4ade80' : '#fb7185';
            const gradient = ctx.createLinearGradient(0, 0, 0, 200);
            gradient.addColorStop(0, isPositive ? 'rgba(74,222,128,0.2)' : 'rgba(251,113,133,0.2)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');

            intradayChart.destroy();
            intradayChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: prices,
                        borderColor: color,
                        borderWidth: 2,
                        fill: true,
                        backgroundColor: gradient,
                        tension: 0.1,
                        pointRadius: 0,
                        pointHitRadius: 10
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
                        y: { position: 'right', grid: { color: 'rgba(255,255,255,0.05)' } }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: { mode: 'index', intersect: false }
                    }
                }
            });
        }
    } catch (e) {
        logger.warn("Chart data load failed", e);
        if (intradayChart) {
            intradayChart.destroy();
            intradayChart = new Chart(ctx, { type: 'line', data: { labels: [], datasets: [] }, options: { plugins: { title: { display: true, text: 'Failed to load chart data' } } } });
        }
    }
}

function updateModalChartRange(range, btn) {
    if (!currentModalItem) return;
    document.querySelectorAll('#modal-chart-filter-group .sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    fetchModalChartData(currentModalItem.ticker, range);
}

// -------------------------------------------------------------------------
// 차트 렌더링 함수들
// -------------------------------------------------------------------------

function renderSummaryChart(labels, invests, evals) {
    const ctx = document.getElementById('summaryChart').getContext('2d');
    if (summaryChart) summaryChart.destroy();

    summaryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '평가액', data: evals, backgroundColor: '#38bdf8', borderRadius: 6 },
                { label: '투자액', data: invests, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 6 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: { 
                    beginAtZero: true, 
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        callback: function(value) {
                            if (window.innerWidth <= 768 && !document.body.classList.contains('force-pc')) {
                                return (value / 100000000).toFixed(0) + '억';
                            }
                            return value.toLocaleString();
                        }
                    }
                }
            },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const label = ctx.dataset.label || '';
                            const value = ctx.raw;
                            const formattedValue = formatValueByMode(value, true);
                            return `${label}: ${maskValue(formattedValue)}`;
                        }
                    }
                }
            }
        }
    });
}

function updateHistoryRange(range, btn) {
    currentHistoryRange = range;
    const buttons = document.querySelectorAll('#history-filter-group .sort-btn');
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderHistoryChartWithRange();
}

function renderHistoryChartWithRange() {
    if (!rawHistoryData || rawHistoryData.length === 0) return;

    const ctx = document.getElementById('historyChart').getContext('2d');
    if (historyChart) historyChart.destroy();

    // 1. 헤더에서 날짜 인덱스 찾기 (첫 번째 열이 보통 날짜)
    const data = rawHistoryData.slice(1); // 헤더 제외
    
    // 2. 필터링 로직
    let filteredData = data;
    const now = new Date();
    
    if (currentHistoryRange !== 'ALL') {
        const cutoff = new Date();
        if (currentHistoryRange === '1M') cutoff.setMonth(now.getMonth() - 1);
        else if (currentHistoryRange === '3M') cutoff.setMonth(now.getMonth() - 3);
        else if (currentHistoryRange === '6M') cutoff.setMonth(now.getMonth() - 6);
        else if (currentHistoryRange === '1Y') cutoff.setFullYear(now.getFullYear() - 1);
        else if (currentHistoryRange === '3Y') cutoff.setFullYear(now.getFullYear() - 3);
        else if (currentHistoryRange === '5Y') cutoff.setFullYear(now.getFullYear() - 5);
        else if (currentHistoryRange === 'YTD') {
            cutoff.setMonth(0); cutoff.setDate(1); cutoff.setHours(0,0,0,0);
        }
        
        filteredData = data.filter(row => {
            let dateStr = row[HISTORY_COL.DATE];
            // 구글 시트의 "YY. MM. DD" 형식을 "20YY-MM-DD" 로 변환하여 파싱 에러 방지
            if (typeof dateStr === 'string' && /^\d{2}\.\s*\d{2}\.\s*\d{2}$/.test(dateStr)) {
                dateStr = '20' + dateStr.replace(/\.\s*/g, '-');
            }
            return new Date(dateStr) >= cutoff;
        });
    }

    const labels = filteredData.map(row => row[HISTORY_COL.DATE]);
    const evals = filteredData.map(row => parseSafeFloat(row[HISTORY_COL.EVAL_TOTAL]));
    const invests = filteredData.map(row => parseSafeFloat(row[HISTORY_COL.INVEST_TOTAL]));
    const profits = filteredData.map(row => parseSafeFloat(row[HISTORY_COL.PROFIT]));
    const dividends = filteredData.map(row => parseSafeFloat(row[HISTORY_COL.DIVIDEND]));

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.2)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');

    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '총 평가액',
                    data: evals,
                    borderColor: '#38bdf8',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 3
                },
                {
                    label: '총 투자액',
                    data: invests,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 2
                },
                {
                    label: '수익금',
                    data: profits,
                    borderColor: '#4ade80', // positive green
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 2
                },
                {
                    label: '배당액',
                    data: dividends,
                    borderColor: '#fbbf24', // yellow/gold for dividends
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
                y: { 
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        callback: function(value) {
                            if (window.innerWidth <= 768 && !document.body.classList.contains('force-pc')) {
                                return (value / 100000000).toFixed(0) + '억';
                            }
                            return value.toLocaleString();
                        }
                    }
                }
            },
            plugins: {
                legend: { 
                    display: true,
                    position: 'bottom',
                    labels: { 
                        color: '#94a3b8', 
                        boxWidth: window.innerWidth <= 768 ? 8 : 12,
                        padding: 15,
                        font: {
                            size: window.innerWidth <= 768 ? 10 : 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const label = ctx.dataset.label || '';
                            const value = ctx.raw;
                            const formattedValue = formatValueByMode(value, true);
                            return `${label}: ${maskValue(formattedValue)}`;
                        }
                    }
                }
            }
        }
    });
}

function filterBubbleChart(currency, btn) {
    const buttons = document.querySelectorAll('#bubble-filter-group .sort-btn');
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    let filtered = globalHoldings;
    if (currency !== 'ALL') {
        filtered = globalHoldings.filter(h => h.currency === currency);
    }
    renderBubbleChart(filtered);
}

function renderBubbleChart(data) {
    const ctx = document.getElementById('bubbleChart').getContext('2d');
    if (bubbleChart) bubbleChart.destroy();

    // 평가금액 기준 정규화를 위한 최대값 계산
    const maxEval = Math.max(...data.map(h => h.eval || 0), 1);

    const bubbleData = data.map(h => ({
        x: h.dailyChange,
        y: h.returnRate,
        // 평가금액에 비례하도록 수정 (Area ∝ Value => r ∝ sqrt(Value))
        r: Math.sqrt((h.eval || 0) / maxEval) * 35 + 6,
        name: h.name,
        profit: h.profit,
        eval: h.eval,
        ticker: h.ticker
    }));

    bubbleChart = new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [{
                label: '보유 종목',
                data: bubbleData,
                backgroundColor: (context) => {
                    const d = context.raw;
                    if (!d) return 'rgba(255,255,255,0.5)';
                    return d.x >= 0 ? 'rgba(74, 222, 128, 0.6)' : 'rgba(251, 113, 133, 0.6)';
                },
                borderColor: (context) => {
                    const d = context.raw;
                    if (!d) return 'white';
                    return d.x >= 0 ? '#4ade80' : '#fb7185';
                },
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: '일일 변동 (%)' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                y: { title: { display: true, text: '전체 수익률 (%)' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const d = context.raw;
                            const name = d.name;
                            const profitStr = d.profit ? ` / 수익: ${maskValue(d.profit.toLocaleString())}원` : '';
                            const evalStr = d.eval ? ` / 평가: ${maskValue(d.eval.toLocaleString())}원` : '';
                            return `${maskValue(name, true)}: 수익률 ${d.y.toFixed(2)}%, 일변동 ${d.x.toFixed(2)}%${profitStr}${evalStr}`;
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

                            // 버블이 너무 작지 않으면 이름 표시
                            if (radius > 6) {
                                const displayName = maskValue(data.name, true);
                                ctx.fillStyle = '#ffffff';
                                // 글자 크기 조정
                                const fontSize = Math.max(Math.min(radius / 2.5, 14), 8);
                                ctx.font = `bold ${fontSize}px Pretendard`;
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';

                                // 가독성을 위한 강한 그림자
                                ctx.shadowBlur = 4;
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
            if (!stockName) {
                alert("신규 종목명을 입력해주세요.");
                return;
            }
            let rawTicker = tickerInput.value.trim().toUpperCase();
            if (!rawTicker) {
                alert("티커를 입력해주세요.");
                return;
            }

        // 한국 주식 (6자리 숫자) 처리: 접두사가 없으면 KRX: 추가
            if (isKoreanStock(rawTicker)) {
                stockCode = 'KRX:' + rawTicker;
            } else {
                stockCode = rawTicker;
            }
        } else {
            const selectedOpt = stockSelect.options[stockSelect.selectedIndex];
            stockName = selectedOpt.value;
            if (!stockName) {
                alert("종목을 선택해주세요.");
                return;
            }
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
            body: JSON.stringify({ ...formData, apiKey: CONFIG.gasApiKey || '' })
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
        logger.error('GAS transaction failed:', err);
        alert('전송 실패: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = '기록하기 🐕';
    }
}

async function requestMarketRefresh(account = null) {
    try {
        const payload = { command: "refresh_market", apiKey: CONFIG.gasApiKey || '' };
        if (account) payload.account = account;

        logger.log(`${account || '전체'} 시트 데이터 갱신 요청 중...`);
        return fetch(CONFIG.gasURL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(payload)
        });
    } catch (e) {
        logger.warn('Market refresh request failed:', e);
        return Promise.resolve();
    }
}

// Slider Functionality
let currentSlide = 0;

function updateSliderDots() {
    const dots = document.querySelectorAll('.slider-dot');
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlide);
    });
}

function moveSlider(direction) {
    const slider = document.getElementById('chart-slider');
    if (!slider) return;
    
    const slideCount = slider.children.length;
    currentSlide = (currentSlide + direction + slideCount) % slideCount;
    
    goSlide(currentSlide);
}

function goSlide(index) {
    const slider = document.getElementById('chart-slider');
    if (!slider) return;
    
    currentSlide = index;
    const slideWidth = slider.offsetWidth;
    slider.scrollTo({
        left: slideWidth * index,
        behavior: 'smooth'
    });
    
    // 제목 업데이트
    const title = document.getElementById('slider-title');
    if (title) {
        title.innerHTML = index === 0 ? '📈 자산 추이 (History)' : '🔍 리스크 분석 (Risk Analysis)';
    }
    
    updateSliderDots();
}

// 슬라이더 스크롤 이벤트 감지 (모바일 스와이프 대응)
document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('chart-slider');
    if (slider) {
        slider.addEventListener('scroll', () => {
            const slideWidth = slider.offsetWidth;
            const newIndex = Math.round(slider.scrollLeft / slideWidth);
            if (newIndex !== currentSlide) {
                currentSlide = newIndex;
                const title = document.getElementById('slider-title');
                if (title) {
                    title.innerHTML = currentSlide === 0 ? '📈 자산 추이 (History)' : '🔍 리스크 분석 (Risk Analysis)';
                }
                updateSliderDots();
            }
        });
    }
});

/**
 * 🚀 S&P 500 / KOSPI 200 종목들의 실시간 가격을 가져와 화면을 조용히 업데이트함
 */
async function updateLivePrices(dataArray, isKorean = false) {
    if (!dataArray || dataArray.length === 0) return;
    
    // 100개 종목을 10개씩 나누어 처리 (API 제한 및 성능 고려)
    const batchSize = 10;
    for (let i = 0; i < dataArray.length; i += batchSize) {
        const batch = dataArray.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (item) => {
            try {
                const ticker = formatTicker(item.ticker);
                const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d&_=${Date.now()}`;
                const res = await fetchWithFallback(url, true);
                
                if (res && res.type === 'json') {
                    const meta = res.data.chart.result[0].meta;
                    const livePrice = meta.regularMarketPrice;
                    const liveChange = meta.regularMarketChangePercent || 
                                     (meta.chartPreviousClose ? ((livePrice / meta.chartPreviousClose - 1) * 100) : 0);
                    
                    // 데이터 객체 업데이트
                    item.price = livePrice;
                    item.change = liveChange.toFixed(2);
                    
                    // DOM 즉시 업데이트 (해당 티커를 포함하는 행 찾기)
                    const tableId = isKorean ? '#kospi200-table' : '#sp500-table';
                    const rows = document.querySelectorAll(`${tableId} tbody tr`);
                    
                    rows.forEach(row => {
                        if (row.innerHTML.includes(`(${item.ticker})`)) {
                            const priceCell = row.querySelector('[data-label="현재가"]');
                            const changeCell = row.querySelector('[data-label="변동률"]');
                            
                            if (priceCell) {
                                const prefix = isKorean ? '₩' : '$';
                                priceCell.textContent = prefix + (isKorean ? livePrice.toLocaleString() : livePrice.toFixed(2));
                            }
                            
                            if (changeCell) {
                                changeCell.textContent = (liveChange >= 0 ? '+' : '') + item.change + '%';
                                changeCell.className = getColorClass(item.change);
                            }
                        }
                    });
                }
            } catch (e) {
                logger.warn(`Live update failed for ${item.ticker}`, e);
            }
        }));
        
        // 배치 간 미세한 지연
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

/**
 * 🔥 자산 변동 히트맵 렌더링
 */
function renderHeatmap() {
    const container = document.getElementById('heatmap-container');
    if (!container || !rawHistoryData || rawHistoryData.length < 2) return;

    // 1. 데이터 파싱 및 일별 변동 계산
    const data = rawHistoryData.slice(1); // 헤더 제외
    const historyMap = new Map();
    let minDate = null;
    let maxDate = new Date();

    data.forEach((row, idx) => {
        let dateStr = row[0];
        if (typeof dateStr === 'string' && /^\d{2}\.\s*\d{2}\.\s*\d{2}$/.test(dateStr)) {
            dateStr = '20' + dateStr.replace(/\.\s*/g, '-');
        }
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        
        if (!minDate || d < minDate) minDate = d;
        
        // 전날 대비 변동률 계산
        let changePercent = 0;
        if (idx > 0) {
            const currentEval = parseSafeFloat(row[1]);
            const prevEval = parseSafeFloat(data[idx-1][1]);
            if (prevEval > 0) {
                changePercent = ((currentEval / prevEval) - 1) * 100;
            }
        }
        
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        historyMap.set(dateKey, {
            percent: changePercent,
            eval: parseSafeFloat(row[1]),
            invest: parseSafeFloat(row[2])
        });
    });

    if (!minDate) return;

    // 2. 테이블 구조 생성 (세로: 월, 가로: 일)
    let html = '<table class="heatmap-table"><thead><tr><th></th>';
    for (let d = 1; d <= 31; d++) {
        html += `<th>${d}</th>`;
    }
    html += '</tr></thead><tbody>';

    const startYear = minDate.getFullYear();
    const startMonth = minDate.getMonth();
    const endYear = maxDate.getFullYear();
    const endMonth = maxDate.getMonth();

    // 월별 루프 (역순: 최신이 위로 오게 하려면 여기서 조절 가능, 일단 과거부터 현재순)
    for (let y = startYear; y <= endYear; y++) {
        const mStart = (y === startYear) ? startMonth : 0;
        const mEnd = (y === endYear) ? endMonth : 11;

        for (let m = mStart; m <= mEnd; m++) {
            const shortYear = String(y).slice(-2);
            const shortMonth = String(m + 1).padStart(2, '0');
            const monthLabel = `${shortYear}.${shortMonth}`;
            html += `<tr><td class="hm-month-label">${monthLabel}</td>`;

            for (let d = 1; d <= 31; d++) {
                const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                
                // 해당 월의 실제 일수 확인
                const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
                
                if (d > lastDayOfMonth) {
                    html += '<td class="hm-cell hm-empty">X</td>'; // 달에 없는 날짜
                } else {
                    const entry = historyMap.get(dateKey);
                    if (entry) {
                        const p = entry.percent;
                        let colorClass = 'hm-empty';
                        
                        // 색상 클래스 결정 (사용자 요청: 상승 빨강, 하락 파랑)
                        if (p > 0) {
                            if (p > 3) colorClass = 'hm-up-5';
                            else if (p > 1.5) colorClass = 'hm-up-4';
                            else if (p > 0.5) colorClass = 'hm-up-3';
                            else if (p > 0.1) colorClass = 'hm-up-2';
                            else colorClass = 'hm-up-1';
                        } else if (p < 0) {
                            const ap = Math.abs(p);
                            if (ap > 3) colorClass = 'hm-down-5';
                            else if (ap > 1.5) colorClass = 'hm-down-4';
                            else if (ap > 0.5) colorClass = 'hm-down-3';
                            else if (ap > 0.1) colorClass = 'hm-down-2';
                            else colorClass = 'hm-down-1';
                        } else {
                            colorClass = 'hm-missing'; // 변동 0 (주말 등)
                        }

                        const tooltip = `${dateKey}: ${p.toFixed(2)}% (${entry.eval.toLocaleString()}원)`;
                        html += `<td class="hm-cell ${colorClass}" title="${tooltip}"></td>`;
                    } else {
                        html += '<td class="hm-cell hm-missing"></td>'; // 데이터 없는 날 (회색)
                    }
                }
            }
            html += '</tr>';
        }
    }

    html += '</tbody></table>';
    container.innerHTML = html;
}


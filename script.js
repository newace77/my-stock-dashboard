// 🐶 바둑이의 주식 데이터 처리 스크립트
// 업데이트: 2026-04-09 (탭 인터페이스 및 MDD 분석 기능 추가)

// Google OAuth 2.0 글로벌 상태 변수
let googleAccessToken = null;
let googleUserEmail = null;
let googleTokenExpiry = 0;
let googleTokenClient = null;

// 구글 로그인 관련 API 선언 및 UI 갱신 함수
function initGoogleAuth() {
  const container = document.getElementById("google-auth-container");
  if (!container) return;

  // Client ID가 구성되어 있지 않다면 UI 숨김 처리하고 종료
  if (!CONFIG.googleClientID) {
    container.style.display = "none";
    return;
  }

  // UI 노출
  container.style.display = "inline-flex";

  // Google GIS Token Client 초기화
  if (
    window.google &&
    window.google.accounts &&
    window.google.accounts.oauth2
  ) {
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientID,
      scope: "https://www.googleapis.com/auth/cloud-platform email profile",
      callback: handleTokenResponse,
    });
  } else {
    console.error("Google Identity Services SDK가 아직 로드되지 않았습니다.");
  }

  // LocalStorage로부터 세션 복원 시도
  const savedToken = localStorage.getItem("google_access_token");
  const savedExpiry = parseInt(
    localStorage.getItem("google_token_expiry") || "0",
    10,
  );
  const savedEmail = localStorage.getItem("google_user_email");

  if (savedToken && savedExpiry > Date.now()) {
    googleAccessToken = savedToken;
    googleTokenExpiry = savedExpiry;
    googleUserEmail = savedEmail;
    updateGoogleAuthUI();
  } else {
    // 만료된 토큰 청소
    clearGoogleAuthSession();
  }
}

// 토큰 응답 핸들러
async function handleTokenResponse(response) {
  if (response.error) {
    console.error("구글 OAuth 로그인 실패:", response.error);
    alert("구글 로그인 중 에러가 발생했습니다: " + response.error);
    return;
  }

  googleAccessToken = response.access_token;
  googleTokenExpiry = Date.now() + parseInt(response.expires_in, 10) * 1000;

  localStorage.setItem("google_access_token", googleAccessToken);
  localStorage.setItem("google_token_expiry", googleTokenExpiry);

  // 사용자 이메일 조회를 위해 UserInfo API 호출
  try {
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
      },
    );

    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      googleUserEmail = userInfo.email || "Google User";
      localStorage.setItem("google_user_email", googleUserEmail);
    } else {
      googleUserEmail = "구글 사용자";
    }
  } catch (err) {
    console.error("사용자 정보 로드 실패:", err);
    googleUserEmail = "구글 사용자";
  }

  updateGoogleAuthUI();
  showToast("구글 로그인이 성공적으로 완료되었습니다! 🐶");
}

// 구글 세션 클리어
function clearGoogleAuthSession() {
  googleAccessToken = null;
  googleTokenExpiry = 0;
  googleUserEmail = null;
  localStorage.removeItem("google_access_token");
  localStorage.removeItem("google_token_expiry");
  localStorage.removeItem("google_user_email");
  updateGoogleAuthUI();
}

// 구글 로그아웃
function logoutGoogle() {
  if (googleAccessToken) {
    try {
      if (
        window.google &&
        window.google.accounts &&
        window.google.accounts.oauth2
      ) {
        google.accounts.oauth2.revoke(googleAccessToken, () => {
          console.log("구글 액세스 토큰 권한 회수 완료.");
        });
      }
    } catch (e) {
      console.warn("구글 토큰 권한 회수 중 오류 발생 (무시 가능):", e);
    }
  }
  clearGoogleAuthSession();
  showToast("구글 로그아웃이 완료되었습니다.");
}

// 구글 로그인 트리거
function loginGoogle() {
  if (googleTokenClient) {
    googleTokenClient.requestAccessToken({ prompt: "consent" });
  } else {
    // 런타임에 google 객체 초기화 재시도
    if (
      window.google &&
      window.google.accounts &&
      window.google.accounts.oauth2
    ) {
      googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.googleClientID,
        scope: "https://www.googleapis.com/auth/cloud-platform email profile",
        callback: handleTokenResponse,
      });
      googleTokenClient.requestAccessToken({ prompt: "consent" });
    } else {
      alert(
        "구글 로그인 모듈이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }
}

// UI 상태 업데이트
function updateGoogleAuthUI() {
  const loginBtn = document.getElementById("google-login-btn");
  const profileDiv = document.getElementById("google-user-profile");
  const emailSpan = document.getElementById("google-user-email");

  const isTokenValid = googleAccessToken && googleTokenExpiry > Date.now();

  if (isTokenValid) {
    if (loginBtn) loginBtn.style.display = "none";
    if (profileDiv) profileDiv.style.display = "inline-flex";
    if (emailSpan) emailSpan.textContent = googleUserEmail;
  } else {
    if (loginBtn) loginBtn.style.display = "inline-flex";
    if (profileDiv) profileDiv.style.display = "none";
    if (emailSpan) emailSpan.textContent = "";
  }
}

// Chart.js Global Defaults for Dark Theme
if (window.Chart) {
  Chart.defaults.color = "#94a3b8";
  Chart.defaults.borderColor = "rgba(255, 255, 255, 0.1)";
  Chart.defaults.font.family = "'Pretendard', 'Inter', sans-serif";
  Chart.defaults.plugins.tooltip.backgroundColor = "rgba(15, 23, 42, 0.9)";
  Chart.defaults.plugins.tooltip.titleColor = "#f1f5f9";
  Chart.defaults.plugins.tooltip.bodyColor = "#f1f5f9";
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
}

// 💡 설정(CONFIG)은 외부 config.js 파일에서 로드됩니다.
if (typeof CONFIG === "undefined") {
  console.warn("CONFIG is not defined. Using default values for snapshot.");
  window.CONFIG = {
    snapshotURL: "data_snapshot.json",
    summaryURL: "",
    holdingsURL: "",
    historyURL: "",
    gasURL: "",
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
  if (val === null || val === undefined) return "";
  const str = String(val);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const cleaned = String(ticker).replace("KRX:", "").trim();
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
  PROFIT: 14,
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
  DIVIDEND: 11,
};

/**
 * 구글 시트 History 컬럼 인덱스 매핑
 */
const HISTORY_COL = {
  DATE: 0,
  EVAL_TOTAL: 1,
  INVEST_TOTAL: 2,
  PROFIT: 3,
  DIVIDEND: 11,
};

/**
 * 환율이 유효한지 확인 (갱신된 적 있고, 30분 이내)
 */
function isExchangeRateValid() {
  if (usdKrwRate <= 100) return false;
  if (usdKrwRateUpdatedAt === 0) return true; // 초기값 1400 사용 허용
  const THIRTY_MIN = 30 * 60 * 1000;
  return Date.now() - usdKrwRateUpdatedAt < THIRTY_MIN;
}

/**
 * 디버그 로거 — localStorage('debug_mode')가 'true'일 때만 출력
 */
const DEBUG = localStorage.getItem("debug_mode") === "true";
const logger = {
  log: (...args) => {
    if (DEBUG) console.log(...args);
  },
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

// =========================================================================
// 전역 상태
// =========================================================================

// 뷰 모드 설정 (auto, pc, mobile)
let globalHoldings = [];
let usdKrwRate = 1400; // USD/KRW 환율 (기본값, Summary 시트에서 갱신)
let usdKrwRateUpdatedAt = 0; // 환율 최근 갱신 시각 (ms)
let isPrivacyMode = localStorage.getItem("privacy_mode") === "true";
let userViewMode = localStorage.getItem("user_view_mode") || "auto";

let rawHistoryData = [];
let currentHistoryRange = "ALL";

let sortState = { column: "weight", direction: "desc" };
let summaryChart = null;
let summaryPieChart = null;
let historyChart = null;
let bubbleChart = null;
let mddChart = null;
let recoveryChart = null;
let intradayChart = null;
let hiddenHistoryDatasets = new Set();
let currentSummarySlide = 0;

/**
 * 현재 테마 모드에 대응하는 색상을 반환합니다.
 * @param {string} lightColor
 * @param {string} darkColor
 * @returns {string}
 */
function getThemeColor(lightColor, darkColor) {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  return theme === "light" ? lightColor : darkColor;
}

let themeMode = localStorage.getItem("theme_mode") || "auto";
let lastSummaryLabels = [];
let lastSummaryInvests = [];
let lastSummaryEvals = [];
let lastMddTicker = "";
let lastMddProcessedData = null;
let lastMddStats = null;
let lastMddCurrentDrawdown = 0;
let currentModalRange = "1mo";

/**
 * 개인정보 마스킹 처리 함수
 * @param {string|number} val 마스킹할 값
 * @param {boolean} isName 계좌명/종목명 여부
 * @returns {string} 마스킹된 문자열
 */
function maskValue(val, isName = false) {
  if (!isPrivacyMode) return val;
  if (val === undefined || val === null || val === "") return val;

  if (isName) {
    return "●●●●●";
  }

  // 금액/숫자 마스킹 (숫자나 콤마가 포함된 문자열)
  const str = String(val);
  if (/[0-9]/.test(str)) {
    return "●●●,●●●";
  }
  return val;
}

/**
 * 큰 숫자를 모바일에서 짧게(만, 억) 표시하기 위한 HTML 생성
 * @param {string} valStr 원래 표시할 문자열 (예: "15,000,000")
 * @returns {string} 반응형 클래스가 적용된 HTML 문자열
 */
/**
 * 금액을 #.#억원 단위로 포맷팅
 * @param {number|string} val
 * @returns {string}
 */
function formatToEokWon(val) {
  const num = parseSafeFloat(val);
  return (num / 100000000).toFixed(1) + "억원";
}

/**
 * 금액 포맷팅 (모바일: 만/억 단위, PC: 전체 숫자)
 * @param {number|string} val
 * @param {boolean} isKRW
 * @returns {string}
 */
function formatValueByMode(val, isKRW = true) {
  const num = parseSafeFloat(val);
  const isMobile =
    userViewMode === "mobile" ||
    (userViewMode === "auto" && window.innerWidth <= 768);

  if (!isMobile) {
    if (isKRW) return Math.round(num).toLocaleString("ko-KR") + "원";
    return (
      "$" +
      num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  // 모바일 포맷팅 (만/억 단위)
  const absNum = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  let result = "";

  if (isKRW) {
    if (absNum >= 100000000) {
      result =
        sign + (absNum / 100000000).toFixed(1) + "억(원)";
    } else if (absNum >= 10000) {
      result = sign + (absNum / 10000).toFixed(0) + "만";
    } else {
      result = sign + Math.round(absNum).toLocaleString() + "원";
    }
  } else {
    // USD는 모바일에서도 가급적 소수점 유지하되 $ 표시
    if (absNum >= 1000) {
      result =
        sign + "$" + (absNum / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    } else {
      result =
        sign +
        "$" +
        absNum.toLocaleString(undefined, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
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
  return num.toFixed(2) + "%";
}

function getResponsiveValueHTML(valStr) {
  if (!valStr || valStr === "-" || typeof valStr !== "string") return valStr;
  // 마스킹된 값이면 그대로 반환
  if (valStr.includes("●")) return valStr;

  // 비율(%) 데이터면 소수점 2자리 강제 적용
  if (valStr.includes("%")) {
    return formatPercent(valStr);
  }

  // 원본에서 숫자만 추출 (음수 기호 포함)
  const numStr = valStr.replace(/[^\d.-]/g, "");
  const num = Number(numStr);

  if (!isNaN(num)) {
    const isKRW = !valStr.includes("$");
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
    tabButtons[i].setAttribute("aria-selected", "false");
  }

  document.getElementById(tabName).classList.add("active");
  evt.currentTarget.classList.add("active");
  evt.currentTarget.setAttribute("aria-selected", "true");

  if (tabName === "holdings-analysis-tab") {
    fetchHoldingsAnalysisData();
  } else if (tabName === "heatmap-tab") {
    renderHeatmap();
  } else if (tabName === "dividend-tab") {
    syncDividendDataAndRender();
  }
}

// 🎁 배당 달력 관련 변수 및 함수
let currentDividendMonth = new Date(); // 현재 표시 중인 달
let dividendCache = []; // { ticker, date, amount, name, qty }

// 헬퍼 함수: 지정된 시간(ms)만큼 대기
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 보유 종목을 기반으로 야후 파이낸스에서 배당 데이터를 가져와 동기화
 */
async function syncDividendDataAndRender() {
  const statusEl = document.getElementById("selected-date-label");
  if (statusEl) statusEl.textContent = " (배당 데이터 동기화 중...)";

  if (!globalHoldings || globalHoldings.length === 0) {
    renderDividendCalendar();
    return;
  }

  // 이미 데이터를 가져왔다면 바로 렌더링 (캐시 활용)
  if (dividendCache.length > 0) {
    renderDividendCalendar();
    if (statusEl) statusEl.textContent = " (동기화 완료)";
    return;
  }

  try {
    const results = [];
    const holdings = globalHoldings.filter(
      (h) => h.ticker && !h.ticker.includes("=") && !h.ticker.startsWith("^"),
    );

    let processedCount = 0;
    const totalCount = holdings.length;

    // 순차적으로 처리하여 프록시 과부하 및 레이트 리밋 방지
    for (const h of holdings) {
      processedCount++;
      if (statusEl)
        statusEl.textContent = ` (데이터 동기화 중... ${processedCount}/${totalCount})`;

      const cleanTicker = h.ticker.trim();
      const formattedTicker = formatTicker(cleanTicker);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(formattedTicker)}?interval=1d&range=5y&events=div`; // 5년치로 단축

      try {
        const result = await fetchWithFallback(url, true);

        if (
          result &&
          result.type === "json" &&
          result.data.chart?.result?.[0]?.events?.dividends
        ) {
          const divs = result.data.chart.result[0].events.dividends;
          Object.values(divs).forEach((div) => {
            // 야후 API 타임스탬프는 간혹 미국 시장 마감/자정 기준으로 들어와 한국 시간 변환 시 하루 밀리는 현상 발생
            // 이를 방지하기 위해 날짜 계산 시 중앙값을 확보하거나 UTC 기준으로 처리
            const d = new Date(div.date * 1000);
            d.setHours(d.getHours() + 12); // 하루 밀림 방지를 위해 12시간 더함

            const shares = parseSafeFloat(h.shares);
            let totalKRW = shares * div.amount;
            if (h.currency === "USD") {
              totalKRW = totalKRW * usdKrwRate;
            }

            results.push({
              date: formatLocalDate(d),
              name: h.name,
              ticker: cleanTicker,
              currency: h.currency,
              qty: h.shares,
              perShare: div.amount,
              total: totalKRW,
            });
          });
        }
        // 프록시 서버 매너를 위한 짧은 휴식 (300ms)
        if (processedCount < totalCount) await sleep(300);
      } catch (innerE) {
        logger.warn(`${cleanTicker} 배당 데이터 로드 실패:`, innerE);
      }
    }

    dividendCache = results;
    renderDividendCalendar();
    if (statusEl) statusEl.textContent = " (동기화 완료)";
  } catch (e) {
    logger.error("배당 데이터 동기화 실패:", e);
    if (statusEl) statusEl.textContent = " (동기화 실패)";
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
  const grid = document.getElementById("calendar-grid");
  const monthLabel = document.getElementById("current-calendar-month");
  if (!grid || !monthLabel) return;

  grid.innerHTML = "";

  const year = currentDividendMonth.getFullYear();
  const month = currentDividendMonth.getMonth();

  monthLabel.textContent = `${year}년 ${month + 1}월`;

  // 달력 시작일 계산 (해당 월의 1일이 포함된 주의 일요일)
  const firstDay = new Date(year, month, 1);
  const startDay = new Date(firstDay);
  startDay.setDate(1 - firstDay.getDay());

  // 6주(42일) 표시
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthlyDividends = getMonthlyDividendData(year, month);

  for (let i = 0; i < 42; i++) {
    const current = new Date(startDay);
    current.setDate(startDay.getDate() + i);

    const dayDiv = document.createElement("div");
    dayDiv.className = "calendar-day";
    if (current.getMonth() !== month) dayDiv.classList.add("other-month");
    if (current.getTime() === today.getTime()) dayDiv.classList.add("today");
    if (current.getDay() === 0) dayDiv.classList.add("sun");
    if (current.getDay() === 6) dayDiv.classList.add("sat");

    const dateStr = formatLocalDate(current);
    const dayDividends = monthlyDividends.filter((d) => d.date === dateStr);

    dayDiv.innerHTML = `<span class="day-number">${current.getDate()}</span>`;

    if (dayDividends.length > 0) {
      const itemContainer = document.createElement("div");
      itemContainer.className = "dividend-items";
      dayDividends.forEach((d) => {
        const item = document.createElement("div");
        item.className = "dividend-item";
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
  return dividendCache.filter((d) => {
    const date = new Date(d.date);
    return date.getFullYear() === year && date.getMonth() === month;
  });
}
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function updateDividendDetailTable(records) {
  const tbody = document.getElementById("dividend-detail-body");
  const label = document.getElementById("selected-date-label");
  if (!tbody) return;
  if (label) label.textContent = "(전체 월 내역)";
  tbody.innerHTML = "";
  if (records.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="empty-msg" style="text-align: center; padding: 2rem; color: var(--text-muted);">해당 월의 배당 내역이 없습니다.</td></tr>';
    return;
  }
  records
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((r) => {
      const tr = document.createElement("tr");
      const currencySymbol = r.currency === "USD" ? "$" : "₩";
      tr.innerHTML = `
            <td>${r.date}</td>
            <td>${r.name}</td>
            <td>${r.qty}</td>
            <td>${currencySymbol}${r.perShare.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td style="font-weight:bold; color:#4ade80;">${Math.round(r.total).toLocaleString()}원</td>
        `;
      tbody.appendChild(tr);
    });
}

function showDividendDetail(date, records) {
  const tbody = document.getElementById("dividend-detail-body");
  const label = document.getElementById("selected-date-label");
  if (!tbody) return;
  if (label) label.textContent = `(${date})`;
  tbody.innerHTML = "";
  records.forEach((r) => {
    const tr = document.createElement("tr");
    const currencySymbol = r.currency === "USD" ? "$" : "₩";
    tr.innerHTML = `
            <td>${r.date}</td>
            <td>${r.name}</td>
            <td>${r.qty}</td>
            <td>${currencySymbol}${r.perShare.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td style="font-weight:bold; color:#4ade80;">${Math.round(r.total).toLocaleString()}원</td>
        `;
    tbody.appendChild(tr);
  });
}

/**
 * 💼 내 보유 종목 상세 분석 (실시간 데이터 연동)
 */
let holdingsAnalysisData = [];
let holdingsAnalysisSortState = { column: "eval", direction: "desc" };

function calculateRSIValue(closes, period = 14) {
  if (closes.length <= period) return 50;
  let gains = 0,
    losses = 0;
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
  return 100 - 100 / (1 + rs);
}

function calculateMDDAndRecovery(closes) {
  if (closes.length === 0) return { mdd: "0.00", recoveryProb: "0.0" };
  let runningMax = -Infinity;
  let mdd = 0;
  const drawdowns = [];

  for (let i = 0; i < closes.length; i++) {
    if (closes[i] > runningMax) runningMax = closes[i];
    const drawdown = runningMax > 0 ? closes[i] / runningMax - 1 : 0;
    if (drawdown < mdd) mdd = drawdown;
    drawdowns.push(drawdown);
  }
  const currentDrawdown = drawdowns[drawdowns.length - 1];
  let currentLevel = Math.ceil(Math.abs(currentDrawdown * 100) / 5) * 5;
  if (currentLevel === 0) currentLevel = 5;

  const threshold = -(currentLevel / 100);
  const count = drawdowns.filter((d) => d >= threshold).length;
  const prob =
    closes.length > 0 ? ((count / closes.length) * 100).toFixed(1) : "0.0";

  return { mdd: (currentDrawdown * 100).toFixed(2), recoveryProb: prob };
}

async function fetchHoldingsAnalysisData(force = false) {
  const tableBody = document.querySelector("#holdings-analysis-table tbody");
  const statusText = document.getElementById("holdings-analysis-status");
  if (!tableBody || !globalHoldings || globalHoldings.length === 0) return;

  // 이미 데이터가 있고 분석이 완료된 상태라면 재분석하지 않음 (수동 새로고침 시에만 갱신)
  if (
    !force &&
    holdingsAnalysisData.length > 0 &&
    holdingsAnalysisData.every((d) => d.rsi !== "-")
  ) {
    renderHoldingsAnalysisTable();
    return;
  }

  statusText.textContent = "⏳ 보유 종목 데이터를 실시간으로 분석 중입니다...";
  tableBody.innerHTML = "";

  // 초기 리스트 렌더링 (구글 시트 기반 기본 정보)
  holdingsAnalysisData = globalHoldings.map((h) => ({
    ...h,
    marketCap: 0,
    price: 0,
    change: 0,
    mdd: "-",
    recoveryProb: "-",
    rsi: "-",
    dividendYield: "-",
  }));

  renderHoldingsAnalysisTable();

  // 병렬로 데이터 수집 (안정성을 위해 배치 처리)
  const batchSize = 3;
  for (let i = 0; i < holdingsAnalysisData.length; i += batchSize) {
    const batch = holdingsAnalysisData.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (item) => {
        try {
          const ticker = formatTicker(item.ticker);
          let divYield = "-";

          const sp500Item = sp500Data.find(
            (d) => formatTicker(d.ticker) === ticker,
          );
          const kospiItem = kospi200Data.find(
            (d) => formatTicker(d.ticker) === ticker,
          );

          if (sp500Item) {
            item.marketCap = sp500Item.marketCap;
            divYield = sp500Item.dividendYield;
          } else if (kospiItem) {
            item.marketCap = kospiItem.marketCap;
            divYield = kospiItem.dividendYield;
          }

          // 1. 기본 정보 및 히스토리 (10년치 + 배당 정보) - 캐시 방지 파라미터 추가
          const historyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=10y&events=div&_=${Date.now()}`;
          const historyRes = await fetchWithFallback(historyUrl, true);

          if (historyRes && historyRes.type === "json") {
            const chartResult = historyRes.data.chart.result[0];
            const meta = chartResult.meta;
            item.price = meta.regularMarketPrice;

            // meta에서 시가총액 정보가 오면 우선 사용 (단, sp500/kospi 캐시가 더 정확할 수 있음)
            if (meta.marketCap && (!item.marketCap || item.marketCap === 0)) {
              item.marketCap = meta.marketCap;
            }

            // Use daily change directly from user's Google Sheet (Holdings / Summary)
            item.change =
              item.display.dailyChange && item.display.dailyChange !== "-"
                ? item.display.dailyChange
                : meta.chartPreviousClose
                  ? ((item.price / meta.chartPreviousClose - 1) * 100).toFixed(
                      2,
                    )
                  : 0;

            // Calculate trailing 12 months dividend yield if missing
            if (
              divYield === "-" &&
              chartResult.events &&
              chartResult.events.dividends
            ) {
              const divs = chartResult.events.dividends;
              const oneYearAgo = Date.now() / 1000 - 365 * 24 * 60 * 60;
              let totalDiv = 0;
              for (const key in divs) {
                if (divs[key].date >= oneYearAgo) totalDiv += divs[key].amount;
              }
              if (totalDiv > 0 && item.price > 0)
                divYield = ((totalDiv / item.price) * 100).toFixed(2);
            } else if (divYield === "-" && meta.dividendYield !== undefined) {
              divYield = meta.dividendYield.toFixed(2);
            } else if (
              divYield === "-" &&
              meta.trailingAnnualDividendYield !== undefined
            ) {
              divYield = (meta.trailingAnnualDividendYield * 100).toFixed(2);
            }
            item.dividendYield = divYield;

            const history = parseYahooData(historyRes, ticker);
            if (history && history.length > 0) {
              const closes = history.map((h) => h.close);
              const mddInfo = calculateMDDAndRecovery(closes);
              item.mdd = mddInfo.mdd;
              item.recoveryProb = mddInfo.recoveryProb;
              item.rsi = calculateRSIValue(closes).toFixed(1);
            }
          }
        } catch (e) {
          logger.warn(`Analysis failed for ${item.ticker}`, e);
        }
      }),
    );

    renderHoldingsAnalysisTable();
    statusText.textContent = `⏳ 분석 중... (${Math.min(i + batchSize, holdingsAnalysisData.length)}/${holdingsAnalysisData.length})`;

    // API 차단 방지를 위한 미세한 지연
    if (i + batchSize < holdingsAnalysisData.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  statusText.textContent = `✅ 분석 완료 (${new Date().toLocaleTimeString()})`;
}

function sortHoldingsAnalysis(column) {
  if (holdingsAnalysisSortState.column === column) {
    holdingsAnalysisSortState.direction =
      holdingsAnalysisSortState.direction === "asc" ? "desc" : "asc";
  } else {
    holdingsAnalysisSortState.column = column;
    // 숫자가 큰게 위로 오게 기본 설정 (MDD는 절대값이 큰게 위험하므로 desc)
    holdingsAnalysisSortState.direction =
      column === "name" || column === "ticker" ? "asc" : "desc";
  }

  holdingsAnalysisData.sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    if (
      column === "mdd" ||
      column === "rsi" ||
      column === "dividendYield" ||
      column === "recoveryProb" ||
      column === "change"
    ) {
      valA = parseFloat(valA);
      valB = parseFloat(valB);
      if (isNaN(valA)) valA = -999;
      if (isNaN(valB)) valB = -999;
    }

    if (typeof valA === "string" && typeof valB === "string") {
      return holdingsAnalysisSortState.direction === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    }

    return holdingsAnalysisSortState.direction === "asc"
      ? valA - valB
      : valB - valA;
  });

  renderHoldingsAnalysisTable();
}

function renderHoldingsAnalysisTable() {
  const tableBody = document.querySelector("#holdings-analysis-table tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  holdingsAnalysisData.forEach((data) => {
    const tr = document.createElement("tr");
    tr.onclick = () =>
      window.open(
        `https://finance.yahoo.com/quote/${encodeURIComponent(data.ticker)}`,
        "_blank",
      );

    let rsiClass = "rsi-neutral";
    const rsiValue = parseFloat(data.rsi);
    if (!isNaN(rsiValue)) {
      if (rsiValue >= 70) rsiClass = "rsi-overbought";
      else if (rsiValue <= 30) rsiClass = "rsi-oversold";
    }

    const pricePrefix = data.currency === "KRW" ? "₩" : "$";
    const priceFmt = data.price
      ? data.currency === "KRW"
        ? data.price.toLocaleString()
        : data.price.toFixed(2)
      : "-";

    const weightFmt =
      data.weight != null && data.weight !== ""
        ? parseFloat(data.weight).toFixed(1) + "%"
        : "-";

    tr.innerHTML = `
            <td data-label="종목명"><strong>${escapeHtml(data.name)}</strong> <span style="color:#888; font-size:0.85em;">(${escapeHtml(data.ticker)})</span></td>
            <td data-label="비중">${weightFmt}</td>
            <td data-label="현재가">${pricePrefix}${escapeHtml(priceFmt)}</td>
            <td data-label="변동률" class="${getColorClass(data.change)}">${escapeHtml(data.change)}%</td>
            <td data-label="수익률" class="${getColorClass(data.returnRate)}">${escapeHtml(data.returnRate)}%</td>
            <td data-label="MDD" style="color:var(--negative)">${data.mdd === "-" ? "-" : escapeHtml(data.mdd) + "%"}</td>
            <td data-label="회복확률">
                ${
                  data.recoveryProb === "-"
                    ? "-"
                    : `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="drawdown-text">${escapeHtml(data.recoveryProb)}%</span>
                </div>
                <div class="drawdown-bar-container" style="background:rgba(255,255,255,0.1); width:100%; height:4px; border-radius:2px; overflow:hidden; margin-top:4px;">
                    <div style="background:${parseFloat(data.recoveryProb) >= 80 ? "#4ade80" : "#fb7185"}; width: ${parseFloat(data.recoveryProb) || 0}%; height:100%;"></div>
                </div>
                `
                }
            </td>
            <td data-label="RSI(14)" style="text-align:center;">${data.rsi === "-" ? "-" : `<span class="rsi-tag ${rsiClass}">${escapeHtml(data.rsi)}</span>`}</td>
            <td data-label="분배율/배당률" style="text-align:center; color: var(--primary);">${data.dividendYield === "-" ? "-" : escapeHtml(data.dividendYield) + "%"}</td>
        `;
    tableBody.appendChild(tr);
  });
}

/**
 * 대시보드 초기 설정 및 이벤트 리스너 등록
 */
function initDashboard() {
  // 🔒 Privacy Mode 초기화
  const privacyToggle = document.getElementById("privacy-toggle");
  if (privacyToggle) {
    privacyToggle.checked = isPrivacyMode;
    privacyToggle.addEventListener("change", (e) => {
      isPrivacyMode = e.target.checked;
      localStorage.setItem("privacy_mode", isPrivacyMode);
      // 데이터 재렌더링
      const cachedData = localStorage.getItem("dashboard_data_cache");
      if (cachedData) {
        renderFromData(JSON.parse(cachedData));
      }
    });
  }

  // 📅 기본 날짜 설정 (ID 수정: input-date -> date-input)
  const dateInput = document.getElementById("date-input");
  if (dateInput) dateInput.value = new Date().toISOString().split("T")[0];

  // 📅 MDD 분석용 날짜 설정 (최근 10년)
  const mddStartInput = document.getElementById("mdd-start-date");
  const mddEndInput = document.getElementById("mdd-end-date");
  if (mddStartInput && mddEndInput) {
    const now = new Date();
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(now.getFullYear() - 10);
    mddEndInput.value = now.toISOString().split("T")[0];
    mddStartInput.value = tenYearsAgo.toISOString().split("T")[0];
  }

  // 🔄 거래 종류에 따라 입력 필드 토글
  document.getElementById("type-select")?.addEventListener("change", (e) => {
    const type = e.target.value;
    const form = document.getElementById("transaction-form");
    if (form) {
      form.setAttribute("data-tx-type", type);
    }
    const tickerGroup = document.getElementById("stock-group");
    const priceGroup = document.getElementById("price-group");
    const qtyLabel = document.getElementById("qty-label");

    if (["현금입금", "현금출금"].includes(type)) {
      if (tickerGroup) tickerGroup.style.display = "none";
      if (priceGroup) priceGroup.style.display = "none";
      if (qtyLabel) qtyLabel.textContent = "금액";
    } else if (type === "배당금") {
      if (tickerGroup) tickerGroup.style.display = "flex";
      if (priceGroup) priceGroup.style.display = "none";
      if (qtyLabel) qtyLabel.textContent = "배당금액";
    } else {
      if (tickerGroup) tickerGroup.style.display = "flex";
      if (priceGroup) priceGroup.style.display = "flex";
      if (qtyLabel) qtyLabel.textContent = "수량";
    }
  });

  // 📈 종목 선택 시 통화 자동 변경
  document
    .getElementById("stock-name-select")
    ?.addEventListener("change", (e) => {
      const selectedOption = e.target.options[e.target.selectedIndex];
      const currencySelect = document.getElementById("currency-select");
      if (selectedOption && selectedOption.dataset.currency && currencySelect) {
        currencySelect.value = selectedOption.dataset.currency;
      }
    });

  // 📈 신규 티커 직접 입력 시 통화 자동 판별
  document
    .getElementById("stock-ticker-input")
    ?.addEventListener("input", (e) => {
      const ticker = e.target.value.trim();
      const currencySelect = document.getElementById("currency-select");
      if (ticker && currencySelect) {
        if (isKoreanStock(ticker)) {
          currencySelect.value = "KRW";
        } else {
          currencySelect.value = "USD";
        }
      }
    });

  // 폼 제출 이벤트
  document
    .getElementById("transaction-form")
    ?.addEventListener("submit", handleTransactionSubmit);

  const refreshBtn = document.getElementById("refresh-fab");
  if (refreshBtn)
    refreshBtn.addEventListener("click", async () => {
      if (refreshBtn.classList.contains("loading")) return;

      refreshBtn.classList.add("loading");

      const accounts = [
        "AJM",
        "AJMjr",
        "JJG-w-AJM",
        "JJG-w-KKO",
        "JJG-w-AJMjr",
        "JJG-w-AJM-ISA",
        "JJG-w-KKO-ISA",
      ];

      // 진행 상태 표시용 토스트 생성
      let container = document.getElementById("toast-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
      }

      const toast = document.createElement("div");
      toast.className = "toast toast-info show";

      const nowStr = new Date().toLocaleTimeString("ko-KR", { hour12: false });
      toast.innerHTML = `
            <span class="toast-icon">⏳</span>
            <div style="display:flex; flex-direction:column; flex:1;">
                <span class="toast-message">실시간 데이터 업데이트 중 (${nowStr})...</span>
                <div class="toast-progress-list">
                    ${accounts
                      .map(
                        (acc) => `
                        <div class="toast-progress-item">
                            <span>${acc}</span>
                            <span class="toast-progress-status pending" data-account="${acc}">대기 중</span>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
            </div>
        `;
      container.appendChild(toast);

      // 로컬 캐시 삭제 (강제 갱신을 위해)
      localStorage.removeItem("dashboard_data_cache");

      // 각 계정별 순차 업데이트
      for (const acc of accounts) {
        const statusEl = toast.querySelector(`[data-account="${acc}"]`);
        if (statusEl) {
          statusEl.textContent = "갱신 중...";
          statusEl.className = "toast-progress-status loading";
        }

        try {
          await requestMarketRefresh(acc);
          if (statusEl) {
            statusEl.textContent = "완료";
            statusEl.className = "toast-progress-status done";
          }
        } catch {
          if (statusEl) {
            statusEl.textContent = "실패";
            statusEl.className = "toast-progress-status fail";
          }
        }
      }

      const syncTimeStr = new Date().toLocaleTimeString("ko-KR", {
        hour12: false,
      });
      toast.querySelector(".toast-message").textContent =
        `데이터 동기화 중 (${syncTimeStr})...`;
      toast.querySelector(".toast-icon").textContent = "🔄";

      // 시트간 데이터 동기화 시간 대기
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const finalTimeStr = new Date().toLocaleTimeString("ko-KR", {
        hour12: false,
      });
      toast.querySelector(".toast-message").textContent =
        `최신 데이터 불러오기 완료! (${finalTimeStr})`;
      toast.querySelector(".toast-icon").textContent = "✅";
      toast.className = "toast toast-success show";

      // 데이터 페치 (강제 갱신)
      await fetchData(true);

      // 현재 활성화된 탭이 서브 데이터 탭이라면 해당 탭도 즉시 갱신
      const activeTab = document.querySelector(".tab-content.active");
      if (activeTab) {
        if (activeTab.id === "holdings-analysis-tab")
          fetchHoldingsAnalysisData(true);
        else if (activeTab.id === "sp500-tab") fetchSP500Data();
        else if (activeTab.id === "kospi200-tab") fetchKOSPI200Data();
      }

      refreshBtn.classList.remove("loading");

      // 5초 후 토스트 제거
      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
      }, 5000);
    });
}

document.addEventListener("DOMContentLoaded", () => {
  // 구글 OAuth 초기화
  initGoogleAuth();

  // 뷰 모드 표시기 초기 업데이트
  updateViewModeIndicator();
  window.addEventListener("resize", updateViewModeIndicator);

  // 초기화 로직 실행
  initDashboard();

  // 페이지 로드 시 구글 시트 데이터 갱신 요청 (Non-blocking)
  const refreshFab = document.getElementById("refresh-fab");
  if (refreshFab) refreshFab.classList.add("loading");

  logger.log("🔄 대시보드 로드 시작...");

  // 시장 데이터 갱신을 백그라운드에서 요청 (구글 시트 모드인 경우에만)
  if (!CONFIG.supabaseURL) {
    requestMarketRefresh();
  }

  // 스마트 매칭 및 자동완성 초기화
  loadStockDictionary();
  initSmartMatching();

  // 즉시 데이터 페치 시작 (내부적으로 캐시를 먼저 보여주고 실시간 데이터를 가져옴)
  fetchData();

  // 스크롤 맨 위로 가기 버튼 로직
  const scrollTopBtn = document.getElementById("scroll-to-top");
  if (scrollTopBtn) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 300) {
        scrollTopBtn.style.display = "flex";
      } else {
        scrollTopBtn.style.display = "none";
      }
    });
    scrollTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
});

/**
 * 현재 화면 너비 및 사용자 설정을 기준으로 PC/Mobile 모드 표시기 업데이트
 */
function updateViewModeIndicator() {
  const textEl = document.getElementById("view-mode-text");
  const iconEl = document.getElementById("view-mode-icon");
  const indicatorEl = document.getElementById("view-mode-indicator");
  if (!textEl || !iconEl || !indicatorEl) return;

  // 1. 클래스 초기화
  document.body.classList.remove("force-mobile", "force-pc");

  // 2. 현재 모드 판정
  let currentDisplayMode = "";
  let labelPrefix = "";

  if (userViewMode === "auto") {
    currentDisplayMode = window.innerWidth <= 768 ? "mobile" : "pc";
    labelPrefix = "Auto: ";
  } else {
    currentDisplayMode = userViewMode;
    labelPrefix = "Manual: ";
    document.body.classList.add(`force-${userViewMode}`);
  }

  // 3. UI 업데이트
  if (currentDisplayMode === "mobile") {
    textEl.textContent = labelPrefix + "Mobile";
    iconEl.textContent = "📱";
    indicatorEl.style.color = "var(--secondary)";
  } else {
    textEl.textContent = labelPrefix + "PC";
    iconEl.textContent = "💻";
    indicatorEl.style.color = "var(--primary)";
  }

  // 4. 모바일에서 PC 모드 강제 시 뷰포트 조절 (선택 사항)
  const viewport = document.querySelector('meta[name="viewport"]');
  if (userViewMode === "pc" && window.innerWidth <= 768) {
    viewport.setAttribute("content", "width=1200"); // 폰에서도 넓게 보이게 함
  } else {
    viewport.setAttribute("content", "width=device-width, initial-scale=1.0");
  }

  // 5. 모바일/PC 전환에 따른 시장 데이터 포맷 즉시 갱신 (데이터가 있는 경우)
  const isMobileMode = currentDisplayMode === "mobile";
  const markets = ["snp", "nasdaq", "dow", "kospi", "kosdaq", "fx"];
  markets.forEach((id) => {
    const valEl = document.getElementById(`card-${id}-val`);
    if (valEl && valEl.getAttribute("data-price")) {
      const lastPrice = parseFloat(valEl.getAttribute("data-price"));
      if (!isNaN(lastPrice)) {
        if (id === "fx") {
          valEl.textContent = isMobileMode
            ? Math.round(lastPrice).toLocaleString()
            : lastPrice.toFixed(2);
        } else {
          if (isMobileMode) {
            valEl.textContent = Math.round(lastPrice).toLocaleString();
          } else {
            valEl.textContent = lastPrice.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
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
  if (userViewMode === "auto") userViewMode = "pc";
  else if (userViewMode === "pc") userViewMode = "mobile";
  else userViewMode = "auto";

  localStorage.setItem("user_view_mode", userViewMode);
  updateViewModeIndicator();

  // 차트 크기 재조정을 위해 리사이즈 이벤트 발생
  window.dispatchEvent(new Event("resize"));

  // 보유 종목 뷰 자동 전환 (모바일 모드일 때 카드 뷰)
  if (
    userViewMode === "mobile" ||
    (userViewMode === "auto" && window.innerWidth <= 768)
  ) {
    switchHoldingsView("cards");
  }
}

/**
 * 사용자에게 알림 메시지를 표시하는 토스트 기능
 */
function showToast(message, type = "info", duration = 5000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let icon = "ℹ️";
  if (type === "warning") icon = "⚠️";
  if (type === "error") icon = "❌";
  if (type === "success") icon = "✅";

  toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

  container.appendChild(toast);

  // 서서히 나타나기
  setTimeout(() => toast.classList.add("show"), 10);

  // 일정 시간 후 삭제
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

async function fetchData(force = false) {
  holdingsAnalysisData = []; // 보유 종목 분석 데이터 초기화
  const CACHE_KEY = "dashboard_data_cache";

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
      } catch (e) {
        logger.warn("Cache fail", e);
      }
    } else {
      // 캐시가 없으면 스냅샷(data_snapshot.json) 시도
      try {
        const response = await fetch(
          CONFIG.snapshotURL + "?t=" + new Date().getTime(),
        );
        if (response.ok) {
          const snapshot = await response.json();
          renderFromData(snapshot);
          updateTimestamp(false, "Snapshot");
        }
      } catch (e) {
        logger.warn("Snapshot load fail", e);
      }
    }
  }

  updateTimestamp(null, "⏳ 데이터 로드 중...");

  try {
    // 시장 지수 업데이트 (await 하지 않고 백그라운드에서 실행)
    updateMarketCharts();

    if (CONFIG.supabaseURL && CONFIG.supabaseKey) {
      logger.log("Supabase 데이터 페칭 시작...");
      
      const fetchHeaders = {
        'apikey': CONFIG.supabaseKey,
        'Authorization': `Bearer ${CONFIG.supabaseKey}`
      };
      
      const [summaryResponse, holdingsResponse, historyResponse] = await Promise.all([
        fetch(`${CONFIG.supabaseURL}/rest/v1/account_summary?select=*`, { headers: fetchHeaders }),
        fetch(`${CONFIG.supabaseURL}/rest/v1/holdings?select=*`, { headers: fetchHeaders }),
        fetch(`${CONFIG.supabaseURL}/rest/v1/asset_history?select=*&order=record_date.asc`, { headers: fetchHeaders })
      ]);
      
      if (!summaryResponse.ok || !holdingsResponse.ok || !historyResponse.ok) {
        throw new Error("Supabase REST API request failed");
      }
      
      const summaryList = await summaryResponse.json();
      const holdingsList = await holdingsResponse.json();
      const historyList = await historyResponse.json();
      
      // TTM 배당금 비동기 조회
      const ttmDividend = await fetchTTMDividend();
      
      // A. Summary 어댑팅
      const summaryData = [
        ["계좌명", "평가금", "투자금", "수입액", "수익률", "일일변동률", "일일변동액", "", "", "", "", "배당금"]
      ];
      let sumEval = 0, sumInvest = 0, sumProfit = 0, sumDailyAmt = 0;
      summaryList.forEach(item => {
        sumEval += parseFloat(item.eval_total) || 0;
        sumInvest += parseFloat(item.invest_total) || 0;
        sumProfit += parseFloat(item.profit) || 0;
        sumDailyAmt += parseFloat(item.daily_change_amt) || 0;
        
        const row = [];
        row[0] = item.account_name;
        row[1] = item.eval_total;
        row[2] = item.invest_total;
        row[3] = item.profit;
        row[4] = item.return_rate + "%";
        row[5] = item.daily_change_pct + "%";
        row[6] = item.daily_change_amt;
        row[11] = item.dividend;
        summaryData.push(row);
      });
      
      const sumReturnRate = sumInvest > 0 ? (sumProfit / sumInvest) * 100 : 0;
      const prevSumEval = sumEval - sumDailyAmt;
      const sumDailyPct = prevSumEval > 0 ? (sumDailyAmt / prevSumEval) * 100 : 0;
      
      const totalRow = [];
      totalRow[0] = "합계";
      totalRow[1] = sumEval;
      totalRow[2] = sumInvest;
      totalRow[3] = sumProfit;
      totalRow[4] = sumReturnRate.toFixed(2) + "%";
      totalRow[5] = sumDailyPct.toFixed(2) + "%";
      totalRow[6] = sumDailyAmt;
      totalRow[11] = ttmDividend;
      summaryData.push(totalRow);
      
      // B. Holdings 어댑팅
      const holdingsData = [
        ["종목명", "Ticker", "", "수량", "매수금액", "평균단가", "현재가", "수익률", "평가금액", "비중", "일일변동", "", "", "", "평가손익"]
      ];
      holdingsList.forEach(item => {
        const costBasisKrw = (parseFloat(item.eval_krw) || 0) - (parseFloat(item.profit) || 0);
        
        const row = [];
        row[0] = item.stock_name;
        row[1] = item.ticker;
        row[3] = item.quantity;
        row[4] = costBasisKrw;
        row[5] = item.avg_price;
        row[6] = item.current_price;
        row[7] = item.return_rate + "%";
        row[8] = item.eval_krw;
        row[9] = item.weight + "%";
        row[10] = item.daily_change + "%";
        row[14] = item.profit;
        holdingsData.push(row);
      });
      
      // C. History 어댑팅
      const historyData = [
        ["일자", "총 평가금", "총 투자금", "총 수입액", "", "", "", "", "", "", "", "총 배당금"]
      ];
      historyList.forEach(item => {
        const row = [];
        row[0] = item.record_date;
        row[1] = item.eval_total;
        row[2] = item.invest_total;
        row[3] = item.profit;
        row[11] = item.dividend;
        historyData.push(row);
      });
      
      const freshData = {
        summary: summaryData,
        holdings: holdingsData,
        history: historyData,
        timestamp: new Date().getTime(),
      };
      
      renderFromData(freshData);
      localStorage.setItem(CACHE_KEY, JSON.stringify(freshData));
      updateTimestamp(true, "Supabase Live");
      logger.log("Supabase Live 데이터 업데이트 완료");
      updateDatalistSuggestions();
    } else {
      // 구글 시트 폴백 로직
      logger.log("구글 시트 실시간 데이터 페칭 시작...");
      const ts = new Date().getTime();
      const addTs = (url) =>
        url ? url + (url.includes("?") ? "&" : "?") + "t=" + ts : url;

      const [summaryRes, holdingsRes, historyRes] = await Promise.all([
        fetchWithFallback(addTs(CONFIG.summaryURL), false, ["총 평가금", "총 투자금"]),
        fetchWithFallback(addTs(CONFIG.holdingsURL), false, ["종목명", "Ticker"]),
        fetchWithFallback(addTs(CONFIG.historyURL), false, ["일자", "평가금"]),
      ]);

      if (summaryRes?.data || holdingsRes?.data) {
        const freshData = {
          summary: summaryRes?.data,
          holdings: holdingsRes?.data,
          history: historyRes?.data,
          timestamp: new Date().getTime(),
        };

        renderFromData(freshData);
        localStorage.setItem(CACHE_KEY, JSON.stringify(freshData));
        updateTimestamp(true, "Live");
        logger.log("Live 데이터 업데이트 완료");
      } else {
        throw new Error("Empty response from all proxies");
      }
    }
  } catch (err) {
    logger.warn("실시간 로드 실패, 로컬 스냅샷 로드 시도...", err);
    try {
      const response = await fetch(
        CONFIG.snapshotURL + "?t=" + new Date().getTime(),
      );
      if (response.ok) {
        const snapshot = await response.json();
        renderFromData(snapshot);
        // 캐시도 스냅샷 데이터로 갱신하여 꼬인 상태 해결
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          ...snapshot,
          timestamp: new Date().getTime()
        }));
        updateTimestamp(false, "Snapshot");
        logger.log("로컬 스냅샷 데이터 로드 및 캐시 갱신 완료");
      } else {
        throw new Error("Snapshot load failed: " + response.statusText);
      }
    } catch (snapshotErr) {
      logger.error("로컬 스냅샷 로드 최종 실패:", snapshotErr);
      showToast(
        "데이터 갱신 실패. 시트의 '웹에 게시' 상태를 확인하세요.",
        "error",
      );
    }
  }
}

// 데이터를 받아서 각 컴포넌트에 뿌려주는 통합 함수
function renderFromData(data) {
  logger.log("데이터 렌더링 시작...", Object.keys(data));
  try {
    if (data.summary) {
      renderSummary(
        data.summary,
        document.querySelector("#summary-table tbody"),
      );
    }
  } catch (e) {
    logger.error("Summary rendering failed:", e);
  }

  try {
    if (data.holdings) {
      processHoldingsData(data.holdings);
    }
  } catch (e) {
    logger.error("Holdings rendering failed:", e);
  }

  try {
    if (data.history) {
      rawHistoryData = data.history;
      renderHistoryChartWithRange();
      renderHeatmap();
    }
  } catch (e) {
    logger.error("History rendering failed:", e);
  }
}

/**
 * 🇺🇸 S&P 500 시가총액 상위 100 종목 데이터 렌더링 (Github Actions 결과 연동)
 */
let sp500Data = [];
let sp500SortState = { column: "rank", direction: "asc" };

async function fetchSP500Data() {
  const tableBody = document.querySelector("#sp500-table tbody");
  const statusText = document.getElementById("sp500-status");
  if (!tableBody) return;

  try {
    statusText.textContent = "⏳ S&P 500 상위 100종목 데이터 로드 중...";

    // Fetch static JSON generated by GitHub Actions
    const response = await fetch("sp500_data.json?v=" + new Date().getTime());
    if (!response.ok) throw new Error("데이터를 찾을 수 없습니다.");

    sp500Data = await response.json();

    // 렌더링
    renderSP500Table();

    // 백그라운드 실시간 가격 업데이트
    updateLivePrices(sp500Data, false);

    statusText.textContent = `✅ S&P 500 업데이트 완료 (${new Date().toLocaleTimeString()})`;
  } catch (err) {
    logger.error("SP500 데이터 로드 실패:", err);
    statusText.textContent =
      "❌ 데이터 로드 실패 (업데이트 준비 중일 수 있습니다)";
  }
}

function formatBillion(num) {
  if (num >= 1e9) {
    return "$" + (num / 1e9).toFixed(1) + "B";
  }
  return "$" + num.toLocaleString();
}

function sortMarketData(marketType, column) {
  const isSP500 = marketType === "sp500";
  const state = isSP500 ? sp500SortState : kospi200SortState;
  const dataList = isSP500 ? sp500Data : kospi200Data;

  if (state.column === column) {
    state.direction = state.direction === "asc" ? "desc" : "asc";
  } else {
    state.column = column;
    state.direction =
      column === "rank" || column === "ticker" || column === "name"
        ? "asc"
        : "desc";
  }

  dataList.sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    if (typeof valA === "string" && typeof valB === "string") {
      const numA = parseFloat(valA.replace(/,/g, ""));
      const numB = parseFloat(valB.replace(/,/g, ""));
      if (
        !isNaN(numA) &&
        !isNaN(numB) &&
        column !== "ticker" &&
        column !== "name"
      ) {
        valA = numA;
        valB = numB;
      } else {
        return state.direction === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
    }

    return state.direction === "asc" ? valA - valB : valB - valA;
  });

  renderMarketTable(marketType);
}

function renderMarketTable(marketType) {
  const isSP500 = marketType === "sp500";
  const tableBody = document.querySelector(
    isSP500 ? "#sp500-table tbody" : "#kospi200-table tbody",
  );
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const dataList = isSP500 ? sp500Data : kospi200Data;

  dataList.forEach((data) => {
    const tr = document.createElement("tr");
    tr.onclick = () =>
      window.open(
        `https://finance.yahoo.com/quote/${encodeURIComponent(data.ticker)}`,
        "_blank",
      );

    let rsiClass = "rsi-neutral";
    const rsiValue = parseFloat(data.rsi);
    if (!isNaN(rsiValue)) {
      if (rsiValue >= 70) rsiClass = "rsi-overbought";
      else if (rsiValue <= 30) rsiClass = "rsi-oversold";
    }

    let priceFmt;
    if (isSP500) {
      priceFmt = data.price ? parseFloat(data.price).toFixed(2) : "-";
    } else {
      priceFmt = data.price
        ? parseFloat(data.price).toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })
        : "-";
    }

    const capFmt = isSP500
      ? formatBillion(data.marketCap)
      : formatKoreanCap(data.marketCap);
    const currencyPrefix = isSP500 ? "$" : "₩";
    const dividendFmt = isSP500
      ? escapeHtml(data.dividendYield)
      : data.dividendYield;

    tr.innerHTML = `
            <td data-label="순위" style="text-align:center;">${escapeHtml(data.rank)}</td>
            <td data-label="종목명"><strong>${escapeHtml(data.name)}</strong> <span style="color:#888; font-size:0.85em;">(${escapeHtml(data.ticker)})</span></td>
            <td data-label="시가 총액">${capFmt}</td>
            <td data-label="현재가">${currencyPrefix}${escapeHtml(priceFmt)}</td>
            <td data-label="변동률" class="${getColorClass(data.change)}">${escapeHtml(data.change)}%</td>
            <td data-label="MDD" style="color:var(--negative)">${escapeHtml(data.mdd)}%</td>
            <td data-label="회복확률">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="drawdown-text">${escapeHtml(data.recoveryProb)}%</span>
                </div>
                <div class="drawdown-bar-container" style="background:rgba(255,255,255,0.1); width:100%; height:4px; border-radius:2px; overflow:hidden; margin-top:4px;">
                    <div style="background:${parseFloat(data.recoveryProb) >= 80 ? "#4ade80" : "#fb7185"}; width: ${parseFloat(data.recoveryProb) || 0}%; height:100%;"></div>
                </div>
            </td>
            <td data-label="RSI(14)" style="text-align:center;"><span class="rsi-tag ${rsiClass}">${escapeHtml(data.rsi)}</span></td>
            <td data-label="배당률" style="text-align:center; color: var(--primary);">${escapeHtml(dividendFmt)}%</td>
        `;
    tableBody.appendChild(tr);
  });
}

function sortSP500(column) {
  sortMarketData("sp500", column);
}

function renderSP500Table() {
  renderMarketTable("sp500");
}

/**
 * 🇰🇷 KOSPI 200 시가총액 상위 100 종목 데이터 렌더링
 */
let kospi200Data = [];
let kospi200SortState = { column: "rank", direction: "asc" };

function formatKoreanCap(num) {
  if (num >= 1e12) {
    return "₩" + (num / 1e12).toFixed(1) + "조";
  }
  if (num >= 1e8) {
    return "₩" + (num / 1e8).toFixed(1) + "억";
  }
  return "₩" + num.toLocaleString();
}

async function fetchKOSPI200Data() {
  const tableBody = document.querySelector("#kospi200-table tbody");
  const statusText = document.getElementById("kospi200-status");
  if (!tableBody) return;

  try {
    statusText.textContent = "⏳ KOSPI 200 상위 100종목 데이터 로드 중...";

    const response = await fetch(
      "kospi200_data.json?v=" + new Date().getTime(),
    );
    if (!response.ok) throw new Error("데이터를 찾을 수 없습니다.");

    kospi200Data = await response.json();

    // 렌더링
    renderKOSPI200Table();

    // 백그라운드 실시간 가격 업데이트
    updateLivePrices(kospi200Data, true);

    statusText.textContent = `✅ KOSPI 200 업데이트 완료 (${new Date().toLocaleTimeString()})`;
  } catch (err) {
    logger.error("KOSPI200 데이터 로드 실패:", err);
    statusText.textContent =
      "❌ 데이터 로드 실패 (업데이트 준비 중일 수 있습니다)";
  }
}

function sortKOSPI200(column) {
  sortMarketData("kospi200", column);
}

function renderKOSPI200Table() {
  renderMarketTable("kospi200");
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
async function fetchWithFallback(targetUrl, isYahoo = false, requiredKeywords = []) {
  if (!targetUrl) return null;

  const fetchTask = async (url, options = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 8000);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const text = await response.text();

      // 1. 유효성 검사 (HTML 에러 페이지 필터링)
      if (
        !text ||
        text.length < 20 ||
        text.includes("<!DOCTYPE") ||
        text.includes("<html") ||
        text.includes("Unauthorized")
      ) {
        throw new Error("Invalid data received (HTML or Unauthorized)");
      }

      // 1.1 JSON 에러 응답 필터링 (일부 프록시의 JSON 에러 문자열 방지)
      if (
        text.trim().startsWith("{") &&
        (text.includes('"error"') || text.includes('"Error"')) &&
        !text.includes('"chart"') &&
        !text.includes('"result"')
      ) {
        throw new Error("Proxy error response received: " + text.substring(0, 100));
      }

      // 2. JSON 데이터인 경우 (야후 파이낸스 등)
      if (
        text.trim().startsWith("{") &&
        (text.includes('"chart"') || text.includes('"result"'))
      ) {
        return { type: "json", data: JSON.parse(text) };
      }

      // 3. CSV 데이터인 경우 (구글 시트)
      if (text.includes(",") || text.includes("\t")) {
        // 구글 시트 데이터의 경우 필수 키워드가 모두 있는지 검증
        if (requiredKeywords && requiredKeywords.length > 0) {
          const hasAllKeywords = requiredKeywords.every((kw) => text.includes(kw));
          if (!hasAllKeywords) {
            throw new Error("CSV data is missing required keywords: " + requiredKeywords.join(", "));
          }
        }

        const result = Papa.parse(text, { header: false, skipEmptyLines: true });
        if (result.data && result.data.length > 1) {
          // 최소 헤더 + 1개 행 이상
          return { type: "csv", data: result.data };
        }
      }

      throw new Error("Parsing failed: Not a valid JSON chart or CSV");
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  // 1단계: 구글 시트(isYahoo === false)인 경우 직접 페치 최우선 시도
  if (!isYahoo) {
    try {
      logger.log(`[Fetch] 직접 페치 시도: ${targetUrl}`);
      return await fetchTask(targetUrl, { timeout: 8000 });
    } catch (e) {
      logger.warn(`[Fetch] 직접 페치 실패, GAS 프록시 전환:`, e);
      if (CONFIG.gasURL) {
        try {
          const gasProxyUrl = `${CONFIG.gasURL}?url=${encodeURIComponent(targetUrl)}`;
          return await fetchTask(gasProxyUrl, { timeout: 8000 });
        } catch (gasErr) {
          logger.error(`[Fetch] GAS 프록시를 통한 페치도 실패했습니다:`, gasErr);
        }
      }
    }
  }

  // 2단계: 야후 파이낸스(isYahoo === true)이거나, 직접 페치/GAS가 모두 실패했을 때
  // GAS 프록시(GET 방식) 시도
  if (CONFIG.gasURL) {
    try {
      const gasProxyUrl = `${CONFIG.gasURL}?url=${encodeURIComponent(targetUrl)}`;
      logger.log(`[Fetch] GAS 프록시 시도: ${gasProxyUrl}`);
      return await fetchTask(gasProxyUrl, { timeout: 10000 });
    } catch (e) {
      logger.warn(`[Fetch] GAS 프록시 실패, 공용 프록시 레이싱 전환:`, e);
    }
  }

  // 3단계: GAS 프록시마저 실패하거나 설정되지 않은 경우, 공용 프록시 레이싱
  const encodedTarget = encodeURIComponent(targetUrl);
  const publicProxies = [
    `https://api.allorigins.win/raw?url=${encodedTarget}`,
    `https://thingproxy.freeboard.io/fetch/${targetUrl}`,
    `https://api.codetabs.com/v1/proxy?url=${encodedTarget}`
  ];

  const tasks = publicProxies.map((proxy) => fetchTask(proxy, { timeout: 6000 }));

  // 야후 파이낸스가 아니라면 직접 호출도 레이싱에 포함
  if (!isYahoo) {
    tasks.push(fetchTask(targetUrl, { timeout: 5000 }));
  }

  try {
    return await Promise.any(tasks);
  } catch (e) {
    logger.error("[Fetch] 모든 페치 경로가 실패했습니다.", e);
    return null;
  }
}

// Yahoo Finance v8 JSON 또는 구형 CSV 데이터를 통일된 형식으로 파싱
function parseYahooData(result, ticker) {
  if (!result) return [];

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return (
      d.getFullYear().toString().slice(-2) +
      "-" +
      ("0" + (d.getMonth() + 1)).slice(-2) +
      "-" +
      ("0" + d.getDate()).slice(-2)
    );
  };

  if (result.type === "json") {
    try {
      const chart = result.data.chart;
      if (!chart || !chart.result || chart.result.length === 0) return [];
      const item = chart.result[0];
      const timestamps = item.timestamp;
      const indicators = item.indicators.quote[0];
      const closes = indicators.close || [];

      if (!timestamps || closes.length === 0) return [];

      return timestamps
        .map((ts, i) => ({
          date: formatDate(new Date(ts * 1000)),
          close: closes[i],
        }))
        .filter(
          (d) => d.close !== null && d.close !== undefined && !isNaN(d.close),
        );
    } catch (e) {
      logger.error("JSON 파싱 에러:", e);
      return [];
    }
  } else if (result.type === "csv") {
    return result.data
      .slice(1)
      .map((row) => ({
        date: formatDate(row[0]),
        close: parseFloat(row[4]),
      }))
      .filter((d) => !isNaN(d.close));
  }
  return [];
}
// 📉 MDD 분석 로직
async function analyzeMDD() {
  const tickerInput = document.getElementById("mdd-ticker").value;
  const analyzeBtn = document.getElementById("mdd-analyze-btn");

  if (!tickerInput || !tickerInput.trim()) {
    showToast("티커를 입력해주세요!", "warning");
    return;
  }

  const ticker = formatTicker(tickerInput);

  // 기간 설정 (최근 10년)
  const p2 = Math.floor(Date.now() / 1000);
  const p1 = p2 - 10 * 365 * 24 * 60 * 60;

  try {
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = "⏳ 데이터 로드 중...";

    const yahooURL = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d&events=history`;
    const data = await fetchWithFallback(yahooURL, true);

    if (!data)
      throw new Error(
        `데이터를 가져오지 못했습니다. 티커 '${ticker}'를 확인해주세요.`,
      );

    analyzeBtn.innerHTML = "📊 통계 계산 중...";
    const history = parseYahooData(data, ticker);

    if (history.length === 0)
      throw new Error("분석할 수 있는 주가 데이터가 없습니다.");

    let runningMax = -Infinity;
    let mdd = 0;
    const processedData = history.map((d) => {
      if (d.close > runningMax) runningMax = d.close;
      const drawdown = d.close / runningMax - 1;
      if (drawdown < mdd) mdd = drawdown;
      return { ...d, runningMax, drawdown: drawdown };
    });

    const stats = calculateRecoveryStats(processedData);
    const currentDrawdown =
      processedData[processedData.length - 1].drawdown * 100;

    lastMddTicker = ticker;
    lastMddProcessedData = processedData;
    lastMddStats = stats;
    lastMddCurrentDrawdown = currentDrawdown;

    renderMDDCharts(ticker, processedData, stats, currentDrawdown);
    updateMDDSummary(ticker, mdd, processedData, currentDrawdown);
  } catch (err) {
    logger.error(err);
    showToast(`분석 중 오류 발생: ${err.message}`, "error");
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = "분석 🔍";
  }
}

function calculateRecoveryStats(data) {
  const levels = Array.from({ length: 20 }, (_, i) => (i + 1) * 5); // 5, 10, ..., 100
  const totalDays = data.length;
  const latestPeak = data[data.length - 1].runningMax;

  return levels.map((level) => {
    // 특정 MDD 레벨보다 높은(0%에 가까운) 위치에 있었던 날수 계산
    // 예: level이 100이면 drawdown >= -1.0 이므로 모든 날이 해당됨
    const threshold = -(level / 100);
    const count = data.filter((d) => d.drawdown >= threshold).length;
    const prob = ((count / totalDays) * 100).toFixed(1);

    // 해당 주가 계산: 최근 최고가 * (1 - 하락폭%)
    const targetPrice = latestPeak * (1 - level / 100);

    return {
      level,
      count: count,
      prob,
      price: targetPrice.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    };
  });
}

function renderMDDCharts(ticker, data, stats, currentDrawdown = 0) {
  const ctxMdd = document.getElementById("mddChart").getContext("2d");
  const dates = data.map((d) => d.date);
  const prices = data.map((d) => d.close);
  const drawdowns = data.map((d) => d.drawdown * 100);

  if (mddChart) mddChart.destroy();

  const gradient = ctxMdd.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, "rgba(251, 113, 133, 0.3)");
  gradient.addColorStop(1, "rgba(251, 113, 133, 0)");

  mddChart = new Chart(ctxMdd, {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        {
          label: "Price ($)",
          data: prices,
          borderColor: "#38bdf8",
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: "y",
        },
        {
          label: "Drawdown (%)",
          data: drawdowns,
          borderColor: "#fb7185",
          backgroundColor: gradient,
          fill: true,
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: {
          type: "linear",
          position: "left",
          grid: {
            color: getThemeColor(
              "rgba(0, 0, 0, 0.05)",
              "rgba(255, 255, 255, 0.05)",
            ),
          },
        },
        y1: {
          type: "linear",
          position: "right",
          min: -100,
          max: 0,
          grid: { display: false },
          ticks: { callback: (v) => v + "%" },
        },
        x: {
          grid: { display: false },
          ticks: { autoSkip: true, maxTicksLimit: 10 },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            color: getThemeColor("#334155", "#e2e8f0"),
            boxWidth: window.innerWidth <= 768 ? 12 : 16,
            padding: window.innerWidth <= 768 ? 20 : 28,
            font: {
              size: window.innerWidth <= 768 ? 11 : 13,
              family: "'Pretendard', 'Inter', sans-serif",
              weight: "500",
            },
            generateLabels: function (chart) {
              const datasets = chart.data.datasets;
              const metaData = chart._getSortedDatasetMetas();
              return metaData.map((meta) => {
                const style = meta.controller.getStyle();
                const isHidden = !meta.visible;

                let strokeColor = style.borderColor || style.backgroundColor;
                let fillColor = style.backgroundColor;

                if (isHidden) {
                  strokeColor = "rgba(148, 163, 184, 0.25)";
                  fillColor = "rgba(148, 163, 184, 0.15)";
                }

                const labelColor = isHidden
                  ? getThemeColor(
                      "rgba(100, 116, 139, 0.4)",
                      "rgba(148, 163, 184, 0.4)",
                    )
                  : getThemeColor("#334155", "#e2e8f0");

                return {
                  text: datasets[meta.index].label,
                  datasetIndex: meta.index,
                  fillStyle: fillColor,
                  strokeStyle: strokeColor,
                  lineWidth: isHidden ? 1 : style.borderWidth || 2,
                  hidden: isHidden,
                  color: labelColor,
                  fontColor: labelColor,
                };
              });
            },
          },
        },
      },
    },
  });

  const ctxRec = document.getElementById("recoveryChart").getContext("2d");
  if (recoveryChart) recoveryChart.destroy();

  const currentLevel = Math.ceil(Math.abs(currentDrawdown) / 5) * 5;

  const backgroundColors = stats.map((s) => {
    const p = parseFloat(s.prob);
    if (p >= 90) return "#fb7185";
    if (p >= 80) return "#fb923c";
    return "rgba(129, 140, 248, 0.6)";
  });

  const borderColors = stats.map((s) =>
    s.level === currentLevel
      ? getThemeColor("#0f172a", "#f1f5f9")
      : "transparent",
  );
  const borderWidths = stats.map((s) => (s.level === currentLevel ? 3 : 0));

  recoveryChart = new Chart(ctxRec, {
    type: "bar",
    data: {
      labels: stats.map((s) => `-${s.level}%`),
      datasets: [
        {
          label: "Recovery Probability (%)",
          data: stats.map((s) => s.prob),
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: borderWidths,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: getThemeColor(
              "rgba(0, 0, 0, 0.05)",
              "rgba(255, 255, 255, 0.05)",
            ),
          },
          ticks: { callback: (v) => v + "%" },
        },
        x: { grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `확률: ${ctx.raw}% (MDD 0 ~ ${ctx.label} 구간)`,
          },
        },
      },
    },
  });

  const tbody = document.getElementById("mdd-stats-tbody");
  tbody.innerHTML = "";
  stats.forEach((s) => {
    const tr = document.createElement("tr");
    if (s.level === currentLevel) tr.className = "highlight";
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
  const summary = document.getElementById("mdd-summary-content");
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
  const lastUpdated = document.getElementById("last-updated");
  if (!lastUpdated) return;
  const timeStr = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  lastUpdated.innerHTML =
    isLive === null ? method : `${timeStr} (${method})`;
  lastUpdated.style.color = isLive
    ? "#2e7d32"
    : isLive === false
      ? "#d84315"
      : "#888";
}

function parseSafeFloat(val) {
  if (val === undefined || val === null) return 0;
  const num = parseFloat(
    String(val).replace(/,/g, "").replace(/%/g, "").trim(),
  );
  return isNaN(num) ? 0 : num;
}

function formatKRWInteger(val) {
  const num = Math.round(parseSafeFloat(val));
  return num.toLocaleString("ko-KR");
}

function getColorClass(value) {
  const num = parseSafeFloat(value);
  return num > 0 ? "value-up" : num < 0 ? "value-down" : "";
}

async function updateMarketCharts() {
  const markets = [
    { id: "snp", ticker: "^GSPC" },
    { id: "nasdaq", ticker: "^IXIC" },
    { id: "dow", ticker: "^DJI" },
    { id: "kospi", ticker: "^KS11" },
    { id: "kosdaq", ticker: "^KQ11" },
    { id: "fx", ticker: "KRW=X" },
  ];

  logger.log("📊 지수 데이터 업데이트 시작...");

  await Promise.all(
    markets.map(async (m) => {
      try {
        const valEl = document.getElementById(`card-${m.id}-val`);
        const chgEl = document.getElementById(`card-${m.id}-change`);

        // 티커 인코딩 적용하여 특수문자(^ 등)로 인한 프록시 에러 방지
        const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(m.ticker)}?interval=1d&range=1d&_=${Date.now()}`;

        const result = await fetchWithFallback(targetUrl, true);

        if (result && result.type === "json") {
          const meta = result.data.chart?.result?.[0]?.meta;
          if (meta) {
            const lastPrice = meta.regularMarketPrice;

            // 우선적으로 API에서 제공하는 공식 변화율 사용 (더 정확함)
            let changePercent = null;
            if (
              meta.regularMarketChangePercent !== undefined &&
              meta.regularMarketChangePercent !== null
            ) {
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
                const isMobileMode =
                  userViewMode === "mobile" ||
                  (userViewMode === "auto" && window.innerWidth <= 768);

                if (m.id === "fx") {
                  // 환율 표시: 모바일은 소수점 없이, PC는 소수점 2자리
                  valEl.textContent = isMobileMode
                    ? Math.round(lastPrice).toLocaleString()
                    : lastPrice.toFixed(2);
                  valEl.setAttribute("data-price", lastPrice);
                  usdKrwRate = lastPrice;
                  usdKrwRateUpdatedAt = Date.now();
                } else {
                  // 지수 표시: 모바일은 소수점 없이, PC는 소수점 2자리(천단위 구분자 포함)
                  valEl.setAttribute("data-price", lastPrice);
                  if (isMobileMode) {
                    valEl.textContent = Math.round(lastPrice).toLocaleString();
                  } else {
                    valEl.textContent = lastPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    });
                  }
                }
              }

              if (chgEl) {
                chgEl.textContent = `${isPositive ? "+" : ""}${changePercent}%`;
                chgEl.className = `market-change ${isPositive ? "value-up" : "value-down"}`;
              }
              return;
            }
          }
        }
      } catch (e) {
        logger.error(`🚨 ${m.id} 업데이트 오류:`, e);
      }
    }),
  );
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
  tableElement.innerHTML = "";

  // 스켈레톤 제거
  document
    .querySelectorAll(".skeleton")
    .forEach((el) => el.classList.remove("skeleton"));

  try {
    // "합계" 또는 "합산"이 포함된 행 중 평가액(index 1)이 숫자인 행 찾기
    let totalRow = data.find((row) => {
      if (!row[SUMMARY_COL.NAME]) return false;
      const name = String(row[SUMMARY_COL.NAME]);
      const evalVal = parseSafeFloat(row[SUMMARY_COL.EVAL_TOTAL]);
      return (name.includes("합계") || name.includes("합산")) && evalVal !== 0;
    });

    // 만약 못 찾으면 데이터 구조를 분석하여 가장 큰 평가액을 가진 행을 후보로 선택
    if (!totalRow) {
      const candidates = data.filter(
        (row) =>
          row[SUMMARY_COL.NAME] &&
          parseSafeFloat(row[SUMMARY_COL.EVAL_TOTAL]) > 0,
      );
      if (candidates.length > 0) {
        totalRow = candidates.reduce((prev, curr) =>
          parseSafeFloat(curr[SUMMARY_COL.EVAL_TOTAL]) >
          parseSafeFloat(prev[SUMMARY_COL.EVAL_TOTAL])
            ? curr
            : prev,
        );
      }
    }

    if (totalRow) {

      // 현재 평가액 카드 업데이트 (KRW만 표기)
      const evalValEl = document.getElementById("card-eval-val");
      if (evalValEl) {
        const evalTextKRW = maskValue(totalRow[SUMMARY_COL.EVAL_TOTAL]);
        let evalText = getResponsiveValueHTML(evalTextKRW);
        evalValEl.innerHTML = evalText || "-";
      }

      document.getElementById("card-invest-val").innerHTML =
        getResponsiveValueHTML(maskValue(totalRow[SUMMARY_COL.INVEST_TOTAL])) ||
        "-";

      const profitElem = document.getElementById("card-profit-val");
      profitElem.innerHTML =
        getResponsiveValueHTML(maskValue(totalRow[SUMMARY_COL.PROFIT])) || "0";
      profitElem.className =
        "value " + getColorClass(totalRow[SUMMARY_COL.PROFIT]);

      const rateElem = document.getElementById("card-rate-val");
      rateElem.textContent = totalRow[SUMMARY_COL.RETURN_RATE] || "0%";
      rateElem.className =
        "value " + getColorClass(totalRow[SUMMARY_COL.RETURN_RATE]);

      const dailyElem = document.getElementById("card-daily-val");
      if (dailyElem) {
        const changePct = totalRow[SUMMARY_COL.DAILY_CHANGE_PCT] || "0%";
        const changeAmt =
          getResponsiveValueHTML(
            maskValue(totalRow[SUMMARY_COL.DAILY_CHANGE_AMT]),
          ) || "0";
        dailyElem.innerHTML = `${changePct} <span style="font-size:0.6em; opacity:0.8;">(${changeAmt})</span>`;
        dailyElem.className =
          "value " + getColorClass(totalRow[SUMMARY_COL.DAILY_CHANGE_PCT]);
      }

      document.getElementById("card-dividend-val").innerHTML =
        getResponsiveValueHTML(maskValue(totalRow[SUMMARY_COL.DIVIDEND])) ||
        "0";
    }
  } catch (e) {
    logger.warn("Summary parsing error", e);
  }

  const labels = [],
    invests = [],
    evals = [];
  const headerIndex = data.findIndex(
    (row) => row[SUMMARY_COL.NAME] && row[SUMMARY_COL.NAME].includes("계좌명"),
  );
  const startIndex = headerIndex !== -1 ? headerIndex + 1 : 0;

  data.forEach((row, i) => {
    if (
      i < startIndex ||
      !row[SUMMARY_COL.NAME] ||
      row[SUMMARY_COL.NAME].includes("계좌명") ||
      row[SUMMARY_COL.NAME].includes("합산") ||
      row[SUMMARY_COL.NAME].includes("합계")
    )
      return;

    const name = row[SUMMARY_COL.NAME].trim();
    if (name === "") return;

    const evalNum = parseSafeFloat(row[SUMMARY_COL.EVAL_TOTAL]),
      investNum = parseSafeFloat(row[SUMMARY_COL.INVEST_TOTAL]);
    labels.push(maskValue(name, true));
    invests.push(investNum);
    evals.push(evalNum);

    const tr = document.createElement("tr");
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
  lastSummaryLabels = labels;
  lastSummaryInvests = invests;
  lastSummaryEvals = evals;

  renderSummaryChart(labels, invests, evals);
  renderSummaryPieChart(labels, evals);
}

function processHoldingsData(data) {
  if (!data || !Array.isArray(data)) {
    logger.warn("Invalid holdings data format:", data);
    return;
  }

  logger.log(`보유 종목 데이터 처리 시작: ${data.length}행 발견`);
  globalHoldings = [];

  // 매매 기록용 자동완성 제안 갱신
  updateDatalistSuggestions();

  data.forEach((row, i) => {
    const nameValue = row[HOLDINGS_COL.NAME] || "";
    // 헤더 및 메타데이터 행 건너뛰기
    if (
      i === 0 ||
      !nameValue ||
      ["종목명", "환율", "Ticker", "화폐단위"].includes(nameValue) ||
      nameValue.startsWith("(")
    )
      return;

    // 한국 주식 여부 (6자리 숫자 티커 또는 특정 종목명)
    const tickerValue = row[HOLDINGS_COL.TICKER] || "";
    const isKRW =
      isKoreanStock(tickerValue) || nameValue.toLowerCase().includes("plus50");
    const currency = isKRW ? "KRW" : "USD";

    const weight = parseSafeFloat(row[HOLDINGS_COL.WEIGHT]);
    const evalKRW = parseSafeFloat(row[HOLDINGS_COL.EVAL_KRW]);

    // 데이터 로드 중인 행이거나 유효하지 않은 데이터 건너뛰기
    if (
      (weight === 0 && evalKRW === 0) ||
      String(row[HOLDINGS_COL.WEIGHT]).includes("로드")
    )
      return;

    const rawTicker = row[HOLDINGS_COL.TICKER] || "";
    const ticker = rawTicker.includes(":")
      ? rawTicker.split(":").pop()
      : rawTicker;

    globalHoldings.push({
      name: row[HOLDINGS_COL.NAME],
      ticker: ticker,
      currency,
      weight,
      returnRate: parseSafeFloat(row[HOLDINGS_COL.RETURN_RATE]),
      eval: evalKRW,
      profit: parseSafeFloat(row[HOLDINGS_COL.PROFIT]),
      dailyChange: parseSafeFloat(row[HOLDINGS_COL.DAILY_CHANGE]),
      shares: row[HOLDINGS_COL.SHARES] || "-",
      avgCost: row[HOLDINGS_COL.AVG_COST] || "-",
      currentPriceKRW:
        row[HOLDINGS_COL.CURRENT_PRICE] || row[HOLDINGS_COL.EVAL_KRW] || "-",
      display: {
        weight: row[HOLDINGS_COL.WEIGHT],
        returnRate: row[HOLDINGS_COL.RETURN_RATE],
        evalKRW: formatKRWInteger(row[HOLDINGS_COL.EVAL_KRW]),
        profitKRW: formatKRWInteger(row[HOLDINGS_COL.PROFIT]),
        dailyChange: row[HOLDINGS_COL.DAILY_CHANGE],
        currentPrice:
          row[HOLDINGS_COL.CURRENT_PRICE] || row[HOLDINGS_COL.EVAL_KRW],
      },
    });
  });

  logger.log(`보유 종목 처리 완료: ${globalHoldings.length}종목 추출됨`);

  // 리스크 분석 필터 초기화 (전체로 리셋)
  const bubbleFilters = document.querySelectorAll(
    "#bubble-filter-group .sort-btn",
  );
  bubbleFilters.forEach((btn, idx) => {
    if (idx === 0) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  sortHoldings(sortState.column, false);
  renderBubbleChart(globalHoldings);
}

// 직접 입력 토글 로직 수정
document.addEventListener("DOMContentLoaded", () => {
  const stockSelect = document.getElementById("stock-name-select");
  const directInputContainer = document.getElementById(
    "direct-input-container",
  );
  if (stockSelect && directInputContainer) {
    stockSelect.addEventListener("change", (e) => {
      directInputContainer.style.display =
        e.target.value === "DIRECT" ? "grid" : "none";
    });
  }
});

function sortHoldings(column, toggle = true) {
  if (toggle) {
    if (sortState.column === column)
      sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
    else {
      sortState.column = column;
      sortState.direction = "desc";
    }
  }

  globalHoldings.sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    // 문자열 정렬 (종목명 등)
    if (typeof valA === "string" && typeof valB === "string") {
      return sortState.direction === "asc"
        ? valA.localeCompare(valB, "ko")
        : valB.localeCompare(valA, "ko");
    }

    // 숫자 정렬 (비중, 수익률 등)
    return sortState.direction === "asc" ? valA - valB : valB - valA;
  });

  renderHoldingsTable();
}

function renderHoldingsTable() {
  const table = document.getElementById("holdings-table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  const thead = table.querySelector("thead");
  if (!tbody) return;
  tbody.innerHTML = "";

  // 헤더 아이콘 업데이트
  if (thead) {
    const headers = thead.querySelectorAll("th");
    const headerMap = {
      name: 0,
      weight: 1,
      returnRate: 2,
      profit: 3,
      eval: 4,
      dailyChange: 5,
    };
    headers.forEach((th, idx) => {
      let text = th.textContent.replace(/[▲▼↕]/g, "");
      if (idx === headerMap[sortState.column]) {
        th.textContent = text + (sortState.direction === "asc" ? "▲" : "▼");
      } else {
        th.textContent = text + "↕";
      }
    });
  }

  globalHoldings.forEach((item) => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.onclick = () => openStockModal(item);

    const weightFmt = formatPercent(item.display.weight);
    const returnRateFmt = formatPercent(item.display.returnRate);
    const dailyChangeFmt = formatPercent(item.display.dailyChange);
    const formattedProfit = getResponsiveValueHTML(
      maskValue(item.display.profitKRW + "원"),
    );
    const formattedEval = getResponsiveValueHTML(
      maskValue(item.display.evalKRW + "원"),
    );

    const currencyLabel = item.currency === "KRW" ? "KRW" : "USD";
    const currencyClass = item.currency === "KRW" ? "krw" : "";

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

  // 카드 뷰도 항상 함께 갱신
  renderHoldingsCards();
}

/**
 * 보유 종목 테이블/카드 뷰 전환
 */
function switchHoldingsView(viewType) {
  const cardsView = document.getElementById("holdings-cards-view");
  const tableView = document.getElementById("holdings-table-view");
  if (!cardsView || !tableView) return;

  if (viewType === "cards") {
    cardsView.style.display = "grid";
    tableView.style.display = "none";
  } else {
    cardsView.style.display = "none";
    tableView.style.display = "block";
  }
}

/**
 * 보유 종목 카드 뷰 렌더링
 */
function renderHoldingsCards() {
  const container = document.getElementById("holdings-cards-view");
  if (!container) return;
  container.innerHTML = "";

  globalHoldings.forEach((item) => {
    const isPositive = item.display.dailyChange >= 0;
    const posClass = isPositive ? "positive" : "negative";
    const changeSign = isPositive ? "+" : "";
    const weightFmt = formatPercent(item.display.weight);
    const returnRateFmt = formatPercent(item.display.returnRate);
    const dailyChangeFmt = formatPercent(item.display.dailyChange);
    const formattedProfit = maskValue(item.display.profitKRW + "원");
    const formattedEval = maskValue(item.display.evalKRW + "원");

    const currencyLabel = item.currency === "KRW" ? "KRW" : "USD";
    const currencyClass = item.currency === "KRW" ? "krw" : "";

    const card = document.createElement("div");
    card.className = `stock-card ${posClass}`;
    card.onclick = () => openStockModal(item);

    card.innerHTML = `
      <div class="card-top">
        <div class="card-ticker-section">
          <div class="card-ticker-row">
            <span class="card-ticker">${safeValue(item.name, true)}</span>
            <span class="card-currency-badge ${currencyClass}">${currencyLabel}</span>
          </div>
          <div class="card-company">${safeValue(item.ticker, true)}</div>
        </div>
        <div class="card-trend-icon ${posClass}">
          ${
            isPositive
              ? `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>`
              : `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6"></path></svg>`
          }
        </div>
      </div>
      <div class="card-price-section">
        <div class="card-price">${formattedEval}</div>
        <div class="card-change ${posClass}">
          ${changeSign}${dailyChangeFmt} (${formattedProfit})
        </div>
      </div>
      <div class="card-bottom">
        <div class="card-bottom-row">
          <span class="label">비중</span>
          <span class="value">${weightFmt}</span>
        </div>
        <div class="card-bottom-row">
          <span class="label">수익률</span>
          <span class="value ${getColorClass(item.display.returnRate)}">${returnRateFmt}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Global variable to keep track of the current item in the modal for chart range updates
let currentModalItem = null;

// ===== Stock Detail Modal =====
async function openStockModal(item) {
  const overlay = document.getElementById("stock-modal-overlay");
  if (!overlay) return;

  currentModalItem = item;
  currentModalRange = "1mo";
  const isPositive = item.dailyChange >= 0;
  const posClass = isPositive ? "positive" : "negative";
  const changeSign = isPositive ? "+" : "";
  const currencyIsKRW = isKoreanStock(item.ticker);
  const currencyLabel = currencyIsKRW ? "KRW" : "USD";

  // 헬퍼 함수
  const fmtKRW = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
  const fmtUSD = (n) =>
    (n >= 0 ? "+" : "-") +
    "$" +
    Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const fmtUSDabs = (n) =>
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const fmtKRWS = (n) =>
    (n >= 0 ? "+" : "") + Math.round(n).toLocaleString("ko-KR") + "원";

  // Header
  const modalIcon = document.getElementById("modal-icon");
  modalIcon.className = `modal-icon ${posClass}`;
  modalIcon.textContent = isPositive ? "↗" : "↘";

  document.getElementById("modal-ticker").textContent = maskValue(
    item.ticker || item.name,
    true,
  );
  const currBadge = document.getElementById("modal-currency");
  currBadge.textContent = currencyLabel;
  currBadge.className = `modal-currency-badge ${currencyIsKRW ? "krw" : ""}`;
  document.getElementById("modal-company").textContent = maskValue(
    item.name,
    true,
  );

  // Price Section (Market Value & Change)
  const evalKRWNum = item.eval || 0;
  const dailyAmtKRW = (evalKRWNum * item.dailyChange) / 100;

  // 3. 가장 위 마켓 밸류: 원화(달러) 형식
  let displayEval = fmtKRW(evalKRWNum);
  if (!currencyIsKRW && isExchangeRateValid()) {
    displayEval += `(${fmtUSDabs(evalKRWNum / usdKrwRate)})`;
  }
  document.getElementById("modal-current-price").textContent =
    maskValue(displayEval);

  // 4. 가장 위 변동액: 변동액 원화(달러) - 변동률(%) 형식
  const diffElem = document.getElementById("modal-price-diff");
  const pctElem = document.getElementById("modal-price-pct");

  let displayDiff = fmtKRWS(dailyAmtKRW);
  if (!currencyIsKRW && isExchangeRateValid()) {
    displayDiff += `(${fmtUSD(dailyAmtKRW / usdKrwRate)})`;
  }
  diffElem.textContent = maskValue(displayDiff);
  diffElem.className = isPositive ? "positive" : "negative";

  pctElem.textContent = `${changeSign}${item.dailyChange}%`;
  pctElem.className = isPositive ? "positive" : "negative";

  // --- Stats Cards ---
  document.getElementById("modal-shares").textContent =
    maskValue(item.shares) || "-";

  const avgCostNum = parseSafeFloat(item.avgCost);
  const avgCostEl = document.getElementById("modal-avg-cost");
  const avgCostSubEl = document.getElementById("modal-avg-cost-sub");
  const totalValEl = document.getElementById("modal-total-value");
  const totalValSubEl = document.getElementById("modal-total-value-sub");
  const todayPLEl = document.getElementById("modal-today-pl");
  const todayPLSubEl = document.getElementById("modal-today-pl-sub");

  if (!currencyIsKRW && isExchangeRateValid()) {
    // USD 종목: 달러(메인) + 원화(보조)
    const avgCostUSD = avgCostNum > 0 ? avgCostNum / usdKrwRate : 0;
    avgCostEl.textContent = maskValue(
      avgCostUSD > 0 ? fmtUSDabs(avgCostUSD) : item.avgCost || "-",
    );
    avgCostSubEl.textContent = maskValue(
      avgCostNum > 0 ? fmtKRW(avgCostNum) : "",
    );

    const evalUSD = evalKRWNum / usdKrwRate;
    totalValEl.textContent = maskValue(
      evalKRWNum > 0 ? fmtUSDabs(evalUSD) : item.display.evalKRW || "-",
    );
    totalValSubEl.textContent = maskValue(
      evalKRWNum > 0 ? fmtKRW(evalKRWNum) : "",
    );

    const todayUSD = dailyAmtKRW / usdKrwRate;
    todayPLEl.textContent = maskValue(
      (todayUSD >= 0 ? "+$" : "-$") +
        Math.abs(todayUSD).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
    );
    todayPLEl.className = isPositive ? "value-up" : "value-down";
    todayPLSubEl.textContent = maskValue(fmtKRWS(dailyAmtKRW));
    todayPLSubEl.className = isPositive ? "sub-up" : "sub-down";
  } else {
    // KRW 종목: 원화만
    avgCostEl.textContent = maskValue(item.avgCost || "-");
    avgCostSubEl.textContent = "";
    totalValEl.textContent = maskValue(item.display.evalKRW || "-");
    totalValSubEl.textContent = "";
    todayPLEl.textContent = maskValue(fmtKRWS(dailyAmtKRW));
    todayPLEl.className = isPositive ? "value-up" : "value-down";
    todayPLSubEl.textContent = "";
  }

  const hlCard = todayPLEl.closest(".modal-stat-card");
  if (hlCard) hlCard.classList.toggle("negative-pl", !isPositive);

  // 2. 주식/ETF 정보 업데이트 (시총, 52주 최고가, 현재 MDD, RSI)
  // 분석 테이블에 이미 있는 데이터(MDD, RSI) 활용 시도
  let analysisData = holdingsAnalysisData.find((d) => d.ticker === item.ticker);
  document.getElementById("modal-mdd").textContent =
    analysisData && analysisData.mdd !== "-"
      ? analysisData.mdd + "%"
      : item.mdd
        ? item.mdd + "%"
        : "-";
  document.getElementById("modal-rsi").textContent =
    analysisData && analysisData.rsi !== "-" ? analysisData.rsi : "-";

  // 시총과 52주 최고가 활용
  document.getElementById("modal-market-cap").textContent =
    analysisData && analysisData.marketCap
      ? currencyIsKRW
        ? formatKoreanCap(analysisData.marketCap)
        : formatBillion(analysisData.marketCap)
      : "-";
  document.getElementById("modal-52w-high").textContent = "-";

  // Your Position — 모두 원화
  const profitKRW = parseSafeFloat(item.display.profitKRW);
  const costBasisKRW = evalKRWNum - profitKRW;

  document.getElementById("modal-market-value").textContent = maskValue(
    evalKRWNum > 0 ? fmtKRW(evalKRWNum) : item.display.evalKRW || "-",
  );
  document.getElementById("modal-cost-basis").textContent = maskValue(
    evalKRWNum > 0 ? fmtKRW(costBasisKRW) : "-",
  );

  const totalGainElem = document.getElementById("modal-total-gain");
  totalGainElem.textContent =
    profitKRW !== 0 ? maskValue(fmtKRWS(profitKRW)) : "-";
  totalGainElem.className =
    profitKRW > 0 ? "value-up" : profitKRW < 0 ? "value-down" : "";

  const returnElem = document.getElementById("modal-return");
  returnElem.textContent = item.display.returnRate
    ? `${item.display.returnRate}%`
    : "-";
  returnElem.className = getColorClass(item.display.returnRate);

  // Show modal
  overlay.classList.add("active");
  document.body.style.overflow = "hidden";

  // Load and render chart
  fetchModalChartData(item.ticker, "1mo");
}

function closeStockModal(e) {
  if (e && e.target !== e.currentTarget && e.target.className !== "modal-close")
    return;
  const overlay = document.getElementById("stock-modal-overlay");
  if (overlay) overlay.classList.remove("active");
  document.body.style.overflow = "auto";
  if (intradayChart) {
    intradayChart.destroy();
    intradayChart = null;
  }
}

function openSettingsModal() {
  const overlay = document.getElementById("settings-modal-overlay");
  if (overlay) {
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }
}

function closeSettingsModal(e) {
  if (e && e.target !== e.currentTarget && e.target.className !== "modal-close")
    return;
  const overlay = document.getElementById("settings-modal-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    document.body.style.overflow = "auto";
  }
}

async function fetchModalChartData(ticker, range) {
  const ctx = document.getElementById("modal-intraday-chart").getContext("2d");
  if (intradayChart) intradayChart.destroy();

  // Placeholder animation while loading
  intradayChart = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      plugins: { title: { display: true, text: "Loading historical data..." } },
    },
  });

  try {
    const formattedTicker = formatTicker(ticker);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(formattedTicker)}?interval=${range === "5d" ? "30m" : "1d"}&range=${range}`;
    const res = await fetchWithFallback(url, true);

    if (res && res.type === "json") {
      const chartData = res.data.chart.result[0];
      const meta = chartData.meta;
      const timestamps = chartData.timestamp;
      const prices = chartData.indicators.quote[0].close;

      // Update meta info in modal if available
      if (meta.marketCap) {
        const isKRW = isKoreanStock(ticker);
        document.getElementById("modal-market-cap").textContent = isKRW
          ? formatKoreanCap(meta.marketCap)
          : formatBillion(meta.marketCap);
      }
      if (meta.fiftyTwoWeekHigh) {
        const isKRW = isKoreanStock(ticker);
        document.getElementById("modal-52w-high").textContent = isKRW
          ? Math.round(meta.fiftyTwoWeekHigh).toLocaleString() + "원"
          : "$" + meta.fiftyTwoWeekHigh.toFixed(2);
      }

      const labels = timestamps.map((ts) => {
        const date = new Date(ts * 1000);
        return range === "5d"
          ? `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`
          : `${date.getMonth() + 1}/${date.getDate()}`;
      });

      const isPositive = prices[prices.length - 1] >= prices[0];
      const color = isPositive ? "#4ade80" : "#fb7185";
      const gradient = ctx.createLinearGradient(0, 0, 0, 200);
      gradient.addColorStop(
        0,
        isPositive ? "rgba(74,222,128,0.2)" : "rgba(251,113,133,0.2)",
      );
      gradient.addColorStop(
        1,
        getThemeColor("rgba(255,255,255,0)", "rgba(0,0,0,0)"),
      );

      intradayChart.destroy();
      intradayChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              data: prices,
              borderColor: color,
              borderWidth: 2,
              fill: true,
              backgroundColor: gradient,
              tension: 0.1,
              pointRadius: 0,
              pointHitRadius: 10,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
            y: {
              position: "right",
              grid: {
                color: getThemeColor(
                  "rgba(0, 0, 0, 0.05)",
                  "rgba(255, 255, 255, 0.05)",
                ),
              },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: { mode: "index", intersect: false },
          },
        },
      });
    }
  } catch (e) {
    logger.warn("Chart data load failed", e);
    if (intradayChart) {
      intradayChart.destroy();
      intradayChart = new Chart(ctx, {
        type: "line",
        data: { labels: [], datasets: [] },
        options: {
          plugins: {
            title: { display: true, text: "Failed to load chart data" },
          },
        },
      });
    }
  }
}

function updateModalChartRange(range, btn) {
  if (!currentModalItem) return;
  currentModalRange = range;
  document
    .querySelectorAll("#modal-chart-filter-group .sort-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  fetchModalChartData(currentModalItem.ticker, range);
}

let currentMarketId = null;
let currentMarketRange = "1mo";
let marketChart = null;

const marketInfo = {
  snp: { name: "S&P 500", ticker: "^GSPC", icon: "🇺🇸" },
  nasdaq: { name: "Nasdaq", ticker: "^IXIC", icon: "🇺🇸" },
  dow: { name: "Dow Jones", ticker: "^DJI", icon: "🇺🇸" },
  kospi: { name: "KOSPI", ticker: "^KS11", icon: "🇰🇷" },
  kosdaq: { name: "KOSDAQ", ticker: "^KQ11", icon: "🇰🇷" },
  fx: { name: "USD/KRW", ticker: "KRW=X", icon: "💵" }
};

async function openMarketModal(marketId) {
  const info = marketInfo[marketId];
  if (!info) return;

  currentMarketId = marketId;
  currentMarketRange = "1mo";

  const iconEl = document.getElementById("market-modal-icon");
  const tickerEl = document.getElementById("market-modal-ticker");
  const nameEl = document.getElementById("market-modal-name");

  if (iconEl) iconEl.textContent = info.icon;
  if (tickerEl) tickerEl.textContent = info.ticker;
  if (nameEl) nameEl.textContent = info.name;

  const valEl = document.getElementById(`card-${marketId}-val`);
  const chgEl = document.getElementById(`card-${marketId}-change`);
  const modalPriceEl = document.getElementById("market-modal-current-price");
  const modalDiffEl = document.getElementById("market-modal-price-diff");
  const modalPctEl = document.getElementById("market-modal-price-pct");

  if (modalPriceEl && valEl) {
    modalPriceEl.textContent = valEl.textContent;
  }

  if (chgEl) {
    const chgText = chgEl.textContent || "";
    if (modalPctEl) {
      modalPctEl.textContent = chgText;
      modalPctEl.className = chgEl.classList.contains("value-up") ? "value-up" : chgEl.classList.contains("value-down") ? "value-down" : "";
    }
    if (modalDiffEl) {
      modalDiffEl.textContent = "";
    }
  }

  const filterGroup = document.getElementById("market-modal-chart-filter-group");
  if (filterGroup) {
    filterGroup.querySelectorAll(".sort-btn").forEach((btn) => {
      if (btn.getAttribute("onclick") && btn.getAttribute("onclick").includes("'1mo'")) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  const overlay = document.getElementById("market-modal-overlay");
  if (overlay) {
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  await fetchMarketChartData(info.ticker, currentMarketRange);
}

function closeMarketModal(e) {
  if (e && e.target !== e.currentTarget && e.target.className !== "modal-close") {
    return;
  }
  const overlay = document.getElementById("market-modal-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    document.body.style.overflow = "auto";
  }
  if (marketChart) {
    marketChart.destroy();
    marketChart = null;
  }
}

async function updateMarketModalChartRange(range, btn) {
  if (!currentMarketId) return;
  currentMarketRange = range;

  if (btn) {
    const parent = btn.parentElement;
    if (parent) {
      parent.querySelectorAll(".sort-btn").forEach((b) => b.classList.remove("active"));
    }
    btn.classList.add("active");
  }

  const info = marketInfo[currentMarketId];
  if (info) {
    await fetchMarketChartData(info.ticker, range);
  }
}

async function fetchMarketChartData(ticker, range) {
  const canvas = document.getElementById("market-modal-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (marketChart) marketChart.destroy();

  marketChart = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      plugins: { title: { display: true, text: "데이터 로딩 중..." } },
    },
  });

  try {
    let interval = "1d";
    if (range === "1d") interval = "2m";
    else if (range === "5d") interval = "15m";
    else if (range === "5y") interval = "1wk";

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
    const res = await fetchWithFallback(url, true);

    if (res && res.type === "json") {
      const chartData = res.data.chart?.result?.[0];
      if (!chartData) throw new Error("차트 데이터 결과가 비어있습니다.");

      const timestamps = chartData.timestamp || [];
      const prices = chartData.indicators?.quote?.[0]?.close || [];

      const validPoints = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (prices[i] !== null && prices[i] !== undefined) {
          validPoints.push({
            x: timestamps[i] * 1000,
            y: prices[i]
          });
        }
      }

      if (validPoints.length === 0) {
        throw new Error("유효한 종가 데이터가 없습니다.");
      }

      const labels = validPoints.map((pt) => {
        const date = new Date(pt.x);
        if (range === "1d") {
          return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        } else if (range === "5d") {
          return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:00`;
        } else {
          return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        }
      });

      const dataPrices = validPoints.map((pt) => pt.y);
      const isPositive = dataPrices[dataPrices.length - 1] >= dataPrices[0];
      const color = isPositive ? "#4ade80" : "#fb7185";
      const gradient = ctx.createLinearGradient(0, 0, 0, 200);
      gradient.addColorStop(
        0,
        isPositive ? "rgba(74,222,128,0.2)" : "rgba(251,113,133,0.2)"
      );
      gradient.addColorStop(
        1,
        getThemeColor("rgba(255,255,255,0)", "rgba(0,0,0,0)")
      );

      marketChart.destroy();
      marketChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              data: dataPrices,
              borderColor: color,
              borderWidth: 2,
              fill: true,
              backgroundColor: gradient,
              tension: 0.1,
              pointRadius: 0,
              pointHitRadius: 10,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
            y: {
              position: "right",
              grid: {
                color: getThemeColor(
                  "rgba(0, 0, 0, 0.05)",
                  "rgba(255, 255, 255, 0.05)"
                ),
              },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              mode: "index",
              intersect: false,
              callbacks: {
                label: function(context) {
                  let val = context.parsed.y;
                  if (ticker === "KRW=X") {
                    return `환율: ${val.toFixed(2)}원`;
                  } else {
                    return `지수: ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  }
                }
              }
            },
          },
        },
      });
    } else {
      throw new Error("올바르지 않은 응답 포맷");
    }
  } catch (e) {
    logger.warn("Market Chart data load failed", e);
    if (marketChart) {
      marketChart.destroy();
      marketChart = new Chart(ctx, {
        type: "line",
        data: { labels: [], datasets: [] },
        options: {
          plugins: {
            title: { display: true, text: "차트 데이터를 불러오지 못했습니다." },
          },
        },
      });
    }
  }
}

// -------------------------------------------------------------------------
// 차트 렌더링 함수들
// -------------------------------------------------------------------------

function renderSummaryPieChart(labels, evals) {
  const ctx = document.getElementById("summaryPieChart").getContext("2d");
  if (summaryPieChart) summaryPieChart.destroy();

  const backgroundColors = [
    "#38bdf8", // Sky blue
    "#4ade80", // Light green
    "#fbbf24", // Yellow/Gold
    "#f472b6", // Pink
    "#a78bfa", // Purple
    "#fb923c", // Orange
    "#2dd4bf", // Teal
    "#e2e8f0", // Slate
  ];

  summaryPieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [
        {
          data: evals,
          backgroundColor: backgroundColors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: getThemeColor("#ffffff", "#0f172a"),
        },
      ],
    },
    plugins: [ChartDataLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            boxWidth: window.innerWidth <= 768 ? 10 : 14,
            padding: window.innerWidth <= 768 ? 12 : 20,
            font: {
              size: window.innerWidth <= 768 ? 11 : 13,
              family: "'Pretendard', 'Inter', sans-serif",
              weight: "500",
            },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.label || "";
              const value = ctx.raw;
              const formattedValue = formatToEokWon(value);
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${maskValue(formattedValue)} (${percentage}%)`;
            },
          },
        },
        datalabels: {
          color: "#ffffff",
          textAlign: "center",
          font: {
            family: "'Pretendard', 'Inter', sans-serif",
            weight: "bold",
            size: window.innerWidth <= 768 ? 9 : 11,
          },
          formatter: (value, context) => {
            const label = context.chart.data.labels[context.dataIndex];
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1) + "%";

            const eokAmount = (value / 100000000).toFixed(1) + "억원";
            const formattedEok = isPrivacyMode ? "●.●억원" : eokAmount;

            return `${label}\n${percentage}\n(${formattedEok})`;
          },
          display: (context) => {
            const value = context.dataset.data[context.dataIndex];
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            return value / total > 0.03;
          },
        },
      },
    },
  });
}

function updateSummarySliderDots() {
  const dots = document.querySelectorAll("#summary-slider-dots .slider-dot");
  dots.forEach((dot, index) => {
    dot.classList.toggle("active", index === currentSummarySlide);
  });
}

function moveSummarySlider(direction) {
  const slider = document.getElementById("summary-chart-slider");
  if (!slider) return;

  const slideCount = slider.children.length;
  currentSummarySlide =
    (currentSummarySlide + direction + slideCount) % slideCount;

  goSummarySlide(currentSummarySlide);
}

function goSummarySlide(index) {
  const slider = document.getElementById("summary-chart-slider");
  if (!slider) return;

  currentSummarySlide = index;
  const slideWidth = slider.offsetWidth;
  slider.scrollTo({
    left: slideWidth * index,
    behavior: "smooth",
  });

  const title = document.getElementById("summary-slider-title");
  if (title) {
    title.innerHTML =
      index === 0
        ? "📊 계좌별 요약 (자산 비중)"
        : "🍰 계좌별 평가액 (파이 차트)";
  }

  updateSummarySliderDots();
}

function renderSummaryChart(labels, invests, evals) {
  const ctx = document.getElementById("summaryChart").getContext("2d");
  if (summaryChart) summaryChart.destroy();

  summaryChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "평가액",
          data: evals,
          backgroundColor: "#38bdf8",
          borderRadius: 6,
        },
        {
          label: "투자액",
          data: invests,
          backgroundColor: getThemeColor(
            "rgba(15, 23, 42, 0.08)",
            "rgba(255, 255, 255, 0.1)",
          ),
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: {
            color: getThemeColor(
              "rgba(0, 0, 0, 0.05)",
              "rgba(255, 255, 255, 0.05)",
            ),
          },
          ticks: {
            callback: function (value) {
              return formatToEokWon(value);
            },
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            boxWidth: window.innerWidth <= 768 ? 12 : 16,
            padding: window.innerWidth <= 768 ? 20 : 28,
            font: {
              size: window.innerWidth <= 768 ? 11 : 13,
              family: "'Pretendard', 'Inter', sans-serif",
              weight: "500",
            },
            generateLabels: function (chart) {
              const datasets = chart.data.datasets;
              const metaData = chart._getSortedDatasetMetas();
              return metaData.map((meta) => {
                const style = meta.controller.getStyle();
                const isHidden = !meta.visible;

                let strokeColor = style.borderColor || style.backgroundColor;
                let fillColor = style.backgroundColor;

                if (isHidden) {
                  strokeColor = "rgba(148, 163, 184, 0.25)";
                  fillColor = "rgba(148, 163, 184, 0.15)";
                }

                return {
                  text: datasets[meta.index].label,
                  datasetIndex: meta.index,
                  fillStyle: fillColor,
                  strokeStyle: strokeColor,
                  lineWidth: isHidden ? 1 : style.borderWidth || 2,
                  hidden: isHidden,
                };
              });
            },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.dataset.label || "";
              const value = ctx.raw;
              const formattedValue = formatToEokWon(value);
              return `${label}: ${maskValue(formattedValue)}`;
            },
          },
        },
      },
    },
  });
}

function updateHistoryRange(range, btn) {
  currentHistoryRange = range;
  const buttons = document.querySelectorAll("#history-filter-group .sort-btn");
  buttons.forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderHistoryChartWithRange();
}

function renderHistoryChartWithRange() {
  if (!rawHistoryData || rawHistoryData.length === 0) return;

  const ctx = document.getElementById("historyChart").getContext("2d");
  if (historyChart) historyChart.destroy();

  // 1. 헤더에서 날짜 인덱스 찾기 (첫 번째 열이 보통 날짜)
  const data = rawHistoryData.slice(1); // 헤더 제외

  // 2. 필터링 로직
  let filteredData = data;
  const now = new Date();

  if (currentHistoryRange !== "ALL") {
    const cutoff = new Date();
    if (currentHistoryRange === "1M") cutoff.setMonth(now.getMonth() - 1);
    else if (currentHistoryRange === "3M") cutoff.setMonth(now.getMonth() - 3);
    else if (currentHistoryRange === "6M") cutoff.setMonth(now.getMonth() - 6);
    else if (currentHistoryRange === "1Y")
      cutoff.setFullYear(now.getFullYear() - 1);
    else if (currentHistoryRange === "3Y")
      cutoff.setFullYear(now.getFullYear() - 3);
    else if (currentHistoryRange === "5Y")
      cutoff.setFullYear(now.getFullYear() - 5);
    else if (currentHistoryRange === "YTD") {
      cutoff.setMonth(0);
      cutoff.setDate(1);
      cutoff.setHours(0, 0, 0, 0);
    }

    filteredData = data.filter((row) => {
      let dateStr = row[HISTORY_COL.DATE];
      if (typeof dateStr === "string") {
        let cleanStr = dateStr.trim();
        if (cleanStr.endsWith(".")) {
          cleanStr = cleanStr.slice(0, -1).trim();
        }
        const match = cleanStr.match(/^(\d{2,4})\.\s*(\d{1,2})\.\s*(\d{1,2})$/);
        if (match) {
          let year = match[1];
          let month = match[2].padStart(2, "0");
          let day = match[3].padStart(2, "0");
          if (year.length === 2) year = "20" + year;
          dateStr = `${year}-${month}-${day}`;
        }
      }
      const parsedDate = new Date(dateStr);
      if (isNaN(parsedDate.getTime())) return false;
      return parsedDate >= cutoff;
    });
  }

  const labels = filteredData.map((row) => {
    let dateStr = row[HISTORY_COL.DATE];
    if (typeof dateStr === "string") {
      let cleanStr = dateStr.trim();
      if (cleanStr.endsWith(".")) {
        cleanStr = cleanStr.slice(0, -1).trim();
      }
      const match = cleanStr.match(/^(\d{2,4})\.\s*(\d{1,2})\.\s*(\d{1,2})$/);
      if (match) {
        let year = match[1];
        let month = match[2].padStart(2, "0");
        let day = match[3].padStart(2, "0");
        if (year.length === 4) year = year.slice(-2);
        return `${year}.${month}.${day}`;
      }
    }
    return dateStr;
  });
  const evals = filteredData.map((row) =>
    parseSafeFloat(row[HISTORY_COL.EVAL_TOTAL]),
  );
  const invests = filteredData.map((row) =>
    parseSafeFloat(row[HISTORY_COL.INVEST_TOTAL]),
  );
  const profits = filteredData.map((row) =>
    parseSafeFloat(row[HISTORY_COL.PROFIT]),
  );
  const dividends = filteredData.map((row) =>
    parseSafeFloat(row[HISTORY_COL.DIVIDEND]),
  );

  const gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, "rgba(56, 189, 248, 0.2)");
  gradient.addColorStop(1, "rgba(56, 189, 248, 0)");

  historyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "총 평가액",
          data: evals,
          borderColor: "#38bdf8",
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 3,
          hidden: hiddenHistoryDatasets.has("총 평가액"),
        },
        {
          label: "총 투자액",
          data: invests,
          borderColor: getThemeColor(
            "rgba(15, 23, 42, 0.3)",
            "rgba(255, 255, 255, 0.3)",
          ),
          borderDash: [5, 5],
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
          hidden: hiddenHistoryDatasets.has("총 투자액"),
        },
        {
          label: "수익금",
          data: profits,
          borderColor: "#4ade80", // positive green
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
          hidden: hiddenHistoryDatasets.has("수익금"),
        },
        {
          label: "배당액",
          data: dividends,
          borderColor: "#fbbf24", // yellow/gold for dividends
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
          hidden: hiddenHistoryDatasets.has("배당액"),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
        y: {
          grid: {
            color: getThemeColor(
              "rgba(0, 0, 0, 0.05)",
              "rgba(255, 255, 255, 0.05)",
            ),
          },
          ticks: {
            callback: function (value) {
              return formatToEokWon(value);
            },
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.dataset.label || "";
              const value = ctx.raw;
              const formattedValue = formatToEokWon(value);
              return `${label}: ${maskValue(formattedValue)}`;
            },
          },
        },
      },
    },
  });

  updateCustomHistoryLegend();
}

function updateCustomHistoryLegend() {
  const container = document.getElementById("history-legend-container");
  if (!container) return;

  const items = [
    { label: "총 평가액", color: "#38bdf8" },
    { label: "총 투자액", color: "rgba(255, 255, 255, 0.4)" },
    { label: "수익금", color: "#4ade80" },
    { label: "배당액", color: "#fbbf24" },
  ];

  container.innerHTML = "";
  items.forEach((item) => {
    const isHidden = hiddenHistoryDatasets.has(item.label);

    const chip = document.createElement("div");
    chip.className = `legend-chip ${isHidden ? "inactive" : ""}`;
    chip.style.setProperty("--chip-color", item.color);

    const dot = document.createElement("span");
    dot.className = "legend-chip-dot";

    if (item.label === "총 투자액") {
      dot.style.width = "12px";
      dot.style.height = "2px";
      dot.style.backgroundColor = item.color;
      dot.style.borderRadius = "0";
    } else {
      dot.style.width = "8px";
      dot.style.height = "8px";
      dot.style.backgroundColor = item.color;
      dot.style.borderRadius = "50%";
    }

    const text = document.createElement("span");
    text.className = "legend-chip-text";
    text.textContent = item.label;

    chip.appendChild(dot);
    chip.appendChild(text);

    chip.addEventListener("click", () => {
      if (hiddenHistoryDatasets.has(item.label)) {
        hiddenHistoryDatasets.delete(item.label);
      } else {
        hiddenHistoryDatasets.add(item.label);
      }
      renderHistoryChartWithRange();
    });

    container.appendChild(chip);
  });
}

function applyTheme(mode) {
  const root = document.documentElement;
  let activeTheme = mode;

  if (mode === "auto") {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    activeTheme = prefersDark ? "dark" : "light";
  }

  // data-theme 속성 설정
  if (activeTheme === "light") {
    root.setAttribute("data-theme", "light");
  } else {
    root.setAttribute("data-theme", "dark");
  }

  // 버튼 활성화 클래스 조절
  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(`theme-${mode}-btn`);
  if (activeBtn) activeBtn.classList.add("active");

  // Chart.js 글로벌 텍스트/그리드 테마 반영
  if (window.Chart) {
    const textColor = activeTheme === "light" ? "#334155" : "#94a3b8";
    const borderColor =
      activeTheme === "light"
        ? "rgba(0, 0, 0, 0.08)"
        : "rgba(255, 255, 255, 0.1)";
    const tooltipBg =
      activeTheme === "light"
        ? "rgba(255, 255, 255, 0.95)"
        : "rgba(15, 23, 42, 0.9)";
    const tooltipColor = activeTheme === "light" ? "#0f172a" : "#f1f5f9";

    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = borderColor;
    Chart.defaults.plugins.tooltip.backgroundColor = tooltipBg;
    Chart.defaults.plugins.tooltip.titleColor = tooltipColor;
    Chart.defaults.plugins.tooltip.bodyColor = tooltipColor;
    Chart.defaults.plugins.tooltip.borderColor =
      activeTheme === "light"
        ? "rgba(0, 0, 0, 0.1)"
        : "rgba(255, 255, 255, 0.15)";
    Chart.defaults.plugins.tooltip.borderWidth = 1;

    refreshAllCharts();
  }
}

function setThemeMode(mode) {
  themeMode = mode;
  localStorage.setItem("theme_mode", mode);
  applyTheme(mode);
}

function refreshAllCharts() {
  if (rawHistoryData && rawHistoryData.length > 0) {
    renderHistoryChartWithRange();
  }
  if (lastSummaryLabels && lastSummaryLabels.length > 0) {
    renderSummaryChart(lastSummaryLabels, lastSummaryInvests, lastSummaryEvals);
    renderSummaryPieChart(lastSummaryLabels, lastSummaryEvals);
  }
  if (globalHoldings && globalHoldings.length > 0) {
    renderBubbleChart(globalHoldings);
  }
  if (lastMddTicker && lastMddProcessedData && lastMddStats) {
    renderMDDCharts(
      lastMddTicker,
      lastMddProcessedData,
      lastMddStats,
      lastMddCurrentDrawdown,
    );
  }
  if (intradayChart && currentModalItem) {
    fetchModalChartData(currentModalItem.ticker, currentModalRange || "1mo");
  }
}

function filterBubbleChart(currency, btn) {
  const buttons = document.querySelectorAll("#bubble-filter-group .sort-btn");
  buttons.forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  let filtered = globalHoldings;
  if (currency !== "ALL") {
    filtered = globalHoldings.filter((h) => h.currency === currency);
  }
  renderBubbleChart(filtered);
}

function renderBubbleChart(data) {
  const ctx = document.getElementById("bubbleChart").getContext("2d");
  if (bubbleChart) bubbleChart.destroy();

  // 평가금액 기준 정규화를 위한 최대값 계산
  const maxEval = Math.max(...data.map((h) => h.eval || 0), 1);

  const bubbleData = data.map((h) => ({
    x: h.dailyChange,
    y: h.returnRate,
    // 평가금액에 비례하도록 수정 (Area ∝ Value => r ∝ sqrt(Value))
    r: Math.sqrt((h.eval || 0) / maxEval) * 35 + 6,
    name: h.name,
    profit: h.profit,
    eval: h.eval,
    ticker: h.ticker,
  }));

  bubbleChart = new Chart(ctx, {
    type: "bubble",
    data: {
      datasets: [
        {
          label: "보유 종목",
          data: bubbleData,
          backgroundColor: (context) => {
            const d = context.raw;
            if (!d)
              return getThemeColor("rgba(0,0,0,0.2)", "rgba(255,255,255,0.5)");
            return d.x >= 0
              ? "rgba(74, 222, 128, 0.6)"
              : "rgba(251, 113, 133, 0.6)";
          },
          borderColor: (context) => {
            const d = context.raw;
            if (!d) return getThemeColor("#0f172a", "white");
            return d.x >= 0 ? "#4ade80" : "#fb7185";
          },
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: "일일 변동 (%)" },
          grid: {
            color: getThemeColor(
              "rgba(0, 0, 0, 0.05)",
              "rgba(255, 255, 255, 0.05)",
            ),
          },
        },
        y: {
          title: { display: true, text: "전체 수익률 (%)" },
          grid: {
            color: getThemeColor(
              "rgba(0, 0, 0, 0.05)",
              "rgba(255, 255, 255, 0.05)",
            ),
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const d = context.raw;
              const name = d.name;
              const profitStr = d.profit
                ? ` / 수익: ${maskValue(d.profit.toLocaleString())}원`
                : "";
              const evalStr = d.eval
                ? ` / 평가: ${maskValue(d.eval.toLocaleString())}원`
                : "";
              return `${maskValue(name, true)}: 수익률 ${d.y.toFixed(2)}%, 일변동 ${d.x.toFixed(2)}%${profitStr}${evalStr}`;
            },
          },
        },
      },
    },
    plugins: [
      {
        id: "bubbleLabels",
        afterDatasetsDraw: (chart) => {
          const { ctx } = chart;
          chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            if (!meta.hidden) {
              meta.data.forEach((element, index) => {
                const { x, y } = element.getProps(["x", "y"], true);
                const data = dataset.data[index];
                const radius = element.options.radius;

                // 버블이 너무 작지 않으면 이름 표시
                if (radius > 6) {
                  const displayName = maskValue(data.name, true);
                  ctx.fillStyle = getThemeColor("#0f172a", "#ffffff");
                  // 글자 크기 조정
                  const fontSize = Math.max(Math.min(radius / 2.5, 14), 8);
                  ctx.font = `bold ${fontSize}px Pretendard`;
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";

                  // 가독성을 위한 강한 그림자
                  ctx.shadowBlur = 4;
                  ctx.shadowColor = getThemeColor(
                    "rgba(255, 255, 255, 0.8)",
                    "rgba(0, 0, 0, 0.8)",
                  );
                  ctx.fillText(displayName, x, y);
                  ctx.shadowBlur = 0;
                }
              });
            }
          });
        },
      },
    ],
  });
}

async function handleTransactionSubmit(e) {
  e.preventDefault();
  const searchInput = document.getElementById("stock-search-input");
  const stockInput = document.getElementById("stock-name-input");
  const tickerInput = document.getElementById("stock-ticker-input");
  const type = document.getElementById("type-select").value;

  let stockName = "";
  let stockCode = "";

  if (["현금입금", "현금출금"].includes(type)) {
    stockName = "현금";
    stockCode = "현금";
  } else {
    // 매수, 매도, 배당금 등
    stockName = stockInput ? stockInput.value.trim() : "";
    stockCode = tickerInput ? tickerInput.value.trim().toUpperCase() : "";

    if (!stockName) {
      showToast("종목명을 입력해주세요.", "warning");
      return;
    }
    if (!stockCode) {
      showToast("티커를 입력해주세요.", "warning");
      return;
    }
  }

  const submitBtn = document.querySelector(".submit-btn");
  let quantity =
    parseFloat(document.getElementById("quantity-input").value) || 0;
  let price = parseFloat(document.getElementById("price-input").value) || 0;
  const currency = document.getElementById("currency-select").value;

  // 1. 배당금/입출금 시 단가(price)를 0으로 강제 세팅하여 백엔드 오작동 방지
  if (["현금입금", "현금출금", "배당금"].includes(type)) {
    price = 0;
  }

  // 2. 유효성 검사
  if (type === "배당금") {
    if (quantity <= 0) {
      showToast("배당금액은 0보다 커야 합니다.", "warning");
      return;
    }
  } else if (["현금입금", "현금출금"].includes(type)) {
    if (quantity <= 0) {
      showToast("입출금 금액은 0보다 커야 합니다.", "warning");
      return;
    }
  } else {
    // 매수, 매도 등 일반 거래
    if (quantity <= 0) {
      showToast("수량은 0보다 커야 합니다.", "warning");
      return;
    }
    if (price <= 0) {
      showToast("단가는 0보다 커야 합니다.", "warning");
      return;
    }
  }

  // 3. 통화가 KRW인 경우 소수점 입력 시 반올림 처리하여 정수로 전송 (소수점 원화 거래 방지)
  if (currency === "KRW") {
    quantity = Math.round(quantity);
    price = Math.round(price);
  }

  // 적용 환율 추출 (외화일 때만)
  let usdKrwRate = 1.0;
  if (currency === "USD") {
    usdKrwRate = parseFloat(document.getElementById("usd-rate-input").value) || 1350.0;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ 전송 중...";

    if (CONFIG.supabaseURL && CONFIG.supabaseKey) {
      // Supabase 직접 Insert
      const payload = {
        date: document.getElementById("date-input").value,
        stock_name: stockName,
        stock_code: stockCode,
        currency: currency,
        type: type,
        quantity: quantity,
        price: price,
        account: document.getElementById("account-select").value,
        usd_krw_rate: usdKrwRate
      };

      const response = await fetch(`${CONFIG.supabaseURL}/rest/v1/transactions`, {
        method: "POST",
        headers: {
          'apikey': CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Supabase insert failed (status ${response.status})`);
      }
    } else {
      // 구글 시트 기존 전송
      const formData = {
        date: document.getElementById("date-input").value,
        stockName: stockName,
        stockCode: stockCode,
        currency: currency,
        type: type,
        quantity: quantity,
        price: price,
        account: document.getElementById("account-select").value,
      };
      
      await fetch(CONFIG.gasURL, {
        method: "POST",
        mode: "no-cors",
        cache: "no-cache",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, apiKey: CONFIG.gasApiKey || "" }),
      });
    }

    // 성공 알림 (간단하게 버튼 텍스트 변경)
    submitBtn.textContent = "✅ 저장 완료!";

    // 특정 필드만 초기화 (수량, 단가, 검색어)
    document.getElementById("quantity-input").value = "";
    document.getElementById("price-input").value = "";
    if (searchInput) searchInput.value = "";

    // 신규 입력창 숨기기 및 초기화
    const directInputContainer = document.getElementById("direct-input-container");
    if (directInputContainer) {
      if (stockInput) stockInput.value = "";
      if (tickerInput) tickerInput.value = "";
      directInputContainer.style.display = "none";
    }
    
    // 적용 환율 숨기기
    const usdRateGroup = document.getElementById("usd-rate-group");
    if (usdRateGroup) usdRateGroup.style.display = "none";

    setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = "기록하기 🐕";
      fetchData(false);
    }, 1500);
  } catch (err) {
    logger.error("Transaction failed:", err);
    showToast("전송 실패: " + err.message, "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "기록하기 🐕";
  }
}

async function requestMarketRefresh(account = null) {
  try {
    const payload = {
      command: "refresh_market",
      apiKey: CONFIG.gasApiKey || "",
    };
    if (account) payload.account = account;

    logger.log(`${account || "전체"} 시트 데이터 갱신 요청 중...`);
    return fetch(CONFIG.gasURL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
    });
  } catch (e) {
    logger.warn("Market refresh request failed:", e);
    return Promise.resolve();
  }
}

// Slider Functionality
let currentSlide = 0;

function updateSliderDots() {
  const dots = document.querySelectorAll(".slider-dot");
  dots.forEach((dot, index) => {
    dot.classList.toggle("active", index === currentSlide);
  });
}

function moveSlider(direction) {
  const slider = document.getElementById("chart-slider");
  if (!slider) return;

  const slideCount = slider.children.length;
  currentSlide = (currentSlide + direction + slideCount) % slideCount;

  goSlide(currentSlide);
}

function goSlide(index) {
  const slider = document.getElementById("chart-slider");
  if (!slider) return;

  currentSlide = index;
  const slideWidth = slider.offsetWidth;
  slider.scrollTo({
    left: slideWidth * index,
    behavior: "smooth",
  });

  // 제목 업데이트
  const title = document.getElementById("slider-title");
  if (title) {
    title.innerHTML =
      index === 0 ? "📈 자산 추이 (History)" : "🔍 리스크 분석 (Risk Analysis)";
  }

  updateSliderDots();
}

// 슬라이더 스크롤 이벤트 감지 (모바일 스와이프 대응)
document.addEventListener("DOMContentLoaded", () => {
  const slider = document.getElementById("chart-slider");
  if (slider) {
    slider.addEventListener("scroll", () => {
      const slideWidth = slider.offsetWidth;
      const newIndex = Math.round(slider.scrollLeft / slideWidth);
      if (newIndex !== currentSlide) {
        currentSlide = newIndex;
        const title = document.getElementById("slider-title");
        if (title) {
          title.innerHTML =
            currentSlide === 0
              ? "📈 자산 추이 (History)"
              : "🔍 리스크 분석 (Risk Analysis)";
        }
        updateSliderDots();
      }
    });
  }

  const summarySlider = document.getElementById("summary-chart-slider");
  if (summarySlider) {
    summarySlider.addEventListener("scroll", () => {
      const slideWidth = summarySlider.offsetWidth;
      const newIndex = Math.round(summarySlider.scrollLeft / slideWidth);
      if (newIndex !== currentSummarySlide) {
        currentSummarySlide = newIndex;
        const title = document.getElementById("summary-slider-title");
        if (title) {
          title.innerHTML =
            currentSummarySlide === 0
              ? "📊 계좌별 요약 (자산 비중)"
              : "🍰 계좌별 평가액 (파이 차트)";
        }
        updateSummarySliderDots();
      }
    });
  }

  applyTheme(themeMode);
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

    await Promise.all(
      batch.map(async (item) => {
        try {
          const ticker = formatTicker(item.ticker);
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d&_=${Date.now()}`;
          const res = await fetchWithFallback(url, true);

          if (res && res.type === "json") {
            const meta = res.data.chart.result[0].meta;
            const livePrice = meta.regularMarketPrice;
            const liveChange =
              meta.regularMarketChangePercent ||
              (meta.chartPreviousClose
                ? (livePrice / meta.chartPreviousClose - 1) * 100
                : 0);

            // 데이터 객체 업데이트
            item.price = livePrice;
            item.change = liveChange.toFixed(2);

            // DOM 즉시 업데이트 (해당 티커를 포함하는 행 찾기)
            const tableId = isKorean ? "#kospi200-table" : "#sp500-table";
            const rows = document.querySelectorAll(`${tableId} tbody tr`);

            rows.forEach((row) => {
              if (row.innerHTML.includes(`(${item.ticker})`)) {
                const priceCell = row.querySelector('[data-label="현재가"]');
                const changeCell = row.querySelector('[data-label="변동률"]');

                if (priceCell) {
                  const prefix = isKorean ? "₩" : "$";
                  priceCell.textContent =
                    prefix +
                    (isKorean
                      ? livePrice.toLocaleString()
                      : livePrice.toFixed(2));
                }

                if (changeCell) {
                  changeCell.textContent =
                    (liveChange >= 0 ? "+" : "") + item.change + "%";
                  changeCell.className = getColorClass(item.change);
                }
              }
            });
          }
        } catch (e) {
          logger.warn(`Live update failed for ${item.ticker}`, e);
        }
      }),
    );

    // 배치 간 미세한 지연
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * 자산 변동 히트맵 통계 (수익 발생일수 및 전체 일수)
 */
let heatmapStats = {
  winDays: 0,
  totalDays: 0,
  winRate: 0,
};
window.heatmapStats = heatmapStats;

/**
 * 🔥 자산 변동 히트맵 렌더링 및 정렬 제어
 */
let heatmapSortOrder = "desc"; // 'desc' (최신순, 기본값) 또는 'asc' (과거순)

function toggleHeatmapSort(order) {
  if (heatmapSortOrder === order) return;
  heatmapSortOrder = order;

  // UI 버튼 활성화 처리
  const descBtn = document.getElementById("hm-sort-desc");
  const ascBtn = document.getElementById("hm-sort-asc");
  if (descBtn && ascBtn) {
    if (order === "desc") {
      descBtn.classList.add("active");
      ascBtn.classList.remove("active");
    } else {
      ascBtn.classList.add("active");
      descBtn.classList.remove("active");
    }
  }

  renderHeatmap();
}

function renderHeatmap() {
  const container = document.getElementById("heatmap-container");
  if (!container || !rawHistoryData || rawHistoryData.length < 2) return;

  // 1. 데이터 파싱 및 일별 변동 계산
  const data = rawHistoryData.slice(1); // 헤더 제외
  const historyMap = new Map();
  let minDate = null;
  let maxDate = new Date();

  let winDays = 0;
  let totalDays = 0;

  data.forEach((row, idx) => {
    let dateStr = row[0];
    if (
      typeof dateStr === "string" &&
      /^\d{2}\.\s*\d{2}\.\s*\d{2}$/.test(dateStr)
    ) {
      dateStr = "20" + dateStr.replace(/\.\s*/g, "-");
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;

    totalDays++;
    if (!minDate || d < minDate) minDate = d;

    // 전날 대비 변동률 계산
    let changePercent = 0;
    if (idx > 0) {
      const currentEval = parseSafeFloat(row[1]);
      const prevEval = parseSafeFloat(data[idx - 1][1]);
      if (prevEval > 0) {
        changePercent = (currentEval / prevEval - 1) * 100;
      }
    }

    if (changePercent > 0) {
      winDays++;
    }

    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    historyMap.set(dateKey, {
      percent: changePercent,
      eval: parseSafeFloat(row[1]),
      invest: parseSafeFloat(row[2]),
    });
  });

  // 통계 업데이트
  heatmapStats.winDays = winDays;
  heatmapStats.totalDays = totalDays;
  heatmapStats.winRate = totalDays > 0 ? (winDays / totalDays) * 100 : 0;

  // DOM 갱신
  const statsEl = document.getElementById("heatmap-stats");
  if (statsEl) {
    statsEl.innerHTML = `
            <span class="stats-label">수익 발생일:</span>
            <span class="stats-value highlight">${winDays}일</span>
            <span class="stats-divider">/</span>
            <span class="stats-label">전체:</span>
            <span class="stats-value">${totalDays}일</span>
            <span class="stats-percentage">(${heatmapStats.winRate.toFixed(2)}%)</span>
        `;
  }

  if (!minDate) return;

  // 2. 테이블 구조 생성 (세로: 월, 가로: 일)
  let html = '<table class="heatmap-table"><thead><tr><th></th>';
  for (let d = 1; d <= 31; d++) {
    html += `<th>${d}</th>`;
  }
  html += "</tr></thead><tbody>";

  const startYear = minDate.getFullYear();
  const startMonth = minDate.getMonth();
  const endYear = maxDate.getFullYear();
  const endMonth = maxDate.getMonth();

  if (heatmapSortOrder === "desc") {
    // 최신순 (역순)
    for (let y = endYear; y >= startYear; y--) {
      const mStart = y === endYear ? endMonth : 11;
      const mEnd = y === startYear ? startMonth : 0;

      for (let m = mStart; m >= mEnd; m--) {
        const shortYear = String(y).slice(-2);
        const shortMonth = String(m + 1).padStart(2, "0");
        const monthLabel = `${shortYear}.${shortMonth}`;
        html += `<tr><td class="hm-month-label">${monthLabel}</td>`;

        for (let d = 1; d <= 31; d++) {
          const dateKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const lastDayOfMonth = new Date(y, m + 1, 0).getDate();

          if (d > lastDayOfMonth) {
            html += '<td class="hm-cell hm-empty">X</td>';
          } else {
            const entry = historyMap.get(dateKey);
            if (entry) {
              const p = entry.percent;
              let colorClass = "hm-empty";
              if (p > 0) {
                if (p > 3) colorClass = "hm-up-5";
                else if (p > 1.5) colorClass = "hm-up-4";
                else if (p > 0.5) colorClass = "hm-up-3";
                else if (p > 0.1) colorClass = "hm-up-2";
                else colorClass = "hm-up-1";
              } else if (p < 0) {
                const ap = Math.abs(p);
                if (ap > 3) colorClass = "hm-down-5";
                else if (ap > 1.5) colorClass = "hm-down-4";
                else if (ap > 0.5) colorClass = "hm-down-3";
                else if (ap > 0.1) colorClass = "hm-down-2";
                else colorClass = "hm-down-1";
              } else {
                colorClass = "hm-missing";
              }

              const tooltip = `${dateKey}: ${p.toFixed(2)}% (${entry.eval.toLocaleString()}원)`;
              html += `<td class="hm-cell ${colorClass}" title="${tooltip}"></td>`;
            } else {
              html += '<td class="hm-cell hm-missing"></td>';
            }
          }
        }
        html += "</tr>";
      }
    }
  } else {
    // 과거순 (정방향)
    for (let y = startYear; y <= endYear; y++) {
      const mStart = y === startYear ? startMonth : 0;
      const mEnd = y === endYear ? endMonth : 11;

      for (let m = mStart; m <= mEnd; m++) {
        const shortYear = String(y).slice(-2);
        const shortMonth = String(m + 1).padStart(2, "0");
        const monthLabel = `${shortYear}.${shortMonth}`;
        html += `<tr><td class="hm-month-label">${monthLabel}</td>`;

        for (let d = 1; d <= 31; d++) {
          const dateKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const lastDayOfMonth = new Date(y, m + 1, 0).getDate();

          if (d > lastDayOfMonth) {
            html += '<td class="hm-cell hm-empty">X</td>';
          } else {
            const entry = historyMap.get(dateKey);
            if (entry) {
              const p = entry.percent;
              let colorClass = "hm-empty";
              if (p > 0) {
                if (p > 3) colorClass = "hm-up-5";
                else if (p > 1.5) colorClass = "hm-up-4";
                else if (p > 0.5) colorClass = "hm-up-3";
                else if (p > 0.1) colorClass = "hm-up-2";
                else colorClass = "hm-up-1";
              } else if (p < 0) {
                const ap = Math.abs(p);
                if (ap > 3) colorClass = "hm-down-5";
                else if (ap > 1.5) colorClass = "hm-down-4";
                else if (ap > 0.5) colorClass = "hm-down-3";
                else if (ap > 0.1) colorClass = "hm-down-2";
                else colorClass = "hm-down-1";
              } else {
                colorClass = "hm-missing";
              }

              const tooltip = `${dateKey}: ${p.toFixed(2)}% (${entry.eval.toLocaleString()}원)`;
              html += `<td class="hm-cell ${colorClass}" title="${tooltip}"></td>`;
            } else {
              html += '<td class="hm-cell hm-missing"></td>';
            }
          }
        }
        html += "</tr>";
      }
    }
  }

  html += "</tbody></table>";
  container.innerHTML = html;
}

// =========================================================================
// AI 포트폴리오 팟캐스트 브리핑 제어 로직
// =========================================================================

let podcastPlaying = false;
let speechUtterance = null; // 브라우저 TTS Fallback용 객체
let podcastProgressInterval = null;
let podcastCurrentTime = 0;
let podcastDuration = 60; // 기본 가상 재생 시간 (초)
let isGeneratingPodcast = false;

// 포트폴리오 데이터를 가공해 팟캐스트 스크립트 텍스트 생성
function generatePodcastText() {
  if (!globalHoldings || globalHoldings.length === 0) {
    return "현재 보유 중인 포트폴리오 종목 정보가 없습니다. 대시보드 하단의 매매 기록 폼을 활용하여 자산을 먼저 등록해 주세요.";
  }

  let totalEval = 0;
  let totalCost = 0;
  let krwEval = 0;
  let usdEval = 0;

  // 계좌별 자산 분산도 계산을 위한 맵
  const accountMap = {};

  globalHoldings.forEach((item) => {
    const evalVal = parseSafeFloat(item.eval);
    const profitVal = parseSafeFloat(item.display?.profitKRW || item.profit);
    totalEval += evalVal;
    totalCost += evalVal - profitVal;

    // 통화별 자산 분류
    if (isKoreanStock(item.ticker)) {
      krwEval += evalVal;
    } else {
      usdEval += evalVal;
    }

    // 계좌별 금액 합산
    const acc = item.account || "미지정 계좌";
    accountMap[acc] = (accountMap[acc] || 0) + evalVal;
  });

  const totalProfit = totalEval - totalCost;
  const returnRate =
    totalCost > 0 ? ((totalProfit / totalCost) * 100).toFixed(2) : "0.00";
  const evalBillion = (totalEval / 100000000).toFixed(2);
  const profitBillion = (totalProfit / 100000000).toFixed(2);
  const sign = totalProfit >= 0 ? "누적 수익" : "누적 손실";

  // 1. 통화 비중 계산
  const krwPct = totalEval > 0 ? Math.round((krwEval / totalEval) * 100) : 0;
  const usdPct = totalEval > 0 ? Math.round((usdEval / totalEval) * 100) : 0;

  // 2. 계좌별 최대 비중 계좌 추출
  let topAccount = "미지정";
  let topAccountPct = 0;
  Object.keys(accountMap).forEach((acc) => {
    const pct =
      totalEval > 0 ? Math.round((accountMap[acc] / totalEval) * 100) : 0;
    if (pct > topAccountPct) {
      topAccount = acc;
      topAccountPct = pct;
    }
  });

  // 3. 주요 상승/하락 종목 선정
  let bestStock = null;
  let worstStock = null;
  globalHoldings.forEach((item) => {
    const change = parseSafeFloat(item.dailyChange);
    if (!bestStock || change > parseSafeFloat(bestStock.dailyChange))
      bestStock = item;
    if (!worstStock || change < parseSafeFloat(worstStock.dailyChange))
      worstStock = item;
  });

  // 4. 위험 관리 지표 분석 (MDD & RSI)
  let worstMddStock = null;
  let worstMddValue = 0;
  const rsiOverbought = [];
  const rsiOversold = [];

  if (
    typeof holdingsAnalysisData !== "undefined" &&
    holdingsAnalysisData.length > 0
  ) {
    holdingsAnalysisData.forEach((d) => {
      const mddVal = Math.abs(parseSafeFloat(d.mdd));
      if (mddVal > worstMddValue) {
        worstMddValue = mddVal;
        worstMddStock = d;
      }

      const rsiVal = parseSafeFloat(d.rsi);
      if (rsiVal >= 70) {
        rsiOverbought.push(d.name || d.ticker);
      } else if (rsiVal <= 30 && rsiVal > 0) {
        rsiOversold.push(d.name || d.ticker);
      }
    });
  }

  // 오늘 날짜 추출
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;

  // 대본 작성
  let scriptText = `안녕하십니까. 투자자님을 위한 인공지능 금융 비서, ${dateStr} 포트폴리오 일일 브리핑을 시작합니다. `;

  scriptText += `먼저 현재 포트폴리오의 종합 자산 규모 현황입니다. `;
  scriptText += `오늘 기준 투자자님의 총 평가 자산은 약 ${evalBillion}억 원으로 파악되었습니다. `;
  scriptText += `투자 원금 대비 종합 ${sign}은 약 ${Math.abs(
    profitBillion,
  )}억 원이며, 이에 따른 포트폴리오 총 누적 수익률은 ${returnRate}%를 나타내고 있습니다. `;

  scriptText += `이어서 자산 분산도 및 헤지 분석 결과입니다. `;
  scriptText += `현재 자산의 통화별 비중은 국내 원화 자산이 ${krwPct}%, 해외 달러 자산이 ${usdPct}%로 배분되어 있습니다. `;
  scriptText += `해외 달러 자산의 보유는 환율 변동에 따른 자산 완충 역할을 할 수 있으므로, 향후 거시경제 흐름을 보며 적절한 통화 리밸런싱을 권장해 드립니다. `;
  scriptText += `또한 등록된 계좌 중에서는 ${topAccount} 계좌가 전체 포트폴리오 자산의 약 ${topAccountPct}%를 차지하여 가장 높은 집중도를 보이고 있습니다. `;

  scriptText += `다음으로 오늘 거래일 기준 개별 종목 성과 리포트입니다. `;
  if (bestStock && parseSafeFloat(bestStock.dailyChange) > 0) {
    scriptText += `가장 우수한 일일 성과를 보여준 종목은 ${bestStock.name}으로, 전일 대비 ${bestStock.dailyChange}% 상승하며 포트폴리오 수익률 방어를 주도했습니다. `;
  }
  if (worstStock && parseSafeFloat(worstStock.dailyChange) < 0) {
    scriptText += `반대로 조정을 겪은 하락 종목으로는 ${
      worstStock.name
    }이 있으며, 전일 대비 ${Math.abs(
      worstStock.dailyChange,
    )}% 하락하며 거래를 마쳤습니다. `;
  }

  scriptText += `마지막으로 리스크 관리 관점의 모니터링 경보입니다. `;
  if (worstMddStock && worstMddValue > 0) {
    scriptText += `보유 자산 중 고점 대비 최대 낙폭을 뜻하는 엠디디가 가장 큰 종목은 ${
      worstMddStock.name || worstMddStock.ticker
    }로, 현재 최고점 대비 마이너스 ${worstMddValue.toFixed(
      1,
    )}% 수준까지 하락해 깊은 조정을 겪고 있습니다. 변동성이 지속될 수 있으니 주의 깊게 관찰하시기 바랍니다. `;
  }

  if (rsiOverbought.length > 0) {
    scriptText += `또한, 단기 과매수 국면에 진입한 것으로 평가되는 종목은 ${rsiOverbought
      .slice(0, 3)
      .join(
        ", ",
      )} 등이 있으므로 단기 차익 실현 욕구에 따른 변동성을 유념하셔야 합니다. `;
  }
  if (rsiOversold.length > 0) {
    scriptText += `반대로 과매도권에 들어서 기술적 반등 가능성이 엿보이는 분할 매수 관심 종목으로는 ${rsiOversold
      .slice(0, 3)
      .join(", ")} 등이 관찰됩니다. `;
  }

  scriptText += `오늘 아침 8시를 기점으로 하여 포트폴리오의 실시간 가치 평가 결과와 국내외 거시경제 전망 지표가 NotebookLM 노트북에 동기화 완료되었습니다. 상세한 개별 종목들의 회복 주기 분석은 하단 MDD 탭의 시장 보고서를 참고하시길 바라며, 추가 거래 기록 발생 시 우측 상단의 새로고침 버튼을 누르시면 최신 데이터가 즉각 반영된 신규 팟캐스트 브리핑이 생성됩니다. 오늘 하루도 성공적인 투자 여정이 되시기를 기원합니다. 이상 브리핑을 마칩니다. 감사합니다.`;

  return scriptText;
}

// 팟캐스트 재생/일시정지 토글
async function togglePodcast() {
  if (isGeneratingPodcast) return;

  const playIcon = document.getElementById("play-icon");
  const playText = document.getElementById("play-text");
  const waveform = document.getElementById("podcast-waveform");
  const statusText = document.getElementById("podcast-status-text");

  if (podcastPlaying) {
    // 일시정지 처리
    podcastPlaying = false;
    if (playIcon) playIcon.textContent = "▶";
    if (playText) playText.textContent = "재생";
    if (waveform) waveform.classList.remove("playing");
    if (statusText) statusText.textContent = "일시정지됨";

    if (speechUtterance && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel(); // TTS 중지
    }
    if (podcastProgressInterval) {
      clearInterval(podcastProgressInterval);
    }
  } else {
    // 재생 시작
    if (statusText) statusText.textContent = "AI 분석 대본 작성 중...";

    const textToSpeak = await generatePodcastTextWithGemini();

    podcastPlaying = true;
    if (playIcon) playIcon.textContent = "⏸";
    if (playText) playText.textContent = "일시정지";
    if (waveform) waveform.classList.add("playing");
    if (statusText) statusText.textContent = "AI 브리핑 브로드캐스팅 중...";

    const subtitleEl = document.getElementById("podcast-subtitle");
    if (subtitleEl) {
      subtitleEl.textContent = `"${textToSpeak}"`;
    }

    // TTS Fallback 구동
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel(); // 이전 Speech 초기화
      speechUtterance = new SpeechSynthesisUtterance(textToSpeak);
      speechUtterance.lang = "ko-KR";
      speechUtterance.rate = 1.05; // 약간 빠르게

      // 대본 길이에 따른 재생 시간 예측 (약 1자당 0.25초)
      podcastDuration = Math.round(textToSpeak.length * 0.25);

      speechUtterance.onend = () => {
        stopPodcastPlayback();
      };

      speechUtterance.onerror = () => {
        stopPodcastPlayback();
      };

      window.speechSynthesis.speak(speechUtterance);
    }

    // 가상 진행률 바 작동
    if (podcastProgressInterval) clearInterval(podcastProgressInterval);
    podcastProgressInterval = setInterval(updatePodcastProgress, 1000);
  }
}

// 팟캐스트 재생 정상 종료 처리
function stopPodcastPlayback() {
  podcastPlaying = false;
  const playIcon = document.getElementById("play-icon");
  const playText = document.getElementById("play-text");
  const waveform = document.getElementById("podcast-waveform");
  const statusText = document.getElementById("podcast-status-text");
  const progressBar = document.getElementById("podcast-progress-bar");
  const timeText = document.getElementById("podcast-time");

  if (playIcon) playIcon.textContent = "▶";
  if (playText) playText.textContent = "재생";
  if (waveform) waveform.classList.remove("playing");
  if (statusText) statusText.textContent = "재생 완료";
  if (progressBar) progressBar.style.width = "0%";
  if (timeText) timeText.textContent = "00:00 / 00:00";

  podcastCurrentTime = 0;
  if (podcastProgressInterval) {
    clearInterval(podcastProgressInterval);
  }
  window.speechSynthesis.cancel();
}

// 진행바 및 시간 텍스트 업데이트
function updatePodcastProgress() {
  if (!podcastPlaying) return;

  podcastCurrentTime += 1;
  if (podcastCurrentTime >= podcastDuration) {
    stopPodcastPlayback();
    return;
  }

  const progressBar = document.getElementById("podcast-progress-bar");
  const timeText = document.getElementById("podcast-time");

  const progressPercent = (podcastCurrentTime / podcastDuration) * 100;
  if (progressBar) progressBar.style.width = `${progressPercent}%`;

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  if (timeText) {
    timeText.textContent = `${formatTime(podcastCurrentTime)} / ${formatTime(
      podcastDuration,
    )}`;
  }
}

// 팟캐스트 새로 고침(최신 분석 생성)
async function refreshPodcast() {
  if (isGeneratingPodcast) return;

  isGeneratingPodcast = true;
  stopPodcastPlayback();

  const refreshBtn = document.getElementById("podcast-refresh-btn");
  const statusText = document.getElementById("podcast-status-text");
  const subtitleEl = document.getElementById("podcast-subtitle");

  if (refreshBtn) refreshBtn.classList.add("loading");
  if (statusText)
    statusText.textContent = "포트폴리오 분석 및 Gemini 동기화 중...";
  if (subtitleEl)
    subtitleEl.textContent =
      "현재 자산 현황을 바탕으로 Gemini LLM을 연동하여 오늘의 포트폴리오 분석 팟캐스트를 동적 생성하고 있습니다. 잠시만 기다려주세요...";

  try {
    // 실시간으로 Gemini API를 호출하여 최신 대본 생성
    const textToSpeak = await generatePodcastTextWithGemini();

    // 연출 효과를 위해 최소 1.5초는 로딩바를 보여줍니다
    setTimeout(() => {
      isGeneratingPodcast = false;
      if (refreshBtn) refreshBtn.classList.remove("loading");
      if (statusText) statusText.textContent = "AI 브리핑 생성 완료 (대기 중)";

      if (subtitleEl) {
        subtitleEl.textContent = `"${textToSpeak}"`;
      }

      showToast(
        "제미나이 기반 AI 포트폴리오 브리핑이 성공적으로 생성되었습니다.",
        "success",
      );
    }, 1500);
  } catch (err) {
    console.error("❌ 팟캐스트 갱신 에러:", err);
    isGeneratingPodcast = false;
    if (refreshBtn) refreshBtn.classList.remove("loading");
    if (statusText) statusText.textContent = "AI 브리핑 생성 오류";
    showToast("팟캐스트 생성 중 에러가 발생했습니다.", "error");
  }
}

// Gemini API를 호출하여 AI 맞춤형 팟캐스트 스크립트 작성
async function generatePodcastTextWithGemini() {
  // 세션 토큰 유효성 검사
  const isTokenValid = googleAccessToken && googleTokenExpiry > Date.now();
  if (!isTokenValid && googleAccessToken) {
    clearGoogleAuthSession();
    showToast("구글 로그인 세션이 만료되었습니다. 다시 로그인해주세요. 😢");
  }

  const token = isTokenValid ? googleAccessToken : null;

  if (!token && !CONFIG.geminiAPIKey) {
    console.log(
      "💡 Google 로그인 토큰 또는 Gemini API Key가 없어 기존 룰 기반 스크립트를 로드합니다.",
    );
    return generatePodcastText();
  }

  // 포트폴리오 상세 분석용 원시 데이터 추출
  const holdingsSummary = globalHoldings.map((item) => ({
    name: item.name,
    ticker: item.ticker,
    eval: parseSafeFloat(item.eval),
    profit: parseSafeFloat(item.display?.profitKRW || item.profit),
    dailyChange: parseSafeFloat(item.dailyChange),
    account: item.account || "미지정",
    currency: isKoreanStock(item.ticker) ? "KRW" : "USD",
  }));

  const mddSummary = (
    typeof holdingsAnalysisData !== "undefined" ? holdingsAnalysisData : []
  ).map((d) => ({
    name: d.name || d.ticker,
    mdd: parseSafeFloat(d.mdd),
    rsi: parseSafeFloat(d.rsi),
  }));

  const today = new Date();
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;

  const prompt = `
당신은 최고의 자산관리 금융 애널리스트이자 팟캐스트 진행자입니다. 
아래 제공되는 오늘의 내 포트폴리오 데이터를 심층적으로 분석하고, 청취자(나 자신)에게 금융 조언을 곁들여 설명하는 라디오 팟캐스트 방송 대본을 작성해 주세요.

[오늘 날짜]
${dateStr}

[보유 종목 데이터]
${JSON.stringify(holdingsSummary, null, 2)}

[주요 위험 관리 지표 (MDD 및 RSI)]
${JSON.stringify(mddSummary, null, 2)}

[작성 지침]
1. 반드시 한국어로 작성해 주세요.
2. 듣는 사람에게 정중하고 신뢰감을 주는 구어체('~습니다', '~입니다') 톤을 사용하세요.
3. 오늘의 총 자산 평가액(원화 및 달러 분산), 계좌별 쏠림 현상(집중 분포), 오늘 가장 크게 오르고 내린 특징 종목, 그리고 MDD(최대 낙폭)가 심한 리스크 종목이나 RSI 과매수/과매도 종목에 대한 구체적인 금융 진단 및 조언을 포함해 주세요.
4. 방송 대본이므로 마크다운 기호(예: **, *, #, -, \` 등)나 특수문자는 소리 내어 읽을 때 어색하므로 절대 사용하지 말고 순수한 줄바꿈과 한글 텍스트로만 리턴해 주세요.
5. "[음악 소리]", "앵커:", "(웃음)" 같은 낭독 외의 해설 괄호나 메타 텍스트는 모두 제외하고 바로 읽을 수 있는 대본으로만 작성해 주세요.
`;

  try {
    let url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
    const headers = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      url += `?key=${CONFIG.geminiAPIKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API 응답 에러: ${response.status}`);
    }

    const resData = await response.json();
    const generatedText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (generatedText) {
      return generatedText.trim();
    }
    throw new Error("API 결과 텍스트가 유실되었습니다.");
  } catch (error) {
    console.error(
      "❌ Gemini API 스크립트 생성 실패, 기존 템플릿으로 대체합니다:",
      error,
    );
    return generatePodcastText();
  }
}

// ===== Supabase 및 스마트 매칭/TTM/환율 추가 기능 =====

// TTM 배당금 비동기 조회
async function fetchTTMDividend() {
  if (!CONFIG.supabaseURL || !CONFIG.supabaseKey) return 0;
  
  const today = new Date();
  const oneYearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
  const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];
  
  const url = `${CONFIG.supabaseURL}/rest/v1/transactions?select=*&type=eq.배당금&date=gte.${oneYearAgoStr}`;
  try {
    const response = await fetch(url, {
      headers: {
        'apikey': CONFIG.supabaseKey,
        'Authorization': `Bearer ${CONFIG.supabaseKey}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      let totalTtmDiv = 0;
      data.forEach(tx => {
        const qty = parseFloat(tx.quantity) || 0;
        const price = parseFloat(tx.price) || 0;
        const rate = parseFloat(tx.usd_krw_rate) || 1.0;
        totalTtmDiv += (qty * price * rate);
      });
      return totalTtmDiv;
    }
  } catch (e) {
    logger.error("TTM Dividend fetch failed:", e);
  }
  return 0;
}

// 과거 환율 조회 함수
async function getHistoricalExchangeRate(dateStr) {
  try {
    const dateObj = new Date(dateStr);
    const startTs = Math.floor(dateObj.getTime() / 1000) - 86400 * 3;
    const endTs = Math.floor(dateObj.getTime() / 1000) + 86400 * 3;
    
    const ticker = "USDKRW=X";
    const yahooURL = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${startTs}&period2=${endTs}&interval=1d&events=history`;
    
    const res = await fetchWithFallback(yahooURL, true);
    if (res && res.type === "json") {
      const chart = res.data.chart;
      if (chart && chart.result && chart.result[0]) {
        const timestamps = chart.result[0].timestamp;
        const indicators = chart.result[0].indicators.quote[0];
        if (timestamps && timestamps.length > 0) {
          const targetTs = Math.floor(dateObj.getTime() / 1000);
          let closestIndex = 0;
          let minDiff = Infinity;
          for (let i = 0; i < timestamps.length; i++) {
            const diff = Math.abs(timestamps[i] - targetTs);
            if (diff < minDiff && indicators.close[i] !== null) {
              minDiff = diff;
              closestIndex = i;
            }
          }
          const rate = indicators.close[closestIndex];
          if (rate) return rate;
        }
      }
    }
  } catch (e) {
    logger.warn("Historical exchange rate fetch failed:", e);
  }
  return 1350.0;
}

// 환율 입력창 제어 및 비동기 업데이트
function triggerExchangeRate(currency) {
  const usdRateGroup = document.getElementById("usd-rate-group");
  const usdRateInput = document.getElementById("usd-rate-input");
  const dateInput = document.getElementById("date-input");
  
  if (currency === "USD") {
    if (usdRateGroup) usdRateGroup.style.display = "flex";
    if (dateInput && dateInput.value) {
      updateRateForDate(dateInput.value);
    }
  } else {
    if (usdRateGroup) usdRateGroup.style.display = "none";
    if (usdRateInput) usdRateInput.value = "";
  }
}

async function updateRateForDate(dateStr) {
  const usdRateInput = document.getElementById("usd-rate-input");
  if (!usdRateInput) return;
  usdRateInput.placeholder = "⚡ 환율 조회 중...";
  const rate = await getHistoricalExchangeRate(dateStr);
  usdRateInput.value = rate.toFixed(2);
  usdRateInput.placeholder = "환율 (자동 조회)";
}

// 스마트 매칭 사전 로딩 및 datalist 구성
let stockDictionary = {};

async function loadStockDictionary() {
  try {
    const [sp500Res, kospiRes] = await Promise.all([
      fetch("sp500_data.json?v=" + new Date().getTime()).then(r => r.ok ? r.json() : []),
      fetch("kospi200_data.json?v=" + new Date().getTime()).then(r => r.ok ? r.json() : [])
    ]);
    
    sp500Res.forEach(item => {
      if (!item.ticker || !item.name) return;
      const ticker = item.ticker.trim().toUpperCase();
      const name = item.name.trim();
      const info = { ticker, name, currency: 'USD' };
      stockDictionary[ticker] = info;
      stockDictionary[name.toLowerCase()] = info;
    });
    
    kospiRes.forEach(item => {
      if (!item.ticker || !item.name) return;
      const rawTicker = item.ticker.trim().toUpperCase();
      const cleanTicker = rawTicker.replace(".KS", "").replace(".KQ", "");
      const name = item.name.trim();
      const info = { ticker: cleanTicker, name, currency: 'KRW' };
      stockDictionary[cleanTicker] = info;
      stockDictionary[rawTicker] = info;
      stockDictionary[name.toLowerCase()] = info;
    });
    
    logger.log("스마트 매칭 사전 구성 완료. 종목수:", Object.keys(stockDictionary).length);
    updateDatalistSuggestions();
  } catch (e) {
    logger.error("스마트 매칭 사전 구축 중 실패:", e);
  }
}

function updateDatalistSuggestions() {
  const datalist = document.getElementById("ticker-suggestions");
  if (!datalist) return;
  
  datalist.innerHTML = "";
  const uniqueItems = new Map();
  
  // 1. 기존 보유 종목 우선 추가
  if (globalHoldings) {
    globalHoldings.forEach(h => {
      uniqueItems.set(h.ticker, h.name);
    });
  }
  
  // 2. 사전 데이터 추가
  Object.values(stockDictionary).forEach(item => {
    uniqueItems.set(item.ticker, item.name);
  });
  
  uniqueItems.forEach((name, ticker) => {
    const option = document.createElement("option");
    option.value = `${name} (${ticker})`;
    datalist.appendChild(option);
  });
}

function initSmartMatching() {
  const searchInput = document.getElementById("stock-search-input");
  const nameInput = document.getElementById("stock-name-input");
  const tickerInput = document.getElementById("stock-ticker-input");
  const directInputContainer = document.getElementById("direct-input-container");
  const currencySelect = document.getElementById("currency-select");
  const dateInput = document.getElementById("date-input");
  
  if (!searchInput) return;
  
  const handleMatching = () => {
    const val = searchInput.value.trim();
    if (!val) {
      if (directInputContainer) directInputContainer.style.display = "none";
      if (nameInput) nameInput.value = "";
      if (tickerInput) tickerInput.value = "";
      return;
    }
    
    const datalistMatch = val.match(/^(.+?)\s*\(([^)]+)\)$/);
    let searchKey = val.toLowerCase();
    let queryTicker = "";
    
    if (datalistMatch) {
      searchKey = datalistMatch[1].trim().toLowerCase();
      queryTicker = datalistMatch[2].trim().toUpperCase();
    }
    
    const match = stockDictionary[queryTicker] || stockDictionary[searchKey] || stockDictionary[val.toUpperCase()];
    
    if (match) {
      if (nameInput) nameInput.value = match.name;
      if (tickerInput) tickerInput.value = match.ticker;
      if (currencySelect) currencySelect.value = match.currency;
      if (directInputContainer) directInputContainer.style.display = "none";
      triggerExchangeRate(match.currency);
    } else {
      if (directInputContainer) {
        directInputContainer.style.display = "flex";
        directInputContainer.style.flexDirection = "column";
      }
      if (/^[A-Za-z0-9\.]+$/.test(val)) {
        if (tickerInput) tickerInput.value = val.toUpperCase();
        if (nameInput) nameInput.value = "";
      } else {
        if (nameInput) nameInput.value = val;
        if (tickerInput) tickerInput.value = "";
      }
      
      // 직접 입력인 경우 통화 자동 판별
      if (tickerInput && currencySelect) {
        const ticker = tickerInput.value;
        if (isKoreanStock(ticker)) {
          currencySelect.value = "KRW";
        } else {
          currencySelect.value = "USD";
        }
        triggerExchangeRate(currencySelect.value);
      }
    }
  };
  
  searchInput.addEventListener("input", handleMatching);
  searchInput.addEventListener("change", handleMatching);
  
  // 통화 변경 및 날짜 변경 이벤트 연동
  if (currencySelect) {
    currencySelect.addEventListener("change", (e) => {
      triggerExchangeRate(e.target.value);
    });
  }
  
  if (dateInput) {
    dateInput.addEventListener("change", (e) => {
      if (currencySelect && currencySelect.value === "USD") {
        updateRateForDate(e.target.value);
      }
    });
  }
}


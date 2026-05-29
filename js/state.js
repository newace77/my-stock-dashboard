// js/state.js

export let googleAccessToken = null;
export let googleUserEmail = null;
export let googleTokenExpiry = 0;
export let googleTokenClient = null;

export function setGoogleAccessToken(val) { googleAccessToken = val; }
export function setGoogleUserEmail(val) { googleUserEmail = val; }
export function setGoogleTokenExpiry(val) { googleTokenExpiry = val; }
export function setGoogleTokenClient(val) { googleTokenClient = val; }

export const config = {
  HOLDINGS_COL: { NAME: 0, TICKER: 1, SHARES: 3, COST_BASIS: 4, AVG_COST: 5, CURRENT_PRICE: 6, RETURN_RATE: 7, EVAL_KRW: 8, WEIGHT: 9, DAILY_CHANGE: 10, PROFIT: 14 },
  SUMMARY_COL: { NAME: 0, EVAL_TOTAL: 1, INVEST_TOTAL: 2, PROFIT: 3, RETURN_RATE: 4, DAILY_CHANGE_PCT: 5, DAILY_CHANGE_AMT: 6, DIVIDEND: 11 },
  HISTORY_COL: { DATE: 0, EVAL_TOTAL: 1, INVEST_TOTAL: 2, PROFIT: 3, DIVIDEND: 11 },
  DEBUG: localStorage.getItem("debug_mode") === "true",
  logger: {
    log: (...args) => { if (localStorage.getItem("debug_mode") === "true") console.log(...args); },
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  },
  marketInfo: {
    kospi: { title: "KOSPI", symbol: "^KS11", color: "#f87171" },
    snp500: { title: "S&P 500", symbol: "^GSPC", color: "#60a5fa" },
    nasdaq: { title: "NASDAQ", symbol: "^IXIC", color: "#4ade80" },
    usdkrw: { title: "USD/KRW", symbol: "KRW=X", color: "#fbbf24" },
    bitcoin: { title: "Bitcoin", symbol: "BTC-USD", color: "#f97316" },
    gold: { title: "Gold", symbol: "GC=F", color: "#eab308" },
  },
  stockDictionary: {}
};

export const state = {
  globalHoldings: [], usdKrwRate: 1400, usdKrwRateUpdatedAt: 0, globalMarketIndices: null,
  isPrivacyMode: localStorage.getItem("privacy_mode") === "true",
  userViewMode: localStorage.getItem("user_view_mode") || "auto",
  rawHistoryData: [], currentHistoryRange: "ALL",
  sortState: { column: "weight", direction: "desc" },
  summaryChart: null, summaryPieChart: null, historyChart: null, bubbleChart: null,
  mddChart: null, recoveryChart: null, intradayChart: null, hiddenHistoryDatasets: new Set(),
  currentSummarySlide: 0, themeMode: localStorage.getItem("theme_mode") || "auto",
  lastSummaryLabels: [], lastSummaryInvests: [], lastSummaryEvals: [],
  lastMddTicker: "", lastMddProcessedData: null, lastMddStats: null, lastMddCurrentDrawdown: 0,
  currentModalRange: "1mo", currentDividendMonth: new Date(), dividendCache: [],
  holdingsAnalysisData: [], holdingsAnalysisSortState: { column: "eval", direction: "desc" },
  sp500Data: [], sp500SortState: { column: "marketCap", direction: "desc" },
  kospi200Data: [], kospi200SortState: { column: "marketCap", direction: "desc" },
  currentModalItem: null, currentMarketId: null, currentMarketRange: "1m", marketChart: null,
  currentSlide: 0, heatmapStats: { upCount: 0, downCount: 0, flatCount: 0, totalReturn: 0, totalInvest: 0 },
  heatmapSortOrder: "desc", podcastPlaying: false, speechUtterance: null, podcastProgressInterval: null,
  podcastCurrentTime: 0, podcastDuration: 60, isGeneratingPodcast: false
};

export let globalHoldings = state.globalHoldings;
export let usdKrwRate = state.usdKrwRate;
export let usdKrwRateUpdatedAt = state.usdKrwRateUpdatedAt;
export let globalMarketIndices = state.globalMarketIndices;
export let isPrivacyMode = state.isPrivacyMode;
export let userViewMode = state.userViewMode;
export let rawHistoryData = state.rawHistoryData;
export let currentHistoryRange = state.currentHistoryRange;
export let sortState = state.sortState;
export let summaryChart = state.summaryChart;
export let summaryPieChart = state.summaryPieChart;
export let historyChart = state.historyChart;
export let bubbleChart = state.bubbleChart;
export let mddChart = state.mddChart;
export let recoveryChart = state.recoveryChart;
export let intradayChart = state.intradayChart;
export let hiddenHistoryDatasets = state.hiddenHistoryDatasets;
export let currentSummarySlide = state.currentSummarySlide;
export let themeMode = state.themeMode;
export let lastSummaryLabels = state.lastSummaryLabels;
export let lastSummaryInvests = state.lastSummaryInvests;
export let lastSummaryEvals = state.lastSummaryEvals;
export let lastMddTicker = state.lastMddTicker;
export let lastMddProcessedData = state.lastMddProcessedData;
export let lastMddStats = state.lastMddStats;
export let lastMddCurrentDrawdown = state.lastMddCurrentDrawdown;
export let currentModalRange = state.currentModalRange;
export let currentDividendMonth = state.currentDividendMonth;
export let dividendCache = state.dividendCache;
export let holdingsAnalysisData = state.holdingsAnalysisData;
export let holdingsAnalysisSortState = state.holdingsAnalysisSortState;
export let sp500Data = state.sp500Data;
export let sp500SortState = state.sp500SortState;
export let kospi200Data = state.kospi200Data;
export let kospi200SortState = state.kospi200SortState;
export let currentModalItem = state.currentModalItem;
export let currentMarketId = state.currentMarketId;
export let currentMarketRange = state.currentMarketRange;
export let marketChart = state.marketChart;
export let currentSlide = state.currentSlide;
export let heatmapStats = state.heatmapStats;
export let heatmapSortOrder = state.heatmapSortOrder;
export let podcastPlaying = state.podcastPlaying;
export let speechUtterance = state.speechUtterance;
export let podcastProgressInterval = state.podcastProgressInterval;
export let podcastCurrentTime = state.podcastCurrentTime;
export let podcastDuration = state.podcastDuration;
export let isGeneratingPodcast = state.isGeneratingPodcast;

export const HOLDINGS_COL = config.HOLDINGS_COL;
export const SUMMARY_COL = config.SUMMARY_COL;
export const HISTORY_COL = config.HISTORY_COL;
export const DEBUG = config.DEBUG;
export const logger = config.logger;
export const marketInfo = config.marketInfo;
export const stockDictionary = config.stockDictionary;

export function isExchangeRateValid() {
  if (state.usdKrwRate <= 100) return false;
  if (state.usdKrwRateUpdatedAt === 0) return true; // 초기값 1400 사용 허용
  const THIRTY_MIN = 30 * 60 * 1000;
  return Date.now() - state.usdKrwRateUpdatedAt < THIRTY_MIN;
}

export function getThemeColor(lightColor, darkColor) {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  return theme === "light" ? lightColor : darkColor;
}

export function maskValue(val, isName = false) {
  if (!state.isPrivacyMode) return val;
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

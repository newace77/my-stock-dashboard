import { encodeYahooTicker, escapeHtml, safeValue, isKoreanStock, formatToEokWon, formatValueByMode, formatPercent, getResponsiveValueHTML, formatTicker, parseSafeFloat, formatKRWInteger, getColorClass, formatBillion, formatKoreanCap, formatLocalDate } from "./utils.js";
import { state, config, googleAccessToken, googleUserEmail, googleTokenExpiry, googleTokenClient, globalHoldings, usdKrwRate, usdKrwRateUpdatedAt, globalMarketIndices, isPrivacyMode, userViewMode, rawHistoryData, currentHistoryRange, sortState, summaryChart, summaryPieChart, historyChart, bubbleChart, mddChart, recoveryChart, intradayChart, hiddenHistoryDatasets, currentSummarySlide, themeMode, lastSummaryLabels, lastSummaryInvests, lastSummaryEvals, lastMddTicker, lastMddProcessedData, lastMddStats, lastMddCurrentDrawdown, currentModalRange, currentDividendMonth, dividendCache, holdingsAnalysisData, holdingsAnalysisSortState, sp500Data, sp500SortState, kospi200Data, kospi200SortState, currentModalItem, currentMarketId, currentMarketRange, marketChart, currentSlide, heatmapStats, heatmapSortOrder, podcastPlaying, speechUtterance, podcastProgressInterval, podcastCurrentTime, podcastDuration, isGeneratingPodcast, HOLDINGS_COL, SUMMARY_COL, HISTORY_COL, DEBUG, logger, marketInfo, stockDictionary, isExchangeRateValid, getThemeColor, maskValue } from "./state.js";
import { initGoogleAuth, handleTokenResponse, clearGoogleAuthSession, logoutGoogle, loginGoogle, updateGoogleAuthUI } from "./auth.js";
import { fetchWithFallback, parseYahooData, handleTransactionSubmit, requestMarketRefresh, fetchTTMDividend, getHistoricalExchangeRate, triggerExchangeRate, updateRateForDate } from "./api.js";
import { renderMDDCharts, renderSummaryPieChart, renderSummaryChart, renderHistoryChartWithRange, updateCustomHistoryLegend, renderBubbleChart, refreshAllCharts, applyTheme, filterBubbleChart } from './charts.js';
import { openTab, changeDividendMonth, renderDividendCalendar, getMonthlyDividendData, updateDividendDetailTable, showDividendDetail, calculateRSIValue, calculateMDDAndRecovery, fetchHoldingsAnalysisData, sortHoldingsAnalysis, renderHoldingsAnalysisTable, showToast, renderFromData, sortMarketData, renderMarketTable, sortSP500, renderSP500Table, sortKOSPI200, renderKOSPI200Table, refreshHoldingsAnalysis, refreshSP500, refreshKOSPI200, calculateRecoveryStats, updateMDDSummary, updateTimestamp, renderSummary, processHoldingsData, sortHoldings, renderHoldingsTable, switchHoldingsView, renderHoldingsCards, openStockModal, closeStockModal, openSettingsModal, closeSettingsModal, openMarketModal, closeMarketModal, updateModalChartRange, updateHistoryRange, setThemeMode, updateViewModeIndicator, cycleViewMode, moveSummarySlider, goSummarySlide, updateSummarySliderDots, moveSlider, goSlide, updateSliderDots, toggleHeatmapSort, renderHeatmap, loadStockDictionary, updateDatalistSuggestions, initSmartMatching, analyzeMDD, initDashboard, syncDividendDataAndRender, sleep, fetchModalChartData, fetchMarketChartData } from './ui.js';
import { generatePodcastText, togglePodcast, stopPodcastPlayback, updatePodcastProgress, refreshPodcast, generatePodcastTextWithGemini } from './podcast.js';

// CONFIG.supabaseURL 자동 정규화 (/rest/v1 중복 방지)
if (window.CONFIG && window.CONFIG.supabaseURL) {
  window.CONFIG.supabaseURL = window.CONFIG.supabaseURL.replace(/\/rest\/v1\/?$/, "");
}

// 💡 설정(CONFIG)은 외부 config.js 파일에서 로드됩니다.
if (typeof CONFIG === "undefined") {
  console.warn("CONFIG is not defined. Using default values for snapshot.");
  window.CONFIG = {
    snapshotURL: "data_snapshot.json",
    summaryURL: "", holdingsURL: "", historyURL: "", gasURL: "",
  };
}

// ⚠️ service_role 키 사용 감지 경고 (keep the JWT check)
if (window.CONFIG && window.CONFIG.supabaseKey) {
  try {
    const payload = JSON.parse(atob(window.CONFIG.supabaseKey.split(".")[1]));
    if (payload.role === "service_role") {
      console.error("🚨 [보안 경고] ...");
    }
  } catch (_) {}
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

  // Defer non-critical data loading
  setTimeout(() => fetchSP500Data(), 3000);
  setTimeout(() => fetchKOSPI200Data(), 3000);

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

async function fetchData(force = false) {
  holdingsAnalysisData.length = 0;
  const CACHE_KEY = "dashboard_data_cache";

  if (!force) {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      try {
        const cache = JSON.parse(cachedData);
        renderFromData(cache);

        const now = new Date().getTime();
        const cacheAge = (now - (cache.timestamp || 0)) / 1000;
        if (cacheAge < 30) {
          updateTimestamp(true, "Cache");
          return;
        }
      } catch (e) {
        logger.warn("Cache fail", e);
        showToast("캐시 데이터 로드 실패", "warning");
      }
    } else {
      try {
        const response = await fetch(
          window.CONFIG.snapshotURL + "?t=" + new Date().getTime(),
        );
        if (response.ok) {
          const snapshot = await response.json();
          renderFromData(snapshot);
          updateTimestamp(false, "Snapshot");
        }
      } catch (e) {
        logger.warn("Snapshot load fail", e);
        showToast("스냅샷 로드 실패", "warning");
      }
    }
  }

  updateTimestamp(null, "⏳ 데이터 로드 중...");

  try {
    updateMarketCharts();

    if (window.CONFIG.supabaseURL && window.CONFIG.supabaseKey) {
      logger.log("Supabase 데이터 페칭 시작...");
      
      const fetchHeaders = {
        'apikey': window.CONFIG.supabaseKey,
        'Authorization': `Bearer ${window.CONFIG.supabaseKey}`
      };
      
      const [summaryResponse, holdingsResponse, historyResponse] = await Promise.all([
        fetch(`${window.CONFIG.supabaseURL}/rest/v1/account_summary?select=*`, { headers: fetchHeaders }),
        fetch(`${window.CONFIG.supabaseURL}/rest/v1/holdings?select=*`, { headers: fetchHeaders }),
        fetch(`${window.CONFIG.supabaseURL}/rest/v1/asset_history?select=*&order=record_date.asc`, { headers: fetchHeaders })
      ]);
      
      if (!summaryResponse.ok || !holdingsResponse.ok || !historyResponse.ok) {
        throw new Error("Supabase REST API request failed");
      }
      
      const summaryList = await summaryResponse.json();
      const holdingsList = await holdingsResponse.json();
      const historyList = await historyResponse.json();
      
      const ttmDividend = await fetchTTMDividend();
      
      const summaryData = [
        ["계좌명", "평가금", "투자금", "수입액", "수익률", "일일변동률", "일일변동액", "", "", "", "", "배당금"]
      ];
      let sumEval = 0, sumInvest = 0, sumProfit = 0, sumDailyAmt = 0;
      let sumDividend = 0;
      summaryList.forEach(item => {
        const evalTotal = parseFloat(item.eval_total) || 0;
        const investTotal = parseFloat(item.invest_total) || 0;
        const profit = parseFloat(item.profit) || 0;
        const dailyChangeAmt = parseFloat(item.daily_change_amt) || 0;
        const dividend = parseFloat(item.dividend) || 0;

        sumEval += evalTotal;
        sumInvest += investTotal;
        sumProfit += profit;
        sumDailyAmt += dailyChangeAmt;
        sumDividend += dividend;
        
        const row = [];
        row[0] = item.account_name;
        row[1] = Math.round(evalTotal).toLocaleString('ko-KR');
        row[2] = Math.round(investTotal).toLocaleString('ko-KR');
        row[3] = Math.round(profit).toLocaleString('ko-KR');
        row[4] = (parseFloat(item.return_rate) || 0).toFixed(2) + "%";
        row[5] = (parseFloat(item.daily_change_pct) || 0).toFixed(2) + "%";
        row[6] = Math.round(dailyChangeAmt).toLocaleString('ko-KR');
        row[11] = Math.round(dividend).toLocaleString('ko-KR');
        summaryData.push(row);
      });
      
      const sumReturnRate = sumInvest > 0 ? (sumProfit / sumInvest) * 100 : 0;
      const prevSumEval = sumEval - sumDailyAmt;
      const sumDailyPct = prevSumEval > 0 ? (sumDailyAmt / prevSumEval) * 100 : 0;
      
      const totalRow = [];
      totalRow[0] = "합계";
      totalRow[1] = Math.round(sumEval).toLocaleString('ko-KR');
      totalRow[2] = Math.round(sumInvest).toLocaleString('ko-KR');
      totalRow[3] = Math.round(sumProfit).toLocaleString('ko-KR');
      totalRow[4] = sumReturnRate.toFixed(2) + "%";
      totalRow[5] = sumDailyPct.toFixed(2) + "%";
      totalRow[6] = Math.round(sumDailyAmt).toLocaleString('ko-KR');
      totalRow[11] = Math.round(sumDividend).toLocaleString('ko-KR');
      summaryData.push(totalRow);
      
      const holdingsData = [
        ["종목명", "Ticker", "", "수량", "매수금액", "평균단가", "현재가", "수익률", "평가금액", "비중", "일일변동", "", "", "", "평가손익"]
      ];

      const aggregatedHoldings = {};
      let totalEvalKrw = 0;

      holdingsList.forEach(item => {
        const ticker = item.ticker;
        const evalKrw = parseFloat(item.eval_krw) || 0;
        const profit = parseFloat(item.profit) || 0;
        const quantity = parseFloat(item.quantity) || 0;
        const costBasisKrw = evalKrw - profit;
        const currency = item.currency || 'KRW';
        const isUSD = currency === 'USD';

        totalEvalKrw += evalKrw;

        if (!aggregatedHoldings[ticker]) {
          aggregatedHoldings[ticker] = {
            stock_name: item.stock_name,
            ticker: ticker,
            quantity: 0,
            costBasisKrw: 0,
            eval_krw: 0,
            profit: 0,
            costBasisForeign: 0,
            evalForeign: 0,
            current_price: parseFloat(item.current_price) || 0,
            daily_change: parseFloat(item.daily_change) || 0,
            currency: currency
          };
        }

        const h = aggregatedHoldings[ticker];
        h.quantity += quantity;
        h.costBasisKrw += costBasisKrw;
        h.eval_krw += evalKrw;
        h.profit += profit;

        const itemAvgPrice = parseFloat(item.avg_price) || 0;
        const itemCurrentPrice = parseFloat(item.current_price) || 0;

        let costBasisForeignItem = 0;
        let evalForeignItem = 0;
        if (isUSD) {
          costBasisForeignItem = itemAvgPrice > 0 ? (quantity * itemAvgPrice) : (costBasisKrw / (usdKrwRate || 1350.0));
          evalForeignItem = itemCurrentPrice > 0 ? (quantity * itemCurrentPrice) : (evalKrw / (usdKrwRate || 1350.0));
        } else {
          costBasisForeignItem = costBasisKrw;
          evalForeignItem = evalKrw;
        }

        h.costBasisForeign += costBasisForeignItem;
        h.evalForeign += evalForeignItem;
      });

      Object.values(aggregatedHoldings).forEach(h => {
        const row = [];
        row[0] = h.stock_name;
        row[1] = h.ticker;
        row[2] = h.currency;
        row[3] = h.quantity;
        row[4] = h.costBasisKrw;
        row[5] = h.quantity > 0 ? (h.currency === 'USD' ? h.costBasisForeign / h.quantity : h.costBasisKrw / h.quantity) : 0;
        row[6] = h.current_price;

        const returnRate = h.currency === 'USD'
          ? (h.costBasisForeign > 0 ? ((h.evalForeign - h.costBasisForeign) / h.costBasisForeign) * 100 : 0)
          : (h.costBasisKrw > 0 ? (h.profit / h.costBasisKrw) * 100 : 0);
          
        row[7] = returnRate.toFixed(2) + "%";
        row[8] = h.eval_krw;

        const weight = totalEvalKrw > 0 ? (h.eval_krw / totalEvalKrw) * 100 : 0;
        row[9] = weight.toFixed(2) + "%";
        row[10] = h.daily_change + "%";
        row[14] = h.profit;
        holdingsData.push(row);
      });
      
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
      
      if (historyList && historyList.length > 0) {
        const latestHistory = historyList[historyList.length - 1];
        if (latestHistory && latestHistory.usd_krw_rate) {
          state.usdKrwRate = parseFloat(latestHistory.usd_krw_rate);
          state.usdKrwRateUpdatedAt = Date.now();
        }
      }

      const freshData = {
        summary: summaryData,
        holdings: holdingsData,
        history: historyData,
        usd_krw_rate: usdKrwRate,
        market_indices: globalMarketIndices,
        timestamp: new Date().getTime(),
      };
      
      renderFromData(freshData);
      localStorage.setItem(CACHE_KEY, JSON.stringify(freshData));
      updateTimestamp(true, "Supabase Live");
      logger.log("Supabase Live 데이터 업데이트 완료");
      updateDatalistSuggestions();
    } else {
      logger.log("구글 시트 실시간 데이터 페칭 시작...");
      const ts = new Date().getTime();
      const addTs = (url) =>
        url ? url + (url.includes("?") ? "&" : "?") + "t=" + ts : url;

      const [summaryRes, holdingsRes, historyRes] = await Promise.all([
        fetchWithFallback(addTs(window.CONFIG.summaryURL), false, ["총 평가금", "총 투자금"]),
        fetchWithFallback(addTs(window.CONFIG.holdingsURL), false, ["종목명", "Ticker"]),
        fetchWithFallback(addTs(window.CONFIG.historyURL), false, ["일자", "평가금"]),
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
        window.CONFIG.snapshotURL + "?t=" + new Date().getTime(),
      );
      if (response.ok) {
        const snapshot = await response.json();
        renderFromData(snapshot);
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

async function fetchSP500Data() {
  const tableBody = document.querySelector("#sp500-table tbody");
  const statusText = document.getElementById("sp500-status");
  if (!tableBody) return;

  try {
    statusText.textContent = "⏳ S&P 500 상위 100종목 데이터 로드 중...";

    const response = await fetch("sp500_data.json?v=" + new Date().getTime());
    if (!response.ok) throw new Error("데이터를 찾을 수 없습니다.");

    const data = await response.json();
    state.sp500Data = data;

    renderSP500Table();

    updateLivePrices(data, false);

    statusText.textContent = `✅ S&P 500 업데이트 완료 (${new Date().toLocaleTimeString()})`;
  } catch (err) {
    logger.error("SP500 데이터 로드 실패:", err);
    statusText.textContent =
      "❌ 데이터 로드 실패 (업데이트 준비 중일 수 있습니다)";
  }
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

    const data = await response.json();
    state.kospi200Data = data;

    renderKOSPI200Table();

    updateLivePrices(data, true);

    statusText.textContent = `✅ KOSPI 200 업데이트 완료 (${new Date().toLocaleTimeString()})`;
  } catch (err) {
    logger.error("KOSPI200 데이터 로드 실패:", err);
    statusText.textContent =
      "❌ 데이터 로드 실패 (업데이트 준비 중일 수 있습니다)";
  }
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

        let lastPrice = null;
        let changePercent = null;

        try {
          const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooTicker(m.ticker)}?interval=1d&range=1d&_=${Date.now()}`;
          const result = await fetchWithFallback(targetUrl, true);

          if (result && result.type === "json") {
            const meta = result.data.chart?.result?.[0]?.meta;
            if (meta) {
              lastPrice = meta.regularMarketPrice;

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
            }
          }
        } catch (e) {
          logger.warn(`실시간 지수 데이터 페칭 실패 (${m.id}):`, e);
        }

        if ((lastPrice === null || lastPrice === undefined) && globalMarketIndices && globalMarketIndices[m.id]) {
          lastPrice = globalMarketIndices[m.id].price;
          changePercent = globalMarketIndices[m.id].change;
          logger.log(`지수 데이터 백업 복원 성공 (${m.id}): ${lastPrice} (${changePercent}%)`);
        }

        if (lastPrice !== null && lastPrice !== undefined && changePercent !== null && changePercent !== undefined) {
              const isPositive = parseFloat(changePercent) >= 0;

              if (valEl) {
                const isMobileMode =
                  userViewMode === "mobile" ||
                  (userViewMode === "auto" && window.innerWidth <= 768);

                if (m.id === "fx") {
                  valEl.textContent = isMobileMode
                    ? Math.round(lastPrice).toLocaleString()
                    : lastPrice.toFixed(2);
                  valEl.setAttribute("data-price", lastPrice);
                  state.usdKrwRate = lastPrice;
                  state.usdKrwRateUpdatedAt = Date.now();
                } else {
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
      } catch (e) {
        logger.error(`🚨 ${m.id} 업데이트 오류:`, e);
      }
    }),
  );
}

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

async function updateMarketModalChartRange(range, btn) {
  if (!currentMarketId) return;
  state.currentMarketRange = range;

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

document.addEventListener("DOMContentLoaded", () => {
  const slider = document.getElementById("chart-slider");
  if (slider) {
    slider.addEventListener("scroll", () => {
      const slideWidth = slider.offsetWidth;
      const newIndex = Math.round(slider.scrollLeft / slideWidth);
      if (newIndex !== currentSlide) {
        state.currentSlide = newIndex;
        const title = document.getElementById("slider-title");
        if (title) {
          title.innerHTML =
            newIndex === 0
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
        state.currentSummarySlide = newIndex;
        const title = document.getElementById("summary-slider-title");
        if (title) {
          title.innerHTML =
            newIndex === 0
              ? "📊 계좌별 요약 (자산 비중)"
              : "🍰 계좌별 평가액 (파이 차트)";
        }
        updateSummarySliderDots();
      }
    });
  }

  applyTheme(themeMode);
});

async function updateLivePrices(dataArray, isKorean = false) {
  if (!dataArray || dataArray.length === 0) return;

  const batchSize = 10;
  for (let i = 0; i < dataArray.length; i += batchSize) {
    const batch = dataArray.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (item) => {
        try {
          const ticker = formatTicker(item.ticker);
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooTicker(ticker)}?interval=1d&range=1d&_=${Date.now()}`;
          const res = await fetchWithFallback(url, true);

          if (res && res.type === "json") {
            const meta = res.data.chart.result[0].meta;
            const livePrice = meta.regularMarketPrice;
            const liveChange =
              meta.regularMarketChangePercent ||
              (meta.chartPreviousClose
                ? (livePrice / meta.chartPreviousClose - 1) * 100
                : 0);

            item.price = livePrice;
            item.change = liveChange.toFixed(2);

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

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

window.heatmapStats = heatmapStats;
window.fetchData = fetchData;
window.updateMarketModalChartRange = updateMarketModalChartRange;
window.fetchSP500Data = fetchSP500Data;
window.fetchKOSPI200Data = fetchKOSPI200Data;

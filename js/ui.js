import { state } from './state.js';
import { formatAmount, formatCurrency, getThemeColor, formatToEokWon, maskValue, getCurrencySymbol, calculateTotalValuation, formatLargeNumber, calculateMDD, parseToNumber, parseCurrency, debounce } from './utils.js';
import { fetchWithRetry } from './api.js';
import { applyTheme, refreshAllCharts, renderHistoryChartWithRange, renderBubbleChart, renderMDDCharts, renderSummaryChart, renderSummaryPieChart, filterBubbleChart, updateCustomHistoryLegend } from './charts.js';

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


function changeDividendMonth(offset) {
  currentDividendMonth.setMonth(currentDividendMonth.getMonth() + offset);
  renderDividendCalendar();
}


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


function getMonthlyDividendData(year, month) {
  return dividendCache.filter((d) => {
    const date = new Date(d.date);
    return date.getFullYear() === year && date.getMonth() === month;
  });
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
          const historyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooTicker(ticker)}?interval=1d&range=10y&events=div&_=${Date.now()}`;
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


function renderFromData(data) {
  if (!data) {
    logger.warn("renderFromData: data is null or undefined");
    return;
  }
  logger.log("데이터 렌더링 시작...", Object.keys(data));
  
  try {
    if (data.usd_krw_rate) {
      usdKrwRate = parseFloat(data.usd_krw_rate);
      usdKrwRateUpdatedAt = Date.now();
      logger.log(`렌더러: 환율 복원 완료 -> ${usdKrwRate}원`);
    }
    if (data.market_indices) {
      globalMarketIndices = data.market_indices;
      if (globalMarketIndices && typeof globalMarketIndices === "object") {
        logger.log("렌더러: 지수 캐시 복원 완료", Object.keys(globalMarketIndices));
      }
    }
  } catch (e) {
    logger.warn("렌더러: 환율/지수 복원 중 오류 발생:", e);
  }

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


function sortKOSPI200(column) {
  sortMarketData("kospi200", column);
}


function renderKOSPI200Table() {
  renderMarketTable("kospi200");
}


function refreshHoldingsAnalysis() {
  fetchHoldingsAnalysisData(true);
}


function refreshSP500() {
  fetchSP500Data();
}


function refreshKOSPI200() {
  fetchKOSPI200Data();
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

  const aggregated = {};
  let totalEvalKrw = 0;

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

    const tickerValue = row[HOLDINGS_COL.TICKER] || "";
    const isKRW =
      isKoreanStock(tickerValue) || nameValue.toLowerCase().includes("plus50");
    const currency = isKRW ? "KRW" : "USD";

    const weight = parseSafeFloat(row[HOLDINGS_COL.WEIGHT]);
    const evalKRW = parseSafeFloat(row[HOLDINGS_COL.EVAL_KRW]);
    const profit = parseSafeFloat(row[HOLDINGS_COL.PROFIT]);
    const costBasis = parseSafeFloat(row[HOLDINGS_COL.COST_BASIS]) || (evalKRW - profit);
    const shares = parseSafeFloat(row[HOLDINGS_COL.SHARES]);

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

    if (!ticker) return;

    totalEvalKrw += evalKRW;

    if (!aggregated[ticker]) {
      aggregated[ticker] = {
        name: nameValue,
        ticker: ticker,
        currency: currency,
        shares: 0,
        costBasis: 0,
        eval: 0,
        profit: 0,
        costBasisForeign: 0,
        evalForeign: 0,
        currentPrice: parseSafeFloat(row[HOLDINGS_COL.CURRENT_PRICE]),
        dailyChange: parseSafeFloat(row[HOLDINGS_COL.DAILY_CHANGE])
      };
    }

    const a = aggregated[ticker];
    a.shares += shares;
    a.costBasis += costBasis;
    a.eval += evalKRW;
    a.profit += profit;

    const currentPriceVal = parseSafeFloat(row[HOLDINGS_COL.CURRENT_PRICE]);
    if (currentPriceVal > 0) {
      a.currentPrice = currentPriceVal;
    }
    const dailyChangeVal = parseSafeFloat(row[HOLDINGS_COL.DAILY_CHANGE]);
    if (dailyChangeVal !== 0) {
      a.dailyChange = dailyChangeVal;
    }

    const rawAvgCost = parseSafeFloat(row[HOLDINGS_COL.AVG_COST]);
    const rawCurrentPrice = parseSafeFloat(row[HOLDINGS_COL.CURRENT_PRICE]);
    const isUSD = currency === "USD";

    let costBasisForeignItem = 0;
    let evalForeignItem = 0;
    if (isUSD) {
      costBasisForeignItem = rawAvgCost > 0 ? (shares * rawAvgCost) : (costBasis / (usdKrwRate || 1350.0));
      evalForeignItem = rawCurrentPrice > 0 ? (shares * rawCurrentPrice) : (evalKRW / (usdKrwRate || 1350.0));
    } else {
      costBasisForeignItem = costBasis;
      evalForeignItem = evalKRW;
    }

    a.costBasisForeign += costBasisForeignItem;
    a.evalForeign += evalForeignItem;
  });

  // 이제 globalHoldings를 채우고 비중/수익률 계산
  Object.values(aggregated).forEach(a => {
    const weight = totalEvalKrw > 0 ? (a.eval / totalEvalKrw) * 100 : 0;
    
    const returnRate = a.currency === "USD"
      ? (a.costBasisForeign > 0 ? ((a.evalForeign - a.costBasisForeign) / a.costBasisForeign) * 100 : 0)
      : (a.costBasis > 0 ? (a.profit / a.costBasis) * 100 : 0);
      
    const avgCost = a.shares > 0
      ? (a.currency === "USD" ? a.costBasisForeign / a.shares : a.costBasis / a.shares)
      : 0;

    globalHoldings.push({
      name: a.name,
      ticker: a.ticker,
      currency: a.currency,
      weight: weight,
      returnRate: returnRate,
      eval: a.eval,
      profit: a.profit,
      dailyChange: a.dailyChange,
      shares: a.shares,
      avgCost: avgCost,
      currentPriceKRW: a.currentPrice || a.eval || "-",
      display: {
        weight: weight.toFixed(2) + "%",
        returnRate: returnRate.toFixed(2) + "%",
        evalKRW: formatKRWInteger(a.eval),
        profitKRW: formatKRWInteger(a.profit),
        dailyChange: a.dailyChange.toFixed(2) + "%",
        currentPrice: a.currentPrice || a.eval
      }
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
    const avgCostUSD = avgCostNum;
    avgCostEl.textContent = maskValue(
      avgCostUSD > 0 ? fmtUSDabs(avgCostUSD) : item.avgCost || "-",
    );
    avgCostSubEl.textContent = maskValue(
      avgCostUSD > 0 ? fmtKRW(avgCostUSD * usdKrwRate) : "",
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


async function openMarketModal(marketId) {
  const info = marketInfo[marketId];
  if (!info) return;

  state.currentMarketId = marketId;
  state.currentMarketRange = "1mo";

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

  await fetchMarketChartData(info.ticker, state.currentMarketRange);
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
  if (state.marketChart) {
    state.marketChart.destroy();
    state.marketChart = null;
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


function updateHistoryRange(range, btn) {
  currentHistoryRange = range;
  const buttons = document.querySelectorAll("#history-filter-group .sort-btn");
  buttons.forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderHistoryChartWithRange();
}


function setThemeMode(mode) {
  themeMode = mode;
  localStorage.setItem("theme_mode", mode);
  applyTheme(mode);
}


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


function updateSummarySliderDots() {
  const dots = document.querySelectorAll("#summary-slider-dots .slider-dot");
  dots.forEach((dot, index) => {
    dot.classList.toggle("active", index === currentSummarySlide);
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


function updateSliderDots() {
  const dots = document.querySelectorAll(".slider-dot");
  dots.forEach((dot, index) => {
    dot.classList.toggle("active", index === currentSlide);
  });
}


function toggleHeatmapSort(order) {
  if (state.heatmapSortOrder === order) return;
  state.heatmapSortOrder = order;

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
  state.heatmapStats.winDays = winDays;
  state.heatmapStats.totalDays = totalDays;
  state.heatmapStats.winRate = totalDays > 0 ? (winDays / totalDays) * 100 : 0;

  // DOM 갱신
  const statsEl = document.getElementById("heatmap-stats");
  if (statsEl) {
    statsEl.innerHTML = `
            <span class="stats-label">수익 발생일:</span>
            <span class="stats-value highlight">${winDays}일</span>
            <span class="stats-divider">/</span>
            <span class="stats-label">전체:</span>
            <span class="stats-value">${totalDays}일</span>
            <span class="stats-percentage">(${state.heatmapStats.winRate.toFixed(2)}%)</span>
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

  if (state.heatmapSortOrder === "desc") {
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
  
  // 1. 기존 보유 종목 우선 추가 및 사전에 동적 등록
  if (globalHoldings) {
    globalHoldings.forEach(h => {
      uniqueItems.set(h.ticker, h.name);
      
      const tickerUpper = h.ticker.trim().toUpperCase();
      const info = { ticker: h.ticker, name: h.name, currency: h.currency || (isKoreanStock(h.ticker) ? 'KRW' : 'USD') };
      stockDictionary[tickerUpper] = info;
      stockDictionary[h.name.trim().toLowerCase()] = info;
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

    const yahooURL = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooTicker(ticker)}?period1=${p1}&period2=${p2}&interval=1d&events=history`;
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
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooTicker(formattedTicker)}?interval=1d&range=5y&events=div`; // 5년치로 단축

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
    let interval = "1d";
    if (range === "1d") interval = "5m";
    else if (range === "5d") interval = "30m";

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooTicker(formattedTicker)}?interval=${interval}&range=${range}`;
    const res = await fetchWithFallback(url, true);

    if (res && res.type === "json") {
      const chartData = res.data.chart.result[0];
      const meta = chartData.meta;
      const rawTimestamps = chartData.timestamp || [];
      const rawPrices = chartData.indicators.quote[0].close || [];

      // Filter out null / undefined prices
      const validPoints = [];
      for (let i = 0; i < rawTimestamps.length; i++) {
        if (rawPrices[i] !== null && rawPrices[i] !== undefined) {
          validPoints.push({
            ts: rawTimestamps[i],
            val: rawPrices[i]
          });
        }
      }

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

      const labels = validPoints.map((pt) => {
        const date = new Date(pt.ts * 1000);
        if (range === "1d") {
          return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        } else if (range === "5d") {
          return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:00`;
        } else {
          return `${date.getMonth() + 1}/${date.getDate()}`;
        }
      });

      const prices = validPoints.map((pt) => pt.val);
      const isPositive = prices.length > 0 ? prices[prices.length - 1] >= prices[0] : true;
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


async function fetchMarketChartData(ticker, range) {
  const canvas = document.getElementById("market-modal-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (state.marketChart) state.marketChart.destroy();

  state.marketChart = new Chart(ctx, {
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

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooTicker(ticker)}?interval=${interval}&range=${range}`;
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

      state.marketChart.destroy();
      state.marketChart = new Chart(ctx, {
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
    if (state.marketChart) {
      state.marketChart.destroy();
      state.marketChart = new Chart(ctx, {
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


document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }
    const stockModal = document.getElementById("stock-modal-overlay");
    const marketModal = document.getElementById("market-modal-overlay");
    const settingsModal = document.getElementById("settings-modal-overlay");
    
    if (stockModal && stockModal.classList.contains("active")) {
      closeStockModal();
    }
    if (marketModal && marketModal.classList.contains("active")) {
      closeMarketModal();
    }
    if (settingsModal && settingsModal.classList.contains("active")) {
      closeSettingsModal();
    }
  }
});

export {
  openTab,
  changeDividendMonth,
  renderDividendCalendar,
  getMonthlyDividendData,
  updateDividendDetailTable,
  showDividendDetail,
  calculateRSIValue,
  calculateMDDAndRecovery,
  fetchHoldingsAnalysisData,
  sortHoldingsAnalysis,
  renderHoldingsAnalysisTable,
  showToast,
  renderFromData,
  sortMarketData,
  renderMarketTable,
  sortSP500,
  renderSP500Table,
  sortKOSPI200,
  renderKOSPI200Table,
  refreshHoldingsAnalysis,
  refreshSP500,
  refreshKOSPI200,
  calculateRecoveryStats,
  updateMDDSummary,
  updateTimestamp,
  renderSummary,
  processHoldingsData,
  sortHoldings,
  renderHoldingsTable,
  switchHoldingsView,
  renderHoldingsCards,
  openStockModal,
  closeStockModal,
  openSettingsModal,
  closeSettingsModal,
  openMarketModal,
  closeMarketModal,
  updateModalChartRange,
  updateHistoryRange,
  setThemeMode,
  updateViewModeIndicator,
  cycleViewMode,
  moveSummarySlider,
  goSummarySlide,
  updateSummarySliderDots,
  moveSlider,
  goSlide,
  updateSliderDots,
  toggleHeatmapSort,
  renderHeatmap,
  loadStockDictionary,
  updateDatalistSuggestions,
  initSmartMatching,
  analyzeMDD,
  initDashboard,
  syncDividendDataAndRender,
  fetchModalChartData,
  fetchMarketChartData
};

window.openTab = openTab;
window.changeDividendMonth = changeDividendMonth;
window.sortHoldings = sortHoldings;
window.sortHoldingsAnalysis = sortHoldingsAnalysis;
window.renderSP500Table = renderSP500Table; window.sortSP500 = sortSP500;
window.sortKOSPI200 = sortKOSPI200; window.renderKOSPI200Table = renderKOSPI200Table;
window.refreshHoldingsAnalysis = refreshHoldingsAnalysis;
window.refreshSP500 = refreshSP500;
window.refreshKOSPI200 = refreshKOSPI200;
window.openStockModal = openStockModal; window.closeStockModal = closeStockModal;
window.openSettingsModal = openSettingsModal; window.closeSettingsModal = closeSettingsModal;
window.openMarketModal = openMarketModal; window.closeMarketModal = closeMarketModal;
window.updateModalChartRange = updateModalChartRange;
window.updateHistoryRange = updateHistoryRange;
window.filterBubbleChart = filterBubbleChart;
window.setThemeMode = setThemeMode;
window.cycleViewMode = cycleViewMode;
window.moveSlider = moveSlider; window.goSlide = goSlide;
window.moveSummarySlider = moveSummarySlider;
window.goSummarySlide = goSummarySlide;
window.toggleHeatmapSort = toggleHeatmapSort;
window.analyzeMDD = analyzeMDD;
window.showDividendDetail = showDividendDetail;

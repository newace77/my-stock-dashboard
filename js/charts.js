import { state } from './state.js';
import { formatToEokWon, maskValue, formatCurrency, parseToNumber, getThemeColor, formatAmount } from './utils.js';

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


export {
  renderMDDCharts,
  renderSummaryPieChart,
  renderSummaryChart,
  renderHistoryChartWithRange,
  updateCustomHistoryLegend,
  renderBubbleChart,
  refreshAllCharts,
  applyTheme,
  filterBubbleChart
};

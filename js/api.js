import { config, logger, googleAccessToken, globalHoldings, stockDictionary } from './state.js';
import { showToast } from './ui.js';
import { encodeYahooTicker, isKoreanStock, formatTicker } from './utils.js';

/**
 * 프록시 레이싱(Racing) 기법을 사용하여 가장 빠른 응답을 반환하는 패치 함수
 */
export async function fetchWithFallback(targetUrl, isYahoo = false, requiredKeywords = []) {
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

        const result = window.Papa.parse(text, { header: false, skipEmptyLines: true });
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
      if (window.CONFIG.gasURL) {
        try {
          const apiKey = window.CONFIG.gasApiKey || "";
          const gasProxyUrl = `${window.CONFIG.gasURL}?url=${encodeURIComponent(targetUrl)}&apiKey=${encodeURIComponent(apiKey)}`;
          return await fetchTask(gasProxyUrl, { timeout: 8000 });
        } catch (gasErr) {
          logger.error(`[Fetch] GAS 프록시를 통한 페치도 실패했습니다:`, gasErr);
        }
      }
    }
  }

  // 2단계: 야후 파이낸스(isYahoo === true)이거나, 직접 페치/GAS가 모두 실패했을 때
  // GAS 프록시(GET 방식) 시도
  if (window.CONFIG.gasURL) {
    try {
      const apiKey = window.CONFIG.gasApiKey || "";
      const gasProxyUrl = `${window.CONFIG.gasURL}?url=${encodeURIComponent(targetUrl)}&apiKey=${encodeURIComponent(apiKey)}`;
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
export function parseYahooData(result, ticker) {
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

export async function handleTransactionSubmit(e) {
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

    if (window.CONFIG.supabaseURL && window.CONFIG.supabaseKey) {
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

      const response = await fetch(`${window.CONFIG.supabaseURL}/rest/v1/transactions`, {
        method: "POST",
        headers: {
          'apikey': window.CONFIG.supabaseKey,
          'Authorization': `Bearer ${window.CONFIG.supabaseKey}`,
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
      
      await fetch(window.CONFIG.gasURL, {
        method: "POST",
        mode: "no-cors",
        cache: "no-cache",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, apiKey: window.CONFIG.gasApiKey || "" }),
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
      window.fetchData(false);
    }, 1500);
  } catch (err) {
    logger.error("Transaction failed:", err);
    showToast("전송 실패: " + err.message, "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "기록하기 🐕";
  }
}

export async function requestMarketRefresh(account = null) {
  try {
    const payload = {
      command: "refresh_market",
      apiKey: window.CONFIG.gasApiKey || "",
    };
    if (account) payload.account = account;

    logger.log(`${account || "전체"} 시트 데이터 갱신 요청 중...`);
    return fetch(window.CONFIG.gasURL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
    });
  } catch (e) {
    logger.warn("Market refresh request failed:", e);
    return Promise.resolve();
  }
}

export async function fetchTTMDividend() {
  if (!window.CONFIG.supabaseURL || !window.CONFIG.supabaseKey) return 0;
  
  const today = new Date();
  const oneYearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
  const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];
  
  const url = `${window.CONFIG.supabaseURL}/rest/v1/transactions?select=*&type=eq.배당금&date=gte.${oneYearAgoStr}`;
  try {
    const response = await fetch(url, {
      headers: {
        'apikey': window.CONFIG.supabaseKey,
        'Authorization': `Bearer ${window.CONFIG.supabaseKey}`
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

export async function getHistoricalExchangeRate(dateStr) {
  try {
    const dateObj = new Date(dateStr);
    const startTs = Math.floor(dateObj.getTime() / 1000) - 86400 * 3;
    const endTs = Math.floor(dateObj.getTime() / 1000) + 86400 * 3;
    
    const ticker = "USDKRW=X";
    const yahooURL = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooTicker(ticker)}?period1=${startTs}&period2=${endTs}&interval=1d&events=history`;
    
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

export function triggerExchangeRate(currency) {
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

export async function updateRateForDate(dateStr) {
  const usdRateInput = document.getElementById("usd-rate-input");
  if (!usdRateInput) return;
  usdRateInput.placeholder = "⚡ 환율 조회 중...";
  const rate = await getHistoricalExchangeRate(dateStr);
  usdRateInput.value = rate.toFixed(2);
  usdRateInput.placeholder = "환율 (자동 조회)";
}

window.handleTransactionSubmit = handleTransactionSubmit;
window.requestMarketRefresh = requestMarketRefresh;
window.triggerExchangeRate = triggerExchangeRate;

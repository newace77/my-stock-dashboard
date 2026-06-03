const fs = require("fs");

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
  if (closes.length === 0) return { mdd: 0, recoveryProb: 0 };
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
    closes.length > 0 ? ((count / closes.length) * 100).toFixed(1) : 0;

  return { mdd: (currentDrawdown * 100).toFixed(2), recoveryProb: prob };
}

/**
 * 지수 백오프를 적용한 재시도 래퍼
 * @param {Function} fn - 비동기 함수
 * @param {number} retries - 최대 재시도 횟수 (기본 3)
 * @param {number} delayMs - 초기 지연(ms), 실패마다 2배 증가 (기본 500)
 * @returns {Promise<*>}
 */
async function withRetry(fn, retries = 3, delayMs = 500) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const wait = delayMs * Math.pow(2, attempt);
        console.warn(`  Retry ${attempt + 1}/${retries} after ${wait}ms — ${err.message}`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}

/**
 * 단일 종목의 히스토리를 조회하여 RSI/MDD를 계산합니다.
 * @param {object} yahooFinance - yahoo-finance2 인스턴스
 * @param {string} ticker
 * @returns {Promise<{rsi: string, mdd: string, recoveryProb: string}>}
 */
async function fetchIndicators(yahooFinance, ticker) {
  const p1 = new Date();
  p1.setFullYear(p1.getFullYear() - 10);
  const queryOptions = {
    period1: p1.toISOString().split("T")[0],
    period2: new Date().toISOString().split("T")[0],
    interval: "1d",
  };

  const chartRes = await withRetry(() => yahooFinance.chart(ticker, queryOptions));
  const closes = chartRes.quotes
    .map((q) => q.close)
    .filter((c) => c !== null && c !== undefined);

  if (closes.length === 0) return { rsi: "-", mdd: "0.00", recoveryProb: "0.0" };

  const mddData = calculateMDDAndRecovery(closes);
  const rsi = calculateRSIValue(closes).toFixed(1);
  return { rsi, mdd: mddData.mdd, recoveryProb: mddData.recoveryProb };
}

/**
 * 종목 목록을 배치로 나눠 지표를 계산하고 결과 배열을 반환합니다.
 * @param {object} yahooFinance - yahoo-finance2 인스턴스
 * @param {object[]} quotes - yahoo-finance2 quote 결과 배열
 * @param {object} nameMap - { ticker: name } 매핑 (옵션)
 * @param {number} batchSize
 * @param {number} batchDelayMs - 배치 사이 지연(ms)
 * @returns {Promise<object[]>}
 */
async function processBatches(yahooFinance, quotes, nameMap = {}, batchSize = 10, batchDelayMs = 200) {
  const results = [];

  for (let i = 0; i < quotes.length; i += batchSize) {
    const batch = quotes.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(quotes.length / batchSize)}...`);

    await Promise.all(
      batch.map(async (quote) => {
        const ticker = quote.symbol;
        const name = nameMap[ticker] || quote.shortName || quote.longName || ticker;
        const price = quote.regularMarketPrice || 0;
        const change = quote.regularMarketChangePercent || 0;
        const marketCap = quote.marketCap || 0;
        const dividendYield = resolveDividendYield(quote);

        let indicators = { rsi: "-", mdd: "0.00", recoveryProb: "0.0" };
        try {
          indicators = await fetchIndicators(yahooFinance, ticker);
        } catch (e) {
          console.error(`Failed to fetch history for ${ticker}: ${e.message}`);
        }

        results.push({
          ticker,
          name,
          price,
          change: change.toFixed(2),
          marketCap,
          mdd: indicators.mdd,
          recoveryProb: indicators.recoveryProb,
          rsi: indicators.rsi,
          dividendYield,
        });
      }),
    );

    if (i + batchSize < quotes.length) {
      await new Promise((r) => setTimeout(r, batchDelayMs));
    }
  }

  return results;
}

/**
 * quote 객체에서 배당률을 정규화하여 반환합니다.
 * @param {object} quote
 * @returns {string}
 */
function resolveDividendYield(quote) {
  if (quote.dividendYield != null) return quote.dividendYield.toFixed(2);
  if (quote.trailingAnnualDividendYield != null)
    return (quote.trailingAnnualDividendYield * 100).toFixed(2);
  return "0.00";
}

/**
 * 결과를 시가총액 순으로 정렬하고 rank를 부여한 뒤 JSON 파일로 저장합니다.
 * @param {object[]} results
 * @param {string} outputPath - 저장할 파일 경로
 */
function saveResults(results, outputPath) {
  results.sort((a, b) => b.marketCap - a.marketCap);
  results.forEach((r, idx) => (r.rank = idx + 1));
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Successfully saved ${results.length} stocks to ${outputPath}`);
}

module.exports = {
  calculateRSIValue,
  calculateMDDAndRecovery,
  withRetry,
  fetchIndicators,
  processBatches,
  saveResults,
};

const YahooFinance = require("yahoo-finance2").default;
const { withRetry, processBatches, saveResults } = require("./helpers");

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

async function getKOSPITop100Tickers() {
  const stocks = [];
  for (let page = 1; page <= 2; page++) {
    const res = await withRetry(() =>
      fetch(`https://finance.naver.com/sise/sise_market_sum.naver?sosok=0&page=${page}`),
    );
    const buffer = await res.arrayBuffer();
    const html = new TextDecoder("euc-kr").decode(buffer);
    const regex = /<a href="\/item\/main\.naver\?code=(\d{6})"[^>]*>(.*?)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const ticker = match[1] + ".KS";
      if (!stocks.find((s) => s.ticker === ticker)) {
        stocks.push({ ticker, name: match[2] });
      }
    }
  }
  return stocks.slice(0, 100);
}

async function run() {
  try {
    console.log("Fetching Top 100 KOSPI Tickers from Naver Finance...");
    const stocks = await getKOSPITop100Tickers();
    const tickers = stocks.map((s) => s.ticker);
    const nameMap = Object.fromEntries(stocks.map((s) => [s.ticker, s.name]));
    console.log(`Found ${tickers.length} tickers.`);

    console.log("Fetching quotes...");
    let allQuotes = [];
    try {
      allQuotes = await withRetry(() => yahooFinance.quote(tickers));
    } catch (e) {
      console.error(`Quote fetch error: ${e.message}`);
    }

    allQuotes.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    const top100 = allQuotes.slice(0, 100);
    console.log("Extracted Top 100 by Market Cap.");

    const results = await processBatches(yahooFinance, top100, nameMap);
    saveResults(results, "kospi200_data.json");
  } catch (e) {
    console.error("Error generating KOSPI200 data:", e);
    process.exit(1);
  }
}

run();

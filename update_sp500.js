const YahooFinance = require("yahoo-finance2").default;
const { withRetry, processBatches, saveResults } = require("./helpers");

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

async function getSP500Tickers() {
  const res = await withRetry(() =>
    fetch("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"),
  );
  const html = await res.text();
  const regex = /<a[^>]*class="external text"[^>]*>([A-Z]+)<\/a>/g;
  const tickers = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const t = match[1];
    if (!tickers.includes(t) && t.length <= 5) tickers.push(t);
  }
  return tickers.map((t) => t.replace(".", "-")).slice(0, 505);
}

async function run() {
  try {
    console.log("Fetching S&P 500 List from Wikipedia...");
    const tickers = await getSP500Tickers();
    console.log(`Found ${tickers.length} tickers.`);

    console.log("Fetching quotes to find top 100 by Market Cap...");
    const allQuotes = [];
    for (let i = 0; i < tickers.length; i += 100) {
      const batch = tickers.slice(i, i + 100);
      try {
        const quotes = await withRetry(() => yahooFinance.quote(batch));
        allQuotes.push(...quotes);
      } catch (e) {
        console.error(`Quote fetch error for batch ${i / 100 + 1}: ${e.message}`);
      }
    }

    allQuotes.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    const top100 = allQuotes.slice(0, 100);
    console.log("Extracted Top 100 by Market Cap.");

    const results = await processBatches(yahooFinance, top100);
    saveResults(results, "sp500_data.json");
  } catch (e) {
    console.error("Error generating S&P500 data:", e);
    process.exit(1);
  }
}

run();

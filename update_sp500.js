const fs = require("fs");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});
const { calculateRSIValue, calculateMDDAndRecovery } = require("./helpers");

async function getSP500Tickers() {
  const res = await fetch(
    "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
  );
  const html = await res.text();
  // HTML regex for S&P500 tickers from the wikipedia table
  const regex = /<a[^>]*class="external text"[^>]*>([A-Z]+)<\/a>/g;
  const tickers = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const t = match[1];
    if (!tickers.includes(t) && t.length <= 5) {
      tickers.push(t);
    }
  }
  // Normalize BRK.B to BRK-B
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
        const quotes = await yahooFinance.quote(batch);
        allQuotes.push(...quotes);
      } catch (e) {
        console.error("Quote fetch error", e);
      }
    }

    allQuotes.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    const top100 = allQuotes.slice(0, 100);
    console.log(`Extracted Top 100 by Market Cap.`);

    const results = [];
    const batchSize = 10;

    for (let i = 0; i < top100.length; i += batchSize) {
      const batch = top100.slice(i, i + batchSize);
      console.log(
        `Processing batch ${i / batchSize + 1}/${top100.length / batchSize}...`,
      );

      await Promise.all(
        batch.map(async (quote) => {
          const ticker = quote.symbol;
          const name = quote.shortName || quote.longName || ticker;
          const price = quote.regularMarketPrice || 0;
          const change = quote.regularMarketChangePercent || 0;
          const marketCap = quote.marketCap || 0;
          const dividendYield = quote.trailingAnnualDividendYield
            ? (quote.trailingAnnualDividendYield * 100).toFixed(2)
            : "0.00";

          let rsi = "-";
          let mddData = { mdd: "0.00", recoveryProb: "0.0" };

          try {
            const p1 = new Date();
            p1.setFullYear(p1.getFullYear() - 10);
            const p2 = new Date();
            const queryOptions = {
              period1: p1.toISOString().split("T")[0],
              period2: p2.toISOString().split("T")[0],
              interval: "1d",
            };
            const chartRes = await yahooFinance.chart(ticker, queryOptions);

            const closes = chartRes.quotes
              .map((q) => q.close)
              .filter((c) => c !== null && c !== undefined);

            if (closes.length > 0) {
              mddData = calculateMDDAndRecovery(closes);
              rsi = calculateRSIValue(closes).toFixed(1);
            }
          } catch (e) {
            console.error(
              `Failed to fetch history for ${ticker}: ${e.message}`,
            );
          }

          results.push({
            ticker,
            name,
            price,
            change: change.toFixed(2),
            marketCap,
            mdd: mddData.mdd,
            recoveryProb: mddData.recoveryProb,
            rsi,
            dividendYield,
          });
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    results.sort((a, b) => b.marketCap - a.marketCap);
    results.forEach((r, idx) => (r.rank = idx + 1));

    fs.writeFileSync("sp500_data.json", JSON.stringify(results, null, 2));
    console.log(
      `Successfully saved ${results.length} stocks to sp500_data.json`,
    );
  } catch (e) {
    console.error("Error generating S&P500 data:", e);
    process.exit(1);
  }
}

run();

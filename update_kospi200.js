const fs = require("fs");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});
const { calculateRSIValue, calculateMDDAndRecovery } = require("./helpers");

async function getKOSPITop100Tickers() {
  const stocks = [];
  for (let page = 1; page <= 2; page++) {
    const res = await fetch(
      `https://finance.naver.com/sise/sise_market_sum.naver?sosok=0&page=${page}`,
    );
    const buffer = await res.arrayBuffer();
    const html = new TextDecoder("euc-kr").decode(buffer);
    const regex =
      /<a href="\/item\/main\.naver\?code=(\d{6})"[^>]*>(.*?)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const ticker = match[1] + ".KS";
      if (!stocks.find((s) => s.ticker === ticker)) {
        stocks.push({ ticker: ticker, name: match[2] });
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
    const nameMap = {};
    stocks.forEach((s) => (nameMap[s.ticker] = s.name));
    console.log(`Found ${tickers.length} tickers.`);

    console.log("Fetching quotes...");
    const allQuotes = [];
    try {
      const quotes = await yahooFinance.quote(tickers);
      allQuotes.push(...quotes);
    } catch (e) {
      console.error("Quote fetch error", e);
    }

    allQuotes.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    const top100 = allQuotes.slice(0, 100);
    console.log(`Extracted Top 100 by Market Cap.`);

    const results = [];
    const batchSize = 10;

    for (let i = 0; i < top100.length; i += batchSize) {
      const batch = top100.slice(i, i + batchSize);
      console.log(
        `Processing batch ${i / batchSize + 1}/${Math.ceil(top100.length / batchSize)}...`,
      );

      await Promise.all(
        batch.map(async (quote) => {
          const ticker = quote.symbol;
          const name =
            nameMap[ticker] || quote.shortName || quote.longName || ticker;
          const price = quote.regularMarketPrice || 0;
          const change = quote.regularMarketChangePercent || 0;
          const marketCap = quote.marketCap || 0;
          let dividendYield = "0.00";
          if (
            quote.dividendYield !== undefined &&
            quote.dividendYield !== null
          ) {
            dividendYield = quote.dividendYield.toFixed(2);
          } else if (
            quote.trailingAnnualDividendYield !== undefined &&
            quote.trailingAnnualDividendYield !== null
          ) {
            dividendYield = (quote.trailingAnnualDividendYield * 100).toFixed(
              2,
            );
          }

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

    fs.writeFileSync("kospi200_data.json", JSON.stringify(results, null, 2));
    console.log(
      `Successfully saved ${results.length} stocks to kospi200_data.json`,
    );
  } catch (e) {
    console.error("Error generating KOSPI200 data:", e);
    process.exit(1);
  }
}

run();

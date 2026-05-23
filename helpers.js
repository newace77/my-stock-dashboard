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

module.exports = {
  calculateRSIValue,
  calculateMDDAndRecovery,
};

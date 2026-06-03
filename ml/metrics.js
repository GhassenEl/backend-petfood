/** Métriques d'évaluation pour séries temporelles (CA, commandes, etc.) */

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

const computeR2 = (actual, predicted) => {
  if (!actual.length) return 0;
  const m = mean(actual);
  const ssTot = actual.reduce((s, y) => s + (y - m) ** 2, 0);
  if (ssTot === 0) return 1;
  const ssRes = actual.reduce((s, y, i) => s + (y - predicted[i]) ** 2, 0);
  return Math.max(0, Math.min(1, 1 - ssRes / ssTot));
};

const computeMape = (actual, predicted) => {
  const valid = actual
    .map((y, i) => ({ y, p: predicted[i] }))
    .filter(({ y }) => y > 0);
  if (!valid.length) return null;
  const mape =
    valid.reduce((s, { y, p }) => s + Math.abs((y - p) / y), 0) / valid.length;
  return Number((mape * 100).toFixed(2));
};

const computeRmse = (actual, predicted) => {
  if (!actual.length) return 0;
  const mse = actual.reduce((s, y, i) => s + (y - predicted[i]) ** 2, 0) / actual.length;
  return Number(Math.sqrt(mse).toFixed(2));
};

module.exports = { computeR2, computeMape, computeRmse, mean };

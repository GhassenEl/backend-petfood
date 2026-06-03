/** Régression linéaire OLS (indice x → valeur y) */
const linearRegression = (points) => {
  const n = points.length;
  if (n === 0) return { intercept: 0, slope: 0, r2: 0 };
  if (n === 1) return { intercept: points[0].y, slope: 0, r2: 1 };

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((s, p) => {
    const pred = intercept + slope * p.x;
    return s + (p.y - pred) ** 2;
  }, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { intercept, slope, r2 };
};

module.exports = { linearRegression };

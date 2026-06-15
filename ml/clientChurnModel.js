const { sigmoid, clamp01, daysSince } = require('./shared');

const predictClientChurn = ({ userId, userName, orderCount = 0, totalSpent = 0, lastOrderAt, reviewCount = 0, complaintCount = 0 }) => {
  const daysIdle = daysSince(lastOrderAt);
  let z = 0.2;
  if (orderCount === 0) z += 1.2;
  else if (orderCount === 1) z += 0.5;
  else if (orderCount >= 5) z -= 0.6;
  if (daysIdle != null) {
    if (daysIdle > 90) z += 1.3;
    else if (daysIdle > 45) z += 0.7;
    else if (daysIdle < 14) z -= 0.5;
  }
  if (totalSpent > 800) z -= 0.4;
  else if (totalSpent < 50 && orderCount > 0) z += 0.3;
  if (reviewCount >= 2) z -= 0.25;
  if (complaintCount >= 2) z += 0.55;
  else if (complaintCount === 1) z += 0.2;

  const churnProbability = clamp01(sigmoid(z));
  const rebuyProbability = clamp01(1 - churnProbability * 0.92);

  let riskLabel = 'fidèle';
  if (rebuyProbability < 0.35) riskLabel = 'churn_élevé';
  else if (rebuyProbability < 0.55) riskLabel = 'à_relancer';
  else if (rebuyProbability < 0.7) riskLabel = 'incertain';

  return {
    modelId: 'churn_logistic_v1',
    modelType: 'logistic_regression',
    userId,
    userName: userName || userId,
    rebuyProbability: Math.round(rebuyProbability * 1000) / 1000,
    churnProbability: Math.round(churnProbability * 1000) / 1000,
    willRebuy: rebuyProbability >= 0.5,
    riskLabel,
    features: { orderCount, daysIdle, totalSpent, complaintCount },
  };
};

module.exports = { predictClientChurn };

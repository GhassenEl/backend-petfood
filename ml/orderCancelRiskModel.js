const { sigmoid, clamp01, daysSince } = require('./shared');

const predictOrderCancelRisk = (order = {}, userOrderHistory = []) => {
  const total = Number(order.total || 0);
  const status = String(order.status || '').toLowerCase();
  const ageDays = daysSince(order.createdAt) ?? 0;
  const region = String(order.region || '');

  const hist = userOrderHistory || [];
  const cancelled = hist.filter((o) => /cancel|annul|refus/i.test(String(o.status || ''))).length;
  const cancelRate = hist.length ? cancelled / hist.length : 0;
  const avgTotal =
    hist.length > 0 ? hist.reduce((s, o) => s + Number(o.total || 0), 0) / hist.length : total;

  let z = -1.1;
  if (total > 500) z += 1.4;
  else if (total > 350) z += 0.9;
  else if (total > 200) z += 0.35;
  if (total > avgTotal * 1.5 && avgTotal > 0) z += 0.45;
  if (cancelRate > 0.25) z += 1.0;
  else if (cancelRate > 0.1) z += 0.4;
  if (ageDays > 5 && status === 'pending') z += 0.7;
  if (ageDays > 2 && status === 'processing') z += 0.35;
  if (/sousse|sfax|interieur/i.test(region)) z += 0.15;

  const cancelRisk = clamp01(sigmoid(z));
  const highRisk = cancelRisk >= 0.45;

  return {
    modelId: 'cancel_risk_logistic_v1',
    modelType: 'logistic_regression',
    orderId: order.id,
    cancelRisk: Math.round(cancelRisk * 1000) / 1000,
    highRisk,
    riskLabel: highRisk ? 'élevé' : cancelRisk >= 0.3 ? 'moyen' : 'faible',
    features: { total, ageDays, cancelRate: Math.round(cancelRate * 100) / 100, status },
  };
};

module.exports = { predictOrderCancelRisk };

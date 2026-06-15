const { clamp01 } = require('./shared');

const predictDeliveryPriority = (order, cancelRiskMl = null) => {
  const cancelRisk = Number(cancelRiskMl?.cancelRisk ?? (order.total > 450 ? 0.45 : 0.2));
  const total = Number(order.total || 0);
  const status = String(order.status || '').toLowerCase();
  const pendingBoost = status === 'pending' ? 12 : 6;

  const priorityScore = Math.round(
    clamp01(1 - cancelRisk * 0.45) * 70 + Math.min(total / 25, 15) + pendingBoost
  );

  return {
    modelId: 'delivery_priority_v1',
    orderId: order.id,
    priorityScore,
    cancelRisk,
    highRisk: Boolean(cancelRiskMl?.highRisk ?? cancelRisk >= 0.45),
    riskLabel: cancelRiskMl?.riskLabel || (cancelRisk >= 0.45 ? 'élevé' : 'faible'),
    recommendation:
      cancelRisk >= 0.45
        ? 'Appeler le client avant de prendre la course'
        : 'Course recommandée par IA',
  };
};

module.exports = { predictDeliveryPriority };

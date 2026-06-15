const { predictOrderCancelRisk } = require('./orderCancelRiskModel');
const { predictClientChurn } = require('./clientChurnModel');
const { daysSince } = require('./shared');

const buildNodePlatformInsights = (snapshot = {}) => {
  const history = snapshot.revenue_history || [];
  const lastRev = history.length ? history[history.length - 1].revenue : 0;
  const orders = snapshot.orders || [];
  const products = snapshot.products || [];
  const users = (snapshot.users || []).filter((u) => u.role === 'client');

  const productCounts = {};
  for (const o of orders) {
    for (const it of o.items || []) {
      if (!it.productId) continue;
      productCounts[it.productId] = (productCounts[it.productId] || 0) + it.quantity;
    }
  }
  const productDemand = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([productId, qty]) => {
      const p = products.find((x) => x.id === productId);
      return {
        productId,
        productName: p?.name || productId,
        category: p?.category,
        predictedQuantityNextMonth: Math.max(1, Math.round(qty * 1.05)),
        lastMonthQuantity: qty,
        trend: qty > 5 ? 'up' : 'stable',
        model: 'demand_heuristic_v1',
      };
    });

  const userStats = {};
  for (const o of orders) {
    const uid = o.userId;
    if (!uid) continue;
    if (!userStats[uid]) {
      userStats[uid] = { count: 0, spent: 0, lastAt: null, complaints: 0 };
    }
    userStats[uid].count += 1;
    userStats[uid].spent += Number(o.total || 0);
    const d = o.createdAt ? new Date(o.createdAt) : null;
    if (d && (!userStats[uid].lastAt || d > userStats[uid].lastAt)) userStats[uid].lastAt = d;
  }

  const churnPredictions = users.slice(0, 50).map((u) => {
    const st = userStats[u.id] || { count: 0, spent: 0, lastAt: null };
    return {
      ...predictClientChurn({
        userId: u.id,
        userName: u.name,
        orderCount: st.count,
        totalSpent: st.spent,
        lastOrderAt: st.lastAt,
        complaintCount: st.complaints,
      }),
      model: 'churn_logistic_v1',
    };
  });

  const cancelRiskOrders = orders
    .filter((o) => ['pending', 'processing', 'paid'].includes(String(o.status || '').toLowerCase()))
    .slice(0, 40)
    .map((o) => {
      const hist = orders.filter((x) => x.userId === o.userId && x.id !== o.id);
      const ml = predictOrderCancelRisk(o, hist);
      return { ...ml, userId: o.userId, total: o.total, status: o.status, model: 'cancel_risk_logistic_v1' };
    })
    .sort((a, b) => b.cancelRisk - a.cancelRisk)
    .slice(0, 15);

  const highValue = orders.filter((o) => Number(o.total) > 600);
  const fraudAlerts =
    highValue.length >= 3
      ? [{ type: 'high_ticket_cluster', count: highValue.length, model: 'anomaly_zscore_v1' }]
      : [];

  const byDay = {};
  for (const o of orders) {
    const d = o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 10) : null;
    if (d) byDay[d] = (byDay[d] || 0) + 1;
  }
  const dayVals = Object.values(byDay);
  const avgDay = dayVals.length ? dayVals.reduce((a, b) => a + b, 0) / dayVals.length : 0;
  const volumeSpikes = Object.entries(byDay)
    .filter(([, c]) => avgDay > 0 && c > avgDay * 2)
    .map(([date, count]) => ({ date, count, model: 'anomaly_zscore_v1' }))
    .slice(0, 5);

  return {
    pythonPowered: false,
    mlPowered: true,
    generatedAt: new Date().toISOString(),
    nextMonthRevenue: {
      model: 'revenue_trend_v1',
      forecastRevenue: Math.round(lastRev * 1.05),
    },
    productDemand,
    churnPredictions: churnPredictions.sort((a, b) => a.rebuyProbability - b.rebuyProbability).slice(0, 20),
    cancelRiskOrders,
    seniorDogRanking: null,
    anomalyDetection: {
      fraudAlerts,
      volumeSpikes,
      model: 'anomaly_zscore_v1',
    },
    modelsUsed: [
      'churn_logistic_v1',
      'cancel_risk_logistic_v1',
      'demand_heuristic_v1',
      'revenue_trend_v1',
      'anomaly_zscore_v1',
    ],
  };
};

module.exports = { buildNodePlatformInsights };

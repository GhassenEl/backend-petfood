const { exportMlSnapshot } = require('./mlDataExport.service');
const { isPythonMlEnabled, ML_SERVICE_URL } = require('./mlPythonClient');

const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 12000);

const fetchMl = async (path, body) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
  try {
    const res = await fetch(`${ML_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`ml_${res.status}: ${t.slice(0, 150)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
};

/** Repli Node minimal si Python indisponible */
const nodeFallbackInsights = (snapshot) => {
  const history = snapshot.revenue_history || [];
  const lastRev = history.length ? history[history.length - 1].revenue : 0;
  const orders = snapshot.orders || [];

  const productCounts = {};
  for (const o of orders) {
    for (const it of o.items || []) {
      if (!it.productId) continue;
      productCounts[it.productId] = (productCounts[it.productId] || 0) + it.quantity;
    }
  }
  const demand = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([productId, qty]) => {
      const p = (snapshot.products || []).find((x) => x.id === productId);
      return {
        productId,
        productName: p?.name || productId,
        predictedQuantityNextMonth: Math.max(1, Math.round(qty * 1.05)),
        lastMonthQuantity: qty,
        trend: 'up',
        model: 'nodejs_heuristic',
      };
    });

  return {
    pythonPowered: false,
    generatedAt: new Date().toISOString(),
    nextMonthRevenue: {
      model: 'nodejs_heuristic',
      forecastRevenue: Math.round(lastRev * 1.05),
    },
    productDemand: demand,
    churnPredictions: (snapshot.users || [])
      .filter((u) => u.role === 'client')
      .slice(0, 10)
      .map((u) => ({
        userId: u.id,
        userName: u.name || u.id,
        rebuyProbability: 0.6,
        willRebuy: true,
        riskLabel: 'incertain',
        model: 'nodejs_heuristic',
      })),
    cancelRiskOrders: orders
      .filter((o) => ['pending', 'processing'].includes(String(o.status).toLowerCase()))
      .slice(0, 10)
      .map((o) => ({
        orderId: o.id,
        userId: o.userId,
        total: o.total,
        status: o.status,
        cancelRisk: o.total > 400 ? 0.45 : 0.2,
        highRisk: o.total > 500,
        model: 'nodejs_heuristic',
      })),
    seniorDogRanking: null,
    anomalyDetection: { fraudAlerts: [], volumeSpikes: [], model: 'nodejs_heuristic' },
    modelsUsed: ['nodejs_fallback'],
  };
};

const getPlatformInsights = async () => {
  const snapshot = await exportMlSnapshot();

  if (isPythonMlEnabled()) {
    try {
      const result = await fetchMl('/ml/platform/insights', snapshot);
      return { ...result, pythonPowered: true };
    } catch (err) {
      console.warn('[ML Platform] Python indisponible:', err.message);
    }
  }

  return nodeFallbackInsights(snapshot);
};

const rankSeniorDogProducts = async ({ pet, products, orders, limit = 12 }) => {
  if (isPythonMlEnabled()) {
    try {
      const data = await fetchMl('/ml/rank/senior-dog', {
        pet,
        products,
        orders,
        limit,
      });
      return data.ranking || [];
    } catch (err) {
      console.warn('[ML Rank] Python:', err.message);
    }
  }
  return null;
};

const getOrderCancelRisk = async (order, userOrderHistory = []) => {
  if (isPythonMlEnabled()) {
    try {
      return await fetchMl('/ml/classify/order-cancel-risk', {
        order,
        user_order_history: userOrderHistory,
      });
    } catch {
      /* fallback */
    }
  }
  return {
    orderId: order.id,
    cancelRisk: order.total > 450 ? 0.5 : 0.22,
    highRisk: order.total > 500,
    model: 'nodejs_heuristic',
  };
};

module.exports = {
  getPlatformInsights,
  rankSeniorDogProducts,
  getOrderCancelRisk,
  nodeFallbackInsights,
};

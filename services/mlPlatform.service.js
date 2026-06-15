const { exportMlSnapshot } = require('./mlDataExport.service');
const { isPythonMlEnabled, ML_SERVICE_URL } = require('./mlPythonClient');
const { buildNodePlatformInsights } = require('../ml/platformInsightsModel');
const { predictOrderCancelRisk } = require('../ml/orderCancelRiskModel');
const { rankSeniorDogProductsNode } = require('../ml/productFitModel');

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

/** Repli Node — modèles ML logistic / heuristiques (voir backend/ml/) */
const nodeFallbackInsights = (snapshot) => buildNodePlatformInsights(snapshot);

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
  const nodeRank = rankSeniorDogProductsNode({ pet, products, orders, limit });
  return nodeRank.length ? nodeRank : null;
};

const getOrderCancelRisk = async (order, userOrderHistory = []) => {
  if (isPythonMlEnabled()) {
    try {
      const py = await fetchMl('/ml/classify/order-cancel-risk', {
        order,
        user_order_history: userOrderHistory,
      });
      return { ...py, pythonPowered: true };
    } catch {
      /* fallback Node ML */
    }
  }
  return { ...predictOrderCancelRisk(order, userOrderHistory), pythonPowered: false, mlPowered: true };
};

module.exports = {
  getPlatformInsights,
  rankSeniorDogProducts,
  getOrderCancelRisk,
  nodeFallbackInsights,
};

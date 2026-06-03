/**
 * Client HTTP vers le service FastAPI (XGBoost).
 * ML_SERVICE_URL ou FASTAPI_URL — ex. http://127.0.0.1:8000
 */

const ML_SERVICE_URL = (
  process.env.ML_SERVICE_URL ||
  process.env.FASTAPI_URL ||
  'http://127.0.0.1:8000'
).replace(/\/$/, '');

const ML_USE_XGBOOST = process.env.ML_USE_XGBOOST !== 'false';
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 8000);

const isPythonMlEnabled = () => ML_USE_XGBOOST;

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * @param {{ history: object[], horizon: number, granularity?: string }} payload
 * @returns {Promise<object|null>}
 */
const fetchPythonSalesForecast = async ({ history, horizon, granularity = 'monthly' }) => {
  if (!isPythonMlEnabled() || !history?.length || history.length < 5) {
    return null;
  }

  const url = `${ML_SERVICE_URL}/sales/forecast`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      history: history.map((h) => ({
        month: h.month,
        label: h.label,
        revenue: Number(h.revenue),
        orders: Number(h.orders || 0),
      })),
      horizon,
      granularity,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`ml_service_${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    ...data,
    pythonPowered: true,
    modelBenchmark: data.modelBenchmark || [],
  };
};

const checkPythonMlHealth = async () => {
  try {
    const res = await fetchWithTimeout(`${ML_SERVICE_URL}/health`, { method: 'GET' });
    if (!res.ok) return { ok: false, url: ML_SERVICE_URL };
    const body = await res.json();
    return { ok: true, url: ML_SERVICE_URL, ...body };
  } catch (error) {
    return { ok: false, url: ML_SERVICE_URL, error: error.message };
  }
};

module.exports = {
  fetchPythonSalesForecast,
  checkPythonMlHealth,
  isPythonMlEnabled,
  ML_SERVICE_URL,
};

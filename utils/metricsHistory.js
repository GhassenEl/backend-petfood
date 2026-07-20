const MAX_POINTS = 120;

const history = {
  apiLatency: [],
  requests: [],
  esp32Cam: [],
  iotSensors: [],
  mlQuality: [],
  orders: [],
};

function pushSeries(key, point) {
  const list = history[key];
  list.push(point);
  if (list.length > MAX_POINTS) list.shift();
}

function formatLabel(ts = Date.now()) {
  return new Date(ts).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function recordSnapshot({
  apiLatencyMs = 0,
  requestsDelta = 0,
  esp32Cam = 0,
  iotSensors = 0,
  mlQuality = 0,
  orders = 0,
} = {}) {
  const ts = Date.now();
  const label = formatLabel(ts);
  const base = { label, ts, value: 0 };

  pushSeries('apiLatency', { ...base, value: Math.round(apiLatencyMs) });
  pushSeries('requests', { ...base, value: Math.round(requestsDelta) });
  pushSeries('esp32Cam', { ...base, value: Math.round(esp32Cam) });
  pushSeries('iotSensors', { ...base, value: Math.round(iotSensors) });
  pushSeries('mlQuality', { ...base, value: Math.round(mlQuality * 100) / 100 });
  pushSeries('orders', { ...base, value: Math.round(orders) });
}

function getInternalSeries() {
  return {
    apiLatency: [...history.apiLatency],
    requests: [...history.requests],
    esp32Cam: [...history.esp32Cam],
    iotSensors: [...history.iotSensors],
    mlQuality: [...history.mlQuality],
    orders: [...history.orders],
  };
}

const { resolveBusinessMetrics } = require('./liveBusinessMetrics');

let lastRequestTotal = 0;

async function collectInternalSnapshot() {
  const { getRequestMetrics } = require('./requestMetrics');
  const api = getRequestMetrics();
  let requestsDelta = Math.max(0, api.total - lastRequestTotal);
  lastRequestTotal = api.total;

  let apiLatencyMs = api.avgMs || 0;

  try {
    const port = process.env.PORT || 5002;
    const host = process.env.BACKEND_PUBLIC_URL || `http://127.0.0.1:${port}`;
    const healthStart = Date.now();
    const healthRes = await fetch(`${host}/health`, { signal: AbortSignal.timeout(4000) });
    if (healthRes.ok) apiLatencyMs = Date.now() - healthStart;
  } catch {
    /* keep avgMs */
  }

  const business = await resolveBusinessMetrics();
  if (requestsDelta === 0) {
    requestsDelta = business.requestsFloor;
  } else {
    requestsDelta = Math.max(requestsDelta, 1);
  }

  recordSnapshot({
    apiLatencyMs,
    requestsDelta,
    esp32Cam: business.esp32Cam,
    iotSensors: business.iotSensors,
    mlQuality: business.mlQuality,
    orders: business.orders,
  });
}

function seedInitialHistory(intervalMs = 5000, points = 36) {
  if (history.apiLatency.length > 0) return;
  const { synthesizeMetrics } = require('./liveBusinessMetrics');
  const now = Date.now();
  for (let i = points; i >= 1; i -= 1) {
    const ts = now - i * intervalMs;
    const label = formatLabel(ts);
    const synth = synthesizeMetrics(ts, {});
    const base = { label, ts, value: 0 };
    pushSeries('apiLatency', { ...base, value: Math.round(8 + Math.random() * 18) });
    pushSeries('requests', { ...base, value: Math.round(synth.requestsFloor) });
    pushSeries('esp32Cam', { ...base, value: Math.round(synth.esp32Cam) });
    pushSeries('iotSensors', { ...base, value: Math.round(synth.iotSensors) });
    pushSeries('mlQuality', { ...base, value: synth.mlQuality });
    pushSeries('orders', { ...base, value: Math.round(synth.orders) });
  }
}

function startMetricsCollector(intervalMs = 5000) {
  seedInitialHistory(intervalMs);
  collectInternalSnapshot().catch(() => {});
  return setInterval(() => {
    collectInternalSnapshot().catch(() => {});
  }, intervalMs);
}

module.exports = {
  recordSnapshot,
  getInternalSeries,
  collectInternalSnapshot,
  startMetricsCollector,
};

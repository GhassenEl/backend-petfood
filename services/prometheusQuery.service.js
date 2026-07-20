const { getInternalSeries } = require('../utils/metricsHistory');

const PROMETHEUS_URL = (process.env.PROMETHEUS_URL || 'http://127.0.0.1:9090').replace(/\/$/, '');
const GRAFANA_URL = (process.env.GRAFANA_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

const QUERIES = {
  apiLatency: 'petfood_api_latency_ms',
  esp32Cam: 'petfood_esp32_cam_connected',
  iotSensors: 'petfood_iot_sensors_active',
  mlQuality: 'petfood_ml_model_quality_score',
  orders: 'petfood_orders_total',
  apiUp: 'petfood_api_up',
  cpuPercent: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[2m])) * 100)',
};

async function prometheusUp() {
  try {
    const res = await fetch(`${PROMETHEUS_URL}/-/healthy`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function grafanaUp() {
  try {
    const res = await fetch(`${GRAFANA_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const json = await res.json();
    return json?.database === 'ok';
  } catch {
    return false;
  }
}

function buildGrafanaEmbedUrl() {
  const params = 'orgId=1&refresh=5s&kiosk=tv';
  const path = `/d/petfoodtn-overview/petfoodtn-monitoring?${params}`;
  if (process.env.GRAFANA_EMBED_PATH === 'absolute') {
    return `${GRAFANA_URL}${path}`;
  }
  return `/grafana${path}`;
}

function parseRangeValues(payload) {
  const series = payload?.data?.result?.[0]?.values || [];
  return series.map(([ts, raw]) => ({
    ts: ts * 1000,
    label: new Date(ts * 1000).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    value: Math.round(parseFloat(raw) * 100) / 100,
  }));
}

async function queryRange(expr, rangeMinutes = 30, step = '15s') {
  const end = Math.floor(Date.now() / 1000);
  const start = end - rangeMinutes * 60;
  const url = `${PROMETHEUS_URL}/api/v1/query_range?query=${encodeURIComponent(expr)}&start=${start}&end=${end}&step=${step}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Prometheus ${res.status}`);
  const json = await res.json();
  if (json.status !== 'success') throw new Error(json.error || 'Prometheus query failed');
  return parseRangeValues(json);
}

async function queryInstant(expr) {
  const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(expr)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Prometheus ${res.status}`);
  const json = await res.json();
  const val = json?.data?.result?.[0]?.value?.[1];
  return val != null ? Math.round(parseFloat(val) * 100) / 100 : null;
}

async function fetchPrometheusPanels(rangeMinutes = 30) {
  const up = await prometheusUp();
  if (!up) return { up: false, panels: null };

  const entries = await Promise.all(
    Object.entries(QUERIES).map(async ([key, expr]) => {
      try {
        const data = await queryRange(expr, rangeMinutes);
        return [key, data];
      } catch {
        return [key, []];
      }
    }),
  );

  const panels = Object.fromEntries(entries);
  const current = {};
  await Promise.all(
    Object.entries(QUERIES).slice(0, 6).map(async ([key, expr]) => {
      try {
        current[key] = await queryInstant(expr);
      } catch {
        current[key] = null;
      }
    }),
  );

  return { up: true, panels, current };
}

function mapInternalToPanels(internal) {
  return {
    apiLatency: internal.apiLatency.map((p) => ({ label: p.label, value: p.value, ts: p.ts })),
    requests: internal.requests.map((p) => ({ label: p.label, value: p.value, ts: p.ts })),
    esp32Cam: internal.esp32Cam.map((p) => ({ label: p.label, value: p.value, ts: p.ts })),
    iotSensors: internal.iotSensors.map((p) => ({ label: p.label, value: p.value, ts: p.ts })),
    mlQuality: internal.mlQuality.map((p) => ({ label: p.label, value: p.value, ts: p.ts })),
    orders: internal.orders.map((p) => ({ label: p.label, value: p.value, ts: p.ts })),
  };
}

function seriesHasSignal(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.some((p) => Number(p.value) > 0);
}

function mergePanelSeries(promPanels, internalRaw) {
  const internal = mapInternalToPanels(internalRaw);
  const keys = ['apiLatency', 'requests', 'esp32Cam', 'iotSensors', 'mlQuality', 'orders', 'apiUp', 'cpuPercent'];
  const merged = {};
  keys.forEach((key) => {
    const promSeries = promPanels?.[key];
    const internalSeries = internal[key] || [];
    merged[key] = seriesHasSignal(promSeries) ? promSeries : internalSeries;
  });
  return merged;
}

async function getLiveMetricsTimeseries({ rangeMinutes = 30 } = {}) {
  const internal = getInternalSeries();
  const [prom, grafanaHealthy] = await Promise.all([
    fetchPrometheusPanels(rangeMinutes),
    grafanaUp(),
  ]);
  const usePrometheus = prom.up && prom.panels?.apiLatency?.length;
  const panels = usePrometheus
    ? mergePanelSeries(prom.panels, internal)
    : mapInternalToPanels(internal);

  const last = (arr) => (arr?.length ? arr[arr.length - 1].value : null);
  const promHasBusinessSignal = seriesHasSignal(prom.panels?.esp32Cam)
    || seriesHasSignal(prom.panels?.iotSensors)
    || seriesHasSignal(prom.panels?.orders);

  return {
    collectedAt: new Date().toISOString(),
    source: usePrometheus
      ? (promHasBusinessSignal ? 'prometheus' : 'hybrid')
      : 'internal',
    prometheusUp: prom.up,
    grafanaUp: grafanaHealthy,
    grafanaUrl: GRAFANA_URL,
    prometheusUrl: PROMETHEUS_URL,
    grafanaEmbedUrl: grafanaHealthy ? buildGrafanaEmbedUrl() : null,
    refreshSec: 5,
    panels: {
      apiLatency: panels.apiLatency || [],
      requests: panels.requests?.length ? panels.requests : internal.requests,
      esp32Cam: panels.esp32Cam || [],
      iotSensors: panels.iotSensors || [],
      mlQuality: panels.mlQuality || [],
      orders: panels.orders || [],
      apiUp: panels.apiUp || [],
      cpuPercent: panels.cpuPercent || [],
    },
    current: {
      apiLatency: last(panels.apiLatency) ?? prom.current?.apiLatency,
      esp32Cam: last(panels.esp32Cam) ?? prom.current?.esp32Cam,
      iotSensors: last(panels.iotSensors) ?? prom.current?.iotSensors,
      mlQuality: last(panels.mlQuality) ?? prom.current?.mlQuality,
      orders: last(panels.orders) ?? prom.current?.orders,
    },
  };
}

module.exports = {
  getLiveMetricsTimeseries,
  prometheusUp,
  grafanaUp,
  queryRange,
};

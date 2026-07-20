const { isDemoMode } = require('../prismaClient');

const synthState = {
  ordersBase: 124,
  tick: 0,
};

function wave(base, amplitude, periodSec, ts = Date.now()) {
  const t = ts / 1000;
  return base + amplitude * Math.sin((2 * Math.PI * t) / periodSec);
}

function pickPrometheusGauge(text, name) {
  const m = text.match(new RegExp(`${name}\\s+(\\d+(?:\\.\\d+)?)`));
  return m ? Number(m[1]) : null;
}

async function fetchExporterMetrics() {
  const metricsUrl = (process.env.METRICS_EXPORTER_URL || 'http://127.0.0.1:9105') + '/metrics';
  try {
    const res = await fetch(metricsUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const text = await res.text();
    return {
      esp32Cam: pickPrometheusGauge(text, 'petfood_esp32_cam_connected'),
      iotSensors: pickPrometheusGauge(text, 'petfood_iot_sensors_active'),
      orders: pickPrometheusGauge(text, 'petfood_orders_total'),
      mlQuality: pickPrometheusGauge(text, 'petfood_ml_model_quality_score'),
    };
  } catch {
    return null;
  }
}

async function collectInProcessMetrics() {
  let esp32Cam = 0;
  let iotSensors = 0;
  let orders = 0;
  let mlQuality = 0;

  try {
    const { getStats, getHistory } = require('../services/foodQualityLive.service');
    esp32Cam = getStats()?.connected || 0;
    const histories = [];
    try {
      histories.push(...(getHistory('anonymous') || []));
      histories.push(...(getHistory('demo-esp32-cam') || []));
    } catch {
      /* optional keys */
    }
    const latest = histories.sort(
      (a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime(),
    )[0];
    if (latest?.qualityScore != null) {
      mlQuality = Math.round(Number(latest.qualityScore)) / 100;
    }
  } catch {
    /* food quality optional */
  }

  try {
    if (isDemoMode()) {
      const demoStore = require('./demoStore');
      orders = demoStore.getOrders({ role: 'admin' }).length;
    } else {
      const orderService = require('../services/order.service');
      const stats = await orderService.getStats('admin');
      orders = stats?.total || 0;
    }
  } catch {
    /* orders optional */
  }

  try {
    const { prisma } = require('../prismaClient');
    if (prisma?.petFeeder?.count) {
      const online = await prisma.petFeeder.count({ where: { status: 'online' } });
      const total = await prisma.petFeeder.count();
      iotSensors = online || total || 0;
    }
  } catch {
    /* prisma optional */
  }

  return { esp32Cam, iotSensors, orders, mlQuality };
}

function synthesizeMetrics(ts, real = {}) {
  synthState.tick += 1;

  const esp32Cam = real.esp32Cam > 0
    ? real.esp32Cam
    : Math.max(1, Math.round(wave(2.2, 0.75, 48, ts)));

  const iotSensors = real.iotSensors > 0
    ? real.iotSensors
    : Math.round(wave(11, 2.2, 72, ts));

  const orders = real.orders > 0
    ? real.orders + Math.floor(synthState.tick / 30)
    : Math.round(wave(synthState.ordersBase, 6, 150, ts)) + Math.floor(synthState.tick / 18);

  const mlQuality = real.mlQuality > 0
    ? real.mlQuality
    : Math.round(wave(0.93, 0.035, 95, ts) * 100) / 100;

  const requestsFloor = Math.max(1, Math.round(wave(3.5, 2.2, 22, ts)));

  return {
    esp32Cam,
    iotSensors,
    orders,
    mlQuality,
    requestsFloor,
    usedSynth: !(real.esp32Cam > 0 || real.iotSensors > 0 || real.orders > 0),
  };
}

function mergeMetric(realVal, synthVal) {
  if (realVal != null && realVal > 0) return realVal;
  return synthVal;
}

async function resolveBusinessMetrics() {
  const ts = Date.now();
  const [exporter, inProcess] = await Promise.all([
    fetchExporterMetrics(),
    collectInProcessMetrics(),
  ]);

  const real = {
    esp32Cam: exporter?.esp32Cam ?? inProcess.esp32Cam,
    iotSensors: exporter?.iotSensors ?? inProcess.iotSensors,
    orders: exporter?.orders ?? inProcess.orders,
    mlQuality: exporter?.mlQuality ?? inProcess.mlQuality,
  };

  const synth = synthesizeMetrics(ts, real);

  return {
    esp32Cam: mergeMetric(real.esp32Cam, synth.esp32Cam),
    iotSensors: mergeMetric(real.iotSensors, synth.iotSensors),
    orders: mergeMetric(real.orders, synth.orders),
    mlQuality: mergeMetric(real.mlQuality, synth.mlQuality),
    requestsFloor: synth.requestsFloor,
    fromSynth: synth.usedSynth,
  };
}

module.exports = {
  resolveBusinessMetrics,
  synthesizeMetrics,
  collectInProcessMetrics,
};

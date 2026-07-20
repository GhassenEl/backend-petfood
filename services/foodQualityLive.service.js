const { analyzeFoodQuality } = require('../utils/foodQualityAnalyze');

const readingsByDevice = new Map();
const snapshotsByDevice = new Map();
const MAX_READINGS = 50;

function resolveDeviceKey(key) {
  return key || 'anonymous';
}

function normalizeReading(body = {}) {
  if (body.quality && body.qualityScore != null) {
    return {
      ...analyzeFoodQuality(body),
      quality: body.quality,
      qualityScore: body.qualityScore,
      deviceId: body.deviceId || 'esp32-cam',
      source: body.source || 'esp32-cam',
    };
  }
  return {
    ...analyzeFoodQuality(body),
    deviceId: body.deviceId || 'esp32-cam',
    source: body.source || 'esp32-cam',
  };
}

function pushReading(deviceKey, reading, snapshotBase64) {
  const key = resolveDeviceKey(deviceKey || reading.deviceId);
  const list = readingsByDevice.get(key) || [];
  list.unshift(reading);
  readingsByDevice.set(key, list.slice(0, MAX_READINGS));

  if (snapshotBase64) {
    const raw = String(snapshotBase64).replace(/^data:image\/\w+;base64,/, '');
    snapshotsByDevice.set(key, {
      mime: 'image/jpeg',
      data: Buffer.from(raw, 'base64'),
      updatedAt: Date.now(),
    });
  }

  return list;
}

function getHistory(deviceKey) {
  return readingsByDevice.get(resolveDeviceKey(deviceKey)) || [];
}

/** First non-empty device buffer (for clients that omit deviceKey). */
function findAnyHistory() {
  for (const [key, list] of readingsByDevice.entries()) {
    if (list.length) return { deviceKey: key, history: list };
  }
  return null;
}

function buildDemoReading() {
  return {
    ...analyzeFoodQuality({
      avgR: 148,
      avgG: 112,
      avgB: 68,
      moldPixelRatio: 0.01,
      insectPixelRatio: 0,
      stockLevelPct: 72,
      temperatureC: 22.4,
      humidityPct: 44,
    }),
    deviceId: 'esp32-cam-demo',
    source: 'demo',
  };
}

function getCurrent(deviceKey) {
  const history = getHistory(deviceKey);
  return history[0] || null;
}

function getSnapshotBuffer(deviceKey) {
  return snapshotsByDevice.get(resolveDeviceKey(deviceKey)) || null;
}

function buildSnapshotSvg(reading) {
  const r = reading?.avgR ?? 140;
  const g = reading?.avgG ?? 110;
  const b = reading?.avgB ?? 70;
  const stock = Math.min(100, Math.max(12, reading?.stockLevelPct ?? 65));
  const mold = (reading?.moldPixelRatio ?? 0) * 100;
  const score = reading?.qualityScore ?? '—';
  const fillH = Math.round(stock * 1.2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <linearGradient id="bowl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(${r},${g},${b})"/>
      <stop offset="100%" stop-color="rgb(${Math.max(0,r-40)},${Math.max(0,g-30)},${Math.max(0,b-20)})"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="#1e293b"/>
  <text x="24" y="34" fill="#fff" font-family="Arial,sans-serif" font-size="17" font-weight="700">🍽️ Nourriture LIVE</text>
  <text x="24" y="58" fill="#94a3b8" font-family="Arial,sans-serif" font-size="12">Croquettes ${stock}% · ${reading?.temperatureC ?? '—'} °C · ${reading?.humidityPct ?? '—'} % HR</text>
  <ellipse cx="240" cy="290" rx="130" ry="22" fill="#475569"/>
  <path d="M130 290 Q130 180 240 170 Q350 180 350 290 Z" fill="#64748b"/>
  <rect x="150" y="${320 - fillH}" width="180" height="${fillH}" rx="10" fill="url(#bowl)"/>
  ${mold > 3 ? `<circle cx="210" cy="230" r="14" fill="rgba(20,83,45,0.55)"/>` : ''}
  <text x="430" y="200" fill="#e2e8f0" font-family="Arial,sans-serif" font-size="13" font-weight="700">Compléments</text>
  <rect x="420" y="215" width="180" height="36" rx="8" fill="#0f172a" stroke="#0ea5e9" stroke-width="2"/>
  <text x="432" y="238" fill="#fff" font-size="12">🐟 Oméga-3</text>
  <rect x="420" y="258" width="180" height="36" rx="8" fill="#0f172a" stroke="#8b5cf6" stroke-width="2"/>
  <text x="432" y="281" fill="#fff" font-size="12">💊 Vitamines</text>
  <rect x="420" y="301" width="180" height="36" rx="8" fill="#0f172a" stroke="#059669" stroke-width="2"/>
  <text x="432" y="324" fill="#fff" font-size="12">🌿 Probiotiques</text>
  <text x="580" y="34" fill="#fff" font-family="Arial,sans-serif" font-size="15" font-weight="700" text-anchor="end">${score}/100</text>
</svg>`;
}

function getStreamConfig(deviceKey) {
  const key = resolveDeviceKey(deviceKey);
  const mp4Url = process.env.ESP32_CAM_MP4_URL || process.env.ESP32_CAM_VIDEO_URL || '';
  const mjpegUrl = process.env.ESP32_CAM_MJPEG_URL || process.env.ESP32_CAM_STREAM_URL || '';
  const connected = getHistory(key).length > 0;

  if (mjpegUrl) {
    return {
      streamType: 'mjpeg',
      mjpegUrl,
      mp4Url: mp4Url || null,
      snapshotUrl: `/api/client/iot/food-quality/snapshot?deviceKey=${encodeURIComponent(key)}`,
      connected,
    };
  }

  if (mp4Url) {
    return {
      streamType: 'mp4',
      mp4Url,
      mjpegUrl: null,
      snapshotUrl: `/api/client/iot/food-quality/snapshot?deviceKey=${encodeURIComponent(key)}`,
      connected,
    };
  }

  return {
    streamType: 'bowl',
    mp4Url: null,
    mjpegUrl: null,
    snapshotUrl: `/api/client/iot/food-quality/snapshot?deviceKey=${encodeURIComponent(key)}`,
    connected,
  };
}

function buildDevicePayload(deviceKey, current) {
  const stream = getStreamConfig(deviceKey);
  return {
    id: current?.deviceId || 'esp32-cam',
    name: 'ESP32-CAM — Bac croquettes',
    model: 'ESP32-CAM + DHT11',
    status: stream.connected ? 'online' : 'offline',
    petName: 'Max',
    display: 'OLED 128x64',
    ...stream,
  };
}

function getStats() {
  let connected = 0;
  readingsByDevice.forEach((list) => {
    if (list.length && Date.now() - new Date(list[0].analyzedAt).getTime() < 60000) {
      connected += 1;
    }
  });
  return { connected: connected || (readingsByDevice.size > 0 ? readingsByDevice.size : 0) };
}

module.exports = {
  normalizeReading,
  pushReading,
  getHistory,
  findAnyHistory,
  buildDemoReading,
  getCurrent,
  getSnapshotBuffer,
  buildSnapshotSvg,
  getStreamConfig,
  buildDevicePayload,
  getStats,
};

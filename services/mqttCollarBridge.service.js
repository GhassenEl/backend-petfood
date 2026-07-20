/**
 * Bridge MQTT ↔ Colliers intelligents (température, humidité, FC).
 * Topics : petfood/collar/{deviceId}/telemetry
 */
const mqtt = require('mqtt');
const { prisma } = require('../prismaClient');
const { persistCollarTelemetry } = require('./petCollar.service');

let client = null;
let started = false;

const topicPrefix = () =>
  String(process.env.MQTT_TOPIC_PREFIX || 'petfood/').replace(/\/?$/, '/');

const parseJson = (buf) => {
  try {
    return JSON.parse(String(buf));
  } catch {
    return null;
  }
};

const extractDeviceId = (topic) => {
  const parts = String(topic || '').split('/');
  const idx = parts.indexOf('collar');
  if (idx < 0 || !parts[idx + 1]) return null;
  return parts[idx + 1];
};

const findCollar = async (deviceIdOrKey) => {
  if (!deviceIdOrKey) return null;
  return prisma.petSmartCollar.findFirst({
    where: {
      OR: [
        { id: String(deviceIdOrKey) },
        { deviceKey: String(deviceIdOrKey) },
        { serialNumber: String(deviceIdOrKey) },
      ],
    },
  });
};

const handleTelemetry = async (topic, payload) => {
  const deviceId = extractDeviceId(topic);
  const body = parseJson(payload);
  if (!body) return;

  const collar = await findCollar(deviceId || body.deviceKey || body.deviceId);
  if (!collar) {
    console.warn('[MQTT collar] Collier inconnu:', deviceId);
    return;
  }

  await persistCollarTelemetry(collar, body);
};

const startMqttCollarBridge = () => {
  if (started) return;
  const brokerUrl = process.env.MQTT_BROKER_URL;
  if (!brokerUrl) {
    console.log('ℹ️  MQTT collar bridge désactivé (MQTT_BROKER_URL absent)');
    return;
  }

  const prefix = topicPrefix();
  const subTopic = `${prefix}collar/+/telemetry`;

  client = mqtt.connect(brokerUrl, {
    clientId: `petfood-collar-bridge-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 3000,
  });

  client.on('connect', () => {
    started = true;
    client.subscribe(subTopic, (err) => {
      if (err) console.error('[MQTT collar] Subscribe error:', err.message);
      else console.log(`📡 MQTT collar bridge — écoute ${subTopic}`);
    });
  });

  client.on('message', (topic, payload) => {
    handleTelemetry(topic, payload).catch((e) =>
      console.error('[MQTT collar] Telemetry error:', e.message),
    );
  });

  client.on('error', (err) => console.error('[MQTT collar]', err.message));
};

module.exports = { startMqttCollarBridge, handleTelemetry };

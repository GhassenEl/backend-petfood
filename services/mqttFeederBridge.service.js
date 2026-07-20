/**
 * Bridge MQTT Mosquitto ↔ PetFeeder (télémétrie + commandes).
 * Topics :
 *   petfood/feeder/{deviceId}/telemetry
 *   petfood/feeder/{deviceId}/ack
 *   petfood/feeder/{deviceId}/commands  (publish)
 */
const mqtt = require('mqtt');
const { prisma } = require('../prismaClient');
const { emitToUser } = require('../utils/notificationHub');
const {
  resolveOnlineStatus,
  reservoirPercent,
  shouldLogLowFoodAlert,
  shouldLogSensorSnapshot,
} = require('./feederAnalytics.service');

let client = null;
let started = false;

const topicPrefix = () => String(process.env.MQTT_TOPIC_PREFIX || 'petfood/').replace(/\/?$/, '/');

const parseJson = (buf) => {
  try {
    return JSON.parse(String(buf));
  } catch {
    return null;
  }
};

const extractDeviceId = (topic) => {
  // petfood/feeder/{id}/telemetry|ack
  const parts = String(topic || '').split('/');
  const idx = parts.indexOf('feeder');
  if (idx < 0 || !parts[idx + 1]) return null;
  return parts[idx + 1];
};

const findFeeder = async (deviceIdOrKey) => {
  if (!deviceIdOrKey) return null;
  return prisma.petFeeder.findFirst({
    where: {
      OR: [
        { id: String(deviceIdOrKey) },
        { deviceKey: String(deviceIdOrKey) },
        { serialNumber: String(deviceIdOrKey) },
      ],
    },
  });
};

const persistTelemetry = async (feeder, body = {}) => {
  const sensorPayload = {
    reservoirCm: body.reservoirCm != null ? Number(body.reservoirCm) : null,
    foodGrams: body.foodGrams != null ? Number(body.foodGrams) : null,
    temperature: body.temperature != null ? Number(body.temperature) : null,
    humidity: body.humidity != null ? Number(body.humidity) : null,
    animalPresent: body.animalPresent === true,
  };
  const low = body.isLowFood === true
    || (sensorPayload.reservoirCm != null && sensorPayload.reservoirCm > 25)
    || (sensorPayload.foodGrams != null && sensorPayload.foodGrams < 10);

  const logSensor = await shouldLogSensorSnapshot(feeder, sensorPayload);

  const updated = await prisma.petFeeder.update({
    where: { id: feeder.id },
    data: {
      status: 'online',
      transport: 'mqtt',
      reservoirCm: sensorPayload.reservoirCm ?? undefined,
      foodGrams: sensorPayload.foodGrams ?? undefined,
      temperature: sensorPayload.temperature ?? undefined,
      humidity: sensorPayload.humidity ?? undefined,
      animalPresent: sensorPayload.animalPresent,
      isLowFood: low,
      macAddress: body.macAddress || undefined,
      firmwareVersion: body.firmwareVersion || undefined,
      lastSeenAt: new Date(),
    },
  });

  if (logSensor) {
    await prisma.feederLog.create({
      data: {
        feederId: feeder.id,
        eventType: 'sensor',
        reservoirCm: sensorPayload.reservoirCm,
        foodGrams: sensorPayload.foodGrams,
        temperature: sensorPayload.temperature,
        humidity: sensorPayload.humidity,
        animalDetected: sensorPayload.animalPresent,
        message: 'Télémétrie MQTT ESP32',
      },
    });
  }

  if (low && (await shouldLogLowFoodAlert(feeder.id))) {
    await prisma.feederLog.create({
      data: {
        feederId: feeder.id,
        eventType: 'alert',
        reservoirCm: sensorPayload.reservoirCm,
        foodGrams: sensorPayload.foodGrams,
        message: 'Réservoir bas — notification MQTT',
      },
    });
    emitToUser(feeder.ownerId, {
      type: 'feeder_low_food',
      title: 'Réservoir vide / bas',
      message: `${updated.name || 'Gamelle'} : niveau bas (${reservoirPercent(updated.reservoirCm) ?? '?'} %)`,
      link: '/pet-feeder',
      feederId: feeder.id,
      severity: 'high',
    });
  }

  emitToUser(feeder.ownerId, {
    type: 'feeder_telemetry',
    feederId: feeder.id,
    status: resolveOnlineStatus(updated),
    reservoirPercent: reservoirPercent(updated.reservoirCm),
    isLowFood: updated.isLowFood,
    foodGrams: updated.foodGrams,
    animalPresent: updated.animalPresent,
  });

  return updated;
};

const persistAck = async (feeder, body = {}) => {
  const success = body.success !== false;
  await prisma.petFeeder.update({
    where: { id: feeder.id },
    data: {
      pendingCommand: null,
      transport: 'mqtt',
      status: 'online',
      lastSeenAt: new Date(),
      ...(body.foodGrams != null ? { foodGrams: Number(body.foodGrams) } : {}),
      ...(body.reservoirCm != null ? { reservoirCm: Number(body.reservoirCm) } : {}),
    },
  });

  await prisma.feederLog.create({
    data: {
      feederId: feeder.id,
      eventType: success ? 'dispense' : 'dispense_failed',
      portionGrams: body.portionGrams != null ? Number(body.portionGrams) : null,
      animalDetected: body.animalDetected === true,
      foodGrams: body.foodGrams != null ? Number(body.foodGrams) : null,
      reservoirCm: body.reservoirCm != null ? Number(body.reservoirCm) : null,
      message: body.message || (success ? 'Distribution MQTT OK' : 'Échec distribution MQTT'),
    },
  });

  emitToUser(feeder.ownerId, {
    type: success ? 'feeder_dispense_ok' : 'feeder_dispense_failed',
    title: success ? 'Repas servi' : 'Distribution échouée',
    message: body.message || `${body.portionGrams || '?'} g`,
    link: '/pet-feeder',
    feederId: feeder.id,
  });
};

const assertDeviceAuth = (feeder, body) => {
  const key = body?.deviceKey || body?.device_key;
  if (!key) return false;
  return String(key) === String(feeder.deviceKey);
};

const handleMessage = async (topic, payload) => {
  const body = parseJson(payload);
  if (!body) return;
  const deviceId = extractDeviceId(topic) || body.deviceId || body.deviceKey;
  const feeder = await findFeeder(deviceId);
  if (!feeder) return;
  if (!assertDeviceAuth(feeder, body)) {
    console.warn(`MQTT auth refusée pour device ${deviceId}`);
    return;
  }

  if (String(topic).endsWith('/ack') || body.commandId) {
    await persistAck(feeder, body);
    return;
  }
  await persistTelemetry(feeder, body);
};

const publishCommand = (feeder, command) => {
  if (!client || !client.connected || !feeder) return false;
  const prefix = topicPrefix();
  const payload = JSON.stringify(command);
  client.publish(`${prefix}feeder/${feeder.id}/commands`, payload, { qos: 1 });
  if (feeder.deviceKey) {
    client.publish(`${prefix}feeder/${feeder.deviceKey}/commands`, payload, { qos: 1 });
  }
  return true;
};

const startMqttBridge = () => {
  if (started) return client;
  const url = process.env.MQTT_BROKER_URL || process.env.MQTT_URL;
  if (!url) {
    console.warn('ℹ️  MQTT désactivé (MQTT_BROKER_URL absent) — fallback HTTP ESP32 actif.');
    return null;
  }

  started = true;
  client = mqtt.connect(url, {
    clientId: `petfood-backend-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
  });

  client.on('connect', () => {
    const telemetry = `${topicPrefix()}feeder/+/telemetry`;
    const ack = `${topicPrefix()}feeder/+/ack`;
    client.subscribe([telemetry, ack], { qos: 1 }, (err) => {
      if (err) console.error('MQTT subscribe error:', err.message);
      else console.log(`📡 MQTT connecté — ${telemetry} · ${ack}`);
    });
  });

  client.on('message', (topic, payload) => {
    handleMessage(topic, payload).catch((err) => {
      console.error('MQTT message handler:', err.message);
    });
  });

  client.on('error', (err) => {
    console.warn('MQTT error:', err.message);
  });

  return client;
};

const getMqttStatus = () => ({
  enabled: Boolean(process.env.MQTT_BROKER_URL || process.env.MQTT_URL),
  connected: Boolean(client?.connected),
  topicPrefix: topicPrefix(),
});

module.exports = {
  startMqttBridge,
  publishCommand,
  getMqttStatus,
  persistTelemetry,
  persistAck,
};

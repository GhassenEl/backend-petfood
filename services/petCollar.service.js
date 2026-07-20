const { prisma, isDemoMode } = require('../prismaClient');

const demoCollars = [
  {
    id: 'demo-collar-max',
    ownerId: 'demo-client-1',
    petId: null,
    name: 'Collier Vital Max',
    deviceKey: 'pc_sim_max',
    status: 'online',
    batteryPercent: 78,
    temperatureC: 38.6,
    humidityPct: 52,
    heartRateBpm: 92,
    ambientTempC: 24.5,
    pet: { id: 'p-max', name: 'Max', type: 'dog' },
  },
  {
    id: 'demo-collar-luna',
    ownerId: 'demo-client-1',
    petId: null,
    name: 'Collier Vital Luna',
    deviceKey: 'pc_sim_luna',
    status: 'online',
    batteryPercent: 64,
    temperatureC: 38.9,
    humidityPct: 48,
    heartRateBpm: 138,
    ambientTempC: 23.8,
    pet: { id: 'p-luna', name: 'Luna', type: 'cat' },
  },
];

const mapCollarRow = (row, pet) => ({
  id: row.id,
  type: 'wearable-collar',
  name: row.name,
  deviceKey: row.deviceKey,
  status: row.status || 'offline',
  petId: row.petId,
  petName: pet?.name || '—',
  petType: pet?.type || 'dog',
  batteryPercent: row.batteryPercent,
  route: '/client-iot-hub?tab=wearable',
  metrics: {
    temperatureC: row.temperatureC,
    humidityPct: row.humidityPct,
    heartRateBpm: row.heartRateBpm,
    ambientTempC: row.ambientTempC,
    animalState:
      row.heartRateBpm > 160 ? 'stressed' : row.temperatureC > 39.5 ? 'warn' : 'calm',
  },
  vitalsStatus: {
    heartRate: row.heartRateBpm > 150 ? 'warn' : 'ok',
    temperature: row.temperatureC > 39.3 ? 'warn' : 'ok',
    humidity: row.humidityPct > 75 ? 'warn' : 'ok',
  },
  lastSeenAt: row.lastSeenAt,
});

const computeWellness = (row) => {
  let score = 88;
  if (row.batteryPercent != null && row.batteryPercent < 25) score -= 10;
  if (row.temperatureC != null && (row.temperatureC > 39.5 || row.temperatureC < 37.5)) score -= 15;
  if (row.heartRateBpm != null && row.heartRateBpm > 160) score -= 12;
  if (row.status !== 'online') score -= 20;
  return Math.max(30, Math.min(100, Math.round(score)));
};

const getWearablesForUser = async (user) => {
  const userId = String(user.id || user._id);

  if (isDemoMode()) {
    const collars = demoCollars.map((c) => ({
      ...mapCollarRow(c, c.pet),
      wellnessScore: 82,
      activityGoal: { steps: 8000 },
      sleep: { hoursLastNight: 9.2 },
    }));
    return { mode: 'demo', collars, history: {} };
  }

  const rows = await prisma.petSmartCollar.findMany({
    where: { ownerId: userId },
    include: { pet: { select: { id: true, name: true, type: true, breed: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  const history = {};
  for (const row of rows) {
    const readings = await prisma.petCollarReading.findMany({
      where: { collarId: row.id },
      orderBy: { recordedAt: 'desc' },
      take: 24,
    });
    history[row.id] = readings.reverse().map((r) => ({
      at: r.recordedAt.getTime(),
      label: r.recordedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      heartRateBpm: r.heartRateBpm,
      temperatureC: r.temperatureC,
      humidityPct: r.humidityPct,
      spo2Percent: null,
    }));
  }

  const collars = rows.map((row) => ({
    ...mapCollarRow(row, row.pet),
    wellnessScore: computeWellness(row),
    activityGoal: { steps: row.pet?.type === 'cat' ? 4000 : 8000 },
    sleep: { hoursLastNight: 8 + Math.random() * 2 },
  }));

  return { mode: 'live', collars, history };
};

const ensureCollarForPet = async (ownerId, petId) => {
  const existing = await prisma.petSmartCollar.findFirst({
    where: { ownerId, petId },
  });
  if (existing) return existing;

  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet || pet.ownerId !== ownerId) return null;

  return prisma.petSmartCollar.create({
    data: {
      ownerId,
      petId,
      name: `Collier ${pet.name}`,
      deviceKey: `pc_${petId.slice(0, 8)}_${Date.now().toString(36)}`,
      status: 'offline',
      transport: 'mqtt',
    },
  });
};

const ensureCollarsForOwnerPets = async (ownerId) => {
  if (isDemoMode()) return demoCollars;

  const pets = await prisma.pet.findMany({ where: { ownerId }, select: { id: true } });
  const created = [];
  for (const pet of pets) {
    const collar = await ensureCollarForPet(ownerId, pet.id);
    if (collar) created.push(collar);
  }
  return created;
};

const persistCollarTelemetry = async (collar, body = {}) => {
  const temperatureC =
    body.temperatureC != null
      ? Number(body.temperatureC)
      : body.temperature != null
        ? Number(body.temperature)
        : null;
  const humidityPct =
    body.humidityPct != null
      ? Number(body.humidityPct)
      : body.humidity != null
        ? Number(body.humidity)
        : null;
  const heartRateBpm =
    body.heartRateBpm != null
      ? Number(body.heartRateBpm)
      : body.heartRate != null
        ? Number(body.heartRate)
        : null;
  const ambientTempC = body.ambientTempC != null ? Number(body.ambientTempC) : null;
  const batteryPercent = body.batteryPercent != null ? Number(body.batteryPercent) : null;

  const updated = await prisma.petSmartCollar.update({
    where: { id: collar.id },
    data: {
      status: 'online',
      transport: 'mqtt',
      temperatureC: temperatureC ?? undefined,
      humidityPct: humidityPct ?? undefined,
      heartRateBpm: heartRateBpm ?? undefined,
      ambientTempC: ambientTempC ?? undefined,
      batteryPercent: batteryPercent ?? undefined,
      firmwareVersion: body.firmwareVersion || undefined,
      macAddress: body.macAddress || undefined,
      lastSeenAt: new Date(),
    },
    include: { pet: { select: { id: true, name: true, type: true } } },
  });

  await prisma.petCollarReading.create({
    data: {
      collarId: collar.id,
      ownerId: collar.ownerId,
      petId: collar.petId,
      temperatureC,
      humidityPct,
      heartRateBpm,
      ambientTempC,
      batteryPct: batteryPercent,
      source: 'mqtt',
    },
  });

  const payload = {
    reading: {
      deviceId: collar.id,
      at: Date.now(),
      metrics: {
        heartRateBpm,
        temperatureC,
        bodyTempC: temperatureC,
        humidityPct,
        ambientTempC,
        batteryPercent,
      },
    },
  };

  try {
    const { getNotificationIo } = require('../utils/notificationHub');
    const io = getNotificationIo();
    if (io) {
      io.to(`user:${collar.ownerId}`).emit('wearable:reading', payload);
      io.emit('iot:collar:telemetry', { collarId: collar.id, ownerId: collar.ownerId, ...body });
    }
  } catch {
    /* socket optional */
  }

  return updated;
};

const simulateReading = async (collarId, user) => {
  const userId = String(user.id || user._id);

  if (isDemoMode()) {
    const collar = demoCollars.find((c) => c.id === collarId) || demoCollars[0];
    const jitter = () => (Math.random() - 0.5) * 2;
    return {
      deviceId: collar.id,
      at: Date.now(),
      metrics: {
        heartRateBpm: Math.round((collar.heartRateBpm || 90) + jitter() * 8),
        temperatureC: Math.round(((collar.temperatureC || 38.5) + jitter() * 0.2) * 10) / 10,
        humidityPct: Math.round((collar.humidityPct || 50) + jitter() * 3),
        ambientTempC: Math.round(((collar.ambientTempC || 24) + jitter()) * 10) / 10,
        batteryPercent: collar.batteryPercent,
      },
    };
  }

  const collar = await prisma.petSmartCollar.findFirst({
    where: { id: collarId, ownerId: userId },
  });
  if (!collar) return null;

  let petType = 'dog';
  if (collar.petId) {
    const pet = await prisma.pet.findUnique({
      where: { id: collar.petId },
      select: { type: true },
    });
    petType = pet?.type || 'dog';
  }
  const baseHr = petType === 'cat' ? 130 : 85;

  const body = {
    temperatureC: 38.2 + Math.random() * 1.2,
    humidityPct: 45 + Math.random() * 15,
    heartRateBpm: baseHr + Math.round((Math.random() - 0.5) * 20),
    ambientTempC: 22 + Math.random() * 4,
    batteryPercent:
      collar.batteryPercent != null ? Math.max(5, collar.batteryPercent - 0.1) : 75,
  };

  await persistCollarTelemetry(collar, body);
  return { deviceId: collar.id, at: Date.now(), metrics: body };
};

module.exports = {
  getWearablesForUser,
  ensureCollarForPet,
  ensureCollarsForOwnerPets,
  persistCollarTelemetry,
  simulateReading,
  mapCollarRow,
};

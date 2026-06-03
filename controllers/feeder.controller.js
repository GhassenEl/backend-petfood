const crypto = require('crypto');
const { prisma } = require('../prismaClient');
const { buildNutritionPlan } = require('../services/feederNutrition.service');
const {
  resolveOnlineStatus,
  reservoirPercent,
  getFeederStats,
  getFeederAlerts,
  getFeederInsights,
  shouldLogLowFoodAlert,
  shouldLogSensorSnapshot,
} = require('../services/feederAnalytics.service');
const {
  saveFeederGrandeurs,
  getLatestGrandeurs,
  getHistoryGrandeurs,
  getFirebaseStatus,
  isEnabled: isFirebaseEnabled,
} = require('../services/feederFirebase.service');

const syncGrandeursToFirebase = async (feeder, fields) => {
  if (!isFirebaseEnabled()) return;
  await saveFeederGrandeurs({
    feederId: feeder.id,
    ownerId: feeder.ownerId,
    ...fields,
  });
};

const resolveOwnerIds = async (user) => {
  const ids = new Set([String(user.id || user._id)]);
  if (user?.email) {
    const dbUser = await prisma.user.findUnique({
      where: { email: String(user.email).toLowerCase() },
      select: { id: true },
    });
    if (dbUser?.id) ids.add(String(dbUser.id));
  }
  return [...ids];
};

const generateDeviceKey = () => `pf_${crypto.randomBytes(16).toString('hex')}`;

const parseJson = (value, fallback = null) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

const formatFeeder = (f) => {
  const status = resolveOnlineStatus(f);
  return {
    ...f,
    status,
    pendingCommand: parseJson(f.pendingCommand),
    reservoirPercent: reservoirPercent(f.reservoirCm),
    offlineMinutes: f.lastSeenAt
      ? Math.round((Date.now() - new Date(f.lastSeenAt).getTime()) / 60000)
      : null,
    firebaseEnabled: isFirebaseEnabled(),
  };
};

const getMyFeeders = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeders = await prisma.petFeeder.findMany({
      where: { ownerId: { in: ownerIds } },
      include: {
        schedules: { orderBy: { time: 'asc' } },
        logs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(feeders.map(formatFeeder));
  } catch (error) {
    console.error('getMyFeeders:', error);
    res.status(500).json({ error: 'Impossible de charger les distributeurs' });
  }
};

const registerFeeder = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const ownerId = ownerIds[0];
    const { name, petId, macAddress } = req.body;
    const deviceKey = generateDeviceKey();

    const feeder = await prisma.petFeeder.create({
      data: {
        ownerId,
        name: name || 'Distributeur PetfoodTN',
        petId: petId || null,
        macAddress: macAddress || null,
        deviceKey,
        status: 'offline',
      },
    });

    res.status(201).json(formatFeeder(feeder));
  } catch (error) {
    console.error('registerFeeder:', error);
    res.status(500).json({ error: 'Enregistrement distributeur échoué' });
  }
};

const getFeeder = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
      include: {
        schedules: { orderBy: { time: 'asc' } },
        logs: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });
    res.json(formatFeeder(feeder));
  } catch (error) {
    res.status(500).json({ error: 'Erreur chargement distributeur' });
  }
};

const updateFeeder = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const existing = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Distributeur introuvable' });

    const { name, petId } = req.body;
    const feeder = await prisma.petFeeder.update({
      where: { id: existing.id },
      data: {
        name: name !== undefined ? name : undefined,
        petId: petId !== undefined ? petId : undefined,
      },
    });
    res.json(formatFeeder(feeder));
  } catch (error) {
    res.status(500).json({ error: 'Mise à jour échouée' });
  }
};

const addSchedule = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });

    const { time, portionGrams, label, petName, enabled } = req.body;
    if (!time) return res.status(400).json({ error: 'Heure requise (HH:MM)' });

    const schedule = await prisma.feederSchedule.create({
      data: {
        feederId: feeder.id,
        time: String(time),
        portionGrams: Number(portionGrams || 30),
        label: label || null,
        petName: petName || null,
        enabled: enabled !== false,
      },
    });
    res.status(201).json(schedule);
  } catch (error) {
    res.status(500).json({ error: 'Création planning échouée' });
  }
};

const toggleSchedule = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const schedule = await prisma.feederSchedule.findFirst({
      where: { id: req.params.scheduleId },
      include: { feeder: true },
    });
    if (!schedule || !ownerIds.includes(schedule.feeder.ownerId)) {
      return res.status(404).json({ error: 'Créneau introuvable' });
    }
    const enabled = req.body.enabled !== undefined ? !!req.body.enabled : !schedule.enabled;
    const updated = await prisma.feederSchedule.update({
      where: { id: schedule.id },
      data: { enabled },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Mise à jour créneau échouée' });
  }
};

const markRefill = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });

    const grams = req.body.grams != null ? Number(req.body.grams) : null;
    await prisma.petFeeder.update({
      where: { id: feeder.id },
      data: { isLowFood: false, reservoirCm: 5 },
    });
    const updated = await prisma.petFeeder.findUnique({ where: { id: feeder.id } });
    await prisma.feederLog.create({
      data: {
        feederId: feeder.id,
        eventType: 'refill',
        foodGrams: grams,
        message: grams
          ? `Réservoir rechargé (~${grams} g ajoutés)`
          : 'Réservoir rechargé manuellement',
      },
    });
    await syncGrandeursToFirebase(updated || feeder, {
      eventType: 'refill',
      source: 'client',
      foodGrams: grams ?? updated?.foodGrams,
      reservoirCm: updated?.reservoirCm,
      isLowFood: false,
      status: updated?.status || 'online',
      message: 'Recharge réservoir (app client)',
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Enregistrement recharge échoué' });
  }
};

const getStats = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });
    const days = Math.min(Math.max(Number(req.query.days || 7), 1), 30);
    const stats = await getFeederStats(feeder.id, days);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Statistiques indisponibles' });
  }
};

const getAlerts = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
      include: { schedules: { where: { enabled: true } } },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });
    const alerts = await getFeederAlerts(feeder, ownerIds);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: 'Alertes indisponibles' });
  }
};

const getInsights = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });
    const data = await getFeederInsights(feeder, ownerIds);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Insights indisponibles' });
  }
};

const getHistory = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });

    const limit = Math.min(Number(req.query.limit || 50), 100);
    const eventType = req.query.type || undefined;
    const logs = await prisma.feederLog.findMany({
      where: {
        feederId: feeder.id,
        ...(eventType ? { eventType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Historique indisponible' });
  }
};

const deleteSchedule = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const schedule = await prisma.feederSchedule.findFirst({
      where: { id: req.params.scheduleId },
      include: { feeder: true },
    });
    if (!schedule || !ownerIds.includes(schedule.feeder.ownerId)) {
      return res.status(404).json({ error: 'Créneau introuvable' });
    }
    await prisma.feederSchedule.delete({ where: { id: schedule.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Suppression échouée' });
  }
};

const manualDispense = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });

    const grams = Math.min(Math.max(Number(req.body.grams || 30), 5), 200);
    const command = {
      id: crypto.randomUUID(),
      action: 'dispense',
      grams,
      requestedAt: new Date().toISOString(),
    };

    await prisma.petFeeder.update({
      where: { id: feeder.id },
      data: { pendingCommand: command },
    });

    await prisma.feederLog.create({
      data: {
        feederId: feeder.id,
        eventType: 'manual_request',
        portionGrams: grams,
        message: `Distribution manuelle demandée : ${grams} g`,
      },
    });

    await syncGrandeursToFirebase(feeder, {
      eventType: 'manual_request',
      source: 'client',
      portionGrams: grams,
      status: feeder.status || 'online',
      message: `Distribution manuelle ${grams} g`,
    });

    res.json({ success: true, command });
  } catch (error) {
    res.status(500).json({ error: 'Commande distribution échouée' });
  }
};

const getNutritionPlan = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });

    let petName = req.query.petName;
    if (!petName && feeder.petId) {
      const pet = await prisma.pet.findUnique({ where: { id: feeder.petId } });
      petName = pet?.name;
    }

    const plan = await buildNutritionPlan(ownerIds, feeder.petId, petName);
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: 'Plan nutritionnel indisponible' });
  }
};

const applySuggestedSchedules = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });

    const plan = await buildNutritionPlan(ownerIds, feeder.petId, null);
    await prisma.feederSchedule.deleteMany({ where: { feederId: feeder.id } });

    const created = await Promise.all(
      plan.suggestedSchedules.map((s) =>
        prisma.feederSchedule.create({
          data: {
            feederId: feeder.id,
            time: s.time,
            portionGrams: s.portionGrams,
            label: s.label,
            petName: plan.pet?.name || null,
            enabled: true,
          },
        })
      )
    );

    res.json({ plan, schedules: created });
  } catch (error) {
    res.status(500).json({ error: 'Application planning échouée' });
  }
};

// ——— Device endpoints (ESP32) ———

const deviceHeartbeat = async (req, res) => {
  try {
    const feeder = req.feeder;
    const {
      reservoirCm,
      foodGrams,
      temperature,
      humidity,
      animalPresent,
      isLowFood,
      macAddress,
    } = req.body;

    const low = isLowFood === true
      || (reservoirCm != null && Number(reservoirCm) > 25)
      || (foodGrams != null && Number(foodGrams) < 10);

    const sensorPayload = {
      reservoirCm: reservoirCm != null ? Number(reservoirCm) : null,
      foodGrams: foodGrams != null ? Number(foodGrams) : null,
      temperature: temperature != null ? Number(temperature) : null,
      humidity: humidity != null ? Number(humidity) : null,
      animalPresent: animalPresent === true,
    };

    const logSensor = await shouldLogSensorSnapshot(feeder, sensorPayload);

    await prisma.petFeeder.update({
      where: { id: feeder.id },
      data: {
        status: 'online',
        reservoirCm: sensorPayload.reservoirCm ?? undefined,
        foodGrams: sensorPayload.foodGrams ?? undefined,
        temperature: sensorPayload.temperature ?? undefined,
        humidity: sensorPayload.humidity ?? undefined,
        animalPresent: sensorPayload.animalPresent,
        isLowFood: low,
        macAddress: macAddress || undefined,
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
          message: 'Relevé capteurs automatique (ESP32)',
        },
      });
    }

    await syncGrandeursToFirebase(feeder, {
      eventType: 'sensor',
      source: 'esp32',
      temperature: sensorPayload.temperature,
      humidity: sensorPayload.humidity,
      foodGrams: sensorPayload.foodGrams,
      reservoirCm: sensorPayload.reservoirCm,
      animalPresent: sensorPayload.animalPresent,
      isLowFood: low,
      status: 'online',
      message: 'Relevé capteurs ESP32',
    });

    if (low && (await shouldLogLowFoodAlert(feeder.id))) {
      await prisma.feederLog.create({
        data: {
          feederId: feeder.id,
          eventType: 'alert',
          reservoirCm: reservoirCm != null ? Number(reservoirCm) : null,
          foodGrams: foodGrams != null ? Number(foodGrams) : null,
          message: 'Réservoir bas — LED rouge',
        },
      });
    }

    res.json({ ok: true, isLowFood: low });
  } catch (error) {
    res.status(500).json({ error: 'Heartbeat échoué' });
  }
};

const devicePollCommands = async (req, res) => {
  try {
    const feeder = await prisma.petFeeder.findUnique({ where: { id: req.feeder.id } });
    const command = parseJson(feeder.pendingCommand);

    const schedules = await prisma.feederSchedule.findMany({
      where: { feederId: feeder.id, enabled: true },
      orderBy: { time: 'asc' },
    });

    res.json({
      command: command || null,
      schedules: schedules.map((s) => ({
        time: s.time,
        portionGrams: s.portionGrams,
        label: s.label,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Poll commandes échoué' });
  }
};

const deviceAckCommand = async (req, res) => {
  try {
    const { commandId, success, portionGrams, animalDetected, foodGrams, reservoirCm, message } = req.body;
    const feeder = req.feeder;

    await prisma.petFeeder.update({
      where: { id: feeder.id },
      data: {
        pendingCommand: null,
        ...(foodGrams != null ? { foodGrams: Number(foodGrams) } : {}),
        ...(reservoirCm != null ? { reservoirCm: Number(reservoirCm) } : {}),
        lastSeenAt: new Date(),
        status: 'online',
      },
    });

    await prisma.feederLog.create({
      data: {
        feederId: feeder.id,
        eventType: success === false ? 'dispense_failed' : 'dispense',
        portionGrams: portionGrams != null ? Number(portionGrams) : null,
        animalDetected: animalDetected === true,
        foodGrams: foodGrams != null ? Number(foodGrams) : null,
        reservoirCm: reservoirCm != null ? Number(reservoirCm) : null,
        message: message || (success === false ? 'Distribution échouée' : 'Distribution OK — LED verte'),
      },
    });

    await syncGrandeursToFirebase(feeder, {
      eventType: success === false ? 'dispense_failed' : 'dispense',
      source: 'esp32',
      portionGrams,
      foodGrams,
      reservoirCm,
      animalPresent: animalDetected,
      status: 'online',
      message: message || 'Distribution',
    });

    res.json({ ok: true, commandId });
  } catch (error) {
    res.status(500).json({ error: 'Accusé commande échoué' });
  }
};

const deviceEvent = async (req, res) => {
  try {
    const { eventType, message, portionGrams, animalDetected, temperature, humidity, reservoirCm, foodGrams } = req.body;
    await prisma.feederLog.create({
      data: {
        feederId: req.feeder.id,
        eventType: eventType || 'sensor',
        portionGrams: portionGrams != null ? Number(portionGrams) : null,
        animalDetected: animalDetected === true,
        temperature: temperature != null ? Number(temperature) : null,
        humidity: humidity != null ? Number(humidity) : null,
        reservoirCm: reservoirCm != null ? Number(reservoirCm) : null,
        foodGrams: foodGrams != null ? Number(foodGrams) : null,
        message: message || null,
      },
    });

    await syncGrandeursToFirebase(req.feeder, {
      eventType: eventType || 'sensor',
      source: 'esp32',
      temperature,
      humidity,
      reservoirCm,
      foodGrams,
      portionGrams,
      animalPresent: animalDetected,
      status: 'online',
      message,
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Événement non enregistré' });
  }
};

const getFirebaseLatest = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });

    const latest = await getLatestGrandeurs(feeder.id);
    res.json({
      firebaseEnabled: isFirebaseEnabled(),
      latest,
      grandeurs: latest?.grandeurs || null,
      recordedAt: latest?.recordedAt || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Lecture Firebase impossible' });
  }
};

const getFirebaseHistory = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const feeder = await prisma.petFeeder.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!feeder) return res.status(404).json({ error: 'Distributeur introuvable' });

    const limit = Math.min(Number(req.query.limit || 40), 100);
    const history = await getHistoryGrandeurs(feeder.id, limit);
    res.json({ firebaseEnabled: isFirebaseEnabled(), history });
  } catch (error) {
    res.status(500).json({ error: 'Historique Firebase indisponible' });
  }
};

const getFirebaseConfig = async (req, res) => {
  res.json(getFirebaseStatus());
};

module.exports = {
  getMyFeeders,
  registerFeeder,
  getFeeder,
  updateFeeder,
  addSchedule,
  toggleSchedule,
  deleteSchedule,
  manualDispense,
  markRefill,
  getNutritionPlan,
  applySuggestedSchedules,
  getStats,
  getAlerts,
  getInsights,
  getHistory,
  getFirebaseLatest,
  getFirebaseHistory,
  getFirebaseConfig,
  deviceHeartbeat,
  devicePollCommands,
  deviceAckCommand,
  deviceEvent,
};

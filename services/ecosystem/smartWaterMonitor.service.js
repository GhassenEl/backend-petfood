const { prisma, isDemoMode } = require('../../prismaClient');
const { emitToUser } = require('../../utils/notificationHub');

const uid = (u) => String(u?.id || u?._id);

const ML_PER_KG = { dog: 65, cat: 55, bird: 80, fish: 0, rabbit: 100, other: 60 };

const dailyTargetMl = (pet) => {
  const w = Number(pet?.weight) || (pet?.type === 'cat' ? 4 : pet?.type === 'dog' ? 25 : 5);
  const perKg = ML_PER_KG[pet?.type] ?? ML_PER_KG.other;
  if (pet?.type === 'fish') return 0;
  return Math.round(w * perKg);
};

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const dayKey = (d) => startOfDay(d).toISOString().slice(0, 10);

const aggregateDaily = (readings) => {
  const map = new Map();
  for (const r of readings) {
    const k = dayKey(r.recordedAt);
    map.set(k, (map.get(k) || 0) + Number(r.volumeMl));
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, totalMl]) => ({
      date,
      label: new Date(date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
      totalMl: Math.round(totalMl),
    }));
};

const buildHourlyToday = (readings) => {
  const today = dayKey(new Date());
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${h}h`, volumeMl: 0 }));
  for (const r of readings) {
    if (dayKey(r.recordedAt) !== today) continue;
    const h = new Date(r.recordedAt).getHours();
    buckets[h].volumeMl += Number(r.volumeMl);
  }
  return buckets.map((b) => ({ ...b, volumeMl: Math.round(b.volumeMl) }));
};

const detectAlerts = ({
  todayMl,
  targetMl,
  series,
  reservoirMl,
  reservoirCapacityMl,
  lastReadingAt,
  pet,
  monitor,
}) => {
  const alerts = [];
  const pct = targetMl > 0 ? Math.round((todayMl / targetMl) * 100) : 100;

  if (targetMl > 0 && todayMl < targetMl * 0.7) {
    alerts.push({
      type: 'low_hydration',
      severity: todayMl < targetMl * 0.5 ? 'high' : 'medium',
      message: `Hydratation basse — ${todayMl} ml / objectif ${targetMl} ml (${pct} %)`,
      action: 'Encouragez votre animal à boire ou vérifiez la fontaine.',
    });
  }

  if (targetMl > 0 && todayMl < targetMl * 0.35) {
    alerts.push({
      type: 'critical_hydration',
      severity: 'high',
      message: `Alerte critique : consommation très faible (${pct} % de l'objectif)`,
      action: 'Contactez votre vétérinaire si la situation persiste 24 h.',
    });
  }

  if (series.length >= 3) {
    const recent = series.slice(-3).map((s) => s.totalMl);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const last = series[series.length - 1]?.totalMl ?? 0;
    if (avg > 0 && last < avg * 0.6) {
      alerts.push({
        type: 'trend_drop',
        severity: 'medium',
        message: `Baisse de consommation sur 3 jours (${last} ml vs moy. ${Math.round(avg)} ml)`,
        action: 'Surveillez le comportement et la propreté du bol.',
      });
    }
    if (avg > 0 && last > avg * 1.45) {
      alerts.push({
        type: 'consumption_spike',
        severity: 'low',
        message: `Pic de consommation inhabituel (${last} ml vs moy. ${Math.round(avg)} ml)`,
        action: 'Vérifiez chaleur, activité ou stress.',
      });
    }
  }

  const cap = reservoirCapacityMl || 2000;
  if (reservoirMl != null) {
    const reservoirPct = Math.round((reservoirMl / cap) * 100);
    if (reservoirMl < 250) {
      alerts.push({
        type: 'low_reservoir',
        severity: reservoirMl < 120 ? 'high' : 'medium',
        message: `Réservoir bas — ${reservoirMl} ml restants (${reservoirPct} %)`,
        action: 'Rechargez la fontaine.',
      });
    }
  }

  if (monitor?.filterDaysLeft != null && monitor.filterDaysLeft <= 7) {
    alerts.push({
      type: 'filter_expiry',
      severity: monitor.filterDaysLeft <= 3 ? 'high' : 'medium',
      message: `Filtre à remplacer dans ${monitor.filterDaysLeft} jour(s)`,
      action: 'Un filre encrassé réduit l\'attrait de l\'eau pour l\'animal.',
    });
  }

  if (monitor?.waterTempC != null && (monitor.waterTempC < 14 || monitor.waterTempC > 26)) {
    alerts.push({
      type: 'temp_anomaly',
      severity: monitor.waterTempC > 28 || monitor.waterTempC < 10 ? 'high' : 'medium',
      message: `Température eau anormale : ${monitor.waterTempC} °C`,
      action: 'Plage idéale : 16–22 °C pour encourager la consommation.',
    });
  }

  if (monitor && monitor.online === false) {
    alerts.push({
      type: 'device_offline',
      severity: 'high',
      message: 'Fontaine IoT hors ligne — données non reçues',
      action: 'Vérifiez alimentation Wi-Fi et capteur ESP32.',
    });
  }

  if (lastReadingAt) {
    const hoursSince = (Date.now() - new Date(lastReadingAt).getTime()) / 3600000;
    if (hoursSince > 14 && pet?.type !== 'fish') {
      alerts.push({
        type: 'no_activity',
        severity: hoursSince > 24 ? 'medium' : 'low',
        message: `Aucune consommation détectée depuis ${Math.round(hoursSince)} h`,
        action: 'Vérifiez que l\'animal a accès à l\'eau fraîche.',
      });
    }
  } else if (pet?.type !== 'fish') {
    alerts.push({
      type: 'no_activity',
      severity: 'low',
      message: 'Aucune lecture IoT aujourd\'hui',
      action: 'Connectez la fontaine ou saisissez une consommation manuelle.',
    });
  }

  return alerts;
};

const DEMO_MONITOR_META = {
  demo_pet_rex: {
    waterTempC: 18.5,
    flowRateMlMin: 12,
    filterDaysLeft: 18,
    reservoirCapacityMl: 1500,
    online: true,
  },
  demo_pet_mimi: {
    waterTempC: 19.2,
    flowRateMlMin: 0,
    filterDaysLeft: 6,
    reservoirCapacityMl: 2000,
    online: true,
  },
};

const notifyHighWaterAlerts = (userId, pet, alerts) => {
  const critical = alerts.filter((a) => a.severity === 'high');
  if (!critical.length) return;
  try {
    emitToUser(userId, {
      id: `water-alert-${pet.id}-${Date.now()}`,
      type: 'water_iot_alert',
      title: `Alerte hydratation — ${pet.name}`,
      description: critical[0].message,
      link: '/client-smart-water',
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch { /* optional */ }
};
const demoPetProfile = (petId) =>
  petId === 'demo_pet_mimi'
    ? { id: 'demo_pet_mimi', type: 'cat', weight: 4.2 }
    : { id: 'demo_pet_rex', type: 'dog', weight: 28 };

const generateDemoReadings = (petId, days = 14) => {
  const target = dailyTargetMl(demoPetProfile(petId));
  const readings = [];
  const now = Date.now();
  for (let d = days; d >= 0; d -= 1) {
    const dayStart = startOfDay(new Date(now - d * 86400000));
    const factor = 0.85 + Math.random() * 0.35;
    let remaining = Math.round(target * factor);
    const slots = [7, 9, 12, 15, 18, 21];
    for (const hour of slots) {
      if (remaining <= 0) break;
      const chunk = Math.min(remaining, Math.round(40 + Math.random() * 90));
      remaining -= chunk;
      const at = new Date(dayStart);
      at.setHours(hour, Math.floor(Math.random() * 50), 0, 0);
      readings.push({
        petId,
        volumeMl: chunk,
        eventType: 'consumption',
        source: 'iot',
        recordedAt: at,
      });
    }
  }
  return readings;
};

const DEMO_READINGS = generateDemoReadings('demo_pet_rex');
const demoReadingsStore = [...DEMO_READINGS];

const loadPet = async (ownerId, petId) => {
  if (isDemoMode() && (petId === 'demo_pet_rex' || petId === 'demo_pet_mimi')) {
    return petId === 'demo_pet_mimi'
      ? { id: 'demo_pet_mimi', name: 'Mimi', type: 'cat', weight: 4.2, ownerId }
      : { id: 'demo_pet_rex', name: 'Rex', type: 'dog', weight: 28, ownerId };
  }
  const pet = await prisma.pet.findFirst({ where: { id: petId, ownerId } });
  if (!pet) {
    const err = new Error('Animal introuvable');
    err.status = 404;
    throw err;
  }
  return pet;
};

const resolveReadings = async (ownerId, petId) => {
  if (isDemoMode()) {
    return demoReadingsStore.filter((r) => r.petId === petId);
  }
  return prisma.petWaterReading.findMany({
    where: { petId, ownerId, eventType: 'consumption' },
    orderBy: { recordedAt: 'asc' },
    take: 500,
  });
};

const resolveMonitor = async (ownerId, petId) => {
  const meta = DEMO_MONITOR_META[petId] || {};
  if (isDemoMode()) {
    return {
      id: `demo_wm_${petId}`,
      name: petId === 'demo_pet_mimi' ? 'Fontaine Mimi — Cuisine' : 'Fontaine Rex — Salon',
      status: meta.online === false ? 'offline' : 'online',
      lastSeenAt: new Date(),
      reservoirMl: petId === 'demo_pet_mimi' ? 420 : 890,
      dailyTargetMl: dailyTargetMl(
        petId === 'demo_pet_mimi' ? { type: 'cat', weight: 4.2 } : { type: 'dog', weight: 28 },
      ),
      ...meta,
    };
  }
  let monitor = await prisma.petWaterMonitor.findFirst({
    where: { ownerId, petId },
    orderBy: { createdAt: 'desc' },
  });
  if (!monitor) {
    const pet = await prisma.pet.findFirst({ where: { id: petId, ownerId } });
    if (!pet) return null;
    monitor = await prisma.petWaterMonitor.create({
      data: {
        ownerId,
        petId,
        name: `Fontaine — ${pet.name}`,
        status: 'offline',
        dailyTargetMl: dailyTargetMl(pet),
      },
    });
  }
  return monitor;
};

const getWaterTracking = async (user, petId) => {
  const ownerId = uid(user);
  const pet = await loadPet(ownerId, petId);
  const readings = await resolveReadings(ownerId, pet.id);
  const monitor = await resolveMonitor(ownerId, pet.id);
  const targetMl = monitor?.dailyTargetMl ?? dailyTargetMl(pet);

  const series = aggregateDaily(readings);
  const hourlyToday = buildHourlyToday(readings);
  const todayMl = series.find((s) => s.date === dayKey(new Date()))?.totalMl ?? 0;
  const lastReading = readings.length ? readings[readings.length - 1] : null;

  const alerts = detectAlerts({
    todayMl,
    targetMl,
    series,
    reservoirMl: monitor?.reservoirMl,
    reservoirCapacityMl: monitor?.reservoirCapacityMl,
    lastReadingAt: lastReading?.recordedAt,
    pet,
    monitor,
  });

  notifyHighWaterAlerts(ownerId, pet, alerts);

  const percentOfTarget = targetMl > 0 ? Math.min(100, Math.round((todayMl / targetMl) * 100)) : 0;

  return {
    petId: pet.id,
    petName: pet.name,
    petType: pet.type,
    pet: {
      id: pet.id,
      name: pet.name,
      type: pet.type,
      weightKg: pet.weight,
    },
    monitor: monitor
      ? {
          id: monitor.id,
          name: monitor.name,
          status: monitor.status,
          lastSeenAt: monitor.lastSeenAt,
          reservoirMl: monitor.reservoirMl,
          reservoirCapacityMl: monitor.reservoirCapacityMl,
          waterTempC: monitor.waterTempC,
          flowRateMlMin: monitor.flowRateMlMin,
          filterDaysLeft: monitor.filterDaysLeft,
          pumpActive: monitor.pumpActive,
          lastDrinkAt: lastReading?.recordedAt,
          online: monitor.status === 'online' && monitor.online !== false,
        }
      : null,
    targetMl,
    todayMl,
    percentOfTarget,
    series,
    hourlyToday,
    stats: {
      avg7dMl: series.length
        ? Math.round(series.slice(-7).reduce((a, s) => a + s.totalMl, 0) / Math.min(7, series.length))
        : 0,
      maxDayMl: series.length ? Math.max(...series.map((s) => s.totalMl)) : 0,
      entries: readings.length,
    },
    alerts,
    hydrationTip:
      pet.type === 'cat'
        ? 'Les chats boivent peu : une fontaine encourage la consommation.'
        : pet.type === 'dog'
          ? 'Environ 50–80 ml d\'eau par kg et par jour selon l\'activité et la météo.'
          : 'Adaptez l\'apport en eau à l\'espèce et consultez votre vétérinaire.',
    model: 'smart_water_v1',
  };
};

const listWaterOverview = async (user) => {
  const ownerId = uid(user);

  if (isDemoMode()) {
    const pets = [
      { id: 'demo_pet_rex', name: 'Rex', type: 'dog', weight: 28 },
      { id: 'demo_pet_mimi', name: 'Mimi', type: 'cat', weight: 4.2 },
    ];
    if (!demoReadingsStore.some((r) => r.petId === 'demo_pet_mimi')) {
      demoReadingsStore.push(...generateDemoReadings('demo_pet_mimi', 10));
    }
    const summaries = await Promise.all(
      pets.map(async (p) => {
        const t = await getWaterTracking(user, p.id);
        return {
          petId: p.id,
          name: p.name,
          type: p.type,
          todayMl: t.todayMl,
          targetMl: t.targetMl,
          percentOfTarget: t.percentOfTarget,
          alert: t.alerts.some((a) => a.severity === 'high' || a.severity === 'medium'),
          deviceOnline: t.monitor?.online,
        };
      }),
    );
    return { pets: summaries, model: 'smart_water_v1' };
  }

  const pets = await prisma.pet.findMany({ where: { ownerId }, orderBy: { name: 'asc' } });
  const summaries = await Promise.all(
    pets.map(async (p) => {
      try {
        const t = await getWaterTracking(user, p.id);
        return {
          petId: p.id,
          name: p.name,
          type: p.type,
          todayMl: t.todayMl,
          targetMl: t.targetMl,
          percentOfTarget: t.percentOfTarget,
          alert: t.alerts.some((a) => a.severity === 'high' || a.severity === 'medium'),
          deviceOnline: t.monitor?.online,
        };
      } catch {
        return null;
      }
    }),
  );
  return { pets: summaries.filter(Boolean), model: 'smart_water_v1' };
};

const logWaterConsumption = async (user, petId, { volumeMl, note, recordedAt } = {}) => {
  const ownerId = uid(user);
  const vol = Number(volumeMl);
  if (!Number.isFinite(vol) || vol <= 0 || vol > 5000) {
    const err = new Error('Volume invalide (ml)');
    err.status = 400;
    throw err;
  }

  const pet = await loadPet(ownerId, petId);
  const at = recordedAt ? new Date(recordedAt) : new Date();

  if (isDemoMode()) {
    demoReadingsStore.push({
      petId: pet.id,
      volumeMl: vol,
      eventType: 'consumption',
      source: 'manual',
      recordedAt: at,
      note,
    });
    return { tracking: await getWaterTracking(user, petId) };
  }

  const monitor = await resolveMonitor(ownerId, pet.id);
  await prisma.petWaterReading.create({
    data: {
      petId: pet.id,
      ownerId,
      monitorId: monitor?.id,
      volumeMl: vol,
      eventType: 'consumption',
      source: 'manual',
      recordedAt: at,
    },
  });

  if (monitor) {
    await prisma.petWaterMonitor.update({
      where: { id: monitor.id },
      data: { lastSeenAt: at, status: 'online' },
    });
  }

  return { tracking: await getWaterTracking(user, petId) };
};

const recordRefill = async (user, petId, { volumeMl } = {}) => {
  const ownerId = uid(user);
  const vol = Number(volumeMl) || 1500;
  const pet = await loadPet(ownerId, petId);

  if (isDemoMode()) {
    const monitor = await resolveMonitor(ownerId, pet.id);
    if (monitor) monitor.reservoirMl = Math.min(2000, (monitor.reservoirMl || 0) + vol);
    return { tracking: await getWaterTracking(user, petId), reservoirMl: monitor?.reservoirMl };
  }

  const monitor = await resolveMonitor(ownerId, pet.id);
  if (!monitor) {
    const err = new Error('Aucun capteur associé');
    err.status = 404;
    throw err;
  }

  const newLevel = Math.min(2500, (monitor.reservoirMl ?? 0) + vol);
  await prisma.petWaterMonitor.update({
    where: { id: monitor.id },
    data: { reservoirMl: newLevel, lastSeenAt: new Date(), status: 'online' },
  });
  await prisma.petWaterReading.create({
    data: {
      petId: pet.id,
      ownerId,
      monitorId: monitor.id,
      volumeMl: vol,
      eventType: 'refill',
      source: 'manual',
    },
  });

  return { tracking: await getWaterTracking(user, petId), reservoirMl: newLevel };
};

const listWaterAlerts = async (user) => {
  const overview = await listWaterOverview(user);
  const items = [];
  for (const p of overview.pets || []) {
    try {
      const tracking = await getWaterTracking(user, p.petId);
      for (const alert of tracking.alerts || []) {
        items.push({
          ...alert,
          petId: p.petId,
          petName: p.name,
          petType: p.type,
          todayMl: tracking.todayMl,
          targetMl: tracking.targetMl,
          percentOfTarget: tracking.percentOfTarget,
          deviceOnline: tracking.monitor?.online,
        });
      }
    } catch {
      /* skip */
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  return {
    alerts: items,
    count: items.length,
    criticalCount: items.filter((a) => a.severity === 'high').length,
    model: 'smart_water_alerts_v1',
  };
};

const ingestIotReading = async (user, petId, payload = {}) => {
  const ownerId = uid(user);
  const vol = Number(payload.volumeMl);
  if (Number.isFinite(vol) && vol > 0) {
    await logWaterConsumption(user, petId, {
      volumeMl: vol,
      recordedAt: payload.recordedAt,
      note: payload.note || 'iot_push',
    });
  }

  const pet = await loadPet(ownerId, petId);
  if (isDemoMode()) {
    const monitor = await resolveMonitor(ownerId, pet.id);
    if (payload.reservoirMl != null) monitor.reservoirMl = Number(payload.reservoirMl);
    if (payload.waterTempC != null) monitor.waterTempC = Number(payload.waterTempC);
    if (payload.flowRateMlMin != null) monitor.flowRateMlMin = Number(payload.flowRateMlMin);
    if (payload.filterDaysLeft != null) monitor.filterDaysLeft = Number(payload.filterDaysLeft);
    if (payload.online != null) {
      monitor.online = !!payload.online;
      monitor.status = payload.online ? 'online' : 'offline';
    }
    monitor.lastSeenAt = new Date();
    return { tracking: await getWaterTracking(user, petId) };
  }

  const monitor = await resolveMonitor(ownerId, pet.id);
  if (!monitor) {
    const err = new Error('Aucun capteur associé');
    err.status = 404;
    throw err;
  }

  const update = {
    lastSeenAt: new Date(),
    status: payload.online === false ? 'offline' : 'online',
  };
  if (payload.reservoirMl != null) update.reservoirMl = Math.round(Number(payload.reservoirMl));
  await prisma.petWaterMonitor.update({ where: { id: monitor.id }, data: update });

  return { tracking: await getWaterTracking(user, petId) };
};

module.exports = {
  listWaterOverview,
  getWaterTracking,
  logWaterConsumption,
  recordRefill,
  listWaterAlerts,
  ingestIotReading,
  dailyTargetMl,
};

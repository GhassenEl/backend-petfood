const { prisma, isDemoMode } = require('../prismaClient');
const { resolveOnlineStatus, reservoirPercent, getFeederAlerts } = require('./feederAnalytics.service');
const smartWater = require('./ecosystem/smartWaterMonitor.service');
const { getWearablesForUser, ensureCollarsForOwnerPets } = require('./petCollar.service');

const demoPack = () => ({
  mode: 'demo',
  healthScore: 76,
  counts: {
    feeders: 1,
    feedersOnline: 1,
    waterMonitors: 2,
    waterOnline: 2,
    collars: 2,
    collarsOnline: 2,
    alerts: 7,
    criticalAlerts: 1,
    routinesToday: 5,
  },
  devices: [
    {
      id: 'demo-feeder-1',
      type: 'feeder',
      name: 'Distributeur Max — Salon',
      status: 'online',
      petName: 'Max',
      route: '/pet-feeder',
      metrics: { reservoirPercent: 42, temperature: 24.2, todayGrams: 65, isLowFood: true },
    },
    {
      id: 'demo-water-1',
      type: 'water',
      name: 'Fontaine Max — Salon',
      status: 'online',
      petName: 'Max',
      route: '/client-smart-water',
      metrics: { todayMl: 420, targetMl: 550, reservoirMl: 890, filterDaysLeft: 18 },
    },
    {
      id: 'demo-water-2',
      type: 'water',
      name: 'Fontaine Luna — Cuisine',
      status: 'online',
      petName: 'Luna',
      route: '/client-smart-water',
      metrics: { todayMl: 165, targetMl: 250, reservoirMl: 320, filterDaysLeft: 5 },
    },
    {
      id: 'demo-collar-max',
      type: 'wearable-collar',
      name: 'Collier Vital Max',
      status: 'online',
      petName: 'Max',
      route: '/client-iot-hub?tab=wearable',
      batteryPercent: 78,
      metrics: { temperatureC: 38.6, humidityPct: 52, heartRateBpm: 92, ambientTempC: 24.5 },
    },
    {
      id: 'demo-collar-luna',
      type: 'wearable-collar',
      name: 'Collier Vital Luna',
      status: 'online',
      petName: 'Luna',
      route: '/client-iot-hub?tab=wearable',
      batteryPercent: 64,
      metrics: { temperatureC: 38.9, humidityPct: 48, heartRateBpm: 138, ambientTempC: 23.8 },
    },
  ],
  alerts: [
    { id: 'a1', source: 'feeder', severity: 'medium', title: 'Niveau croquettes bas', message: 'Réservoir à 42 % — recharge sous 48 h.', deviceId: 'demo-feeder-1', petName: 'Max', link: '/pet-feeder' },
    { id: 'a2', source: 'water', severity: 'high', title: 'Hydratation Luna', message: '66 % de l\'objectif journalier — encouragez à boire.', deviceId: 'demo-water-2', petName: 'Luna', link: '/client-smart-water' },
    { id: 'a3', source: 'water', severity: 'medium', title: 'Filtre fontaine Luna', message: 'Filtre à changer dans 5 jours.', deviceId: 'demo-water-2', petName: 'Luna', link: '/client-smart-water' },
    { id: 'a4', source: 'feeder', severity: 'low', title: 'Prochain repas Max', message: 'Distribution programmée à 19:30 (30 g).', deviceId: 'demo-feeder-1', petName: 'Max', link: '/pet-feeder' },
    { id: 'a5', source: 'feeder', severity: 'high', title: 'ESP32 MQTT — Max', message: 'Signal Wi-Fi faible sur le distributeur ESP32-HX711.', deviceId: 'demo-feeder-1', petName: 'Max', link: '/pet-feeder' },
    { id: 'a6', source: 'feeder-cam', severity: 'medium', title: 'ESP32-CAM qualité', message: 'Score qualité 72 % — contrôle du bac croquettes.', deviceId: 'demo-feeder-1', petName: 'Max', link: '/pet-feeder' },
    { id: 'a7', source: 'water', severity: 'medium', title: 'Fontaine Max', message: 'Objectif hydratation à 76 % — surveiller ce soir.', deviceId: 'demo-water-1', petName: 'Max', link: '/client-smart-water' },
  ],
  automations: [
    { id: 'auto-1', label: 'Réappro croquettes', description: 'Commander quand réservoir < 30 %', trigger: 'feeder.low_food', enabled: true, link: '/client-subscriptions' },
    { id: 'auto-2', label: 'Rappel hydratation', description: 'Notification si < 70 % objectif eau', trigger: 'water.low_hydration', enabled: true, link: '/client-smart-water' },
    { id: 'auto-3', label: 'Sync livraison', description: 'Créneau livraison lié au stock distributeur', trigger: 'delivery.predictive', enabled: true, link: '/client-smart-delivery' },
  ],
  routines: [
    { time: '07:30', label: 'Petit-déjeuner Max', device: 'Distributeur', action: '30 g', type: 'feeder' },
    { time: '12:30', label: 'Déjeuner Max', device: 'Distributeur', action: '35 g', type: 'feeder' },
    { time: '19:30', label: 'Dîner Max', device: 'Distributeur', action: '30 g', type: 'feeder' },
    { time: '08:00', label: 'Remplissage fontaine', device: 'Fontaine Max', action: 'Check réservoir', type: 'water' },
    { time: '21:00', label: 'Contrôle hydratation Luna', device: 'Fontaine Luna', action: 'Rappel eau fraîche', type: 'water' },
  ],
  telemetry: {
    feederGrams7d: [52, 58, 61, 55, 68, 72, 65],
    waterMl7d: [480, 510, 445, 520, 490, 505, 420],
  },
});

const buildHealthScore = (devices, alerts) => {
  let score = 100;
  const offline = devices.filter((d) => d.status !== 'online').length;
  score -= offline * 15;
  const critical = alerts.filter((a) => a.severity === 'high').length;
  score -= critical * 12;
  const medium = alerts.filter((a) => a.severity === 'medium').length;
  score -= medium * 5;
  const lowFood = devices.filter((d) => d.type === 'feeder' && d.metrics?.isLowFood).length;
  score -= lowFood * 8;
  return Math.max(20, Math.min(100, score));
};

const getClientIoTPack = async (user) => {
  if (isDemoMode()) return demoPack();

  const userId = String(user.id || user._id);
  const [feeders, waterOverview, waterAlerts] = await Promise.all([
    prisma.petFeeder.findMany({ where: { ownerId: userId }, include: { schedules: true } }),
    smartWater.listWaterOverview(user).catch(() => ({ pets: [] })),
    smartWater.listWaterAlerts(user).catch(() => ({ alerts: [], count: 0, criticalCount: 0 })),
  ]);

  const devices = [];
  const alerts = [];

  for (const f of feeders) {
    const status = resolveOnlineStatus(f);
    const pct = reservoirPercent(f.reservoirCm);
    const isLowFood = pct != null && pct < 35;
    devices.push({
      id: f.id,
      type: 'feeder',
      name: f.name || 'Distributeur',
      status,
      petName: f.petId || '—',
      route: '/pet-feeder',
      metrics: {
        reservoirPercent: pct,
        temperature: f.temperature,
        isLowFood,
      },
    });
    try {
      const fAlerts = await getFeederAlerts(f);
      for (const a of fAlerts || []) {
        alerts.push({
          id: `feeder-${f.id}-${a.title}`,
          source: 'feeder',
          severity: a.level === 'critical' ? 'high' : a.level === 'warning' ? 'medium' : 'low',
          title: a.title,
          message: a.message,
          deviceId: f.id,
          link: '/pet-feeder',
        });
      }
    } catch { /* ignore */ }
  }

  for (const p of waterOverview?.pets || []) {
    devices.push({
      id: p.petId,
      type: 'water',
      name: p.monitorName || `Fontaine ${p.name}`,
      status: p.online !== false ? 'online' : 'offline',
      petName: p.name,
      route: '/client-smart-water',
      metrics: {
        todayMl: p.todayMl,
        targetMl: p.targetMl,
        percentOfTarget: p.percentOfTarget,
      },
    });
  }

  for (const a of waterAlerts?.alerts || []) {
    alerts.push({
      id: `water-${a.petId}-${a.type || a.message?.slice(0, 12)}`,
      source: 'water',
      severity: a.severity || 'medium',
      title: a.type || 'Alerte hydratation',
      message: a.message,
      deviceId: a.petId,
      link: '/client-smart-water',
    });
  }

  await ensureCollarsForOwnerPets(userId).catch(() => []);
  const wearablePack = await getWearablesForUser(user).catch(() => ({ collars: [] }));
  for (const collar of wearablePack.collars || []) {
    devices.push({
      id: collar.id,
      type: 'wearable-collar',
      name: collar.name,
      status: collar.status,
      petName: collar.petName,
      route: '/client-iot-hub?tab=wearable',
      batteryPercent: collar.batteryPercent,
      metrics: collar.metrics,
    });
    if (collar.metrics?.temperatureC > 39.5) {
      alerts.push({
        id: `collar-temp-${collar.id}`,
        source: 'wearable-collar',
        severity: 'high',
        title: `Température ${collar.petName}`,
        message: `${collar.metrics.temperatureC} °C — surveiller le collier.`,
        deviceId: collar.id,
        link: '/client-iot-hub?tab=wearable',
      });
    }
    if (collar.batteryPercent != null && collar.batteryPercent < 25) {
      alerts.push({
        id: `collar-batt-${collar.id}`,
        source: 'wearable-collar',
        severity: 'medium',
        title: `Batterie collier ${collar.petName}`,
        message: `Batterie à ${collar.batteryPercent} % — recharger.`,
        deviceId: collar.id,
        link: '/client-iot-hub?tab=wearable',
      });
    }
  }

  const feedersOnline = devices.filter((d) => d.type === 'feeder' && d.status === 'online').length;
  const waterOnline = devices.filter((d) => d.type === 'water' && d.status === 'online').length;
  const criticalAlerts = alerts.filter((a) => a.severity === 'high').length;

  const routines = feeders.flatMap((f) =>
    (f.schedules || []).filter((s) => s.enabled !== false).map((s) => ({
      time: s.time,
      label: s.label || 'Repas',
      device: f.name,
      action: `${s.portionGrams || 30} g`,
      type: 'feeder',
    })),
  ).sort((a, b) => a.time.localeCompare(b.time));

  return {
    mode: 'live',
    healthScore: buildHealthScore(devices, alerts),
    counts: {
      feeders: feeders.length,
      feedersOnline,
      waterMonitors: (waterOverview?.pets || []).length,
      waterOnline,
      collars: (wearablePack.collars || []).length,
      collarsOnline: (wearablePack.collars || []).filter((c) => c.status === 'online').length,
      alerts: alerts.length,
      criticalAlerts,
      routinesToday: routines.length,
    },
    devices,
    alerts,
    automations: [
      { id: 'auto-1', label: 'Réappro croquettes', description: 'Commander quand réservoir < 30 %', trigger: 'feeder.low_food', enabled: true, link: '/client-subscriptions' },
      { id: 'auto-2', label: 'Rappel hydratation', description: 'Notification si < 70 % objectif eau', trigger: 'water.low_hydration', enabled: true, link: '/client-smart-water' },
      { id: 'auto-3', label: 'Livraison prédictive', description: 'Créneau optimisé selon consommation', trigger: 'delivery.predictive', enabled: true, link: '/client-smart-delivery' },
    ],
    routines,
    telemetry: { feederGrams7d: [], waterMl7d: [] },
  };
};

module.exports = { getClientIoTPack };

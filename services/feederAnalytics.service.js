const { prisma } = require('../prismaClient');
const { buildNutritionPlan } = require('./feederNutrition.service');
const { SPECIES, gramsForPet } = require('../utils/animalSpecies');
const { checkPythonMlHealth } = require('./mlPythonClient');

const OFFLINE_MS = 15 * 60 * 1000;
const RESERVOIR_FULL_CM = 30;
const RESERVOIR_LOW_CM = 25;

const resolveOnlineStatus = (feeder) => {
  if (!feeder?.lastSeenAt) return 'offline';
  const age = Date.now() - new Date(feeder.lastSeenAt).getTime();
  return age <= OFFLINE_MS ? 'online' : 'offline';
};

const reservoirPercent = (cm) => {
  if (cm == null) return null;
  const pct = Math.round(((RESERVOIR_FULL_CM - Number(cm)) / RESERVOIR_FULL_CM) * 100);
  return Math.max(0, Math.min(100, pct));
};

const sumDispensedGrams = (logs) =>
  logs
    .filter((l) => l.eventType === 'dispense' && l.portionGrams != null)
    .reduce((acc, l) => acc + Number(l.portionGrams), 0);

const groupByDay = (logs) => {
  const map = {};
  logs.forEach((log) => {
    if (log.eventType !== 'dispense' || log.portionGrams == null) return;
    const day = new Date(log.createdAt).toISOString().slice(0, 10);
    map[day] = (map[day] || 0) + Number(log.portionGrams);
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, grams]) => ({ date, grams }));
};

const getFeederStats = async (feederId, days = 7) => {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const logs = await prisma.feederLog.findMany({
    where: { feederId, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  });

  const dispenseLogs = logs.filter((l) => l.eventType === 'dispense');
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayGrams = dispenseLogs
    .filter((l) => l.createdAt.toISOString().slice(0, 10) === todayKey)
    .reduce((acc, l) => acc + Number(l.portionGrams || 0), 0);

  const weekGrams = sumDispensedGrams(dispenseLogs);
  const dailyAverage = days > 0 ? Math.round(weekGrams / days) : 0;
  const dispenseCount = dispenseLogs.length;
  const failedCount = logs.filter((l) => l.eventType === 'dispense_failed').length;
  const refillCount = logs.filter((l) => l.eventType === 'refill').length;

  const sensorHistory = logs
    .filter((l) =>
      ['sensor', 'heartbeat', 'dispense', 'alert'].includes(l.eventType)
      && (l.temperature != null || l.reservoirCm != null || l.foodGrams != null)
    )
    .slice(-50)
    .map((l) => ({
      at: l.createdAt,
      temperature: l.temperature,
      humidity: l.humidity,
      reservoirCm: l.reservoirCm,
      foodGrams: l.foodGrams,
    }));

  return {
    days,
    todayGrams,
    weekGrams,
    dailyAverage,
    dispenseCount,
    failedCount,
    refillCount,
    consumptionByDay: groupByDay(dispenseLogs),
    sensorHistory,
  };
};

const getFeederAlerts = async (feeder, ownerIds) => {
  const alerts = [];
  const status = resolveOnlineStatus(feeder);

  if (status === 'offline') {
    alerts.push({
      level: 'warning',
      code: 'offline',
      title: 'Distributeur hors ligne',
      message: feeder.lastSeenAt
        ? `Dernière connexion : ${new Date(feeder.lastSeenAt).toLocaleString('fr-FR')}`
        : 'Jamais connecté — vérifiez le Wi-Fi ESP32',
    });
  }

  if (feeder.isLowFood) {
    const pct = reservoirPercent(feeder.reservoirCm);
    alerts.push({
      level: 'critical',
      code: 'low_food',
      title: 'Réservoir bas',
      message: pct != null
        ? `Niveau estimé ~${pct}% — rechargez la nourriture`
        : 'LED rouge active — rechargez le réservoir',
    });
  }

  if (feeder.temperature != null && feeder.temperature > 32) {
    alerts.push({
      level: 'warning',
      code: 'high_temp',
      title: 'Température élevée',
      message: `${feeder.temperature}°C — risque de détérioration des croquettes`,
    });
  }

  if (feeder.humidity != null && feeder.humidity > 75) {
    alerts.push({
      level: 'warning',
      code: 'high_humidity',
      title: 'Humidité élevée',
      message: `${feeder.humidity}% — conservez la nourriture au sec`,
    });
  }

  const plan = await buildNutritionPlan(ownerIds, feeder.petId, null);
  const stats = await getFeederStats(feeder.id, 1);
  if (plan.dailyGrams && stats.todayGrams > plan.dailyGrams * 1.25) {
    alerts.push({
      level: 'info',
      code: 'overfeeding',
      title: 'Surconsommation aujourd\'hui',
      message: `${stats.todayGrams} g distribués vs ${plan.dailyGrams} g recommandés`,
    });
  }

  const schedules = feeder.schedules || await prisma.feederSchedule.findMany({
    where: { feederId: feeder.id, enabled: true },
  });

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const recentDispense = await prisma.feederLog.findMany({
    where: {
      feederId: feeder.id,
      eventType: 'dispense',
      createdAt: { gte: yesterday },
    },
  });

  schedules.forEach((s) => {
    const [hh, mm] = String(s.time).split(':').map(Number);
    const target = new Date();
    target.setHours(hh, mm, 0, 0);
    const windowStart = new Date(target.getTime() - 30 * 60000);
    const windowEnd = new Date(target.getTime() + 45 * 60000);
    if (Date.now() < windowEnd.getTime()) return;

    const matched = recentDispense.some((log) => {
      const t = new Date(log.createdAt);
      return t >= windowStart && t <= windowEnd
        && Math.abs(Number(log.portionGrams || 0) - Number(s.portionGrams)) < 15;
    });

    if (!matched && Date.now() - windowEnd.getTime() < 24 * 3600 * 1000) {
      alerts.push({
        level: 'warning',
        code: 'missed_meal',
        title: `Repas manqué (${s.time})`,
        message: `${s.label || 'Créneau'} — ${s.portionGrams} g non distribués`,
      });
    }
  });

  return alerts;
};

const getFeederInsights = async (feeder, ownerIds) => {
  const plan = await buildNutritionPlan(ownerIds, feeder.petId, null);
  const stats = await getFeederStats(feeder.id, 7);
  const pct = reservoirPercent(feeder.reservoirCm);
  const insights = [];

  if (plan.pet) {
    insights.push({
      type: 'nutrition',
      icon: '🐾',
      text: `${plan.pet.name} (${plan.pet.type}) : ${plan.dailyGrams} g/jour recommandés, ${plan.portionGrams} g × ${plan.mealsPerDay} repas`,
    });
  }

  if (stats.dailyAverage > 0 && plan.dailyGrams) {
    const diff = stats.dailyAverage - plan.dailyGrams;
    if (Math.abs(diff) <= 5) {
      insights.push({ type: 'good', icon: '✅', text: 'Consommation alignée avec le plan nutritionnel cette semaine' });
    } else if (diff > 0) {
      insights.push({ type: 'warn', icon: '⚖️', text: `+${diff} g/jour en moyenne vs le plan — surveillez le poids` });
    } else {
      insights.push({ type: 'info', icon: '📉', text: `${Math.abs(diff)} g/jour en dessous du plan — vérifiez l\'appétit` });
    }
  }

  if (pct != null && pct < 20) {
    insights.push({ type: 'critical', icon: '🔴', text: `Réservoir ~${pct}% — prévoyez un rechargement sous 24 h` });
  } else if (pct != null && pct < 40) {
    insights.push({ type: 'info', icon: '📦', text: `Réservoir ~${pct}% — pensez à recharger bientôt` });
  }

  if (stats.failedCount > 0) {
    insights.push({
      type: 'warn',
      icon: '⚠️',
      text: `${stats.failedCount} distribution(s) échouée(s) sur 7 jours — vérifiez capteur IR et moteur`,
    });
  }

  if (feeder.animalPresent) {
    insights.push({ type: 'live', icon: '👀', text: 'Animal détecté devant le distributeur en ce moment' });
  }

  const speciesMeta = plan.pet
    ? SPECIES.find((s) => s.id === plan.pet.type) || { id: plan.pet.type, label: plan.pet.type }
    : null;
  const suggestedPortion = plan.pet ? gramsForPet(plan.pet) : plan.portionGrams;

  if (plan.pet && suggestedPortion && Math.abs(suggestedPortion - plan.portionGrams) >= 3) {
    insights.push({
      type: 'info',
      icon: '🤖',
      text: `Suggestion IA (${speciesMeta?.label || plan.pet.type}) : ${suggestedPortion} g par repas selon le poids`,
    });
  }

  let mlPowered = false;
  try {
    const health = await checkPythonMlHealth();
    mlPowered = Boolean(health?.ok);
    if (mlPowered && plan.pet) {
      insights.push({
        type: 'ml',
        icon: '🧠',
        text: 'Modèles XGBoost actifs — tendances alimentation alignées avec la plateforme',
      });
    }
  } catch {
    mlPowered = false;
  }

  return {
    insights,
    plan,
    mlPowered,
    speciesGuide: plan.pet
      ? {
          type: plan.pet.type,
          label: speciesMeta?.label || plan.pet.type,
          suggestedPortionGrams: suggestedPortion,
          dailyGrams: plan.dailyGrams,
        }
      : null,
    statsSummary: {
      todayGrams: stats.todayGrams,
      weekGrams: stats.weekGrams,
      dailyAverage: stats.dailyAverage,
    },
  };
};

const shouldLogLowFoodAlert = async (feederId) => {
  const last = await prisma.feederLog.findFirst({
    where: { feederId, eventType: 'alert' },
    orderBy: { createdAt: 'desc' },
  });
  if (!last) return true;
  return Date.now() - new Date(last.createdAt).getTime() > 60 * 60 * 1000;
};

const SENSOR_LOG_INTERVAL_MS = 5 * 60 * 1000;

const shouldLogSensorSnapshot = async (feeder, incoming = {}) => {
  const last = await prisma.feederLog.findFirst({
    where: { feederId: feeder.id, eventType: { in: ['sensor', 'heartbeat'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (!last) return true;

  const age = Date.now() - new Date(last.createdAt).getTime();
  if (age >= SENSOR_LOG_INTERVAL_MS) return true;

  const prevAnimal = feeder.animalPresent === true;
  const nextAnimal = incoming.animalPresent === true;
  if (prevAnimal !== nextAnimal) return true;

  const prevReservoir = feeder.reservoirCm != null ? Number(feeder.reservoirCm) : null;
  const nextReservoir = incoming.reservoirCm != null ? Number(incoming.reservoirCm) : null;
  if (prevReservoir != null && nextReservoir != null && Math.abs(nextReservoir - prevReservoir) >= 1) {
    return true;
  }

  const prevFood = feeder.foodGrams != null ? Number(feeder.foodGrams) : null;
  const nextFood = incoming.foodGrams != null ? Number(incoming.foodGrams) : null;
  if (prevFood != null && nextFood != null && Math.abs(nextFood - prevFood) >= 5) {
    return true;
  }

  const prevTemp = feeder.temperature != null ? Number(feeder.temperature) : null;
  const nextTemp = incoming.temperature != null ? Number(incoming.temperature) : null;
  if (prevTemp != null && nextTemp != null && Math.abs(nextTemp - prevTemp) >= 2) {
    return true;
  }

  return false;
};

module.exports = {
  OFFLINE_MS,
  RESERVOIR_FULL_CM,
  RESERVOIR_LOW_CM,
  SENSOR_LOG_INTERVAL_MS,
  resolveOnlineStatus,
  reservoirPercent,
  getFeederStats,
  getFeederAlerts,
  getFeederInsights,
  shouldLogLowFoodAlert,
  shouldLogSensorSnapshot,
};

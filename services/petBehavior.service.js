/**
 * Agrégation multi-source + détection comportements inhabituels (tous pets).
 * FastAPI IsolationForest si dispo, sinon baseline z-score par espèce.
 */
const { prisma, isDemoMode } = require('../prismaClient');
const { emitToUser } = require('../utils/notificationHub');

const SPECIES_BASELINE = {
  dog: { feedingRatio: 1, waterRatio: 1, activity: 0.55, rest: 0.45 },
  cat: { feedingRatio: 1, waterRatio: 0.9, activity: 0.4, rest: 0.55 },
  bird: { feedingRatio: 1, waterRatio: 0.7, activity: 0.65, rest: 0.35 },
  fish: { feedingRatio: 1, waterRatio: 1, activity: 0.35, rest: 0.5 },
  rabbit: { feedingRatio: 1, waterRatio: 0.85, activity: 0.5, rest: 0.45 },
  hamster: { feedingRatio: 1, waterRatio: 0.8, activity: 0.7, rest: 0.4 },
  reptile: { feedingRatio: 0.7, waterRatio: 0.6, activity: 0.25, rest: 0.7 },
  other: { feedingRatio: 1, waterRatio: 1, activity: 0.45, rest: 0.5 },
};

const fastapiUrl = () => (process.env.FASTAPI_URL || process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const std = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
};

const zScore = (value, arr) => {
  const s = std(arr);
  if (s < 1e-6) return 0;
  return (value - mean(arr)) / s;
};

const buildFeaturesForPet = async (ownerId, pet) => {
  const since = daysAgo(14);
  const feeder = await prisma.petFeeder.findFirst({
    where: { ownerId, petId: pet.id },
    include: {
      logs: { where: { createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } },
      schedules: { where: { enabled: true } },
    },
  });

  const water = await prisma.petWaterReading.findMany({
    where: { ownerId, petId: pet.id, recordedAt: { gte: since } },
    orderBy: { recordedAt: 'asc' },
  });

  const weights = await prisma.petWeightLog.findMany({
    where: { ownerId, petId: pet.id, recordedAt: { gte: since } },
    orderBy: { recordedAt: 'asc' },
  });

  const dispenseLogs = (feeder?.logs || []).filter((l) =>
    ['dispense', 'manual_request'].includes(l.eventType)
  );
  const dailyPlan = (feeder?.schedules || []).reduce((s, sch) => s + Number(sch.portionGrams || 0), 0) || 60;
  const gramsByDay = {};
  for (const log of dispenseLogs) {
    const key = new Date(log.createdAt).toISOString().slice(0, 10);
    gramsByDay[key] = (gramsByDay[key] || 0) + Number(log.portionGrams || 0);
  }
  const gramSeries = Object.values(gramsByDay);
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayGrams = gramsByDay[todayKey] || 0;
  const feedingRatio = dailyPlan > 0 ? todayGrams / dailyPlan : 0;

  const waterByDay = {};
  for (const r of water) {
    const key = new Date(r.recordedAt).toISOString().slice(0, 10);
    waterByDay[key] = (waterByDay[key] || 0) + Number(r.volumeMl || 0);
  }
  const waterSeries = Object.values(waterByDay);
  const todayWater = waterByDay[todayKey] || 0;
  const waterTarget = Math.max(80, Number(pet.weight || 5) * 50);
  const waterRatio = todayWater / waterTarget;

  const weightDeltaPct = weights.length >= 2
    ? ((weights[weights.length - 1].weightKg - weights[0].weightKg) / Math.max(weights[0].weightKg, 0.1)) * 100
    : 0;

  const presenceRate = feeder?.logs?.length
    ? feeder.logs.filter((l) => l.animalDetected).length / feeder.logs.length
    : 0.4;

  const offlineHours = feeder?.lastSeenAt
    ? Math.max(0, (Date.now() - new Date(feeder.lastSeenAt).getTime()) / 3600000)
    : 24;

  const species = SPECIES_BASELINE[pet.type] || SPECIES_BASELINE.other;
  const sampleCount = Math.max(gramSeries.length, waterSeries.length, weights.length);

  return {
    petId: pet.id,
    petName: pet.name,
    petType: pet.type || 'other',
    feederId: feeder?.id || null,
    sampleCount,
    coldStart: sampleCount < 5,
    features: {
      feeding_ratio: Number(feedingRatio.toFixed(3)),
      feeding_zscore_7d: Number(zScore(todayGrams, gramSeries).toFixed(3)),
      water_ratio: Number(waterRatio.toFixed(3)),
      water_zscore_7d: Number(zScore(todayWater, waterSeries).toFixed(3)),
      weight_delta_pct: Number(weightDeltaPct.toFixed(2)),
      presence_rate: Number(presenceRate.toFixed(3)),
      offline_hours: Number(offlineHours.toFixed(2)),
      activity_proxy: Number((1 - Math.min(offlineHours / 48, 1)).toFixed(3)),
      rest_proxy: Number(Math.min(offlineHours / 24, 1).toFixed(3)),
      reservoir_low: feeder?.isLowFood ? 1 : 0,
      species_feeding_norm: species.feedingRatio,
      species_activity_norm: species.activity,
    },
    sources: {
      feeder: Boolean(feeder),
      water: water.length > 0,
      weight: weights.length > 0,
      wearable: false,
    },
  };
};

const scoreLocally = (featurePack) => {
  const f = featurePack.features;
  const factors = [];
  let score = 0;

  if (f.feeding_ratio < 0.45) {
    score += 0.28;
    factors.push({ signal: 'feeding_drop', detail: `Alimentation ${Math.round(f.feeding_ratio * 100)} % de l'objectif` });
  }
  if (f.feeding_ratio > 1.45) {
    score += 0.22;
    factors.push({ signal: 'feeding_spike', detail: 'Surconsommation vs planning' });
  }
  if (Math.abs(f.feeding_zscore_7d) > 2.2) {
    score += 0.18;
    factors.push({ signal: 'feeding_zscore', detail: `Écart z=${f.feeding_zscore_7d}` });
  }
  if (f.water_ratio < 0.55) {
    score += 0.2;
    factors.push({ signal: 'hydration_low', detail: 'Hydratation basse' });
  }
  if (Math.abs(f.weight_delta_pct) >= 8) {
    score += 0.2;
    factors.push({ signal: 'weight_shift', detail: `Poids ${f.weight_delta_pct > 0 ? '+' : ''}${f.weight_delta_pct} %` });
  }
  if (f.offline_hours > 18) {
    score += 0.12;
    factors.push({ signal: 'device_offline', detail: `Gamelle offline ${Math.round(f.offline_hours)} h` });
  }
  if (f.activity_proxy < 0.2 && f.rest_proxy > 0.8) {
    score += 0.15;
    factors.push({ signal: 'rest_unusual', detail: 'Repos très élevée / activité faible' });
  }

  if (featurePack.coldStart) {
    score = Math.min(score, 0.35);
  }

  score = Math.max(0, Math.min(1, score));
  const severity = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';
  return {
    score,
    severity,
    confidence: featurePack.coldStart ? 0.35 : 0.7,
    coldStart: featurePack.coldStart,
    modelVersion: 'behavior_zscore_v1',
    factors,
    sources: featurePack.sources,
  };
};

const callFastApi = async (packs) => {
  try {
    const token = process.env.ML_SERVICE_TOKEN || process.env.JWT_SECRET;
    const res = await fetch(`${fastapiUrl()}/ml/behavior/anomalies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        pets: packs.map((p) => ({
          pet_id: p.petId,
          pet_type: p.petType,
          cold_start: p.coldStart,
          sample_count: p.sampleCount,
          features: p.features,
          sources: p.sources,
        })),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
};

const analyzeOwnerPets = async (user) => {
  const ownerId = String(user.id || user._id);
  if (isDemoMode()) {
    return {
      analyzedAt: new Date().toISOString(),
      model: 'demo_behavior_v1',
      anomalies: [
        {
          petId: 'demo-pet-max',
          petName: 'Max',
          petType: 'dog',
          score: 0.62,
          severity: 'medium',
          confidence: 0.7,
          coldStart: false,
          modelVersion: 'behavior_zscore_v1',
          factors: [{ signal: 'feeding_drop', detail: 'Alimentation 48 % de l\'objectif' }],
          sources: { feeder: true, water: true, weight: true, wearable: false },
        },
      ],
    };
  }

  const pets = await prisma.pet.findMany({ where: { ownerId } });
  const packs = [];
  for (const pet of pets) {
    packs.push(await buildFeaturesForPet(ownerId, pet));
  }

  const remote = await callFastApi(packs);
  const anomalies = [];

  for (const pack of packs) {
    const remoteHit = remote?.results?.find((r) => r.pet_id === pack.petId);
    const scored = remoteHit
      ? {
          score: Number(remoteHit.score ?? 0),
          severity: remoteHit.severity || 'low',
          confidence: Number(remoteHit.confidence ?? 0.6),
          coldStart: Boolean(remoteHit.cold_start ?? pack.coldStart),
          modelVersion: remoteHit.model_version || 'behavior_if_v1',
          factors: remoteHit.factors || [],
          sources: remoteHit.sources || pack.sources,
        }
      : scoreLocally(pack);

    if (scored.score < 0.4 && !scored.coldStart) continue;

    anomalies.push({
      petId: pack.petId,
      petName: pack.petName,
      petType: pack.petType,
      feederId: pack.feederId,
      ...scored,
    });
  }

  return {
    analyzedAt: new Date().toISOString(),
    model: remote?.model_version || 'behavior_zscore_v1',
    pythonPowered: Boolean(remote?.model_version),
    anomalies,
    petsAnalyzed: packs.length,
  };
};

const persistAndNotify = async (user, analysis) => {
  const ownerId = String(user.id || user._id);
  const saved = [];
  for (const a of analysis.anomalies || []) {
    if (a.severity === 'low' && !a.coldStart) continue;

    const recent = await prisma.petBehaviorAnomaly.findFirst({
      where: {
        ownerId,
        petId: a.petId || undefined,
        status: 'open',
        createdAt: { gte: daysAgo(1) },
        severity: a.severity,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent && Math.abs(recent.score - a.score) < 0.08) {
      saved.push(recent);
      continue;
    }

    const row = await prisma.petBehaviorAnomaly.create({
      data: {
        ownerId,
        petId: a.petId || null,
        feederId: a.feederId || null,
        score: a.score,
        severity: a.severity,
        confidence: a.confidence,
        modelVersion: a.modelVersion,
        coldStart: Boolean(a.coldStart),
        factorsJson: JSON.stringify(a.factors || []),
        sourcesJson: JSON.stringify(a.sources || {}),
        status: 'open',
        notifiedAt: new Date(),
      },
    });
    saved.push(row);

    if (a.severity !== 'low') {
      emitToUser(ownerId, {
        type: 'behavior_anomaly',
        title: `Comportement inhabituel — ${a.petName || 'animal'}`,
        message: (a.factors?.[0]?.detail) || `Score ${Math.round(a.score * 100)}`,
        link: '/pet-feeder',
        severity: a.severity,
        petId: a.petId,
        anomalyId: row.id,
      });
    }
  }
  return saved;
};

const listAnomalies = async (user, { limit = 20 } = {}) => {
  const ownerId = String(user.id || user._id);
  if (isDemoMode()) {
    const analysis = await analyzeOwnerPets(user);
    return analysis.anomalies;
  }
  return prisma.petBehaviorAnomaly.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(limit) || 20, 50),
  });
};

const recordBehaviorEvent = async (user, body = {}) => {
  const ownerId = String(user.id || user._id);
  return prisma.petBehaviorEvent.create({
    data: {
      ownerId,
      petId: body.petId || null,
      feederId: body.feederId || null,
      source: body.source || 'manual',
      eventType: body.eventType || 'observation',
      value: body.value != null ? Number(body.value) : null,
      unit: body.unit || null,
      payloadJson: body.payload ? JSON.stringify(body.payload) : null,
      recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
    },
  });
};

module.exports = {
  SPECIES_BASELINE,
  buildFeaturesForPet,
  analyzeOwnerPets,
  persistAndNotify,
  listAnomalies,
  recordBehaviorEvent,
  scoreLocally,
};

const { prisma, isDemoMode } = require('../../prismaClient');

const uid = (u) => String(u?.id || u?._id);
const demoLogs = [];

const loadPet = async (ownerId, petId) => {
  const pet = await prisma.pet.findFirst({ where: { id: petId, ownerId } });
  if (!pet) {
    const err = new Error('Animal introuvable');
    err.status = 404;
    throw err;
  }
  return pet;
};

const buildSeries = (points) =>
  [...points]
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt))
    .map((p) => ({
      date: p.recordedAt,
      label: new Date(p.recordedAt).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }),
      weightKg: Math.round(p.weightKg * 100) / 100,
      source: p.source,
    }));

const detectAlerts = (series, pet) => {
  const alerts = [];
  if (series.length < 2) return alerts;

  const latest = series[series.length - 1].weightKg;
  const prev = series[series.length - 2].weightKg;
  const changePct = prev > 0 ? ((latest - prev) / prev) * 100 : 0;

  if (Math.abs(changePct) >= 8) {
    alerts.push({
      type: changePct > 0 ? 'gain' : 'loss',
      severity: Math.abs(changePct) >= 15 ? 'high' : 'medium',
      message:
        changePct > 0
          ? `Prise de poids rapide (+${changePct.toFixed(1)} % vs dernière pesée)`
          : `Perte de poids rapide (${changePct.toFixed(1)} % vs dernière pesée)`,
      changePercent: Math.round(changePct * 10) / 10,
    });
  }

  if (series.length >= 3) {
    const first = series[0].weightKg;
    const totalChange = first > 0 ? ((latest - first) / first) * 100 : 0;
    const days =
      (new Date(series[series.length - 1].date) - new Date(series[0].date)) / 86400000 || 1;
    if (days >= 14 && Math.abs(totalChange) >= 12) {
      alerts.push({
        type: totalChange > 0 ? 'trend_gain' : 'trend_loss',
        severity: 'medium',
        message: `Tendance sur ${Math.round(days)} j : ${totalChange > 0 ? '+' : ''}${totalChange.toFixed(1)} %`,
        changePercent: Math.round(totalChange * 10) / 10,
      });
    }
  }

  const type = pet?.type || 'dog';
  const idealMin = type === 'cat' ? 2.5 : 8;
  const idealMax = type === 'cat' ? 8 : 45;
  if (latest < idealMin || latest > idealMax) {
    alerts.push({
      type: 'out_of_range',
      severity: 'low',
      message: `Poids hors fourchette indicative ${type} (${idealMin}–${idealMax} kg) — à confirmer avec le vétérinaire`,
    });
  }

  return alerts;
};

const getWeightTracking = async (user, petId) => {
  const ownerId = uid(user);

  if (isDemoMode()) {
    const now = Date.now();
    const demoSeries = [
      { recordedAt: new Date(now - 60 * 86400000), weightKg: 11.2, source: 'manual' },
      { recordedAt: new Date(now - 45 * 86400000), weightKg: 11.5, source: 'manual' },
      { recordedAt: new Date(now - 30 * 86400000), weightKg: 11.8, source: 'vet' },
      { recordedAt: new Date(now - 14 * 86400000), weightKg: 12.4, source: 'manual' },
      { recordedAt: new Date(now - 2 * 86400000), weightKg: 12.9, source: 'manual' },
    ];
    const series = buildSeries(demoSeries);
    const pet = { id: petId || 'demo_pet', name: 'Médor', type: 'dog', weight: 12.9 };
    const alerts = detectAlerts(series, pet);
    return {
      pet: { id: pet.id, name: pet.name, type: pet.type, currentWeightKg: series[series.length - 1]?.weightKg },
      series,
      stats: {
        minKg: Math.min(...series.map((s) => s.weightKg)),
        maxKg: Math.max(...series.map((s) => s.weightKg)),
        change30d: series.length >= 2 ? series[series.length - 1].weightKg - series[0].weightKg : 0,
        entries: series.length,
      },
      alerts,
      model: 'smart_weight_v1',
    };
  }

  const pet = await loadPet(ownerId, petId);
  const logs = await prisma.petWeightLog.findMany({
    where: { petId, ownerId },
    orderBy: { recordedAt: 'asc' },
    take: 120,
  });

  const points = logs.map((l) => ({
    recordedAt: l.recordedAt,
    weightKg: l.weightKg,
    source: l.source,
    note: l.note,
  }));

  if (pet.weight != null) {
    const hasCurrent = points.some(
      (p) => Math.abs(p.weightKg - pet.weight) < 0.01 && Date.now() - new Date(p.recordedAt).getTime() < 7 * 86400000,
    );
    if (!hasCurrent) {
      points.push({ recordedAt: pet.createdAt || new Date(), weightKg: pet.weight, source: 'profile' });
    }
  }

  const vetRecords = await prisma.veterinaryRecord.findMany({
    where: { ownerId, petName: pet.name, weight: { not: null } },
    orderBy: { visitDate: 'asc' },
    take: 40,
    select: { visitDate: true, weight: true },
  });
  for (const r of vetRecords) {
    points.push({ recordedAt: r.visitDate, weightKg: r.weight, source: 'vet' });
  }

  const series = buildSeries(points);
  const alerts = detectAlerts(series, pet);

  return {
    pet: {
      id: pet.id,
      name: pet.name,
      type: pet.type,
      currentWeightKg: series[series.length - 1]?.weightKg ?? pet.weight,
    },
    series,
    stats: {
      minKg: series.length ? Math.min(...series.map((s) => s.weightKg)) : null,
      maxKg: series.length ? Math.max(...series.map((s) => s.weightKg)) : null,
      change30d:
        series.length >= 2
          ? Math.round((series[series.length - 1].weightKg - series[0].weightKg) * 100) / 100
          : 0,
      entries: series.length,
    },
    alerts,
    model: 'smart_weight_v1',
  };
};

const logWeight = async (user, petId, { weightKg, note, recordedAt } = {}) => {
  const ownerId = uid(user);
  const w = Number(weightKg);
  if (!Number.isFinite(w) || w <= 0 || w > 200) {
    const err = new Error('Poids invalide');
    err.status = 400;
    throw err;
  }

  if (isDemoMode()) {
    const row = {
      id: `wl_${Date.now()}`,
      petId,
      ownerId,
      weightKg: w,
      note: note || null,
      source: 'manual',
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
    };
    demoLogs.push(row);
    return { log: row, tracking: await getWeightTracking(user, petId) };
  }

  const pet = await loadPet(ownerId, petId);
  const row = await prisma.petWeightLog.create({
    data: {
      petId: pet.id,
      ownerId,
      weightKg: w,
      note: note || null,
      source: 'manual',
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
    },
  });

  await prisma.pet.update({
    where: { id: pet.id },
    data: { weight: w },
  });

  const tracking = await getWeightTracking(user, petId);
  return { log: row, tracking };
};

module.exports = { getWeightTracking, logWeight, detectAlerts, buildSeries };

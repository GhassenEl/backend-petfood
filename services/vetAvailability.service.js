const { prisma, isDemoMode } = require('../prismaClient');

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const DEFAULT_WEEKLY = {
  mon: { open: true, ranges: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '17:00' }] },
  tue: { open: true, ranges: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '17:00' }] },
  wed: { open: true, ranges: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '17:00' }] },
  thu: { open: true, ranges: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '17:00' }] },
  fri: { open: true, ranges: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '17:00' }] },
  sat: { open: true, ranges: [{ start: '09:00', end: '13:00' }] },
  sun: { open: false, ranges: [] },
};

const parsePrefs = (raw) => {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const parseTimeRangeString = (value) => {
  if (!value || typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed || /^fermé|ferme|closed$/i.test(trimmed)) return [];

  return trimmed.split(',').map((part) => {
    const m = part.trim().match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    if (!m) return null;
    return { start: normalizeTime(m[1]), end: normalizeTime(m[2]) };
  }).filter(Boolean);
};

const normalizeTime = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
};

const weeklyFromOpeningHours = (openingHours) => {
  if (!openingHours || typeof openingHours !== 'object') return { ...DEFAULT_WEEKLY };
  const weekly = {};
  for (const key of DAY_KEYS) {
    const ranges = parseTimeRangeString(openingHours[key]);
    weekly[key] = { open: ranges.length > 0, ranges };
  }
  return weekly;
};

const defaultVetAvailability = (prefs = {}) => ({
  isAvailable: true,
  statusNote: 'Consultations sur rendez-vous',
  slotDurationMinutes: 60,
  weeklyHours: weeklyFromOpeningHours(prefs.clinic?.openingHours) || { ...DEFAULT_WEEKLY },
  blockedDates: [],
  updatedAt: new Date().toISOString(),
});

const getVetAvailability = async (vetId) => {
  if (isDemoMode()) {
    return defaultVetAvailability();
  }

  const user = await prisma.user.findUnique({
    where: { id: vetId },
    select: { preferences: true, role: true },
  });
  if (!user || user.role !== 'vet') {
    const err = new Error('Vétérinaire introuvable');
    err.status = 404;
    throw err;
  }

  const prefs = parsePrefs(user.preferences);
  if (prefs.vetAvailability) {
    return {
      ...defaultVetAvailability(prefs),
      ...prefs.vetAvailability,
      weeklyHours: prefs.vetAvailability.weeklyHours || defaultVetAvailability(prefs).weeklyHours,
    };
  }
  return defaultVetAvailability(prefs);
};

const saveVetAvailability = async (vetId, data) => {
  if (isDemoMode()) {
    return { ...defaultVetAvailability(), ...data, updatedAt: new Date().toISOString() };
  }

  const user = await prisma.user.findUnique({ where: { id: vetId } });
  if (!user || user.role !== 'vet') {
    const err = new Error('Vétérinaire introuvable');
    err.status = 404;
    throw err;
  }

  const prefs = parsePrefs(user.preferences);
  const current = prefs.vetAvailability || defaultVetAvailability(prefs);

  const next = {
    ...current,
    ...(data.isAvailable !== undefined ? { isAvailable: Boolean(data.isAvailable) } : {}),
    ...(data.statusNote !== undefined ? { statusNote: String(data.statusNote) } : {}),
    ...(data.slotDurationMinutes !== undefined
      ? { slotDurationMinutes: Math.min(120, Math.max(15, Number(data.slotDurationMinutes) || 60)) }
      : {}),
    ...(data.weeklyHours !== undefined ? { weeklyHours: data.weeklyHours } : {}),
    ...(data.blockedDates !== undefined
      ? { blockedDates: Array.isArray(data.blockedDates) ? data.blockedDates : [] }
      : {}),
    updatedAt: new Date().toISOString(),
  };

  prefs.vetAvailability = next;

  if (data.syncOpeningHours !== false && next.weeklyHours) {
    const openingHours = {};
    for (const key of DAY_KEYS) {
      const day = next.weeklyHours[key];
      if (!day?.open || !day.ranges?.length) {
        openingHours[key] = 'Fermé';
      } else {
        openingHours[key] = day.ranges.map((r) => `${r.start}-${r.end}`).join(', ');
      }
    }
    prefs.clinic = { ...(prefs.clinic || {}), openingHours };
  }

  await prisma.user.update({
    where: { id: vetId },
    data: { preferences: JSON.stringify(prefs) },
  });

  return next;
};

const parseDateOnly = (dateStr) => {
  const iso = String(dateStr).slice(0, 10);
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dayKeyForDate = (dateStr) => {
  const d = parseDateOnly(dateStr);
  if (!d) return 'mon';
  return DAY_KEYS[d.getUTCDay()];
};

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);

const buildSlotsForDay = (dateStr, config) => {
  if (!config.isAvailable) return [];

  if ((config.blockedDates || []).includes(String(dateStr).slice(0, 10))) {
    return [];
  }

  const dayKey = dayKeyForDate(dateStr);
  const day = config.weeklyHours?.[dayKey];
  if (!day?.open || !day.ranges?.length) return [];

  const base = parseDateOnly(dateStr);
  const duration = config.slotDurationMinutes || 60;
  const slots = [];

  for (const range of day.ranges) {
    const [sh, sm] = range.start.split(':').map(Number);
    const [eh, em] = range.end.split(':').map(Number);
    let cursor = new Date(base);
    cursor.setUTCHours(sh, sm || 0, 0, 0);
    const end = new Date(base);
    end.setUTCHours(eh, em || 0, 0, 0);

    while (addMinutes(cursor, duration) <= end) {
      const slotEnd = addMinutes(cursor, duration);
      slots.push({
        start: cursor.toISOString(),
        end: slotEnd.toISOString(),
        capacity: 1,
        isAvailable: true,
      });
      cursor = slotEnd;
    }
  }

  return slots;
};

const getActiveVetConfigs = async (vetIdFilter) => {
  if (isDemoMode()) {
    return [{ vetId: 'demo_vet', config: defaultVetAvailability() }];
  }

  if (vetIdFilter) {
    const config = await getVetAvailability(vetIdFilter);
    return [{ vetId: vetIdFilter, config }];
  }

  const vets = await prisma.user.findMany({
    where: { role: 'vet', isActive: true },
    select: { id: true, preferences: true },
  });

  if (!vets.length) {
    return [{ vetId: null, config: defaultVetAvailability() }];
  }

  return vets.map((v) => {
    const prefs = parsePrefs(v.preferences);
    const config = prefs.vetAvailability
      ? { ...defaultVetAvailability(prefs), ...prefs.vetAvailability }
      : defaultVetAvailability(prefs);
    return { vetId: v.id, config };
  });
};

const markTakenSlots = async (dateStr, slots) => {
  const dayStart = parseDateOnly(dateStr);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  if (isDemoMode()) {
    return slots;
  }

  const appointments = await prisma.petAppointment.findMany({
    where: {
      date: { gte: dayStart, lt: dayEnd },
      status: { in: ['scheduled', 'confirmed', 'pending'] },
    },
    select: { date: true },
  });

  const takenMs = new Set(
    appointments
      .map((a) => {
        const d = new Date(a.date);
        return Number.isNaN(d.getTime()) ? null : d.getTime();
      })
      .filter((t) => t != null)
  );

  return slots.map((s) => {
    const startMs = new Date(s.start).getTime();
    return {
      ...s,
      isAvailable: s.isAvailable !== false && !takenMs.has(startMs),
    };
  });
};

const getPublicAvailabilitySlots = async ({ date, vetId }) => {
  const selectedDate = date || new Date().toISOString().slice(0, 10);
  const vetConfigs = await getActiveVetConfigs(vetId);

  const availableVets = vetConfigs.filter((v) => v.config.isAvailable !== false);
  if (!availableVets.length) {
    return {
      date: selectedDate,
      slots: [],
      vetsAvailable: 0,
      message: 'Aucun vétérinaire disponible pour le moment.',
    };
  }

  let slots = [];
  for (const { vetId: vid, config } of availableVets) {
    const daySlots = buildSlotsForDay(selectedDate, config).map((s) => ({
      ...s,
      vetId: vid,
    }));
    slots = slots.concat(daySlots);
  }

  slots.sort((a, b) => new Date(a.start) - new Date(b.start));

  const deduped = [];
  const seen = new Set();
  for (const s of slots) {
    const key = s.start;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }

  const adjusted = await markTakenSlots(selectedDate, deduped);

  return {
    date: selectedDate,
    slots: adjusted,
    vetsAvailable: availableVets.length,
    slotDurationMinutes: availableVets[0]?.config?.slotDurationMinutes || 60,
  };
};

module.exports = {
  DEFAULT_WEEKLY,
  DAY_KEYS,
  defaultVetAvailability,
  getVetAvailability,
  saveVetAvailability,
  getPublicAvailabilitySlots,
  buildSlotsForDay,
  weeklyFromOpeningHours,
};

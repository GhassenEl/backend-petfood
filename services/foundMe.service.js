const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');

const ACTIVE = 'active';
const REUNITED = 'reunited';
const CLOSED = 'closed';

const generateTagCode = () => {
  const part = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FM-${part}`;
};

const normalizeReport = (row, reporter = null) => ({
  id: row.id,
  tagCode: row.tagCode,
  reportType: row.reportType,
  reporterId: row.reporterId,
  petId: row.petId || null,
  petName: row.petName,
  animalType: row.animalType,
  breed: row.breed || null,
  color: row.color || null,
  distinctiveMarks: row.distinctiveMarks || null,
  description: row.description || null,
  photoUrl: row.photoUrl || null,
  lastSeenAt: row.lastSeenAt || null,
  location: row.location,
  region: row.region || null,
  latitude: row.latitude ?? null,
  longitude: row.longitude ?? null,
  contactPhone: row.contactPhone || null,
  contactEmail: row.contactEmail || null,
  rewardOffered: row.rewardOffered || null,
  status: row.status || ACTIVE,
  matchedReportId: row.matchedReportId || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  reporter: reporter
    ? { id: reporter.id, name: reporter.name, phone: reporter.phone, email: reporter.email }
    : row.reporter || null,
});

const scoreMatch = (source, candidate) => {
  let score = 0;
  const reasons = [];

  const opposite =
    (source.reportType === 'lost' && candidate.reportType === 'found') ||
    (source.reportType === 'found' && candidate.reportType === 'lost');
  if (!opposite) return { score: 0, reasons: [] };

  if (source.animalType === candidate.animalType) {
    score += 40;
    reasons.push('Même espèce');
  } else {
    return { score: 0, reasons: [] };
  }

  const breedA = (source.breed || '').toLowerCase().trim();
  const breedB = (candidate.breed || '').toLowerCase().trim();
  if (breedA && breedB && (breedA.includes(breedB) || breedB.includes(breedA))) {
    score += 25;
    reasons.push('Race similaire');
  }

  const colorA = (source.color || '').toLowerCase().trim();
  const colorB = (candidate.color || '').toLowerCase().trim();
  if (colorA && colorB && (colorA.includes(colorB) || colorB.includes(colorA))) {
    score += 15;
    reasons.push('Couleur proche');
  }

  if (source.region && candidate.region && source.region === candidate.region) {
    score += 20;
    reasons.push('Même région');
  }

  const locA = (source.location || '').toLowerCase();
  const locB = (candidate.location || '').toLowerCase();
  if (locA && locB && (locA.includes(locB) || locB.includes(locA))) {
    score += 10;
    reasons.push('Zone géographique proche');
  }

  const nameA = (source.petName || '').toLowerCase().trim();
  const nameB = (candidate.petName || '').toLowerCase().trim();
  if (nameA.length > 2 && nameB.length > 2 && nameA === nameB) {
    score += 15;
    reasons.push('Même prénom');
  }

  return { score, reasons };
};

const findMatchesFor = (source, all) =>
  all
    .filter((r) => r.id !== source.id && r.status === ACTIVE)
    .map((candidate) => {
      const { score, reasons } = scoreMatch(source, candidate);
      return { report: candidate, score, reasons };
    })
    .filter((m) => m.score >= 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

const listReports = async (filters = {}) => {
  const { reportType, animalType, status = ACTIVE, region, q } = filters;

  if (isDemoMode()) {
    let list = demoStore.getFoundMeReports();
    if (reportType) list = list.filter((r) => r.reportType === reportType);
    if (animalType) list = list.filter((r) => r.animalType === animalType);
    if (status) list = list.filter((r) => r.status === status);
    if (region) list = list.filter((r) => r.region === region);
    if (q) {
      const hay = q.toLowerCase();
      list = list.filter(
        (r) =>
          r.petName?.toLowerCase().includes(hay) ||
          r.tagCode?.toLowerCase().includes(hay) ||
          r.location?.toLowerCase().includes(hay)
      );
    }
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const where = {};
  if (reportType) where.reportType = reportType;
  if (animalType) where.animalType = animalType;
  if (status) where.status = status;
  if (region) where.region = region;
  if (q) {
    where.OR = [
      { petName: { contains: q } },
      { tagCode: { contains: q } },
      { location: { contains: q } },
    ];
  }

  const rows = await prisma.petFoundMeReport.findMany({
    where,
    include: { reporter: { select: { id: true, name: true, phone: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((r) => normalizeReport(r, r.reporter));
};

const listMyReports = async (userId) => {
  if (isDemoMode()) {
    return demoStore
      .getFoundMeReports()
      .filter((r) => r.reporterId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  const rows = await prisma.petFoundMeReport.findMany({
    where: { reporterId: userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => normalizeReport(r));
};

const getReportById = async (id) => {
  if (isDemoMode()) {
    const row = demoStore.getFoundMeReportById(id);
    return row || null;
  }
  const row = await prisma.petFoundMeReport.findUnique({
    where: { id },
    include: { reporter: { select: { id: true, name: true, phone: true, email: true } } },
  });
  return row ? normalizeReport(row, row.reporter) : null;
};

const lookupByTag = async (tagCode, { withContact = false } = {}) => {
  const code = String(tagCode || '').trim().toUpperCase();
  if (!code) return null;

  const report = isDemoMode()
    ? demoStore.getFoundMeReportByTag(code)
    : await prisma.petFoundMeReport.findUnique({
        where: { tagCode: code },
        include: withContact
          ? { reporter: { select: { id: true, name: true, phone: true, email: true } } }
          : undefined,
      });

  if (!report) return null;
  const normalized = isDemoMode() ? report : normalizeReport(report, report.reporter);

  if (!withContact) {
    return {
      id: normalized.id,
      tagCode: normalized.tagCode,
      reportType: normalized.reportType,
      petName: normalized.petName,
      animalType: normalized.animalType,
      status: normalized.status,
      location: normalized.location,
      region: normalized.region,
      lastSeenAt: normalized.lastSeenAt,
      description: normalized.description,
      photoUrl: normalized.photoUrl,
      contactHint: 'Connectez-vous à PetfoodTN pour contacter le propriétaire ou le signaleur.',
    };
  }
  return normalized;
};

const createReport = async (userId, payload, user = {}) => {
  const data = {
    tagCode: generateTagCode(),
    reportType: payload.reportType === 'found' ? 'found' : 'lost',
    reporterId: userId,
    petId: payload.petId || null,
    petName: String(payload.petName || 'Sans nom').trim(),
    animalType: payload.animalType || 'other',
    breed: payload.breed || null,
    color: payload.color || null,
    distinctiveMarks: payload.distinctiveMarks || null,
    description: payload.description || null,
    photoUrl: payload.photoUrl || null,
    lastSeenAt: payload.lastSeenAt ? new Date(payload.lastSeenAt) : new Date(),
    location: String(payload.location || 'Non précisé').trim(),
    region: payload.region || user.region || null,
    latitude: payload.latitude != null ? Number(payload.latitude) : null,
    longitude: payload.longitude != null ? Number(payload.longitude) : null,
    contactPhone: payload.contactPhone || user.phone || null,
    contactEmail: payload.contactEmail || user.email || null,
    rewardOffered: payload.rewardOffered || null,
    status: ACTIVE,
  };

  if (isDemoMode()) {
    return demoStore.createFoundMeReport(data);
  }

  const row = await prisma.petFoundMeReport.create({ data });
  return normalizeReport(row);
};

const updateReport = async (id, userId, patch, isAdmin = false) => {
  const existing = await getReportById(id);
  if (!existing) return null;
  if (!isAdmin && existing.reporterId !== userId) {
    const err = new Error('Non autorisé');
    err.status = 403;
    throw err;
  }

  const data = {};
  if (patch.status) data.status = patch.status;
  if (patch.matchedReportId !== undefined) data.matchedReportId = patch.matchedReportId;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.location !== undefined) data.location = patch.location;
  if (patch.contactPhone !== undefined) data.contactPhone = patch.contactPhone;

  if (isDemoMode()) {
    return demoStore.updateFoundMeReport(id, data);
  }

  const row = await prisma.petFoundMeReport.update({ where: { id }, data });
  return normalizeReport(row);
};

const getMatches = async (id) => {
  const source = await getReportById(id);
  if (!source) return null;

  const all = await listReports({ status: ACTIVE });
  const matches = findMatchesFor(source, all);
  return { report: source, matches };
};

module.exports = {
  ACTIVE,
  REUNITED,
  CLOSED,
  listReports,
  listMyReports,
  getReportById,
  lookupByTag,
  createReport,
  updateReport,
  getMatches,
  generateTagCode,
};

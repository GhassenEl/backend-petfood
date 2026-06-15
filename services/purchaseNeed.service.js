const { prisma } = require('../prismaClient');

const OPEN = 'open';
const FULFILLED = 'fulfilled';
const CLOSED = 'closed';

const normalizeNeed = (row, { includeResponses = false } = {}) => {
  const base = {
    id: row.id,
    clientId: row.clientId,
    title: row.title,
    description: row.description,
    category: row.category,
    animalType: row.animalType || null,
    petName: row.petName || null,
    quantity: row.quantity || null,
    budgetMin: row.budgetMin ?? null,
    budgetMax: row.budgetMax ?? null,
    city: row.city || null,
    region: row.region || null,
    urgency: row.urgency || 'normal',
    status: row.status || OPEN,
    responseCount: row._count?.responses ?? row.responses?.length ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    client: row.client
      ? { id: row.client.id, name: row.client.name, region: row.client.region || null }
      : null,
  };
  if (includeResponses && row.responses) {
    base.responses = row.responses.map(normalizeResponse);
  }
  return base;
};

const normalizeResponse = (row) => ({
  id: row.id,
  needId: row.needId,
  vendorUserId: row.vendorUserId,
  vendorName: row.vendorName || row.vendor?.name || 'Vendeur',
  message: row.message,
  proposedPrice: row.proposedPrice ?? null,
  productUrl: row.productUrl || null,
  status: row.status || 'pending',
  createdAt: row.createdAt,
});

const buildWhere = (filters = {}) => {
  const where = {};
  if (filters.status && filters.status !== 'all') where.status = filters.status;
  if (filters.category && filters.category !== 'all') where.category = filters.category;
  if (filters.animalType && filters.animalType !== 'all') where.animalType = filters.animalType;
  if (filters.region) where.region = filters.region;
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.q) {
    const q = String(filters.q).trim();
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { petName: { contains: q } },
    ];
  }
  return where;
};

const listNeeds = async (filters = {}) => {
  const where = buildWhere(filters);
  const rows = await prisma.purchaseNeed.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, region: true } },
      _count: { select: { responses: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(filters.limit) || 100, 200),
  });
  return rows.map((r) => normalizeNeed(r));
};

const listMyNeeds = async (clientId) => {
  const rows = await prisma.purchaseNeed.findMany({
    where: { clientId },
    include: {
      _count: { select: { responses: true } },
      responses: {
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => normalizeNeed(r, { includeResponses: true }));
};

const getNeedById = async (id, { withResponses = false } = {}) => {
  const row = await prisma.purchaseNeed.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, region: true } },
      _count: { select: { responses: true } },
      ...(withResponses
        ? {
            responses: {
              include: { vendor: { select: { id: true, name: true } } },
              orderBy: { createdAt: 'desc' },
            },
          }
        : {}),
    },
  });
  return row ? normalizeNeed(row, { includeResponses: withResponses }) : null;
};

const createNeed = async (clientId, payload, user = {}) => {
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '').trim();
  if (!title || title.length < 3) {
    const err = new Error('Titre requis (3 caractères minimum)');
    err.status = 400;
    throw err;
  }
  if (!description || description.length < 10) {
    const err = new Error('Description requise (10 caractères minimum)');
    err.status = 400;
    throw err;
  }

  const row = await prisma.purchaseNeed.create({
    data: {
      clientId,
      title,
      description,
      category: payload.category || 'food',
      animalType: payload.animalType || null,
      petName: payload.petName || null,
      quantity: payload.quantity || null,
      budgetMin: payload.budgetMin != null ? Number(payload.budgetMin) : null,
      budgetMax: payload.budgetMax != null ? Number(payload.budgetMax) : null,
      city: payload.city || user.location || null,
      region: payload.region || user.region || null,
      urgency: ['low', 'normal', 'high'].includes(payload.urgency) ? payload.urgency : 'normal',
      status: OPEN,
    },
    include: {
      client: { select: { id: true, name: true, region: true } },
      _count: { select: { responses: true } },
    },
  });
  return normalizeNeed(row);
};

const updateNeed = async (id, clientId, patch, isAdmin = false) => {
  const existing = await prisma.purchaseNeed.findUnique({ where: { id } });
  if (!existing) return null;
  if (!isAdmin && existing.clientId !== clientId) {
    const err = new Error('Non autorisé');
    err.status = 403;
    throw err;
  }

  const data = {};
  if (patch.status && [OPEN, FULFILLED, CLOSED].includes(patch.status)) data.status = patch.status;
  if (patch.title !== undefined) data.title = String(patch.title).trim();
  if (patch.description !== undefined) data.description = String(patch.description).trim();
  if (patch.urgency !== undefined && ['low', 'normal', 'high'].includes(patch.urgency)) {
    data.urgency = patch.urgency;
  }

  const row = await prisma.purchaseNeed.update({
    where: { id },
    data,
    include: {
      client: { select: { id: true, name: true, region: true } },
      _count: { select: { responses: true } },
    },
  });
  return normalizeNeed(row);
};

const addResponse = async (needId, vendorUserId, payload, vendor = {}) => {
  const need = await prisma.purchaseNeed.findUnique({ where: { id: needId } });
  if (!need) return null;
  if (need.status !== OPEN) {
    const err = new Error('Cette annonce n\'accepte plus de réponses');
    err.status = 400;
    throw err;
  }

  const message = String(payload.message || '').trim();
  if (!message || message.length < 5) {
    const err = new Error('Message requis (5 caractères minimum)');
    err.status = 400;
    throw err;
  }

  const row = await prisma.purchaseNeedResponse.create({
    data: {
      needId,
      vendorUserId,
      vendorName: vendor.name || payload.vendorName || 'Vendeur',
      message,
      proposedPrice: payload.proposedPrice != null ? Number(payload.proposedPrice) : null,
      productUrl: payload.productUrl || null,
      status: 'pending',
    },
    include: { vendor: { select: { id: true, name: true } } },
  });
  return normalizeResponse(row);
};

const listResponses = async (needId) => {
  const rows = await prisma.purchaseNeedResponse.findMany({
    where: { needId },
    include: { vendor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(normalizeResponse);
};

const updateResponseStatus = async (responseId, clientId, status) => {
  if (!['accepted', 'rejected', 'pending'].includes(status)) {
    const err = new Error('Statut invalide');
    err.status = 400;
    throw err;
  }

  const response = await prisma.purchaseNeedResponse.findUnique({
    where: { id: responseId },
    include: { need: true },
  });
  if (!response) return null;
  if (response.need.clientId !== clientId) {
    const err = new Error('Non autorisé');
    err.status = 403;
    throw err;
  }

  const row = await prisma.purchaseNeedResponse.update({
    where: { id: responseId },
    data: { status },
    include: { vendor: { select: { id: true, name: true } } },
  });

  if (status === 'accepted') {
    await prisma.purchaseNeed.update({
      where: { id: response.needId },
      data: { status: FULFILLED },
    });
  }

  return normalizeResponse(row);
};

module.exports = {
  OPEN,
  FULFILLED,
  CLOSED,
  listNeeds,
  listMyNeeds,
  getNeedById,
  createNeed,
  updateNeed,
  addResponse,
  listResponses,
  updateResponseStatus,
};

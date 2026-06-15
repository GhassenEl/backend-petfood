const { randomUUID } = require('crypto');
const { prisma, isDemoMode } = require('../prismaClient');
const { useDemoStore } = require('../utils/demoUser');
const { emitToRole } = require('../utils/notificationHub');

const AFTER_SALE_TYPES = {
  reschedule: 'Reprogrammation',
  quality_issue: 'Problème qualité',
  partial_refund: 'Remboursement partiel',
  warranty: 'Garantie satisfaction',
  follow_up: 'Suivi post-prestation',
};

const demoRequests = [];

const getUserId = (user) => user?.id || user?._id;
const shouldUseDemo = (user) => isDemoMode() || useDemoStore(user);

const normalizeRequest = (row) => {
  if (!row) return row;
  let meta = {};
  try {
    meta = typeof row.message === 'string' && row.message.startsWith('{')
      ? JSON.parse(row.message)
      : { details: row.message };
  } catch {
    meta = { details: row.message };
  }
  return {
    id: row.id,
    bookingId: meta.bookingId || row.orderId || null,
    type: meta.type || row.type || 'follow_up',
    typeLabel: AFTER_SALE_TYPES[meta.type] || meta.type || 'Suivi',
    serviceLabel: meta.serviceLabel || row.subject?.replace(/^Après-vente — /, '') || 'Service',
    petName: meta.petName || null,
    details: meta.details || row.message || '',
    status: row.status || 'pending',
    response: row.response || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt || row.createdAt,
  };
};

const listAfterSales = async (user) => {
  const userId = getUserId(user);

  if (shouldUseDemo(user)) {
    const list = demoRequests.filter((r) => r.userId === userId || user.role === 'admin');
    return list.map(normalizeRequest).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const rows = await prisma.complaint.findMany({
    where: {
      userId,
      aiCategory: 'service_after_sale',
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(normalizeRequest);
};

const createAfterSale = async (user, payload) => {
  const userId = getUserId(user);
  const { bookingId, type, details, serviceLabel, petName } = payload || {};

  if (!bookingId) {
    const err = new Error('Réservation requise');
    err.status = 400;
    throw err;
  }
  if (!type || !AFTER_SALE_TYPES[type]) {
    const err = new Error('Type de demande invalide');
    err.status = 400;
    throw err;
  }
  if (!details?.trim()) {
    const err = new Error('Décrivez votre demande');
    err.status = 400;
    throw err;
  }

  const typeLabel = AFTER_SALE_TYPES[type];
  const now = new Date().toISOString();
  const meta = {
    bookingId,
    type,
    details: details.trim(),
    serviceLabel: serviceLabel || null,
    petName: petName || null,
  };

  if (shouldUseDemo(user)) {
    const row = {
      id: randomUUID(),
      userId,
      orderId: bookingId,
      subject: `Après-vente — ${typeLabel}`,
      message: JSON.stringify(meta),
      type,
      status: 'pending',
      response: null,
      createdAt: now,
      updatedAt: now,
    };
    demoRequests.unshift(row);

    try {
      emitToRole('support', {
        id: `aftersale-${row.id}`,
        type: 'service_after_sale',
        title: `Après-vente service — ${typeLabel}`,
        description: `${serviceLabel || bookingId} — ${petName || 'animal'}`,
        link: '/support/returns',
        read: false,
        createdAt: now,
      });
    } catch { /* optional */ }

    return normalizeRequest(row);
  }

  const created = await prisma.complaint.create({
    data: {
      userId,
      subject: `Après-vente — ${typeLabel}`,
      message: JSON.stringify(meta),
      orderId: bookingId,
      status: 'pending',
      aiCategory: 'service_after_sale',
    },
  });

  try {
    emitToRole('support', {
      id: `aftersale-${created.id}`,
      type: 'service_after_sale',
      title: `Après-vente service — ${typeLabel}`,
      description: `${serviceLabel || bookingId}`,
      link: '/support/returns',
      read: false,
      createdAt: created.createdAt,
    });
  } catch { /* optional */ }

  return normalizeRequest(created);
};

module.exports = {
  AFTER_SALE_TYPES,
  listAfterSales,
  createAfterSale,
};

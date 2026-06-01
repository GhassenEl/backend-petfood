const { prisma } = require('../prismaClient');

const resolveOwnerId = (value) => {
  if (value == null) return null;
  if (typeof value === 'object') return value.id || value._id || null;
  return value;
};

const clampRating = (value) => Math.min(5, Math.max(1, Number(value) || 0));

const getRatingsForUser = async (user) => {
  const userId = resolveOwnerId(user.id || user._id);
  const where = user.role === 'admin' ? {} : { userId };
  return prisma.serviceRating.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, email: true } },
      order: { select: { id: true, region: true, status: true, total: true } },
    },
  });
};

const getEligibleTargets = async (userId) => {
  const [deliveredOrders, pastAppointments, existing] = await Promise.all([
    prisma.order.findMany({
      where: { userId, status: 'delivered' },
      orderBy: { deliveredAt: 'desc' },
      select: {
        id: true,
        region: true,
        total: true,
        deliveredAt: true,
        assignedLivreurId: true,
        createdAt: true,
      },
    }),
    prisma.petAppointment.findMany({
      where: {
        ownerId: userId,
        status: { in: ['completed', 'confirmed'] },
        date: { lte: new Date() },
      },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        petName: true,
        animalType: true,
        date: true,
        status: true,
        visitMode: true,
        vetId: true,
        vet: { select: { id: true, name: true } },
      },
    }),
    prisma.serviceRating.findMany({
      where: { userId },
      select: { orderId: true, appointmentId: true },
    }),
  ]);

  const ratedOrders = new Set(existing.map((r) => r.orderId).filter(Boolean));
  const ratedAppts = new Set(existing.map((r) => r.appointmentId).filter(Boolean));

  return {
    delivery: deliveredOrders
      .filter((o) => !ratedOrders.has(o.id))
      .map((o) => ({
        orderId: o.id,
        region: o.region || null,
        total: o.total,
        deliveredAt: o.deliveredAt,
        livreurId: o.assignedLivreurId,
      })),
    veterinary: pastAppointments
      .filter((a) => !ratedAppts.has(a.id))
      .map((a) => ({
        appointmentId: a.id,
        petName: a.petName,
        animalType: a.animalType,
        date: a.date,
        visitMode: a.visitMode,
        vetId: a.vetId,
        vetName: a.vet?.name || null,
      })),
  };
};

const createRating = async (user, payload) => {
  const userId = resolveOwnerId(user.id || user._id);
  const type = String(payload.type || '').toLowerCase();
  const rating = clampRating(payload.rating);

  if (!['veterinary', 'delivery'].includes(type)) {
    const error = new Error('Type invalide (veterinary ou delivery)');
    error.status = 400;
    throw error;
  }
  if (rating < 1 || rating > 5) {
    const error = new Error('La note doit être entre 1 et 5');
    error.status = 400;
    throw error;
  }

  let region = payload.region || null;
  let orderId = null;
  let appointmentId = null;
  let targetUserId = null;

  if (type === 'delivery') {
    orderId = payload.orderId;
    if (!orderId) {
      const error = new Error('orderId requis pour noter la livraison');
      error.status = 400;
      throw error;
    }
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || String(order.userId) !== String(userId)) {
      const error = new Error('Commande introuvable');
      error.status = 404;
      throw error;
    }
    if (order.status !== 'delivered') {
      const error = new Error('Seules les commandes livrées peuvent être notées');
      error.status = 400;
      throw error;
    }
    region = region || order.region || null;
    targetUserId = order.assignedLivreurId || null;
  }

  if (type === 'veterinary') {
    appointmentId = payload.appointmentId;
    if (!appointmentId) {
      const error = new Error('appointmentId requis pour noter le vétérinaire');
      error.status = 400;
      throw error;
    }
    const appt = await prisma.petAppointment.findUnique({
      where: { id: appointmentId },
      include: { vet: { select: { id: true, region: true } } },
    });
    if (!appt || String(appt.ownerId) !== String(userId)) {
      const error = new Error('Rendez-vous introuvable');
      error.status = 404;
      throw error;
    }
    if (!['completed', 'confirmed'].includes(appt.status)) {
      const error = new Error('Ce rendez-vous ne peut pas encore être noté');
      error.status = 400;
      throw error;
    }
    targetUserId = appt.vetId || null;
    region = region || appt.vet?.region || null;
  }

  return prisma.serviceRating.create({
    data: {
      userId,
      type,
      rating,
      comment: payload.comment?.trim() || null,
      region,
      orderId,
      appointmentId,
      targetUserId,
    },
    include: {
      user: { select: { id: true, name: true } },
      order: { select: { id: true, region: true } },
    },
  });
};

const getStatsByRegion = async (type = 'delivery') => {
  const ratings = await prisma.serviceRating.findMany({
    where: { type, region: { not: null } },
    select: { region: true, rating: true },
  });

  const byRegion = {};
  for (const row of ratings) {
    const key = row.region || 'Autre';
    if (!byRegion[key]) byRegion[key] = { total: 0, sum: 0 };
    byRegion[key].total += 1;
    byRegion[key].sum += row.rating;
  }

  return Object.entries(byRegion)
    .map(([region, stats]) => ({
      region,
      count: stats.total,
      average: Number((stats.sum / stats.total).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count);
};

const deleteRating = async (id, user) => {
  const userId = resolveOwnerId(user.id || user._id);
  const existing = await prisma.serviceRating.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('Note introuvable');
    error.status = 404;
    throw error;
  }
  if (user.role !== 'admin' && String(existing.userId) !== String(userId)) {
    const error = new Error('Non autorisé');
    error.status = 403;
    throw error;
  }
  await prisma.serviceRating.delete({ where: { id } });
};

module.exports = {
  getRatingsForUser,
  getEligibleTargets,
  createRating,
  getStatsByRegion,
  deleteRating,
};

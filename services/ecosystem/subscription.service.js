const { prisma, isDemoMode } = require('../../prismaClient');

const uid = (u) => String(u?.id || u?._id);
const demoSubs = [];

const listSubscriptions = async (user) => {
  const userId = uid(user);
  if (isDemoMode()) {
    return { subscriptions: demoSubs.filter((s) => s.userId === userId) };
  }
  const rows = await prisma.productSubscription.findMany({
    where: { userId },
    include: { product: { select: { id: true, name: true, price: true, imageUrl: true } } },
    orderBy: { nextDeliveryAt: 'asc' },
  });
  return { subscriptions: rows };
};

const createSubscription = async (user, body) => {
  const userId = uid(user);
  const { productId, quantity = 1, frequencyDays = 30, petName, address } = body;
  if (!productId) {
    const err = new Error('Produit requis');
    err.status = 400;
    throw err;
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    const err = new Error('Produit introuvable');
    err.status = 404;
    throw err;
  }

  const nextDeliveryAt = new Date(Date.now() + frequencyDays * 86400000);

  if (isDemoMode()) {
    const row = {
      id: `sub_${Date.now()}`,
      userId,
      productId,
      product,
      quantity,
      frequencyDays,
      discountPercent: 10,
      status: 'active',
      nextDeliveryAt,
      petName,
    };
    demoSubs.push(row);
    return row;
  }

  return prisma.productSubscription.create({
    data: {
      userId,
      productId,
      quantity,
      frequencyDays,
      petName: petName || null,
      address: address || null,
      discountPercent: 10,
      status: 'active',
      nextDeliveryAt,
    },
    include: { product: true },
  });
};

const updateSubscription = async (user, id, body) => {
  const userId = uid(user);
  const { status, quantity, frequencyDays, pausedUntil } = body;

  if (isDemoMode()) {
    const row = demoSubs.find((s) => s.id === id && s.userId === userId);
    if (!row) {
      const err = new Error('Abonnement introuvable');
      err.status = 404;
      throw err;
    }
    Object.assign(row, { status, quantity, frequencyDays, pausedUntil });
    return row;
  }

  const row = await prisma.productSubscription.findFirst({ where: { id, userId } });
  if (!row) {
    const err = new Error('Abonnement introuvable');
    err.status = 404;
    throw err;
  }

  const data = {};
  if (status) data.status = status;
  if (quantity != null) data.quantity = quantity;
  if (frequencyDays != null) {
    data.frequencyDays = frequencyDays;
    data.nextDeliveryAt = new Date(Date.now() + frequencyDays * 86400000);
  }
  if (pausedUntil !== undefined) data.pausedUntil = pausedUntil ? new Date(pausedUntil) : null;

  return prisma.productSubscription.update({ where: { id }, data, include: { product: true } });
};

module.exports = { listSubscriptions, createSubscription, updateSubscription };

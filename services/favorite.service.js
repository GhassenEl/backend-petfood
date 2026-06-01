const { prisma, isDemoMode } = require('../prismaClient');

const listFavorites = async (userId) => {
  const rows = await prisma.productFavorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      product: true,
    },
  });
  return rows.map((r) => r.product).filter(Boolean);
};

const addFavorite = async (userId, productId) => {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    const error = new Error('Produit introuvable');
    error.status = 404;
    throw error;
  }
  await prisma.productFavorite.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: {},
  });
  return product;
};

const removeFavorite = async (userId, productId) => {
  await prisma.productFavorite.deleteMany({ where: { userId, productId } });
};

const getFavoriteIds = async (userId) => {
  const rows = await prisma.productFavorite.findMany({
    where: { userId },
    select: { productId: true },
  });
  return rows.map((r) => r.productId);
};

const getFrequentProducts = async (userId, limit = 8) => {
  const orders = await prisma.order.findMany({
    where: { userId, status: { in: ['delivered', 'shipped', 'pending'] } },
    include: {
      items: {
        include: { product: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });

  const counts = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      const pid = item.productId;
      if (!pid || !item.product) continue;
      const prev = counts.get(pid) || { product: item.product, qty: 0, orders: 0 };
      prev.qty += item.quantity || 1;
      prev.orders += 1;
      counts.set(pid, prev);
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.qty - a.qty || b.orders - a.orders)
    .slice(0, limit)
    .map((entry) => ({
      ...entry.product,
      purchaseCount: entry.orders,
      totalQuantity: entry.qty,
    }));
};

module.exports = {
  listFavorites,
  addFavorite,
  removeFavorite,
  getFavoriteIds,
  getFrequentProducts,
};

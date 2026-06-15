const { prisma, isDemoMode } = require('../prismaClient');

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getPlatformLiveSnapshot = async () => {
  const now = new Date();
  const since = startOfToday();

  if (isDemoMode()) {
    const t = Date.now();
    return {
      serverTime: now.toISOString(),
      tick: Math.floor(t / 12000),
      ordersToday: 8 + (Math.floor(t / 60000) % 5),
      pendingOrders: 3,
      lowStockProducts: 4,
      pendingComplaints: 2,
      activeDeliveries: 2,
      online: true,
      mode: 'demo',
    };
  }

  const [
    ordersToday,
    pendingOrders,
    lowStockProducts,
    pendingComplaints,
    activeDeliveries,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: since } } }),
    prisma.order.count({ where: { status: { in: ['pending', 'confirmed', 'processing'] } } }),
    prisma.product.count({ where: { stock: { lt: 10, gte: 0 } } }),
    prisma.complaint.count({ where: { status: { in: ['pending', 'open'] } } }),
    prisma.order.count({ where: { status: { in: ['shipped', 'in_transit', 'out_for_delivery'] } } }),
  ]);

  return {
    serverTime: now.toISOString(),
    tick: Math.floor(Date.now() / 12000),
    ordersToday,
    pendingOrders,
    lowStockProducts,
    pendingComplaints,
    activeDeliveries,
    online: true,
    mode: 'live',
  };
};

module.exports = { getPlatformLiveSnapshot };

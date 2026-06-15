const { prisma, isDemoMode } = require('../../prismaClient');

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const sumInRange = (rows, dateField, amountField, from, to) =>
  rows
    .filter((r) => {
      const d = new Date(r[dateField]);
      return d >= from && d <= to;
    })
    .reduce((s, r) => s + Number(r[amountField] || 0), 0);

const buildMonthlySeries = (commissions, months = 6) => {
  const series = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    const total = commissions
      .filter((c) => {
        const cd = new Date(c.createdAt);
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
      })
      .reduce((s, c) => s + Number(c.orderTotal || 0), 0);
    series.push({ month: key, label, revenue: Math.round(total * 100) / 100, orders: commissions.filter((c) => {
      const cd = new Date(c.createdAt);
      return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
    }).length });
  }
  return series;
};

const computeVendorKpis = async (vendor) => {
  if (isDemoMode()) {
    return {
      revenue7d: 320,
      revenue30d: 1240,
      revenuePrev30d: 980,
      revenueGrowthPct: 26.5,
      orders30d: 18,
      avgBasket30d: 68.9,
      paidCommissions: 154,
      pendingCommissions: 86,
      lowStockCount: 2,
      outOfStockCount: 0,
      activeProducts: 8,
      conversionRate: 3.2,
      marketplaceRank: 2,
      marketplaceTotal: 5,
    };
  }

  const commissions = vendor.commissions || [];
  const now = new Date();
  const d7 = daysAgo(7);
  const d30 = daysAgo(30);
  const d60 = daysAgo(60);

  const revenue7d = sumInRange(commissions, 'createdAt', 'orderTotal', d7, now);
  const revenue30d = sumInRange(commissions, 'createdAt', 'orderTotal', d30, now);
  const revenuePrev30d = sumInRange(commissions, 'createdAt', 'orderTotal', d60, d30);
  const orders30d = commissions.filter((c) => new Date(c.createdAt) >= d30).length;
  const avgBasket30d = orders30d ? Math.round((revenue30d / orders30d) * 100) / 100 : 0;
  const growth =
    revenuePrev30d > 0
      ? Math.round(((revenue30d - revenuePrev30d) / revenuePrev30d) * 1000) / 10
      : revenue30d > 0
        ? 100
        : 0;

  const products = vendor.products || [];
  const lowStockCount = products.filter((p) => Number(p.stock) > 0 && Number(p.stock) < 5).length;
  const outOfStockCount = products.filter((p) => Number(p.stock) <= 0).length;

  const paid = commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.commission, 0);
  const pending = commissions.filter((c) => c.status === 'pending').reduce((s, c) => s + c.commission, 0);

  const allVendors = await prisma.vendor.findMany({
    where: { isActive: true },
    orderBy: { totalSales: 'desc' },
    select: { id: true, totalSales: true },
  });
  const marketplaceRank = allVendors.findIndex((v) => v.id === vendor.id) + 1;

  const productIds = products.map((p) => p.productId).filter(Boolean);
  let conversionRate = 0;
  if (productIds.length) {
    const viewsProxy = productIds.length * 120;
    const soldItems = await prisma.orderItem.count({
      where: {
        productId: { in: productIds },
        order: { createdAt: { gte: d30 }, status: { not: 'cancelled' } },
      },
    });
    conversionRate = viewsProxy > 0 ? Math.round((soldItems / viewsProxy) * 1000) / 10 : 0;
  }

  return {
    revenue7d: Math.round(revenue7d * 100) / 100,
    revenue30d: Math.round(revenue30d * 100) / 100,
    revenuePrev30d: Math.round(revenuePrev30d * 100) / 100,
    revenueGrowthPct: growth,
    orders30d,
    avgBasket30d,
    paidCommissions: Math.round(paid * 100) / 100,
    pendingCommissions: Math.round(pending * 100) / 100,
    lowStockCount,
    outOfStockCount,
    activeProducts: products.filter((p) => p.isActive !== false).length,
    conversionRate,
    marketplaceRank: marketplaceRank || allVendors.length,
    marketplaceTotal: allVendors.length,
  };
};

const getProductPerformance = async (vendor) => {
  if (isDemoMode()) {
    return [
      { productId: 'p1', name: 'Croquettes Premium', unitsSold: 42, revenue: 3708, trend: 'up', stock: 24 },
      { productId: 'p2', name: 'Friandises Training', unitsSold: 28, revenue: 420, trend: 'stable', stock: 3 },
    ];
  }

  const productIds = (vendor.products || []).map((p) => p.productId).filter(Boolean);
  if (!productIds.length) return [];

  const since = daysAgo(30);
  const items = await prisma.orderItem.findMany({
    where: {
      productId: { in: productIds },
      order: { createdAt: { gte: since }, status: { in: ['delivered', 'paid', 'processing', 'shipped'] } },
    },
    include: { product: { select: { id: true, name: true } } },
  });

  const map = {};
  for (const it of items) {
    const id = it.productId;
    if (!map[id]) map[id] = { productId: id, name: it.product?.name || id, unitsSold: 0, revenue: 0 };
    map[id].unitsSold += it.quantity;
    map[id].revenue += Number(it.price || 0) * it.quantity;
  }

  return (vendor.products || [])
    .map((vp) => {
      const perf = map[vp.productId] || { unitsSold: 0, revenue: 0 };
      return {
        productId: vp.productId,
        name: vp.product?.name || perf.name,
        unitsSold: perf.unitsSold,
        revenue: Math.round(perf.revenue * 100) / 100,
        stock: vp.stock,
        trend: perf.unitsSold >= 5 ? 'up' : perf.unitsSold > 0 ? 'stable' : 'down',
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
};

const getRecentOrders = (commissions, limit = 12) =>
  [...(commissions || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      orderId: c.orderId,
      total: c.orderTotal,
      commission: c.commission,
      platformFee: c.platformFee,
      status: c.status,
      createdAt: c.createdAt,
    }));

const buildVendorAnalytics = async (vendor) => {
  const kpis = await computeVendorKpis(vendor);
  const salesTrend = buildMonthlySeries(vendor.commissions || []);
  const productPerformance = await getProductPerformance(vendor);
  const recentOrders = getRecentOrders(vendor.commissions);

  return { kpis, salesTrend, productPerformance, recentOrders };
};

module.exports = {
  buildVendorAnalytics,
  computeVendorKpis,
  buildMonthlySeries,
};

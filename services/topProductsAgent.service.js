const { prisma } = require('../prismaClient');

/**
 * Agent « top produits vendus » — agrège ventes réelles + popularité catalogue.
 */
const getTopSellingProducts = async ({ limit = 10, days = null } = {}) => {
  const since = days
    ? new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)
    : null;

  const orderWhere = since ? { createdAt: { gte: since } } : {};

  const [orderItems, products] = await Promise.all([
    prisma.orderItem.findMany({
      where: since
        ? { order: orderWhere }
        : undefined,
      include: {
        product: true,
        order: { select: { createdAt: true, status: true } },
      },
    }),
    prisma.product.findMany(),
  ]);

  const salesMap = new Map();

  for (const item of orderItems) {
    const pid = item.productId;
    if (!pid) continue;
    const prev = salesMap.get(pid) || {
      productId: pid,
      unitsSold: 0,
      revenue: 0,
      orderLines: 0,
      product: item.product,
    };
    const qty = Number(item.quantity || 1);
    const lineRev = Number(item.price || 0) * qty;
    prev.unitsSold += qty;
    prev.revenue += lineRev;
    prev.orderLines += 1;
    salesMap.set(pid, prev);
  }

  const fromSales = [...salesMap.values()]
    .map((row) => {
      const p = row.product || products.find((x) => x.id === row.productId);
      return {
        productId: row.productId,
        name: p?.name || 'Produit',
        category: p?.category,
        animalType: p?.animalType,
        imageUrl: p?.imageUrl || p?.image,
        price: p?.price,
        discount: p?.discount,
        unitsSold: row.unitsSold,
        revenue: Number(row.revenue.toFixed(2)),
        orderLines: row.orderLines,
        popularity: Number(p?.popularity || 0),
        rating_avg: Number(p?.rating_avg || 0),
        rating_count: Number(p?.rating_count || 0),
        score: row.unitsSold * 2 + row.revenue * 0.1 + Number(p?.popularity || 0) * 0.05,
        source: 'sales',
      };
    })
    .sort((a, b) => b.score - a.score);

  const topFromSales = fromSales.slice(0, limit);

  if (topFromSales.length >= limit) {
    return {
      periodDays: days,
      totalOrderLines: orderItems.length,
      topProducts: topFromSales,
      insights: buildTopInsights(topFromSales),
    };
  }

  const fallback = products
    .map((p) => ({
      productId: p.id,
      name: p.name,
      category: p.category,
      animalType: p.animalType,
      imageUrl: p.imageUrl || p.image,
      price: p.price,
      discount: p.discount,
      unitsSold: salesMap.get(p.id)?.unitsSold || 0,
      revenue: salesMap.get(p.id)?.revenue || 0,
      popularity: Number(p.popularity || 0),
      rating_avg: Number(p.rating_avg || 0),
      rating_count: Number(p.rating_count || 0),
      score: Number(p.popularity || 0) + Number(p.rating_avg || 0) * 10,
      source: 'catalog',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const mergedIds = new Set(topFromSales.map((p) => p.productId));
  const combined = [
    ...topFromSales,
    ...fallback.filter((p) => !mergedIds.has(p.productId)),
  ].slice(0, limit);

  return {
    periodDays: days,
    totalOrderLines: orderItems.length,
    topProducts: combined,
    insights: buildTopInsights(combined),
  };
};

const buildTopInsights = (topProducts) => {
  const byCategory = {};
  const byAnimal = {};
  for (const p of topProducts) {
    if (p.category) byCategory[p.category] = (byCategory[p.category] || 0) + 1;
    if (p.animalType) byAnimal[p.animalType] = (byAnimal[p.animalType] || 0) + 1;
  }
  const dominantCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0];
  const dominantAnimal = Object.entries(byAnimal).sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    leader: topProducts[0]?.name || null,
    dominantCategory,
    dominantAnimal,
    totalUnitsInTop: topProducts.reduce((s, p) => s + (p.unitsSold || 0), 0),
  };
};

module.exports = { getTopSellingProducts };

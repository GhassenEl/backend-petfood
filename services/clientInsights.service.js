const { prisma } = require('../prismaClient');

const parseJsonList = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  } catch {
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  }
};

const emotionScore = (emotion, rating) => {
  const r = Number(rating || 3);
  if (['happy', 'satisfied'].includes(emotion)) return Math.max(r, 4);
  if (['disappointed', 'frustrated', 'angry'].includes(emotion)) return Math.min(r, 2);
  return r;
};

const monthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const buildClientInsights = async (user) => {
  const userId = user.id || user._id;
  const ownerIds = [String(userId)];
  if (user.email) {
    const linked = await prisma.user.findUnique({
      where: { email: String(user.email).toLowerCase() },
      select: { id: true },
    });
    if (linked?.id && !ownerIds.includes(linked.id)) ownerIds.push(linked.id);
  }

  const [dbUser, pets, orders, reviews, allProducts] = await Promise.all([
    prisma.user.findFirst({
      where: { id: { in: ownerIds } },
      select: {
        id: true,
        name: true,
        email: true,
        petType: true,
        petAge: true,
        preferences: true,
        favoriteCategories: true,
      },
    }),
    prisma.pet.findMany({ where: { ownerId: { in: ownerIds } }, orderBy: { createdAt: 'asc' } }),
    prisma.order.findMany({
      where: { userId: { in: ownerIds } },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.review.findMany({
      where: { userId: { in: ownerIds } },
      include: { product: { select: { id: true, name: true, category: true, animalType: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.findMany({ select: { id: true, name: true, category: true, animalType: true, popularity: true } }),
  ]);

  const profile = dbUser || user;
  const preferences = parseJsonList(profile.preferences);
  const favoriteCategories = parseJsonList(profile.favoriteCategories);

  const categorySpend = {};
  const animalSpend = {};
  const productCounts = {};
  const monthlySpend = {};
  let totalSpent = 0;
  let orderCount = orders.length;

  for (const order of orders) {
    const mk = monthKey(order.createdAt);
    monthlySpend[mk] = (monthlySpend[mk] || 0) + Number(order.total || 0);
    totalSpent += Number(order.total || 0);
    for (const item of order.items || []) {
      const p = item.product;
      const pid = item.productId || p?.id;
      const qty = Number(item.quantity || 1);
      const lineTotal = Number(item.price || 0) * qty;
      productCounts[pid] = (productCounts[pid] || 0) + qty;
      if (p?.category) categorySpend[p.category] = (categorySpend[p.category] || 0) + lineTotal;
      if (p?.animalType) animalSpend[p.animalType] = (animalSpend[p.animalType] || 0) + lineTotal;
    }
  }

  const topCategories = Object.entries(categorySpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount: Number(amount.toFixed(2)) }));

  const topAnimalTypes = Object.entries(animalSpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, amount]) => ({ type, amount: Number(amount.toFixed(2)) }));

  const purchasedProductIds = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([productId, quantity]) => {
      const meta = allProducts.find((p) => p.id === productId);
      return {
        productId,
        name: meta?.name || 'Produit',
        quantity,
        category: meta?.category,
        animalType: meta?.animalType,
      };
    });

  const reviewStats = {
    count: reviews.length,
    avgRating: reviews.length
      ? Number((reviews.reduce((s, r) => s + emotionScore(r.emotion, r.rating), 0) / reviews.length).toFixed(2))
      : null,
    emotions: {},
    positiveThemes: [],
    negativeThemes: [],
  };

  for (const r of reviews) {
    const em = r.emotion || 'neutral';
    reviewStats.emotions[em] = (reviewStats.emotions[em] || 0) + 1;
    if (emotionScore(r.emotion, r.rating) >= 4) {
      reviewStats.positiveThemes.push(r.product?.name || r.comment?.slice(0, 40));
    } else if (emotionScore(r.emotion, r.rating) <= 2) {
      reviewStats.negativeThemes.push(r.product?.name || r.comment?.slice(0, 40));
    }
  }
  reviewStats.positiveThemes = [...new Set(reviewStats.positiveThemes)].slice(0, 5);
  reviewStats.negativeThemes = [...new Set(reviewStats.negativeThemes)].slice(0, 3);

  const spendTrend = Object.entries(monthlySpend)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, amount]) => ({ month, amount: Number(amount.toFixed(2)) }));

  let trendDirection = 'stable';
  if (spendTrend.length >= 2) {
    const last = spendTrend[spendTrend.length - 1].amount;
    const prev = spendTrend[spendTrend.length - 2].amount;
    if (last > prev * 1.1) trendDirection = 'up';
    else if (last < prev * 0.9) trendDirection = 'down';
  }

  const petProfiles = pets.length
    ? pets.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        breed: p.breed,
        weight: p.weight,
      }))
    : profile.petType
      ? [{ id: 'profile', name: 'Mon animal', type: profile.petType, breed: null, weight: null }]
      : [];

  return {
    profile: {
      name: profile.name,
      petType: profile.petType,
      petAge: profile.petAge,
      preferences,
      favoriteCategories,
    },
    pets: petProfiles,
    purchase: {
      orderCount,
      totalSpent: Number(totalSpent.toFixed(2)),
      avgOrderValue: orderCount ? Number((totalSpent / orderCount).toFixed(2)) : 0,
      topCategories,
      topAnimalTypes,
      purchasedProducts: purchasedProductIds,
      spendTrend,
      trendDirection,
    },
    reviews: reviewStats,
    experienceSummary: {
      loyaltyLevel:
        orderCount >= 10 ? 'fidèle' : orderCount >= 3 ? 'régulier' : orderCount >= 1 ? 'nouveau' : 'prospect',
      satisfaction:
        reviewStats.avgRating == null
          ? 'non évalué'
          : reviewStats.avgRating >= 4.5
            ? 'très satisfait'
            : reviewStats.avgRating >= 3.5
              ? 'satisfait'
              : 'à améliorer',
    },
  };
};

module.exports = { buildClientInsights };

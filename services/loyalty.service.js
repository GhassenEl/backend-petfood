const { prisma } = require('../prismaClient');
const promoService = require('./promo.service');

const POINTS_PER_DT = 1;
const REDEEM_TIERS = [
  { id: 'voucher_5', label: 'Bon 5 DT', pointsCost: 100, discountType: 'fixed', discountValue: 5 },
  { id: 'voucher_10pct', label: 'Réduction 10 %', pointsCost: 200, discountType: 'percent', discountValue: 10 },
  { id: 'voucher_15pct', label: 'Réduction 15 %', pointsCost: 350, discountType: 'percent', discountValue: 15 },
];

const getUserId = (user) => user?.id || user?._id;

const getAccount = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { loyaltyPoints: true, petType: true, favoriteCategories: true, name: true },
  });
  if (!user) return null;

  const ledger = await prisma.loyaltyLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const vouchers = await prisma.loyaltyVoucher.findMany({
    where: { userId, usedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return {
    points: user.loyaltyPoints || 0,
    tiers: REDEEM_TIERS,
    ledger,
    vouchers,
    nextTier: REDEEM_TIERS.find((t) => (user.loyaltyPoints || 0) < t.pointsCost) || null,
  };
};

const earnPoints = async (userId, points, reason, orderId = null) => {
  if (!points || points <= 0) return null;
  if (orderId) {
    const dup = await prisma.loyaltyLedger.findFirst({
      where: { userId, orderId, reason },
    });
    if (dup) return dup;
  }

  const [, entry] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { loyaltyPoints: { increment: points } },
    }),
    prisma.loyaltyLedger.create({
      data: { userId, points, reason, orderId },
    }),
  ]);
  return entry;
};

const earnForDeliveredOrder = async (order) => {
  const userId = typeof order.userId === 'object' ? order.userId?.id : order.userId;
  if (!userId) return;
  const points = Math.max(1, Math.floor(Number(order.total || 0) * POINTS_PER_DT));
  return earnPoints(userId, points, 'Commande livrée', order.id);
};

const redeemTier = async (userId, tierId) => {
  const tier = REDEEM_TIERS.find((t) => t.id === tierId);
  if (!tier) {
    const error = new Error('Palier de récompense invalide');
    error.status = 400;
    throw error;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || (user.loyaltyPoints || 0) < tier.pointsCost) {
    const error = new Error('Points insuffisants');
    error.status = 400;
    throw error;
  }

  const code = `FID-${String(userId).slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 60 * 24 * 3600 * 1000);

  const [voucher] = await prisma.$transaction([
    prisma.loyaltyVoucher.create({
      data: {
        userId,
        code,
        discountType: tier.discountType,
        discountValue: tier.discountValue,
        pointsCost: tier.pointsCost,
        expiresAt,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { loyaltyPoints: { decrement: tier.pointsCost } },
    }),
    prisma.loyaltyLedger.create({
      data: {
        userId,
        points: -tier.pointsCost,
        reason: `Échange : ${tier.label}`,
      },
    }),
  ]);

  try {
    await prisma.promoCode.create({
      data: {
        code,
        label: `Bon fidélité — ${tier.label}`,
        discountType: tier.discountType,
        discountValue: tier.discountValue,
        minOrderAmount: tier.discountType === 'fixed' ? tier.discountValue + 1 : 20,
        maxUses: 1,
        validUntil: expiresAt,
        isActive: true,
      },
    });
  } catch {
    /* promo peut déjà exister */
  }

  return voucher;
};

const getPersonalizedOffers = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { petType: true, favoriteCategories: true, loyaltyPoints: true, region: true },
  });
  if (!user) return { promos: [], products: [], message: '' };

  const now = new Date();
  const promos = await prisma.promoCode.findMany({
    where: {
      isActive: true,
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });

  const productWhere = { OR: [{ isOnSale: true }, { discount: { gt: 0 } }] };
  if (user.petType) {
    productWhere.OR.push({ animalType: user.petType });
  }

  const products = await prisma.product.findMany({
    where: productWhere,
    orderBy: [{ popularity: 'desc' }, { rating_avg: 'desc' }],
    take: 6,
  });

  let categories = [];
  try {
    categories = user.favoriteCategories ? JSON.parse(user.favoriteCategories) : [];
  } catch {
    categories = [];
  }

  const personalizedPromos = promos.slice(0, 5).map((p) => ({
    ...p,
    personalized: true,
    highlight:
      user.petType && p.label?.toLowerCase().includes(user.petType)
        ? `Adapté à votre ${user.petType === 'dog' ? 'chien' : user.petType === 'cat' ? 'chat' : 'animal'}`
        : categories.length
          ? 'Selon vos préférences'
          : null,
  }));

  return {
    points: user.loyaltyPoints || 0,
    petType: user.petType,
    region: user.region,
    promos: personalizedPromos,
    products,
    vouchers: await prisma.loyaltyVoucher.findMany({
      where: { userId, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      orderBy: { createdAt: 'desc' },
    }),
  };
};

const markVoucherUsed = async (code, userId) => {
  await prisma.loyaltyVoucher.updateMany({
    where: { code: String(code).toUpperCase(), userId, usedAt: null },
    data: { usedAt: new Date() },
  });
};

module.exports = {
  REDEEM_TIERS,
  getAccount,
  earnPoints,
  earnForDeliveredOrder,
  redeemTier,
  getPersonalizedOffers,
  markVoucherUsed,
  getUserId,
};

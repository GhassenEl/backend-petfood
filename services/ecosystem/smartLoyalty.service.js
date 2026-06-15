const { prisma, isDemoMode } = require('../../prismaClient');
const loyaltyService = require('../loyalty.service');
const { predictClientChurn } = require('../../ml/clientChurnModel');

const uid = (u) => String(u?.id || u?._id);

const VIP_TIERS = [
  { id: 'standard', label: 'Standard', minPoints: 0, discount: 0 },
  { id: 'silver', label: 'Silver', minPoints: 200, discount: 5 },
  { id: 'gold', label: 'Gold', minPoints: 500, discount: 10 },
  { id: 'vip', label: 'VIP', minPoints: 1000, discount: 15 },
];

const resolveVipTier = (points) => {
  let tier = VIP_TIERS[0];
  for (const t of VIP_TIERS) {
    if (points >= t.minPoints) tier = t;
  }
  return tier;
};

const getSmartLoyalty = async (user) => {
  const userId = uid(user);
  const account = await loyaltyService.getAccount(userId);
  const points = account?.points || 0;
  const tier = resolveVipTier(points);

  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { total: true, createdAt: true, status: true },
  });
  const lastOrder = orders[0];
  const churnMl = predictClientChurn({
    userId,
    userName: user.name,
    orderCount: orders.length,
    totalSpent: orders.reduce((s, o) => s + Number(o.total || 0), 0),
    lastOrderAt: lastOrder?.createdAt,
  });

  const personalizedOffers = [];
  if (churnMl.riskLabel === 'churn_élevé' || churnMl.riskLabel === 'à_relancer') {
    personalizedOffers.push({ type: 'winback', label: 'Bon -12 % réactivation', code: 'RETOUR12', expiresDays: 14 });
  }
  if (tier.id === 'vip') {
    personalizedOffers.push({ type: 'vip', label: 'Livraison prioritaire offerte', code: null });
  } else if (tier.id === 'gold') {
    personalizedOffers.push({ type: 'gold', label: '-10 % sur votre prochain panier', code: 'GOLD10' });
  }

  const topCategories = await prisma.order.findMany({
    where: { userId, status: 'delivered' },
    include: { items: { include: { product: { select: { category: true } } } } },
    take: 10,
  });
  const cats = {};
  for (const o of topCategories) {
    for (const it of o.items) {
      const c = it.product?.category || 'autre';
      cats[c] = (cats[c] || 0) + 1;
    }
  }
  const favCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (favCat === 'nourriture') {
    personalizedOffers.push({ type: 'habit', label: '-8 % croquettes habituelles', code: 'FOOD8' });
  }

  if (!isDemoMode() && tier.id !== (await prisma.user.findUnique({ where: { id: userId }, select: { vipTier: true } }))?.vipTier) {
    await prisma.user.update({ where: { id: userId }, data: { vipTier: tier.id } });
  }

  return {
    points,
    tier,
    tiers: VIP_TIERS,
    ledger: account?.ledger || [],
    vouchers: account?.vouchers || [],
    redeemTiers: account?.tiers || [],
    churnMl,
    personalizedOffers,
    nextTier: VIP_TIERS.find((t) => points < t.minPoints) || null,
    model: 'smart_loyalty_v1',
  };
};

module.exports = { getSmartLoyalty, VIP_TIERS, resolveVipTier };

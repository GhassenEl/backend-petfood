const { prisma, isDemoMode } = require('../../prismaClient');
const { getPetRecommendations } = require('../petRecommendation.service');

const uid = (u) => String(u?.id || u?._id);

const dailyCalories = (pet) => {
  const w = Number(pet?.weight) || (pet?.type === 'cat' ? 4 : 12);
  const mult = pet?.type === 'cat' ? 70 : 95;
  return Math.round(mult * Math.pow(w, 0.75));
};

/** Grammes croquettes / jour (≈ 4 kcal/g). */
const dailyGrams = (pet) => Math.round(dailyCalories(pet) / 4);

const loadPet = async (userId, petId, petName) => {
  if (petId) return prisma.pet.findFirst({ where: { id: petId, ownerId: userId } });
  if (petName) return prisma.pet.findFirst({ where: { ownerId: userId, name: petName } });
  return prisma.pet.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } });
};

const lastFoodOrder = async (userId) => {
  const orders = await prisma.order.findMany({
    where: { userId, status: { not: 'cancelled' } },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });
  for (const o of orders) {
    const foodItems = (o.items || []).filter(
      (it) => /croquette|nourrit|aliment|pâtée|chat|chien|food/i.test(it.product?.name || ''),
    );
    if (foodItems.length) return { order: o, items: foodItems };
  }
  return null;
};

const estimateStockGrams = async (userId, pet, lastOrder) => {
  const feeder = await prisma.petFeeder.findFirst({
    where: { ownerId: userId, petId: pet?.id || undefined },
    orderBy: { updatedAt: 'desc' },
  });
  if (feeder?.foodGrams != null && Number(feeder.foodGrams) > 0) {
    return { grams: Number(feeder.foodGrams), source: 'feeder_iot', isLowFood: Boolean(feeder.isLowFood) };
  }
  const qty = lastOrder?.items?.reduce((s, it) => s + it.quantity, 0) || 1;
  const bagKg = pet?.type === 'cat' ? 2 : 4;
  const purchasedGrams = bagKg * 1000 * qty;
  const daysSince = lastOrder?.order?.createdAt
    ? (Date.now() - new Date(lastOrder.order.createdAt).getTime()) / 86400000
    : 14;
  const consumed = dailyGrams(pet) * Math.min(daysSince, 45);
  return {
    grams: Math.max(0, purchasedGrams - consumed),
    source: 'order_consumption_model',
    isLowFood: purchasedGrams - consumed < dailyGrams(pet) * 5,
  };
};

const buildProposedOrder = async (user, pet) => {
  const reco = await getPetRecommendations(user, { petId: pet?.id, limit: 6 }).catch(() => ({ recommendations: [] }));
  const products = (reco.recommendations || []).filter((p) => p?.id);
  const main = products[0] || (await prisma.product.findFirst({
    where: { OR: [{ category: 'nourriture' }, { name: { contains: 'Croquette' } }] },
  }));
  if (!main) {
    return {
      items: [],
      subtotal: 0,
      message: 'Aucun produit recommandé — parcourez la boutique',
    };
  }
  const price = Number(main.discountPrice || main.price || 0);
  const qty = pet?.type === 'cat' ? 1 : 1;
  return {
    items: [{ productId: main.id, name: main.name, quantity: qty, unitPrice: price }],
    subtotal: Math.round(price * qty * 100) / 100,
    discountPercent: 10,
    subscriptionEligible: true,
    message: `Réassort suggéré : ${main.name}`,
  };
};

const getPredictiveDelivery = async (user, { petId, petName } = {}) => {
  const userId = uid(user);

  if (isDemoMode()) {
    const daysLeft = 4.2;
    const runOutAt = new Date(Date.now() + daysLeft * 86400000);
    return {
      model: 'predictive_food_v1',
      pet: { name: petName || 'Médor', type: 'dog', weight: 12 },
      stockGrams: 480,
      dailyGrams: 114,
      daysUntilEmpty: daysLeft,
      runOutAt: runOutAt.toISOString(),
      urgency: 'high',
      alert: 'La nourriture risque de manquer dans ~4 jours',
      proposedOrder: {
        items: [{ productId: 'demo_p1', name: 'Croquettes Premium 4 kg', quantity: 1, unitPrice: 89 }],
        subtotal: 89,
        discountPercent: 10,
        subscriptionEligible: true,
        message: 'Commande automatique proposée — validez en 1 clic',
      },
      autoReorderRecommended: true,
      feederLinked: true,
    };
  }

  const pet = await loadPet(userId, petId, petName);
  if (!pet) {
    const err = new Error('Animal introuvable');
    err.status = 404;
    throw err;
  }

  const last = await lastFoodOrder(userId);
  const stock = await estimateStockGrams(userId, pet, last);
  const daily = dailyGrams(pet);
  const daysUntilEmpty = daily > 0 ? Math.round((stock.grams / daily) * 10) / 10 : 0;
  const runOutAt = new Date(Date.now() + Math.max(0, daysUntilEmpty) * 86400000);
  let urgency = 'low';
  if (daysUntilEmpty <= 3 || stock.isLowFood) urgency = 'high';
  else if (daysUntilEmpty <= 7) urgency = 'medium';

  const proposedOrder = await buildProposedOrder(user, pet);

  return {
    model: 'predictive_food_v1',
    pet: { id: pet.id, name: pet.name, type: pet.type, weight: pet.weight },
    stockGrams: Math.round(stock.grams),
    dailyGrams: daily,
    daysUntilEmpty,
    runOutAt: runOutAt.toISOString(),
    urgency,
    alert:
      urgency === 'high'
        ? `Réapprovisionnement recommandé — stock estimé ${daysUntilEmpty} jour(s)`
        : `Stock OK pour environ ${daysUntilEmpty} jours`,
    stockSource: stock.source,
    lastOrderAt: last?.order?.createdAt || null,
    proposedOrder,
    autoReorderRecommended: urgency !== 'low',
    feederLinked: stock.source === 'feeder_iot',
  };
};

const acceptProposedOrder = async (user, body = {}) => {
  const pack = await getPredictiveDelivery(user, body);
  if (!pack.proposedOrder?.items?.length) {
    const err = new Error('Aucune proposition de commande disponible');
    err.status = 400;
    throw err;
  }
  return {
    status: 'proposal_ready',
    cart: pack.proposedOrder,
    checkoutHint: 'Utilisez POST /api/orders avec les productId listés',
    predictive: {
      daysUntilEmpty: pack.daysUntilEmpty,
      runOutAt: pack.runOutAt,
    },
  };
};

module.exports = { getPredictiveDelivery, acceptProposedOrder, dailyGrams };

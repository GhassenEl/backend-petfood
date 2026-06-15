const { completionWithSystem } = require('./groq.service');
const { buildClientInsights } = require('./clientInsights.service');
const { getPetRecommendations } = require('./petRecommendation.service');
const { getTopSellingProducts } = require('./topProductsAgent.service');
const { normalizeProductRecord } = require('../utils/productNormalize');
const { predictClientChurn } = require('../ml/clientChurnModel');
const { prisma } = require('../prismaClient');

const CLIENT_AGENT_PROMPT = `Tu es l'agent IA PetfoodTN pour les clients.
Tu analyses les achats, avis et préférences pour expliquer les tendances et recommander des produits pour animaux.
Règles :
- Réponds UNIQUEMENT en français.
- Sois concret, bienveillant, max 4 paragraphes courts.
- Cite des éléments du profil fourni (catégories, animaux, avis).
- Ne invente pas de produits : utilise uniquement la liste "recommendations" fournie.
- Termine par 1 phrase d'action (ex. ajouter au panier, compléter profil).`;

const TOP_PRODUCTS_AGENT_PROMPT = `Tu es l'agent IA "Top ventes" de PetfoodTN pour l'administration et la boutique.
Tu résumes les produits les plus vendus et les tendances du catalogue.
Réponds en français, 2-3 paragraphes, avec des chiffres du contexte JSON.`;

const buildRuleBasedSummary = (insights, recommendations) => {
  const lines = [];
  const p = insights.profile;
  const pur = insights.purchase;
  const exp = insights.experienceSummary;

  if (p.petType) lines.push(`Votre profil indique un ${p.petType}${p.petAge != null ? ` de ${p.petAge} an(s)` : ''}.`);
  if (pur.orderCount > 0) {
    lines.push(
      `Vous avez passé ${pur.orderCount} commande(s) pour ${pur.totalSpent} DT.` +
        (pur.topCategories[0] ? ` Catégorie favorite : ${pur.topCategories[0].name}.` : '')
    );
  } else {
    lines.push('Aucun achat enregistré pour le moment — vos recommandations reposent sur votre profil animal.');
  }

  if (insights.reviews.count > 0) {
    lines.push(
      `${insights.reviews.count} avis : satisfaction ${exp.satisfaction}` +
        (insights.reviews.positiveThemes[0] ? ` (ex. ${insights.reviews.positiveThemes[0]})` : '') +
        '.'
    );
  }

  if (recommendations.length) {
    lines.push(
      `Notre moteur vous propose ${recommendations.length} produit(s), dont « ${recommendations[0].name} » (${recommendations[0].recommendedReason || 'adapté à votre animal'}).`
    );
  }

  return lines.join('\n\n');
};

const buildTopProductsSummary = (topData) => {
  const top = topData.topProducts || [];
  if (!top.length) return 'Pas encore de données de vente suffisantes.';
  const leader = top[0];
  const ins = topData.insights || {};
  return [
    `Le produit le plus vendu est « ${leader.name} » (${leader.unitsSold || 0} unités, ${leader.revenue || 0} DT de CA).`,
    ins.dominantCategory ? `Catégorie dominante : ${ins.dominantCategory}.` : '',
    ins.dominantAnimal ? `Type animal le plus demandé : ${ins.dominantAnimal}.` : '',
    `Top ${top.length} analysé sur ${topData.totalOrderLines || 0} lignes de commande.`,
  ]
    .filter(Boolean)
    .join(' ');
};

const getPersonalizedRecommendations = async (user, { petId, limit = 8 } = {}) => {
  const insights = await buildClientInsights(user);
  const petResult = await getPetRecommendations(user, { petId, limit });
  const recommendations = (petResult.recommendations || []).map((p) => {
    const n = normalizeProductRecord(p);
    return {
      ...n,
      score: p.score,
      recommendedReason: p.recommendedReason || p.reasons?.[0],
      reasons: p.reasons || [],
      petName: p.petName,
      petType: p.petType,
    };
  });

  const payloadForAi = {
    insights,
    recommendations: recommendations.map((r) => ({
      id: r.id || r._id,
      name: r.name,
      category: r.category,
      animalType: r.animalType,
      score: r.score,
      reason: r.recommendedReason,
    })),
  };

  let aiSummary = buildRuleBasedSummary(insights, recommendations);
  let aiPowered = false;

  if (process.env.GROQ_API_KEY) {
    const groqText = await completionWithSystem(
      CLIENT_AGENT_PROMPT,
      `Analyse ce client et explique tendances + recommandations :\n${JSON.stringify(payloadForAi, null, 2)}`
    );
    if (groqText) {
      aiSummary = groqText;
      aiPowered = true;
    }
  }

  const trends = {
    spend: insights.purchase.spendTrend,
    direction: insights.purchase.trendDirection,
    topCategories: insights.purchase.topCategories,
    loyalty: insights.experienceSummary.loyaltyLevel,
    satisfaction: insights.experienceSummary.satisfaction,
  };

  const preferences = {
    declared: insights.profile.preferences,
    favoriteCategories: insights.profile.favoriteCategories,
    inferredFromPurchases: insights.purchase.topCategories.map((c) => c.name),
    inferredAnimalFocus: insights.purchase.topAnimalTypes.map((a) => a.type),
  };

  const userId = String(user.id || user._id);
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { total: true, createdAt: true },
  });
  const lastOrderAt = orders[0]?.createdAt;
  const churnMl = predictClientChurn({
    userId,
    userName: user.name,
    orderCount: insights.purchase.orderCount || orders.length,
    totalSpent: insights.purchase.totalSpent || orders.reduce((s, o) => s + Number(o.total || 0), 0),
    lastOrderAt,
    reviewCount: insights.reviews?.count || 0,
  });

  return {
    agent: 'client_personalization',
    aiPowered,
    mlPowered: true,
    models: ['product_fit_v1', 'churn_logistic_v1', aiPowered ? 'groq' : 'rules_scoring'],
    summary: aiSummary,
    trends,
    preferences,
    reviewExperience: insights.reviews,
    pets: petResult.pets || insights.pets,
    selectedPetId: petResult.selectedPetId,
    recommendations,
    insights,
    churnMl,
    rebuyScore: churnMl,
  };
};

const getTopProductsReport = async (options = {}) => {
  const limit = Math.min(Number(options.limit) || 10, 20);
  const days = options.days ? Number(options.days) : null;
  const topData = await getTopSellingProducts({ limit, days });

  let summary = buildTopProductsSummary(topData);
  let aiPowered = false;

  if (process.env.GROQ_API_KEY) {
    const groqText = await completionWithSystem(
      TOP_PRODUCTS_AGENT_PROMPT,
      `Résume ces top ventes :\n${JSON.stringify(topData, null, 2)}`
    );
    if (groqText) {
      summary = groqText;
      aiPowered = true;
    }
  }

  return {
    agent: 'top_products',
    aiPowered,
    summary,
    ...topData,
  };
};

const getClientInsightsOnly = async (user) => {
  const insights = await buildClientInsights(user);
  let aiSummary = null;
  let aiPowered = false;

  if (process.env.GROQ_API_KEY) {
    const groqText = await completionWithSystem(
      CLIENT_AGENT_PROMPT,
      `Décris tendances et préférences sans liste produits :\n${JSON.stringify(insights, null, 2)}`
    );
    if (groqText) {
      aiSummary = groqText;
      aiPowered = true;
    }
  }

  return {
    agent: 'client_insights',
    aiPowered,
    summary: aiSummary || buildRuleBasedSummary(insights, []),
    insights,
  };
};

module.exports = {
  getPersonalizedRecommendations,
  getTopProductsReport,
  getClientInsightsOnly,
};

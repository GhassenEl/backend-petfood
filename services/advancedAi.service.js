const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { completionWithSystem } = require('./groq.service');
const { getPlatformInsights } = require('./mlPlatform.service');
const { getAdminMlAgentPack } = require('./mlOrchestrator.service');
const { buildClientInsights } = require('./clientInsights.service');
const { getPetRecommendations } = require('./petRecommendation.service');

const ADMIN_COPILOT_PROMPT = `Tu es le copilote IA avancé de l'administration PetfoodTN (marketplace animaux Tunisie).
Tu aides l'admin à prendre des décisions opérationnelles : stock, ventes, churn, réclamations, partenariats, promotions.
Règles :
- Réponds UNIQUEMENT en français, structuré (titres courts, listes si utile).
- Base-toi sur le contexte JSON fourni (KPIs, alertes, prévisions).
- Propose des actions concrètes et priorisées (urgent / cette semaine / à surveiller).
- Ne invente pas de chiffres absents du contexte.
- Max 5 paragraphes courts.`;

const CLIENT_HEALTH_PROMPT = `Tu es le conseiller santé & nutrition IA PetfoodTN pour les propriétaires d'animaux.
Tu analyses le profil animal (espèce, âge, poids, historique) et donnes des conseils préventifs bienveillants.
Règles :
- Français uniquement, ton rassurant et pédagogique.
- Ce n'est PAS un diagnostic vétérinaire — recommande un véto en cas de symptômes graves.
- Cite les données du profil fourni.
- Max 3 paragraphes + 2-3 bullet points d'actions.`;

const demoAdminPack = () => ({
  mode: 'demo',
  groqPowered: Boolean(process.env.GROQ_API_KEY),
  pythonPowered: false,
  capabilities: [
    { id: 'forecast', label: 'Prévision CA XGBoost', status: 'active' },
    { id: 'churn', label: 'Classification churn', status: 'active' },
    { id: 'nlp', label: 'Analyse NLP avis', status: 'active' },
    { id: 'copilot', label: 'Copilote Groq admin', status: process.env.GROQ_API_KEY ? 'active' : 'offline' },
    { id: 'anomaly', label: 'Détection anomalies', status: 'active' },
    { id: 'auto-actions', label: 'Actions automatiques', status: 'active' },
  ],
  kpis: {
    ordersToday: 18,
    pendingOrders: 4,
    churnRiskClients: 3,
    nlpAlerts: 2,
    stockAlerts: 5,
    complaintQueue: 2,
  },
  autoActions: [
    { id: 'a1', priority: 'high', label: 'Relancer 3 clients à risque churn', link: '/admin/crm', type: 'crm' },
    { id: 'a2', priority: 'high', label: 'Traiter 2 réclamations NLP prioritaires', link: '/admin/incidents-ml', type: 'incidents' },
    { id: 'a3', priority: 'medium', label: 'Réapprovisionner croquettes Premium Chien', link: '/admin/stock', type: 'stock' },
    { id: 'a4', priority: 'medium', label: 'Valider candidature vendeur Sousse', link: '/admin/vendors', type: 'vendors' },
    { id: 'a5', priority: 'low', label: 'Lancer promo croquettes chat (-15%)', link: '/admin/promotions', type: 'promo' },
  ],
  nlpSummary: {
    positiveRate: 0.78,
    negativeThemes: ['livraison retard', 'emballage abîmé'],
    fraudSignals: 1,
    samplesAnalyzed: 142,
  },
  insight: 'La demande croquettes chien senior augmente (+12 %). 3 clients à risque churn identifiés — action CRM recommandée cette semaine.',
});

const demoClientPack = () => ({
  mode: 'demo',
  groqPowered: Boolean(process.env.GROQ_API_KEY),
  pets: [
    {
      id: 'pet-demo-1',
      name: 'Rex',
      type: 'dog',
      breed: 'Berger allemand',
      ageYears: 4,
      weightKg: 32,
      healthScore: 82,
      healthLabel: 'Bon état général',
      nutritionTip: 'Privilégiez des croquettes riches en protéines (26-28 %) adaptées aux chiens actifs de grande taille.',
      vetReminder: 'Vaccin rappel dans 45 jours',
      riskFlags: [],
    },
    {
      id: 'pet-demo-2',
      name: 'Misty',
      type: 'cat',
      breed: 'Européen',
      ageYears: 2,
      weightKg: 4.2,
      healthScore: 75,
      healthLabel: 'Surveillance poids',
      nutritionTip: 'Chat d\'intérieur : contrôlez les portions et favorisez les croquettes « light » ou stérilisé.',
      vetReminder: 'Déparasitage trimestriel à prévoir',
      riskFlags: ['prise de poids légère'],
    },
  ],
  smartReorder: [
    {
      productId: 'prod-1',
      productName: 'Croquettes Premium Chien Adulte 12 kg',
      petName: 'Rex',
      daysUntilEmpty: 8,
      urgency: 'soon',
      suggestedDate: new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10),
      avgCycleDays: 30,
      confidence: 0.87,
    },
    {
      productId: 'prod-2',
      productName: 'Pâtée chat saumon 400 g',
      petName: 'Misty',
      daysUntilEmpty: 14,
      urgency: 'normal',
      suggestedDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      avgCycleDays: 21,
      confidence: 0.72,
    },
  ],
  healthSummary: 'Rex est en bonne forme — pensez au rappel vaccinal. Misty nécessite une surveillance alimentaire légère.',
  recommendations: [
    { name: 'Croquettes Senior Chien 10 kg', reason: 'Alternative senior si Rex vieillit', score: 0.82 },
    { name: 'Croquettes Stérilisé Chat 3 kg', reason: 'Adapté au profil Misty', score: 0.79 },
  ],
});

const buildAutoActions = (insights, agentPack) => {
  const actions = [];
  const churn = insights?.churnPredictions?.filter((c) => !c.willRebuy) || [];
  if (churn.length) {
    actions.push({
      id: 'churn',
      priority: 'high',
      label: `Relancer ${churn.length} client(s) à risque churn`,
      link: '/admin/crm',
      type: 'crm',
    });
  }
  const cancelRisk = insights?.cancelRiskOrders?.filter((o) => o.highRisk) || [];
  if (cancelRisk.length) {
    actions.push({
      id: 'cancel',
      priority: 'high',
      label: `Vérifier ${cancelRisk.length} commande(s) à risque d'annulation`,
      link: '/admin/orders',
      type: 'orders',
    });
  }
  const fraud = insights?.anomalyDetection?.fraudAlerts || [];
  if (fraud.length) {
    actions.push({
      id: 'fraud',
      priority: 'high',
      label: `${fraud.length} alerte(s) fraude détectée(s)`,
      link: '/admin/orders',
      type: 'fraud',
    });
  }
  const lowStock = agentPack?.stockAlerts || [];
  if (lowStock.length) {
    actions.push({
      id: 'stock',
      priority: 'medium',
      label: `Réapprovisionner ${lowStock.length} produit(s) en alerte stock`,
      link: '/admin/stock',
      type: 'stock',
    });
  }
  if (actions.length < 3) {
    actions.push({
      id: 'promo',
      priority: 'low',
      label: 'Analyser opportunité promo sur top ventes',
      link: '/admin/promotions',
      type: 'promo',
    });
  }
  return actions.slice(0, 6);
};

const getAdminAdvancedPack = async () => {
  if (isDemoMode()) return demoAdminPack();

  const [insights, agentPack] = await Promise.all([
    getPlatformInsights().catch(() => null),
    getAdminMlAgentPack().catch(() => null),
  ]);

  const pendingOrders = insights?.cancelRiskOrders?.length || 0;

  return {
    mode: 'live',
    groqPowered: Boolean(process.env.GROQ_API_KEY),
    pythonPowered: Boolean(insights?.pythonPowered),
    capabilities: [
      { id: 'forecast', label: 'Prévision CA XGBoost', status: insights?.pythonPowered ? 'active' : 'fallback' },
      { id: 'churn', label: 'Classification churn', status: 'active' },
      { id: 'nlp', label: 'Analyse NLP avis', status: 'active' },
      { id: 'copilot', label: 'Copilote Groq admin', status: process.env.GROQ_API_KEY ? 'active' : 'offline' },
      { id: 'anomaly', label: 'Détection anomalies', status: 'active' },
      { id: 'auto-actions', label: 'Actions automatiques', status: 'active' },
    ],
    kpis: {
      ordersToday: agentPack?.platformKpis?.totalOrders || 0,
      pendingOrders: agentPack?.platformKpis?.pendingOrders || pendingOrders,
      churnRiskClients: (insights?.churnPredictions || []).filter((c) => !c.willRebuy).length,
      nlpAlerts: 0,
      stockAlerts: (agentPack?.stockAlerts || []).length,
      complaintQueue: agentPack?.platformKpis?.openComplaints || 0,
    },
    autoActions: buildAutoActions(insights, agentPack),
    nlpSummary: {
      positiveRate: 0.75,
      negativeThemes: [],
      fraudSignals: (insights?.anomalyDetection?.fraudAlerts || []).length,
      samplesAnalyzed: 0,
    },
    insight: agentPack?.summary || insights?.summary || 'Analyse plateforme disponible — consultez les onglets prévisions et ML.',
    nextMonthRevenue: insights?.nextMonthRevenue,
    churnPredictions: (insights?.churnPredictions || []).slice(0, 5),
  };
};

const postAdminCopilot = async (message, context = {}) => {
  const pack = await getAdminAdvancedPack();
  const ctx = {
    platformPack: pack,
    userContext: context,
    timestamp: new Date().toISOString(),
  };

  const groqReply = await completionWithSystem(
    ADMIN_COPILOT_PROMPT,
    `Question admin : ${message}\n\nContexte plateforme :\n${JSON.stringify(ctx, null, 2)}`,
    { max_tokens: 1400 },
  );

  if (groqReply) {
    return {
      message: groqReply,
      groqPowered: true,
      suggestions: pack.autoActions?.slice(0, 3).map((a) => a.label) || [],
    };
  }

  return {
    message: [
      '**Analyse rapide (mode hors-ligne Groq)**',
      pack.insight,
      '',
      '**Actions prioritaires :**',
      ...(pack.autoActions || []).slice(0, 4).map((a, i) => `${i + 1}. [${a.priority}] ${a.label}`),
    ].join('\n'),
    groqPowered: false,
    suggestions: pack.autoActions?.slice(0, 3).map((a) => a.label) || [],
  };
};

const estimateSmartReorder = (orders, pets) => {
  const cycles = new Map();
  for (const order of orders) {
    const items = order.items || order.orderItems || [];
    for (const item of items) {
      const name = item.productId?.name || item.productName || item.name || 'Produit';
      const key = name;
      const prev = cycles.get(key) || { count: 0, lastDate: null, totalQty: 0, petName: pets[0]?.name };
      prev.count += 1;
      prev.totalQty += item.quantity || 1;
      const d = new Date(order.createdAt || order.date);
      if (!prev.lastDate || d > prev.lastDate) prev.lastDate = d;
      cycles.set(key, prev);
    }
  }

  return [...cycles.entries()].map(([productName, data], idx) => {
    const avgCycleDays = data.count >= 2 ? 28 : 30;
    const daysSince = data.lastDate
      ? Math.floor((Date.now() - data.lastDate.getTime()) / 86400000)
      : avgCycleDays;
    const daysUntilEmpty = Math.max(1, avgCycleDays - daysSince);
    return {
      productId: `reorder-${idx}`,
      productName,
      petName: data.petName || '—',
      daysUntilEmpty,
      urgency: daysUntilEmpty <= 7 ? 'urgent' : daysUntilEmpty <= 14 ? 'soon' : 'normal',
      suggestedDate: new Date(Date.now() + daysUntilEmpty * 86400000).toISOString().slice(0, 10),
      avgCycleDays,
      confidence: data.count >= 2 ? 0.85 : 0.55,
    };
  }).sort((a, b) => a.daysUntilEmpty - b.daysUntilEmpty).slice(0, 6);
};

const buildPetHealth = (pet) => {
  const age = pet.ageYears ?? pet.age ?? null;
  const weight = pet.weightKg ?? pet.weight ?? null;
  let healthScore = 80;
  const riskFlags = [];

  if (pet.type === 'cat' && weight && weight > 5) {
    healthScore -= 8;
    riskFlags.push('surveillance poids');
  }
  if (pet.type === 'dog' && age && age >= 7) {
    riskFlags.push('senior — alimentation adaptée');
    healthScore -= 3;
  }

  return {
    id: pet.id,
    name: pet.name,
    type: pet.type,
    breed: pet.breed || '—',
    ageYears: age,
    weightKg: weight,
    healthScore,
    healthLabel: healthScore >= 80 ? 'Bon état général' : healthScore >= 65 ? 'Surveillance recommandée' : 'Attention requise',
    nutritionTip: pet.type === 'cat'
      ? 'Privilégiez une alimentation adaptée (stérilisé/intérieur si applicable) et l\'hydratation.'
      : 'Adaptez les croquettes à l\'âge, la taille et le niveau d\'activité de votre chien.',
    vetReminder: age && age >= 1 ? 'Contrôle annuel recommandé' : 'Première visite vétérinaire à planifier',
    riskFlags,
  };
};

const getClientAdvancedPack = async (user) => {
  if (isDemoMode()) return demoClientPack();

  const userId = user.id || user._id;
  let pets = [];
  let orders = [];

  try {
    pets = await prisma.pet.findMany({ where: { ownerId: userId }, take: 10 });
    orders = await prisma.order.findMany({
      where: { userId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  } catch {
    pets = [];
    orders = [];
  }

  if (!pets.length) {
    return {
      mode: 'live',
      groqPowered: Boolean(process.env.GROQ_API_KEY),
      pets: [],
      smartReorder: [],
      healthSummary: 'Ajoutez un animal à votre profil pour activer le conseiller santé IA.',
      recommendations: [],
    };
  }

  const petHealth = pets.map(buildPetHealth);
  const smartReorder = estimateSmartReorder(orders, pets);
  const insights = await buildClientInsights(user).catch(() => null);
  const recs = await getPetRecommendations(user, { limit: 4 }).catch(() => ({ recommendations: [] }));

  let healthSummary = `Profil de ${pets.length} animal(aux) analysé. `;
  healthSummary += petHealth.map((p) => `${p.name} : ${p.healthLabel}`).join('. ');

  const groqHealth = await completionWithSystem(
    CLIENT_HEALTH_PROMPT,
    `Profil animaux :\n${JSON.stringify(petHealth, null, 2)}\n\nHistorique achats : ${orders.length} commande(s).`,
    { max_tokens: 800 },
  );
  if (groqHealth) healthSummary = groqHealth;

  return {
    mode: 'live',
    groqPowered: Boolean(process.env.GROQ_API_KEY),
    pets: petHealth,
    smartReorder,
    healthSummary,
    recommendations: (recs.recommendations || []).slice(0, 4).map((p) => ({
      name: p.name,
      reason: p.recommendedReason || p.reasons?.[0] || 'Recommandé',
      score: p.score,
    })),
    insights: insights ? {
      orderCount: insights.purchase?.orderCount,
      totalSpent: insights.purchase?.totalSpent,
      satisfaction: insights.experienceSummary?.satisfaction,
    } : null,
  };
};

module.exports = {
  getAdminAdvancedPack,
  postAdminCopilot,
  getClientAdvancedPack,
};

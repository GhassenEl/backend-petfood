/**

 * Orchestration IA : fusion Groq + XGBoost + scoring règles pour la plateforme.

 */

const { getPlatformInsights, rankSeniorDogProducts, getOrderCancelRisk } = require('./mlPlatform.service');

const { exportMlSnapshot } = require('./mlDataExport.service');

const { getPersonalizedRecommendations } = require('./aiRecommendationAgent.service');

const { getPetRecommendations } = require('./petRecommendation.service');

const { checkPythonMlHealth } = require('./mlPythonClient');

const { getLifeStage } = require('./feederNutrition.service');



const rankForPet = async (snapshot, userId, pet, limit = 6) => {

  const userOrders = snapshot.orders.filter((o) => o.userId === userId);

  return rankSeniorDogProducts({

    pet: {

      id: pet.id,

      ownerId: pet.ownerId || userId,

      name: pet.name,

      type: pet.type,

      breed: pet.breed,

      birthDate: pet.birthDate,

      weight: pet.weight,

    },

    products: snapshot.products,

    orders: userOrders.length ? userOrders : snapshot.orders,

    limit,

  });

};



const getClientAiPack = async (user) => {

  const [aiReco, petReco, mlHealth] = await Promise.all([

    getPersonalizedRecommendations(user, { limit: 8 }).catch(() => null),

    getPetRecommendations(user, { limit: 8 }).catch(() => null),

    checkPythonMlHealth().catch(() => ({ ok: false })),

  ]);



  let mlRanking = null;

  let rebuyScore = null;

  let topDemand = [];



  if (mlHealth?.ok) {

    try {

      const snapshot = await exportMlSnapshot();

      const userId = String(user.id || user._id);

      const userPets = snapshot.pets.filter((p) => p.ownerId === userId);

      const pet =

        userPets[0] ||

        snapshot.pets.find((p) => p.ownerId === userId) ||

        petReco?.pets?.[0];



      if (pet) {

        const ranking = await rankForPet(snapshot, userId, pet);

        if (ranking?.length) {

          mlRanking = { pet, items: ranking };

        }

      }



      const platform = await getPlatformInsights();

      const churn = platform.churnPredictions || [];

      rebuyScore = churn.find((c) => c.userId === userId) || null;

      topDemand = (platform.productDemand || []).slice(0, 5);

    } catch (err) {

      console.warn('[ML Orchestrator] client pack:', err.message);

    }

  }



  const hasMlBoost = Boolean(

    petReco?.recommendations?.some((r) => r.mlBoosted) || mlRanking?.items?.length

  );



  return {

    role: 'client',

    pythonPowered: mlHealth?.ok && hasMlBoost,

    groqPowered: Boolean(aiReco?.aiPowered),

    models: [

      mlHealth?.ok ? 'xgboost' : null,

      aiReco?.aiPowered ? 'groq' : null,

      'rules_scoring',

    ].filter(Boolean),

    summary: aiReco?.summary || petReco?.recommendations?.[0]?.recommendedReason,

    personalized: aiReco,

    petRecommendations: petReco,

    mlRanking,

    rebuyScore,

    trendingProducts: topDemand,

    nextMonthHint: null,

  };

};

const getClientMlAgentPack = async (user) => {
  const userId = String(user.id || user._id);
  const [personalized, petReco, mlHealth] = await Promise.all([
    getPersonalizedRecommendations(user, { limit: 10 }).catch(() => null),
    getPetRecommendations(user, { limit: 10 }).catch(() => null),
    checkPythonMlHealth().catch(() => ({ ok: false })),
  ]);

  let petRankings = [];
  let mlRanking = null;
  let rebuyScore = null;
  let topDemand = [];
  let pythonPowered = false;

  let snapshot = { products: [], pets: [], orders: [] };
  try {
    snapshot = await exportMlSnapshot();
  } catch {
    snapshot = { products: [], pets: [], orders: [] };
  }

  const userPets = snapshot.pets.filter((p) => p.ownerId === userId);

  if (mlHealth?.ok) {
    try {
      for (const pet of userPets.slice(0, 5)) {
        const items = await rankForPet(snapshot, userId, pet, 6);
        if (items?.length) {
          petRankings.push({
            pet: { id: pet.id, name: pet.name, type: pet.type, breed: pet.breed },
            items,
          });
        }
      }
      if (petRankings[0]) mlRanking = petRankings[0];
      const platform = await getPlatformInsights();
      rebuyScore = platform.churnPredictions?.find((c) => c.userId === userId) || null;
      topDemand = (platform.productDemand || []).slice(0, 6);
      pythonPowered = Boolean(platform.pythonPowered || petRankings.length > 0);
    } catch (err) {
      console.warn('[ML Orchestrator] client agent:', err.message);
    }
  }

  const adoptionCatalog = (snapshot.products || [])
    .filter((p) => p.category === 'animaux')
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      name: p.name,
      animalType: p.animalType,
      price: p.price,
      category: p.category,
    }));

  const actionHints = [];
  if (rebuyScore && (rebuyScore.rebuyProbability ?? 1) < 0.45) {
    actionHints.push({
      type: 'reorder',
      label: 'Réassort recommandé selon vos habitudes d\'achat',
      link: '/client-products',
    });
  }
  if (userPets.length > 0) {
    actionHints.push({
      type: 'feeder',
      label: `Nutrition IoT pour ${userPets[0].name}`,
      link: '/pet-feeder',
    });
  }
  if (adoptionCatalog.length > 0) {
    actionHints.push({
      type: 'adoption',
      label: 'Animaux à adopter sur PetfoodTN',
      link: '/client-products?category=animaux',
    });
  }
  actionHints.push({
    type: 'chat',
    label: 'Discuter avec l\'assistant catalogue (Groq)',
    link: '/client-ai',
  });

  const topRecommendations = (personalized?.recommendations || petReco?.recommendations || []).slice(0, 10);

  return {
    role: 'client',
    agent: 'client_ml_agent',
    pythonPowered,
    groqPowered: Boolean(personalized?.aiPowered),
    models: [
      pythonPowered ? 'xgboost' : null,
      personalized?.aiPowered ? 'groq' : null,
      'pet_scoring',
      'rules_scoring',
    ].filter(Boolean),
    summary: personalized?.summary || petReco?.recommendations?.[0]?.recommendedReason,
    trends: personalized?.trends,
    preferences: personalized?.preferences,
    reviewExperience: personalized?.reviewExperience,
    pets: personalized?.pets || petReco?.pets || userPets,
    personalized,
    petRecommendations: petReco,
    mlRanking,
    petRankings,
    rebuyScore,
    trendingProducts: topDemand,
    topRecommendations,
    adoptionCatalog,
    actionHints,
    tip: personalized?.aiPowered
      ? 'Analyse Groq + modèles XGBoost actifs pour vos animaux'
      : 'Activez le service ML Python pour des recommandations encore plus précises',
  };
};

const getAdminMlPack = async () => {

  const [insights, riskMap, mlHealth] = await Promise.all([

    getPlatformInsights().catch(() => ({})),

    getAdminOrdersRiskMap().catch(() => ({ list: [], risks: {} })),

    checkPythonMlHealth().catch(() => ({ ok: false })),

  ]);



  const churn = insights.churnPredictions || [];

  return {

    role: 'admin',

    pythonPowered: Boolean(insights.pythonPowered || mlHealth?.ok),

    models: insights.pythonPowered || mlHealth?.ok
      ? ['xgboost', 'churn', 'cancel_risk', 'demand_forecast']
      : ['rules_scoring'],

    nextMonthRevenue: insights.nextMonthRevenue,

    productDemand: insights.productDemand?.slice(0, 10) || [],

    churnHighRisk: churn.filter((c) => (c.rebuyProbability ?? 1) < 0.45).slice(0, 8),

    cancelRisks: riskMap.list?.slice(0, 10) || [],

    anomalies: insights.anomalyDetection,

    fraudSignals: insights.fraudDetection?.slice?.(0, 5) || insights.fraudDetection || [],

  };

};



const normalizeCancelRisk = (r) => {
  const cancelRisk = Number(r.cancelRisk ?? r.cancelProbability ?? 0.2);
  return {
    orderId: r.orderId,
    cancelRisk,
    highRisk: Boolean(r.highRisk ?? cancelRisk >= 0.45),
    model: r.model || 'rules',
    riskLabel: cancelRisk >= 0.45 ? 'élevé' : cancelRisk >= 0.3 ? 'moyen' : 'faible',
  };
};

const getLivreurOrdersRiskMap = async (user) => {
  const region = user.region || user.city || null;

  const [insights, snapshot, mlHealth] = await Promise.all([
    getPlatformInsights().catch(() => ({})),
    exportMlSnapshot(),
    checkPythonMlHealth().catch(() => ({ ok: false })),
  ]);

  const risks = {};
  for (const r of insights.cancelRiskOrders || []) {
    risks[r.orderId] = normalizeCancelRisk(r);
  }

  const isRelevant = (o) => {
    const st = String(o.status || '').toLowerCase();
    if (!['pending', 'shipped', 'processing', 'paid'].includes(st)) return false;
    if (region && o.region && o.region !== region) return false;
    return true;
  };

  const relevant = (snapshot.orders || []).filter(isRelevant);
  const toEnrich = relevant.filter((o) => !risks[o.id]).slice(0, 25);

  await Promise.all(
    toEnrich.map(async (o) => {
      try {
        const hist = snapshot.orders.filter((x) => x.userId === o.userId && x.id !== o.id);
        const risk = await getOrderCancelRisk(o, hist);
        risks[o.id] = normalizeCancelRisk({ ...risk, orderId: o.id });
      } catch {
        risks[o.id] = normalizeCancelRisk({
          orderId: o.id,
          cancelRisk: Number(o.total) > 450 ? 0.5 : 0.22,
        });
      }
    })
  );

  const poolPriority = relevant
    .filter((o) => String(o.status).toLowerCase() === 'pending')
    .map((o) => {
      const r = risks[o.id] || normalizeCancelRisk({ orderId: o.id, cancelRisk: 0.2 });
      const priorityScore = Math.round(
        100 - r.cancelRisk * 45 + Math.min(Number(o.total || 0) / 25, 12)
      );
      return {
        orderId: o.id,
        total: o.total,
        region: o.region,
        priorityScore,
        cancelRisk: r.cancelRisk,
        highRisk: r.highRisk,
        riskLabel: r.riskLabel,
        recommendation: r.highRisk
          ? 'Appeler le client avant de prendre la course'
          : 'Course recommandée par IA',
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const highCancelRiskDeliveries = Object.values(risks)
    .filter((r) => r.cancelRisk >= 0.35)
    .sort((a, b) => b.cancelRisk - a.cancelRisk)
    .slice(0, 12);

  const hourLoad = insights.anomalyDetection?.peakHours;
  const todayDeliveriesForecast = Math.max(
    1,
    Math.round(poolPriority.length * 0.6 + (insights.productDemand?.length || 4) * 0.5)
  );

  return {
    pythonPowered: Boolean(insights.pythonPowered || mlHealth?.ok),
    models: insights.pythonPowered || mlHealth?.ok
      ? ['xgboost_cancel', 'route_priority', 'demand_forecast']
      : ['route_rules'],
    region: region || 'Grand Tunis',
    risks,
    poolPriority,
    highCancelRiskDeliveries,
    busyHoursHint: Array.isArray(hourLoad) ? hourLoad.join(' · ') : '17h–20h',
    todayDeliveriesForecast,
    commissionForecastDt: todayDeliveriesForecast * 5,
    productDemand: (insights.productDemand || []).slice(0, 5),
    tip:
      highCancelRiskDeliveries.length > 0
        ? `${highCancelRiskDeliveries.length} commande(s) à risque d'annulation — confirmez avec le client avant départ`
        : 'Priorisez les courses à score IA élevé dans la file d\'attente',
  };
};

const getLivreurMlPack = async (user) => {
  const pack = await getLivreurOrdersRiskMap(user);
  return { role: 'livreur', ...pack };
};



const getVetMlPack = async (user) => {

  const snapshot = await exportMlSnapshot();

  const userId = String(user.id || user._id);

  const platform = await getPlatformInsights().catch(() => ({}));



  const pets = snapshot.pets;

  const speciesBreakdown = pets.reduce((acc, p) => {

    acc[p.type] = (acc[p.type] || 0) + 1;

    return acc;

  }, {});



  const seniorPets = pets.filter((p) => getLifeStage(p) === 'senior');

  const nutritionDemand = (platform.productDemand || []).filter(

    (d) => !d.category || d.category === 'nourriture' || String(d.productName || '').toLowerCase().includes('croquette')

  );



  const animalSales = snapshot.products.filter((p) => p.category === 'animaux').slice(0, 5);



  return {

    role: 'vet',

    pythonPowered: Boolean(platform.pythonPowered),

    models: platform.pythonPowered ? ['xgboost', 'senior_care', 'demand_forecast'] : ['clinical_rules'],

    speciesBreakdown,

    seniorPetCount: seniorPets.length,

    seniorPetSamples: seniorPets.slice(0, 5).map((p) => ({ id: p.id, name: p.name, type: p.type })),

    nutritionDemand: nutritionDemand.slice(0, 8),

    adoptionCatalog: animalSales,

    tip:

      seniorPets.length > 0

        ? `${seniorPets.length} patient(s) senior — privilégiez aliments adaptés et suivi poids`

        : 'Répartition espèces stable — consultez les tendances nutrition ci-dessous',

  };

};



const getAdminOrdersRiskMap = async () => {

  const insights = await getPlatformInsights();

  const risks = insights.cancelRiskOrders || [];

  return {

    pythonPowered: insights.pythonPowered,

    risks: risks.reduce((acc, r) => {

      acc[r.orderId] = r;

      return acc;

    }, {}),

    list: risks,

    anomalies: insights.anomalyDetection,

    nextMonthRevenue: insights.nextMonthRevenue,

    productDemand: insights.productDemand?.slice(0, 10) || [],

  };

};



module.exports = {

  getClientAiPack,

  getClientMlAgentPack,

  getAdminMlPack,

  getLivreurMlPack,

  getLivreurOrdersRiskMap,

  getVetMlPack,

  getAdminOrdersRiskMap,

  getOrderCancelRisk,

};



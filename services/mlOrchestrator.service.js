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



const getLivreurMlPack = async (user) => {

  const insights = await getPlatformInsights().catch(() => ({}));

  const region = user.region || user.city || 'Grand Tunis';

  const risky = (insights.cancelRiskOrders || [])

    .filter((r) => (r.cancelProbability ?? 0) >= 0.35)

    .slice(0, 8);



  const hourLoad = insights.anomalyDetection?.peakHours || ['17:00', '19:00'];



  return {

    role: 'livreur',

    pythonPowered: Boolean(insights.pythonPowered),

    models: insights.pythonPowered ? ['xgboost', 'cancel_risk', 'route_rules'] : ['route_rules'],

    region,

    highCancelRiskDeliveries: risky,

    busyHoursHint: Array.isArray(hourLoad) ? hourLoad.join(' · ') : '17h–20h',

    productDemand: insights.productDemand?.slice(0, 5) || [],

    tip:

      risky.length > 0

        ? `${risky.length} livraison(s) à risque d'annulation — confirmez avec le client avant départ`

        : 'Charge normale prévue sur votre secteur',

  };

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

  getAdminMlPack,

  getLivreurMlPack,

  getVetMlPack,

  getAdminOrdersRiskMap,

  getOrderCancelRisk,

};



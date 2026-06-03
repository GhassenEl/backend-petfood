/**

 * Orchestration IA : fusion Groq + XGBoost + scoring règles pour la plateforme.

 */

const { getPlatformInsights, rankSeniorDogProducts, getOrderCancelRisk } = require('./mlPlatform.service');

const { exportMlSnapshot } = require('./mlDataExport.service');

const { getPersonalizedRecommendations, getTopProductsReport } = require('./aiRecommendationAgent.service');

const { getPetRecommendations } = require('./petRecommendation.service');

const { checkPythonMlHealth } = require('./mlPythonClient');

const { getLifeStage } = require('./feederNutrition.service');

const { completionWithSystem, VET_SYSTEM_PROMPT } = require('./groq.service');

const { getClinicProfile, getClinicStats } = require('./clinic.service');

const { getVetClinicalAlerts } = require('./clinicalAlerts.service');

const { getMedicationCatalog, getLowStockAlerts } = require('./pharmacy.service');

const { prisma, isDemoMode } = require('../prismaClient');

const resolveVetId = (user) => String(user?.id || user?._id || '');

const groqBrief = async (prompt, payload) => {
  try {
    const text = await completionWithSystem(
      VET_SYSTEM_PROMPT,
      `${prompt}\n\nDonnées:\n${JSON.stringify(payload, null, 2).slice(0, 3500)}`,
      { max_tokens: 400 }
    );
    return text || null;
  } catch {
    return null;
  }
};

const getVetUpcomingAppointments = async (vetId, limit = 8) => {
  if (isDemoMode()) {
    return [
      { id: 'demo-appt-1', petName: 'Rex', date: new Date(Date.now() + 86400000).toISOString(), type: 'consultation', status: 'scheduled' },
    ];
  }
  const now = new Date();
  return prisma.petAppointment.findMany({
    where: {
      vetId,
      date: { gte: now },
      status: { in: ['scheduled', 'pending', 'confirmed'] },
    },
    orderBy: { date: 'asc' },
    take: limit,
    select: { id: true, petName: true, date: true, type: true, status: true },
  });
};



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

const getAdminMlAgentPack = async () => {
  const [insights, riskMap, mlHealth, topReport, snapshot] = await Promise.all([
    getPlatformInsights().catch(() => ({})),
    getAdminOrdersRiskMap().catch(() => ({ list: [], risks: {}, pythonPowered: false })),
    checkPythonMlHealth().catch(() => ({ ok: false })),
    getTopProductsReport({ limit: 10 }).catch(() => null),
    exportMlSnapshot().catch(() => ({ orders: [], products: [], users: [], pets: [] })),
  ]);

  const orders = snapshot.orders || [];
  const products = snapshot.products || [];
  const users = snapshot.users || [];
  const churn = insights.churnPredictions || [];
  const churnHighRisk = churn
    .filter((c) => (c.rebuyProbability ?? 1) < 0.45)
    .slice(0, 12);

  const cancelList = (riskMap.list || [])
    .map((r) => normalizeCancelRisk(r))
    .sort((a, b) => b.cancelRisk - a.cancelRisk)
    .slice(0, 15);

  const pendingOrders = orders.filter((o) =>
    ['pending', 'processing', 'paid'].includes(String(o.status || '').toLowerCase())
  ).length;

  const lowStockProducts = products
    .filter((p) => Number(p.stock ?? 0) < 10)
    .slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock, category: p.category }));

  const rev = insights.nextMonthRevenue || {};
  const forecastRevenue = Number(rev.forecastRevenue ?? rev.predicted ?? 0);

  const actionHints = [];
  if (cancelList.length) {
    actionHints.push({
      type: 'cancel_risk',
      label: `${cancelList.length} commande(s) à risque d'annulation`,
      link: '/admin/orders',
    });
  }
  if (churnHighRisk.length) {
    actionHints.push({
      type: 'churn',
      label: `${churnHighRisk.length} client(s) à risque churn`,
      link: '/admin/users',
    });
  }
  if (lowStockProducts.length) {
    actionHints.push({
      type: 'stock',
      label: `${lowStockProducts.length} produit(s) en stock faible`,
      link: '/admin/products',
    });
  }
  actionHints.push({
    type: 'dashboard',
    label: 'Tableau de bord et historique',
    link: '/admin/dashboard',
  });

  const ruleSummary = [
    forecastRevenue
      ? `CA prévu mois prochain : ${Math.round(forecastRevenue).toLocaleString('fr-FR')} DT.`
      : '',
    `${pendingOrders} commande(s) en cours de traitement.`,
    cancelList.length ? `${cancelList.length} livraison(s) sensibles à l'annulation.` : '',
    churnHighRisk.length ? `${churnHighRisk.length} client(s) à relancer.` : '',
    topReport?.topProducts?.[0] ? `Meilleure vente : ${topReport.topProducts[0].name}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    role: 'admin',
    agent: 'admin_ml_agent',
    pythonPowered: Boolean(insights.pythonPowered || mlHealth?.ok || riskMap.pythonPowered),
    groqPowered: Boolean(topReport?.aiPowered),
    models: [
      insights.pythonPowered || mlHealth?.ok ? 'xgboost' : null,
      topReport?.aiPowered ? 'groq' : null,
      'churn_classifier',
      'cancel_risk',
      'demand_forecast',
      'anomaly_detection',
    ].filter(Boolean),
    summary: topReport?.summary || ruleSummary,
    tip: insights.pythonPowered
      ? 'XGBoost + Groq actifs — surveillez les alertes rouges ci-dessous'
      : 'Lancez le service ML Python (port 8000) pour activer XGBoost',
    nextMonthRevenue: rev,
    productDemand: insights.productDemand?.slice(0, 12) || [],
    churnPredictions: churn.slice(0, 12),
    churnHighRisk,
    cancelRisks: cancelList,
    cancelRiskOrders: insights.cancelRiskOrders || cancelList,
    ordersRisk: riskMap.risks || {},
    anomalies: insights.anomalyDetection,
    fraudSignals: insights.fraudDetection?.slice?.(0, 8) || insights.fraudDetection || [],
    seniorDogRanking: insights.seniorDogRanking,
    topProducts: topReport?.topProducts || [],
    topProductsInsights: topReport?.insights || null,
    platformKpis: {
      totalOrders: orders.length,
      pendingOrders,
      clients: users.filter((u) => u.role === 'client').length,
      livreurs: users.filter((u) => u.role === 'livreur').length,
      products: products.length,
      pets: (snapshot.pets || []).length,
      adoptionListings: products.filter((p) => p.category === 'animaux').length,
    },
    lowStockProducts,
    actionHints,
    platformInsights: insights,
  };
};

const getAdminMlPack = async () => {
  const pack = await getAdminMlAgentPack();
  const { platformInsights, topProductsInsights, ...lite } = pack;
  return lite;
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



const getVetMlAgentPack = async (user) => {
  const vetId = resolveVetId(user);
  const snapshot = await exportMlSnapshot();
  const platform = await getPlatformInsights().catch(() => ({}));
  const mlHealth = await checkPythonMlHealth().catch(() => ({ ok: false }));

  const pets = snapshot.pets || [];
  const speciesBreakdown = pets.reduce((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {});

  const seniorPets = pets.filter((p) => getLifeStage(p) === 'senior');
  const nutritionDemand = (platform.productDemand || []).filter(
    (d) =>
      !d.category ||
      d.category === 'nourriture' ||
      String(d.productName || '').toLowerCase().includes('croquette')
  );
  const animalSales = (snapshot.products || []).filter((p) => p.category === 'animaux').slice(0, 6);

  let seniorRankings = [];
  if (platform.pythonPowered || mlHealth?.ok) {
    for (const pet of seniorPets.slice(0, 3)) {
      const items = await rankForPet(snapshot, pet.ownerId, pet, 4);
      if (items?.length) {
        seniorRankings.push({
          pet: { id: pet.id, name: pet.name, type: pet.type },
          items,
        });
      }
    }
  }

  const ruleSummary = [
    `${seniorPets.length} patient(s) senior sur la plateforme.`,
    Object.keys(speciesBreakdown).length
      ? `Espèces : ${Object.entries(speciesBreakdown)
          .map(([k, v]) => `${k} (${v})`)
          .join(', ')}.`
      : '',
    nutritionDemand[0] ? `Tendance nutrition : ${nutritionDemand[0].productName}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const groqSummary = await groqBrief(
    'Synthèse courte (4 phrases max) pour le vétérinaire : patients seniors, espèces et nutrition.',
    { speciesBreakdown, seniorPetCount: seniorPets.length, nutritionDemand: nutritionDemand.slice(0, 4) }
  );

  const actionHints = [
    { type: 'clinical_ml', label: 'Agent anomalies & maladie', link: '/vet/diagnostics' },
    { type: 'diagnostics', label: 'Diagnostic IA patient', link: '/vet/diagnostics' },
    { type: 'dossiers', label: 'Dossiers médicaux', link: '/vet/medical-dossiers' },
    { type: 'calendar', label: 'Calendrier RDV', link: '/vet/calendar' },
    { type: 'hub', label: 'Hub agents IA', link: '/vet/ml-agent' },
  ];

  return {
    role: 'vet',
    agent: 'vet_ml_agent',
    pythonPowered: Boolean(platform.pythonPowered || mlHealth?.ok),
    groqPowered: Boolean(groqSummary),
    models: [
      platform.pythonPowered || mlHealth?.ok ? 'xgboost' : null,
      groqSummary ? 'groq' : null,
      'senior_care',
      'demand_forecast',
      'clinical_rules',
    ].filter(Boolean),
    summary: groqSummary || ruleSummary,
    tip:
      seniorPets.length > 0
        ? `${seniorPets.length} patient(s) senior — aliments adaptés et suivi poids recommandés`
        : 'Consultez les tendances nutrition et le hub clinique / pharmacie',
    speciesBreakdown,
    seniorPetCount: seniorPets.length,
    seniorPetSamples: seniorPets.slice(0, 6).map((p) => ({ id: p.id, name: p.name, type: p.type })),
    seniorRankings,
    nutritionDemand: nutritionDemand.slice(0, 8),
    adoptionCatalog: animalSales,
    actionHints,
  };
};

const getClinicMlAgentPack = async (user) => {
  const vetId = resolveVetId(user);
  const [clinic, stats, alerts, upcoming, platform, mlHealth] = await Promise.all([
    getClinicProfile(vetId).catch(() => ({})),
    getClinicStats(vetId).catch(() => ({})),
    getVetClinicalAlerts(vetId).catch(() => []),
    getVetUpcomingAppointments(vetId),
    getPlatformInsights().catch(() => ({})),
    checkPythonMlHealth().catch(() => ({ ok: false })),
  ]);

  const highAlerts = (alerts || []).filter((a) => a.severity === 'high');
  const ruleSummary = [
    clinic.clinicName ? `Cabinet : ${clinic.clinicName}.` : '',
    stats.todayAppointments != null ? `${stats.todayAppointments} RDV aujourd'hui.` : '',
    stats.vaccinesDueSoon != null ? `${stats.vaccinesDueSoon} rappel(s) vaccin sous 30 j.` : '',
    highAlerts.length ? `${highAlerts.length} alerte(s) prioritaire(s).` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const groqSummary = await groqBrief(
    'Synthèse opérationnelle clinique (4 phrases) : planning, dossiers, vaccins, alertes.',
    { clinic: { clinicName: clinic.clinicName, region: clinic.region }, stats, alerts: alerts.slice(0, 6) }
  );

  const actionHints = [
    { type: 'calendar', label: 'Calendrier & RDV', link: '/vet/calendar' },
    { type: 'dossiers', label: 'Dossiers médicaux', link: '/vet/medical-dossiers' },
    { type: 'vaccines', label: 'Vaccinations', link: '/vet/vaccinations' },
    { type: 'clinic', label: 'Profil clinique', link: '/vet/clinic' },
    { type: 'contact', label: 'Demandes contact', link: '/vet/contact-requests' },
  ];

  return {
    role: 'vet',
    agent: 'clinic_ml_agent',
    pythonPowered: Boolean(platform.pythonPowered || mlHealth?.ok),
    groqPowered: Boolean(groqSummary),
    models: ['clinical_rules', 'appointment_scoring', platform.pythonPowered ? 'xgboost' : null, groqSummary ? 'groq' : null].filter(Boolean),
    summary: groqSummary || ruleSummary,
    tip:
      stats.vaccinesDueSoon > 0
        ? `${stats.vaccinesDueSoon} rappel(s) vaccin à planifier`
        : 'Planning stable — vérifiez les dossiers non signés',
    clinic,
    clinicStats: stats,
    clinicalAlerts: alerts.slice(0, 12),
    upcomingAppointments: upcoming.map((a) => ({
      ...a,
      dateLabel: a.date ? new Date(a.date).toLocaleString('fr-FR') : '',
      link: `/vet/appointments/${a.id}`,
    })),
    alertCounts: {
      total: alerts.length,
      high: highAlerts.length,
      stock: alerts.filter((a) => a.type === 'stock').length,
      appointment: alerts.filter((a) => a.type === 'appointment').length,
    },
    actionHints,
  };
};

const getPharmacyMlAgentPack = async (user) => {
  const vetId = resolveVetId(user);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [catalog, lowStock, platform, mlHealth] = await Promise.all([
    getMedicationCatalog().catch(() => []),
    getLowStockAlerts().catch(() => []),
    getPlatformInsights().catch(() => ({})),
    checkPythonMlHealth().catch(() => ({ ok: false })),
  ]);

  let recentPrescriptions = 0;
  let topMeds = [];
  if (!isDemoMode() && vetId) {
    recentPrescriptions = await prisma.prescription.count({
      where: { vetId, createdAt: { gte: thirtyDaysAgo } },
    });
    const rxList = await prisma.prescription.findMany({
      where: { vetId, createdAt: { gte: thirtyDaysAgo } },
      select: { medications: true },
      take: 50,
    });
    const freq = {};
    for (const rx of rxList) {
      const names = String(rx.medications || '')
        .split(/[,;+]/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const n of names) {
        freq[n] = (freq[n] || 0) + 1;
      }
    }
    topMeds = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  } else {
    recentPrescriptions = 12;
    topMeds = [{ name: 'Amoxicilline', count: 5 }, { name: 'Carprofène', count: 3 }];
  }

  const criticalStock = lowStock.filter((m) => (m.stockQty ?? 0) === 0);
  const ruleSummary = [
    `${catalog.length} référence(s) en catalogue.`,
    lowStock.length ? `${lowStock.length} alerte(s) stock bas.` : 'Stocks OK.',
    recentPrescriptions ? `${recentPrescriptions} ordonnance(s) sur 30 j.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const groqSummary = await groqBrief(
    'Synthèse pharmacie vétérinaire (4 phrases) : stocks critiques, réapprovisionnement, tendances prescriptions.',
    { lowStock: lowStock.slice(0, 6), topMeds, recentPrescriptions }
  );

  const actionHints = [
    { type: 'pharmacy', label: 'Stock pharmacie', link: '/vet/pharmacy' },
    { type: 'rx', label: 'Ordonnances', link: '/vet/prescriptions' },
    { type: 'bi', label: 'Import BI pharmacie', link: '/vet/bi' },
    { type: 'diagnostics', label: 'Aide diagnostic', link: '/vet/diagnostics' },
  ];

  return {
    role: 'vet',
    agent: 'pharmacy_ml_agent',
    pythonPowered: Boolean(platform.pythonPowered || mlHealth?.ok),
    groqPowered: Boolean(groqSummary),
    models: ['pharmacy_rules', 'dose_calculator', platform.pythonPowered ? 'xgboost' : null, groqSummary ? 'groq' : null].filter(Boolean),
    summary: groqSummary || ruleSummary,
    tip:
      criticalStock.length > 0
        ? `${criticalStock.length} médicament(s) en rupture — réapprovisionner`
        : lowStock.length
          ? `${lowStock.length} référence(s) sous seuil minimum`
          : 'Stocks pharmacie dans les normes',
    medicationCatalog: catalog.slice(0, 20),
    lowStockAlerts: lowStock,
    criticalStockCount: criticalStock.length,
    recentPrescriptionsCount: recentPrescriptions,
    topPrescribedMedications: topMeds,
    stockKpis: {
      totalSkus: catalog.length,
      lowStock: lowStock.length,
      outOfStock: criticalStock.length,
    },
    actionHints,
  };
};

const getVetMlPack = async (user) => {
  const pack = await getVetMlAgentPack(user);
  return pack;
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

  getAdminMlAgentPack,

  getLivreurMlPack,

  getLivreurOrdersRiskMap,

  getVetMlPack,

  getVetMlAgentPack,

  getClinicMlAgentPack,

  getPharmacyMlAgentPack,

  getAdminOrdersRiskMap,

  getOrderCancelRisk,

};



const { prisma, isDemoMode } = require('../../prismaClient');
const { getPetRecommendations } = require('../petRecommendation.service');
const { predictClinicalUrgency } = require('../../ml/clinicalUrgencyModel');
const { completionWithSystem } = require('../groq.service');

const uid = (u) => String(u?.id || u?._id);

const loadPet = async (userId, petId, petName) => {
  if (petId) return prisma.pet.findFirst({ where: { id: petId, ownerId: userId } });
  if (petName) return prisma.pet.findFirst({ where: { ownerId: userId, name: petName } });
  return prisma.pet.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } });
};

const dailyCalories = (pet) => {
  const w = Number(pet?.weight) || (pet?.type === 'cat' ? 4 : 12);
  const mult = pet?.type === 'cat' ? 70 : 95;
  return Math.round(mult * Math.pow(w, 0.75));
};

const persistReport = async (userId, pet, type, payload) => {
  if (isDemoMode()) return { id: `demo_${type}`, reportType: type, ...payload };
  return prisma.premiumAiReport.create({
    data: {
      userId,
      petId: pet?.id,
      petName: pet?.name,
      reportType: type,
      payloadJson: JSON.stringify(payload),
    },
  });
};

const generateMealPlan = async (user, { petId, petName, activityLevel = 'moderate' }) => {
  const userId = uid(user);
  const pet = await loadPet(userId, petId, petName);
  if (!pet) {
    const err = new Error('Animal introuvable');
    err.status = 404;
    throw err;
  }

  const kcal = dailyCalories(pet);
  const meals =
    pet.type === 'cat'
      ? [
          { time: '08:00', portion: '35%', food: 'Pâtée ou croquettes premium chat' },
          { time: '13:00', portion: '25%', food: 'Friandise légère / hydratation' },
          { time: '19:00', portion: '40%', food: 'Croquettes adaptées stade de vie' },
        ]
      : [
          { time: '07:30', portion: '30%', food: 'Croquettes matin — énergie' },
          { time: '12:30', portion: '20%', food: 'Collation / friandise entraînement' },
          { time: '19:00', portion: '50%', food: 'Repas principal — digestible' },
        ];

  const reco = await getPetRecommendations(user, { petId: pet.id, limit: 5 }).catch(() => ({ recommendations: [] }));

  let groqNote = null;
  if (process.env.GROQ_API_KEY) {
    groqNote = await completionWithSystem(
      'Tu es nutritionniste PetfoodTN. Réponds en français, 3 phrases max.',
      `Plan pour ${pet.name} (${pet.type}, ${pet.weight || '?'} kg, activité ${activityLevel}). ${kcal} kcal/jour.`,
      { max_tokens: 200 }
    ).catch(() => null);
  }

  const payload = {
    pet: { id: pet.id, name: pet.name, type: pet.type, weight: pet.weight },
    dailyCaloriesKcal: kcal,
    activityLevel,
    meals,
    weeklyTips: [
      'Eau fraîche toujours disponible',
      'Transition alimentaire sur 7 jours si changement',
      'Pesée mensuelle recommandée',
    ],
    recommendedProducts: (reco.recommendations || []).slice(0, 5),
    aiNote: groqNote,
    model: 'premium_meal_plan_v1',
  };

  await persistReport(userId, pet, 'meal_plan', payload);
  return payload;
};

const estimateMonthlyBudget = async (user, { petId, petName }) => {
  const userId = uid(user);
  const pet = await loadPet(userId, petId, petName);
  const reco = await getPetRecommendations(user, { petId: pet?.id, limit: 6 }).catch(() => ({ recommendations: [] }));
  const products = reco.recommendations || [];

  const foodCost = products.length
    ? products.reduce((s, p) => s + Number(p.price || p.discountPrice || 45), 0) / products.length
    : 55;
  const monthlyFood = Math.round(foodCost * 1.2 * 100) / 100;
  const supplements = Math.round(monthlyFood * 0.15 * 100) / 100;
  const vetReserve = 40;
  const subscriptionDiscount = 0.1;

  const payload = {
    petName: pet?.name || 'Votre animal',
    currency: 'DT',
    lines: [
      { label: 'Alimentation principale', amount: monthlyFood },
      { label: 'Compléments / friandises', amount: supplements },
      { label: 'Réserve soins préventifs', amount: vetReserve },
    ],
    totalMonthly: Math.round((monthlyFood + supplements + vetReserve) * 100) / 100,
    withSubscription: Math.round((monthlyFood + supplements + vetReserve) * (1 - subscriptionDiscount) * 100) / 100,
    savingsPercent: subscriptionDiscount * 100,
    topProducts: products.slice(0, 4),
    model: 'budget_estimator_v1',
  };

  if (pet) await persistReport(userId, pet, 'budget', payload);
  return payload;
};

const predictFutureNeeds = async (user, { petId, petName }) => {
  const userId = uid(user);
  const pet = await loadPet(userId, petId, petName);
  const age = pet?.birthDate
    ? Math.max(0, new Date().getFullYear() - new Date(pet.birthDate).getFullYear())
    : null;

  const needs = [];
  if (age != null && age < 1) needs.push({ when: '0-3 mois', item: 'Croquettes junior / chiot', priority: 'high' });
  if (age != null && age >= 7) needs.push({ when: 'Continu', item: 'Formule senior + articulations', priority: 'high' });
  needs.push({ when: 'Mois prochain', item: 'Réassort croquettes (abonnement -10 %)', priority: 'medium' });
  needs.push({ when: 'Trimestre', item: 'Antiparasitaire saisonnier', priority: 'medium' });
  if (pet?.type === 'dog') needs.push({ when: 'Semaine prochaine', item: 'Friandises éducatives', priority: 'low' });

  const payload = { pet: pet ? { name: pet.name, type: pet.type, ageYears: age } : null, needs, model: 'future_needs_v1' };
  if (pet) await persistReport(userId, pet, 'future_needs', payload);
  return payload;
};

const detectHealthRisks = async (user, { petId, petName, symptoms = '' }) => {
  const userId = uid(user);
  const pet = await loadPet(userId, petId, petName);
  const ml = predictClinicalUrgency({
    symptoms: symptoms || 'Contrôle préventif routine',
    vitals: {},
    profile: { pet: pet || { type: 'dog', ageYears: 5 } },
  });

  const risks = [];
  if (ml.urgencyClass === 'urgent') {
    risks.push({ level: 'high', label: 'Consultation rapide recommandée', source: ml.modelId });
  }
  if (ml.diseaseSuspected) {
    risks.push({ level: 'medium', label: 'Surveillance santé renforcée', source: ml.modelId });
  }
  if ((pet?.weight || 0) > 35 && pet?.type === 'dog') {
    risks.push({ level: 'medium', label: 'Risque surpoids — adapter ration', source: 'weight_rules' });
  }
  if (!risks.length) risks.push({ level: 'low', label: 'Profil stable — contrôle annuel', source: 'preventive' });

  const payload = {
    petName: pet?.name,
    risks,
    mlScores: { urgencyScore: ml.urgencyScore, diseaseProbability: ml.diseaseProbability },
    vetReferral: ml.urgencyClass === 'urgent',
    model: 'health_risk_early_v1',
  };

  if (pet) await persistReport(userId, pet, 'health_risk', payload);
  return payload;
};

const getPremiumPack = async (user, query) => {
  const [mealPlan, budget, futureNeeds, healthRisks] = await Promise.all([
    generateMealPlan(user, query).catch(() => null),
    estimateMonthlyBudget(user, query).catch(() => null),
    predictFutureNeeds(user, query).catch(() => null),
    detectHealthRisks(user, query).catch(() => null),
  ]);
  return { mealPlan, budget, futureNeeds, healthRisks, tier: 'premium' };
};

module.exports = {
  generateMealPlan,
  estimateMonthlyBudget,
  predictFutureNeeds,
  detectHealthRisks,
  getPremiumPack,
};

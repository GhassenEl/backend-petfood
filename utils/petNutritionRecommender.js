/**
 * Recommandations nutritionnelles par animal — poids, race, âge.
 * S'appuie sur petCalorieCalculator (RER × MER) + profils races.
 */

const { calculatePetCalories, petAgeYears } = require('./petCalorieCalculator');

const PET_TYPE_LABELS = {
  dog: 'Chien', cat: 'Chat', bird: 'Oiseau', fish: 'Poisson', rabbit: 'Lapin / NAC', other: 'Autre',
};

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const DOG_BREEDS = {
  labrador: {
    label: 'Labrador',
    size: 'large',
    idealWeightKg: { min: 25, max: 36 },
    energy: 'high',
    tips: [
      'Formule « grande race » riche en glucosamine pour les articulations.',
      'Labrador très gourmand : pesez les rations, limitez les friandises à 10 % des kcal.',
      'Privilégiez 2 repas/jour pour limiter le risque de dilatation-torsion gastrique.',
    ],
    productKeywords: ['labrador', 'grand chien', 'large', 'articulation', 'chien'],
  },
  'berger allemand': {
    label: 'Berger allemand',
    size: 'large',
    idealWeightKg: { min: 22, max: 40 },
    energy: 'high',
    tips: [
      'Digestion parfois sensible : transition alimentaire sur 10 jours.',
      'Apport protéique modéré à élevé (22–26 %) selon activité (sport, travail).',
      'Surveillez le poids — cette race a un risque de dysplasie si surpoids.',
    ],
    productKeywords: ['berger', 'grand chien', 'sensible', 'chien'],
  },
  golden: {
    label: 'Golden Retriever',
    size: 'large',
    idealWeightKg: { min: 25, max: 34 },
    energy: 'high',
    tips: [
      'Poils longs : formules avec acides gras oméga-3 pour le pelage.',
      'Très actif en jeunesse ; réduisez légèrement les calories après 7 ans.',
    ],
    productKeywords: ['golden', 'poil', 'omega', 'chien'],
  },
  'bulldog francais': {
    label: 'Bulldog français',
    size: 'small',
    idealWeightKg: { min: 8, max: 14 },
    energy: 'low',
    brachycephalic: true,
    tips: [
      'Race brachycéphale : petites croquettes, gamelle surélevée, pas d\'effort après le repas.',
      'Évitez l\'excès calorique — propension au surpoids.',
      'Formule digestible, protéines de qualité.',
    ],
    productKeywords: ['petit chien', 'light', 'digestion', 'chien'],
  },
  caniche: {
    label: 'Caniche',
    size: 'small',
    idealWeightKg: { min: 3, max: 12 },
    energy: 'medium',
    tips: [
      'Adapter la ration à la taille (toy / miniature / standard).',
      'Poils continus : besoins en protéines et oméga-3 pour la peau.',
    ],
    productKeywords: ['petit chien', 'caniche', 'poil', 'chien'],
  },
  chihuahua: {
    label: 'Chihuahua',
    size: 'toy',
    idealWeightKg: { min: 1.5, max: 3 },
    energy: 'medium',
    tips: [
      'Très petit métabolisme : croquettes mini, plusieurs petits repas possibles.',
      'Fragile sur le plan dentaire — croquettes adaptées toy.',
    ],
    productKeywords: ['mini', 'toy', 'petit chien', 'chihuahua'],
  },
  beagle: {
    label: 'Beagle',
    size: 'medium',
    idealWeightKg: { min: 9, max: 14 },
    energy: 'high',
    tips: [
      'Nez fin : très appétent, contrôlez strictement les portions.',
      '2 repas fixes + friandises d\'éducation comptabilisées.',
    ],
    productKeywords: ['beagle', 'medium', 'chien'],
  },
  yorkshire: {
    label: 'Yorkshire',
    size: 'toy',
    idealWeightKg: { min: 1.5, max: 3.5 },
    energy: 'medium',
    tips: [
      'Croquettes très petites, riches en protéines animales.',
      'Attention aux hypoglycémies chez le chiot toy — 3–4 repas/jour jusqu\'à 6 mois.',
    ],
    productKeywords: ['toy', 'yorkshire', 'mini', 'chien'],
  },
  sloughi: {
    label: 'Sloughi (lévrier arabe)',
    size: 'large',
    idealWeightKg: { min: 18, max: 28 },
    energy: 'high',
    tips: [
      'Race tunisienne patrimoniale — très active : formule riche en protéines, lipides modérés.',
      'Éviter le surpoids ; privilégier 2 repas après l\'effort, pas avant.',
      'Besoin d\'espace et d\'exercice : ajuster les kcal selon la course quotidienne.',
    ],
    productKeywords: ['levrier', 'sloughi', 'actif', 'grand chien', 'chien'],
  },
  'levrier arabe': {
    label: 'Lévrier arabe (Sloughi)',
    size: 'large',
    idealWeightKg: { min: 18, max: 28 },
    energy: 'high',
    tips: [
      'Lévrier maghrébin : ration haute qualité, digestion sensible aux graisses excessives.',
      'Protéger des excès de chaleur après les repas en été.',
    ],
    productKeywords: ['levrier', 'sloughi', 'actif', 'chien'],
  },
  khlib: {
    label: 'Khlib / Baladi (chien tunisien)',
    size: 'medium',
    idealWeightKg: { min: 12, max: 22 },
    energy: 'medium',
    tips: [
      'Chien local robuste : formule adulte équilibrée, souvent bon appétit.',
      'Adapter la ration au mode de vie (courtyard vs très actif).',
      'Vaccination et vermifuge à jour — profil métabolique variable.',
    ],
    productKeywords: ['chien', 'adulte', 'medium', 'equilibre'],
  },
  baladi: {
    label: 'Baladi (chien de rue tunisien)',
    size: 'medium',
    idealWeightKg: { min: 10, max: 20 },
    energy: 'medium',
    tips: [
      'Profil rustique : croquettes standard qualité, éviter les restes gras.',
      'Surveiller le poids en milieu urbain (moins d\'activité).',
    ],
    productKeywords: ['chien', 'adulte', 'medium'],
  },
  tunisien: {
    label: 'Chien tunisien',
    size: 'medium',
    idealWeightKg: { min: 12, max: 22 },
    energy: 'medium',
    tips: [
      'Race non standardisée : ajuster selon morphologie réelle et activité.',
      'Consultez un vétérinaire pour objectif pondéral précis.',
    ],
    productKeywords: ['chien', 'adulte'],
  },
  malinois: {
    label: 'Malinois (Berger belge)',
    size: 'large',
    idealWeightKg: { min: 22, max: 32 },
    energy: 'very_high',
    tips: [
      'Très répandu en Tunisie (garde) : besoins élevés si chien de travail.',
      'Formule performance ou grande race active, 2 repas minimum.',
      'Attention : ne pas suralimenter si chien de compagnie sédentaire.',
    ],
    productKeywords: ['malinois', 'berger', 'actif', 'grand chien', 'chien'],
  },
  'berger belge': {
    label: 'Berger belge (Malinois)',
    size: 'large',
    idealWeightKg: { min: 22, max: 32 },
    energy: 'very_high',
    tips: [
      'Élevé énergie : ration adaptée à l\'activité réelle (garde, sport).',
    ],
    productKeywords: ['malinois', 'berger', 'actif', 'chien'],
  },
  barb: {
    label: 'Chien de berger barbaresque',
    size: 'medium',
    idealWeightKg: { min: 20, max: 30 },
    energy: 'high',
    tips: [
      'Chien de travail nord-africain : apport protéique soutenu.',
      'Eau abondante en période chaude.',
    ],
    productKeywords: ['berger', 'actif', 'chien'],
  },
};

const CAT_BREEDS = {
  'maine coon': {
    label: 'Maine Coon',
    size: 'large',
    idealWeightKg: { min: 4.5, max: 8 },
    tips: [
      'Grande race féline : apport protéique élevé, ration supérieure à un chat moyen.',
      'Croissance longue (jusqu\'à 3 ans) : formule kitten/junior prolongée.',
    ],
    productKeywords: ['maine coon', 'grand chat', 'chat'],
  },
  siamois: {
    label: 'Siamois',
    size: 'medium',
    idealWeightKg: { min: 3, max: 5.5 },
    energy: 'high',
    tips: [
      'Métabolisme actif : besoins caloriques légèrement supérieurs à la moyenne.',
      'Aime la variété : mix croquettes + pâtée pour l\'hydratation.',
    ],
    productKeywords: ['siamois', 'actif', 'chat'],
  },
  persan: {
    label: 'Persan',
    size: 'medium',
    idealWeightKg: { min: 3, max: 6 },
    energy: 'low',
    tips: [
      'Poils longs : formule anti-boules de poils, brossage régulier.',
      'Moins actif : surveillez le surpoids, ration stérilisé si castré.',
    ],
    productKeywords: ['persan', 'poil', 'hairball', 'chat'],
  },
  europeen: {
    label: 'Européen (chat tunisien courant)',
    size: 'medium',
    idealWeightKg: { min: 3.5, max: 5.5 },
    tips: [
      'Très répandu en Tunisie : formule adulte équilibrée, 2 repas/jour.',
      'Associez pâtée (10–20 % des kcal) pour l\'hydratation en climat chaud.',
      'Formule stérilisé recommandée si castré.',
    ],
    productKeywords: ['chat', 'adulte', 'europeen', 'sterilise'],
  },
  bengal: {
    label: 'Bengal',
    size: 'medium',
    idealWeightKg: { min: 3.5, max: 7 },
    energy: 'very_high',
    tips: [
      'Très actif : formule riche en protéines animales (> 35 %).',
      'Enrichissement alimentaire (puzzles) pour ralentir la prise.',
    ],
    productKeywords: ['bengal', 'actif', 'chat'],
  },
  'chat tunisien': {
    label: 'Chat tunisien',
    size: 'medium',
    idealWeightKg: { min: 3, max: 5.5 },
    tips: [
      'Chat local maghrébin : rustique, formule adulte équilibrée.',
      'Hydratation importante en climat chaud — ajoutez de la pâtée.',
      'Stérilisation fréquente : formule « stérilisé » recommandée.',
    ],
    productKeywords: ['chat', 'sterilise', 'adulte', 'tunisie'],
  },
  'nord africain': {
    label: 'Chat nord-africain',
    size: 'medium',
    idealWeightKg: { min: 3, max: 5.5 },
    tips: [
      'Morphologie fine et active : protéines animales de qualité.',
      'Accès à l\'eau fraîche en permanence.',
    ],
    productKeywords: ['chat', 'adulte'],
  },
  gouttiere: {
    label: 'Chat de gouttière (Tunisie)',
    size: 'medium',
    idealWeightKg: { min: 3, max: 5 },
    tips: [
      'Profil très courant : ration stérilisé si castré, contrôle du poids.',
      'Parasites externes fréquents en milieu urbain — santé globale liée à l\'appétit.',
    ],
    productKeywords: ['chat', 'sterilise', 'light', 'adulte'],
  },
  chartreux: {
    label: 'Chartreux',
    size: 'medium',
    idealWeightKg: { min: 4, max: 7 },
    energy: 'low',
    tips: [
      'Chat musclé et calme : éviter le surpoids, jouets interactifs.',
      'Poil dense : oméga-3 pour le pelage.',
    ],
    productKeywords: ['chartreux', 'chat', 'poil'],
  },
  'angora turc': {
    label: 'Angora turc',
    size: 'medium',
    idealWeightKg: { min: 3, max: 5 },
    energy: 'high',
    tips: [
      'Poils semi-longs : formule anti-boules de poils, brossage.',
      'Actif et joueur : besoins légèrement supérieurs à la moyenne.',
    ],
    productKeywords: ['angora', 'poil', 'chat', 'actif'],
  },
};

const inferDogSize = (weightKg) => {
  const w = Number(weightKg);
  if (!w || w <= 0) return 'medium';
  if (w < 6) return 'toy';
  if (w < 15) return 'small';
  if (w < 25) return 'medium';
  if (w < 40) return 'large';
  return 'giant';
};

const inferCatSize = (weightKg) => {
  const w = Number(weightKg);
  if (!w || w <= 0) return 'medium';
  if (w < 3.5) return 'small';
  if (w < 6) return 'medium';
  return 'large';
};

const resolveBreedProfile = (pet) => {
  const type = String(pet?.type || pet?.animalType || 'dog').toLowerCase();
  const breedRaw = pet?.breed || '';
  const key = normalize(breedRaw);

  if (type === 'dog') {
    const exact = DOG_BREEDS[key];
    if (exact) return { ...exact, breed: breedRaw || exact.label, matched: true };

    for (const [k, profile] of Object.entries(DOG_BREEDS)) {
      if (key && (key.includes(k) || k.includes(key))) {
        return { ...profile, breed: breedRaw || profile.label, matched: true };
      }
    }

    const weight = Number(pet?.weight ?? pet?.weightKg ?? 0);
    const size = inferDogSize(weight);
    return {
      label: breedRaw || 'Chien (race non répertoriée)',
      breed: breedRaw || null,
      size,
      matched: false,
      idealWeightKg: size === 'toy' ? { min: 1, max: 5 }
        : size === 'small' ? { min: 5, max: 12 }
          : size === 'medium' ? { min: 12, max: 25 }
            : size === 'large' ? { min: 25, max: 40 }
              : { min: 40, max: 70 },
      tips: [
        `Taille estimée « ${size} » selon le poids (${weight || '?'} kg).`,
        'Affinez la race dans le dossier vétérinaire pour des conseils plus précis.',
      ],
      productKeywords: [size === 'large' || size === 'giant' ? 'grand chien' : 'chien'],
    };
  }

  if (type === 'cat') {
    const exact = CAT_BREEDS[key];
    if (exact) return { ...exact, breed: breedRaw || exact.label, matched: true };

    for (const [k, profile] of Object.entries(CAT_BREEDS)) {
      if (key && (key.includes(k) || k.includes(key))) {
        return { ...profile, breed: breedRaw || profile.label, matched: true };
      }
    }

    const weight = Number(pet?.weight ?? pet?.weightKg ?? 0);
    const size = inferCatSize(weight);
    return {
      label: breedRaw || 'Chat (race non répertoriée)',
      breed: breedRaw || null,
      size,
      matched: false,
      idealWeightKg: size === 'small' ? { min: 2.5, max: 4 }
        : size === 'large' ? { min: 5, max: 8 }
          : { min: 3.5, max: 5.5 },
      tips: [
        `Profil estimé selon le poids (${weight || '?'} kg).`,
        'Indiquez la race dans Santé & vétérinaire pour affiner les recommandations.',
      ],
      productKeywords: ['chat'],
    };
  }

  return {
    label: breedRaw || PET_TYPE_LABELS[type] || type,
    breed: breedRaw || null,
    size: 'medium',
    matched: false,
    tips: ['Consultez un vétérinaire NAC pour une ration adaptée à l\'espèce.'],
    productKeywords: [type],
  };
};

const getWeightStatus = (weightKg, idealRange) => {
  const w = Number(weightKg);
  if (!w || !idealRange) return 'unknown';
  if (w < idealRange.min * 0.9) return 'underweight';
  if (w > idealRange.max * 1.1) return 'overweight';
  if (w < idealRange.min) return 'lean';
  if (w > idealRange.max) return 'heavy';
  return 'ideal';
};

const lifeStageAdvice = (type, ageYears) => {
  if (ageYears == null) {
    return {
      stage: 'adulte',
      label: 'Adulte (âge non renseigné)',
      tips: ['Renseignez la date de naissance pour adapter chiot/chaton/senior.'],
    };
  }

  if (type === 'dog') {
    if (ageYears < 0.5) {
      return {
        stage: 'chiot',
        label: 'Chiot (< 6 mois)',
        tips: [
          'Formule chiot : 3–4 repas/jour, croissance rapide.',
          'Ne pas supplémenter en calcium sans avis vétérinaire.',
        ],
      };
    }
    if (ageYears < 1) {
      return {
        stage: 'chiot_junior',
        label: 'Jeune chien (6–12 mois)',
        tips: ['Passage progressif à 2–3 repas, surveillez la courbe de poids.'],
      };
    }
    if (ageYears >= 8) {
      return {
        stage: 'senior',
        label: 'Chien senior (8+ ans)',
        tips: [
          'Formule senior : moins calorique, soutien articulaire et rénal.',
          'Pesée mensuelle recommandée.',
        ],
      };
    }
    return { stage: 'adulte', label: 'Chien adulte', tips: ['2 repas/jour, eau fraîche à volonté.'] };
  }

  if (type === 'cat') {
    if (ageYears < 1) {
      return {
        stage: 'chaton',
        label: 'Chaton (< 1 an)',
        tips: ['Formule kitten, libre-service ou 4 repas jusqu\'à 6 mois.'],
      };
    }
    if (ageYears >= 10) {
      return {
        stage: 'senior',
        label: 'Chat senior (10+ ans)',
        tips: ['Formule senior, surveillance rénale et hydratation (pâtée).'],
      };
    }
    return { stage: 'adulte', label: 'Chat adulte', tips: ['2 repas, 10–20 % pâtée pour l\'hydratation.'] };
  }

  return { stage: 'adulte', label: 'Adulte', tips: [] };
};

const adjustGoalFromWeight = (goal, weightStatus) => {
  if (weightStatus === 'overweight' || weightStatus === 'heavy') return 'perte';
  if (weightStatus === 'underweight' || weightStatus === 'lean') return 'prise';
  return goal;
};

const buildPetNutritionRecommendation = (pet, options = {}) => {
  const type = String(pet?.type || pet?.animalType || 'dog').toLowerCase();
  const breedProfile = resolveBreedProfile(pet);
  const ageYears =
    options.ageYears != null && !Number.isNaN(Number(options.ageYears))
      ? Number(options.ageYears)
      : pet?.ageYears != null
        ? Number(pet.ageYears)
        : petAgeYears(pet?.birthDate);

  const weightKg = Number(pet?.weight ?? pet?.weightKg ?? 0);
  const weightStatus = getWeightStatus(weightKg, breedProfile.idealWeightKg);
  const lifeStage = lifeStageAdvice(type, ageYears);
  const goal = adjustGoalFromWeight(options.goal || 'maintien', weightStatus);

  const calories = calculatePetCalories(pet, {
    ...options,
    ageYears,
    goal,
  });

  const recommendations = [];

  recommendations.push({
    id: 'calories',
    category: 'portion',
    priority: 'high',
    title: 'Apport calorique quotidien',
    text: calories.supported
      ? `${calories.dailyKcal} kcal/jour (~${calories.dryFoodGramsPerDay} g croquettes, ${calories.gramsPerMeal} g × ${calories.mealCount} repas).`
      : calories.message || 'Complétez le poids pour calculer la ration.',
  });

  if (breedProfile.breed) {
    recommendations.push({
      id: 'breed',
      category: 'breed',
      priority: 'high',
      title: `Race : ${breedProfile.label || breedProfile.breed}`,
      text: breedProfile.matched
        ? `Profil race reconnu (taille ${breedProfile.size}). Poids idéal indicatif : ${breedProfile.idealWeightKg?.min}–${breedProfile.idealWeightKg?.max} kg.`
        : `Race « ${breedProfile.breed} » — profil estimé par poids et espèce.`,
    });
  }

  if (weightStatus !== 'unknown' && weightStatus !== 'ideal') {
    const statusLabels = {
      underweight: 'sous-poids',
      lean: 'plutôt maigre',
      heavy: 'léger surpoids',
      overweight: 'surpoids',
    };
    recommendations.push({
      id: 'weight',
      category: 'weight',
      priority: weightStatus === 'overweight' || weightStatus === 'underweight' ? 'high' : 'medium',
      title: `État pondéral : ${statusLabels[weightStatus]}`,
      text:
        weightStatus === 'overweight' || weightStatus === 'heavy'
          ? `Objectif ajusté : perte de poids. Réduisez friandises, formule « light », activité progressive.`
          : `Objectif ajusté : prise de masse contrôlée. Fractionnez les repas, formule haute digestibilité.`,
    });
  }

  recommendations.push({
    id: 'life',
    category: 'life_stage',
    priority: 'medium',
    title: lifeStage.label,
    text: lifeStage.tips.join(' '),
  });

  (breedProfile.tips || []).forEach((tip, i) => {
    recommendations.push({
      id: `breed-tip-${i}`,
      category: 'breed_specific',
      priority: 'medium',
      title: 'Conseil race',
      text: tip,
    });
  });

  if (goal === 'perte') {
    recommendations.push({
      id: 'goal-perte',
      category: 'goal',
      priority: 'high',
      title: 'Objectif perte de poids',
      text: 'Réduction 10–20 % des kcal sous supervision vétérinaire. Pas de jeûne brutal.',
    });
  }

  const mealPlan = calories.supported
    ? {
        mealsPerDay: calories.mealCount,
        gramsPerMeal: calories.gramsPerMeal,
        gramsPerDay: calories.dryFoodGramsPerDay,
        kcalPerDay: calories.dailyKcal,
        split: type === 'cat'
          ? { croquettes: 80, patée: 20 }
          : { croquettes: 90, patée: 10 },
        notes: type === 'cat'
          ? '10–20 % de la ration en pâtée améliore l\'hydratation.'
          : 'L\'eau fraîche doit être disponible en permanence.',
      }
    : null;

  return {
    petId: pet?.id || pet?._id || null,
    name: pet?.name || 'Animal',
    type,
    breed: breedProfile.breed || pet?.breed || null,
    ageYears: ageYears != null ? Math.round(ageYears * 10) / 10 : null,
    weightKg: weightKg || null,
    weightStatus,
    idealWeightKg: breedProfile.idealWeightKg,
    lifeStage: lifeStage.stage,
    lifeStageLabel: lifeStage.label,
    goal,
    calories,
    breedProfile,
    recommendations,
    mealPlan,
    productKeywords: [
      ...(breedProfile.productKeywords || []),
      lifeStage.stage === 'chiot' || lifeStage.stage === 'chiot_junior' ? 'chiot' : '',
      lifeStage.stage === 'chaton' ? 'chaton' : '',
      lifeStage.stage === 'senior' ? 'senior' : '',
      goal === 'perte' ? 'light' : '',
      type,
    ].filter(Boolean),
    disclaimer:
      'Recommandations indicatives basées sur poids, race et âge. Validation vétérinaire recommandée avant changement alimentaire.',
  };
};

const matchProductsForPet = (products, recommendation, limit = 4) => {
  if (!products?.length || !recommendation) return [];

  const keywords = (recommendation.productKeywords || []).map(normalize);
  const type = recommendation.type;

  const scored = products
    .filter((p) => Number(p.stock ?? p.quantity ?? 0) > 0)
    .map((p) => {
      const hay = normalize(`${p.name} ${p.description || ''} ${p.category || ''} ${p.animalType || ''}`);
      let score = 0;
      if (p.animalType === type || p.petType === type) score += 3;
      keywords.forEach((kw) => {
        if (kw && hay.includes(kw)) score += 2;
      });
      if (recommendation.goal === 'perte' && hay.includes('light')) score += 3;
      if ((recommendation.lifeStage === 'chiot' || recommendation.lifeStage === 'chiot_junior') && hay.includes('chiot')) score += 4;
      if (recommendation.lifeStage === 'chaton' && hay.includes('chaton')) score += 4;
      if (recommendation.lifeStage === 'senior' && hay.includes('senior')) score += 3;
      return { product: p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ product, score }) => ({
    ...product,
    nutritionMatchScore: score,
    recommendedReason: `Adapté au profil ${recommendation.name}${recommendation.breed ? ` (${recommendation.breed})` : ''}`,
  }));
};

const buildAllPetNutritionRecommendations = (pets, options = {}) =>
  (pets || []).map((pet) => buildPetNutritionRecommendation(pet, options));

module.exports = {
  resolveBreedProfile,
  getWeightStatus,
  buildPetNutritionRecommendation,
  matchProductsForPet,
  buildAllPetNutritionRecommendations,
};

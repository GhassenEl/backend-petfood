/**
 * Besoins énergétiques journaliers (kcal) — formule RER × facteur MER.
 * Référence : NRC / pratique vétérinaire courante (chien, chat).
 */

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const petAgeYears = (birthDate) => {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const ms = Date.now() - birth.getTime();
  return ms > 0 ? ms / (365.25 * 24 * 60 * 60 * 1000) : 0;
};

/** RER = 70 × poids^0,75 (kcal/jour) */
const calculateRER = (weightKg) => {
  const w = Number(weightKg);
  if (!w || w <= 0) return null;
  return Math.round(70 * Math.pow(w, 0.75));
};

const getMERFactor = ({
  type = 'dog',
  ageYears = null,
  activityLevel = 'moyen',
  goal = 'maintien',
  isNeutered = true,
}) => {
  const t = String(type || 'dog').toLowerCase();

  if (t === 'dog') {
    if (ageYears != null && ageYears < 0.5) return 3.0;
    if (ageYears != null && ageYears < 1) return 2.0;
    if (goal === 'perte') return 1.0;
    if (goal === 'prise') return 1.4;
    if (activityLevel === 'eleve') return 2.5;
    if (activityLevel === 'faible') return 1.4;
    return isNeutered ? 1.6 : 1.8;
  }

  if (t === 'cat') {
    if (ageYears != null && ageYears < 1) return 2.5;
    if (goal === 'perte') return 0.8;
    if (goal === 'prise') return 1.2;
    if (activityLevel === 'eleve') return 1.4;
    return isNeutered ? 1.2 : 1.4;
  }

  if (t === 'rabbit') {
    if (goal === 'perte') return 0.9;
    if (goal === 'prise') return 1.15;
    return 1.0;
  }

  return null;
};

const estimateDryFoodGrams = (dailyKcal, kcalPer100g = 350) => {
  const kcal = Number(kcalPer100g) || 350;
  return Math.round((dailyKcal / kcal) * 100);
};

/**
 * @param {object} pet - { type, weight, birthDate, name, id }
 * @param {object} options - { activityLevel, goal, isNeutered, mealCount, kcalPer100g }
 */
const calculatePetCalories = (pet, options = {}) => {
  const type = String(pet?.type || pet?.animalType || 'dog').toLowerCase();
  const weight = Number(pet?.weight ?? pet?.weightKg ?? 0);
  const name = pet?.name || 'Animal';
  const ageYears =
    options.ageYears != null && !Number.isNaN(Number(options.ageYears))
      ? Number(options.ageYears)
      : petAgeYears(pet?.birthDate);
  const activityLevel = options.activityLevel || 'moyen';
  const goal = options.goal || 'maintien';
  const isNeutered = options.isNeutered !== false;
  const mealCount = clamp(Number(options.mealCount) || 2, 1, 6);
  const kcalPer100g = clamp(Number(options.kcalPer100g) || 350, 250, 450);

  if (!weight || weight <= 0) {
    return {
      petId: pet?.id || pet?._id || null,
      name,
      type,
      supported: false,
      needsWeight: true,
      message: 'Renseignez le poids (kg) de l’animal pour calculer les calories.',
    };
  }

  const rer = calculateRER(weight);
  const merFactor = getMERFactor({ type, ageYears, activityLevel, goal, isNeutered });

  if (merFactor == null || (type !== 'dog' && type !== 'cat' && type !== 'rabbit')) {
    const rough = type === 'bird'
      ? Math.round(weight * 40)
      : type === 'fish'
        ? Math.round(weight * 25)
        : null;
    return {
      petId: pet?.id || pet?._id || null,
      name,
      type,
      weightKg: weight,
      supported: false,
      estimateOnly: rough != null,
      dailyKcal: rough,
      message:
        type === 'dog' || type === 'cat'
          ? 'Calcul indisponible.'
          : 'Estimation indicative — consultez un vétérinaire NAC pour une ration précise.',
    };
  }

  const dailyKcal = Math.round(rer * merFactor);
  const dryFoodGramsPerDay = estimateDryFoodGrams(dailyKcal, kcalPer100g);
  const gramsPerMeal = Math.round(dryFoodGramsPerDay / mealCount);

  let lifeStage = 'adulte';
  if (ageYears != null) {
    if (type === 'dog' && ageYears < 1) lifeStage = 'chiot';
    else if (type === 'cat' && ageYears < 1) lifeStage = 'chaton';
    else if (ageYears >= 8) lifeStage = 'senior';
  }

  return {
    petId: pet?.id || pet?._id || null,
    name,
    type,
    weightKg: weight,
    ageYears: ageYears != null ? Math.round(ageYears * 10) / 10 : null,
    lifeStage,
    supported: true,
    rer,
    merFactor,
    dailyKcal,
    dryFoodGramsPerDay,
    mealCount,
    gramsPerMeal,
    kcalPer100g,
    activityLevel,
    goal,
    isNeutered,
    message:
      'Estimation à ajuster selon l’état corporel, l’appétit et l’avis de votre vétérinaire. Les friandises comptent dans l’apport calorique.',
  };
};

module.exports = {
  petAgeYears,
  calculateRER,
  getMERFactor,
  estimateDryFoodGrams,
  calculatePetCalories,
};

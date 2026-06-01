const { prisma } = require('../prismaClient');
const productRepository = require('../repositories/product.repository');

const PET_EMOJI = { dog: '🐕', cat: '🐈', bird: '🐦', fish: '🐟', rabbit: '🐰', other: '🐾' };

const parseTags = (tags) => {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : String(tags).split(',').map((t) => t.trim());
  } catch {
    return String(tags).split(',').map((t) => t.trim()).filter(Boolean);
  }
};

const getPetAgeYears = (birthDate) => {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years -= 1;
  return Math.max(0, years);
};

const getLifeStage = (pet) => {
  const years = getPetAgeYears(pet.birthDate);
  if (years == null) return 'adult';
  if (years < 1) return 'young';
  if (years >= 7 && ['dog', 'cat'].includes(pet.type)) return 'senior';
  if (years >= 5 && ['rabbit', 'bird'].includes(pet.type)) return 'senior';
  return 'adult';
};

const lifeStageLabel = (stage) => ({
  young: 'jeune',
  adult: 'adulte',
  senior: 'senior',
}[stage] || 'adulte');

const resolveOwnerIds = async (user) => {
  const ids = new Set([String(user.id || user._id)]);
  if (user.email) {
    const dbUser = await prisma.user.findUnique({
      where: { email: String(user.email).toLowerCase() },
      select: { id: true },
    });
    if (dbUser?.id) ids.add(String(dbUser.id));
  }
  return [...ids];
};

const loadPetsForUser = async (user, petId) => {
  const ownerIds = await resolveOwnerIds(user);
  const where = { ownerId: { in: ownerIds } };
  if (petId) where.id = petId;

  const pets = await prisma.pet.findMany({ where, orderBy: { createdAt: 'asc' } });
  if (pets.length > 0) return pets;

  if (user.petType) {
    return [{
      id: 'profile_pet',
      name: user.name ? `Animal de ${user.name.split(' ')[0]}` : 'Mon animal',
      type: user.petType,
      breed: null,
      birthDate: user.petAge != null ? new Date(new Date().getFullYear() - user.petAge, 0, 1) : null,
      weight: null,
      notes: null,
      ownerId: user.id || user._id,
    }];
  }
  return [];
};

const loadVetContextByPet = async (ownerIds, petName) => {
  const records = await prisma.veterinaryRecord.findMany({
    where: { ownerId: { in: ownerIds }, petName },
    orderBy: { visitDate: 'desc' },
    take: 3,
  });
  const allergies = records.map((r) => r.allergies).filter(Boolean).join(' ').toLowerCase();
  const diet = records.map((r) => r.diet).filter(Boolean).join(' ').toLowerCase();
  const diagnosis = records.map((r) => r.diagnosis).filter(Boolean).join(' ').toLowerCase();
  return { allergies, diet, diagnosis, records };
};

const productMatchesLifeStage = (product, stage) => {
  const hay = `${product.name} ${product.description || ''} ${parseTags(product.tags).join(' ')}`.toLowerCase();
  if (stage === 'young') return /junior|chiot|chaton|puppy|kitten|jeune|starter|croissance/.test(hay);
  if (stage === 'senior') return /senior|mature|7\+|10\+|âgé|age/.test(hay);
  return /adulte|adult|standard|equilibre|équilibre/.test(hay) || true;
};

const scoreProductForPet = (product, pet, context, user, boughtIds, positiveIds) => {
  let score = 0;
  const reasons = [];
  const pTags = parseTags(product.tags);
  const hay = `${product.name} ${product.description || ''} ${pTags.join(' ')}`.toLowerCase();

  if (product.animalType === pet.type) {
    score += 0.35;
    reasons.push(`${PET_EMOJI[pet.type] || '🐾'} Pour ${pet.name} (${pet.type})`);
  } else if (product.animalType === 'other') {
    score += 0.05;
  } else {
    return { score: 0, reasons: [], skip: true };
  }

  const stage = getLifeStage(pet);
  if (productMatchesLifeStage(product, stage)) {
    score += 0.12;
    reasons.push(`Adapté ${lifeStageLabel(stage)}`);
  }

  if (pet.breed && hay.includes(String(pet.breed).toLowerCase())) {
    score += 0.15;
    reasons.push(`Race ${pet.breed}`);
  }

  if (pet.weight != null) {
    if (pet.weight < 5 && /mini|small|petit|light/.test(hay)) {
      score += 0.08;
      reasons.push('Format petit animal');
    }
    if (pet.weight > 25 && /maxi|large|grand/.test(hay)) {
      score += 0.08;
      reasons.push('Format grand animal');
    }
  }

  if (context.diet) {
    if (context.diet.includes('sans céréales') || context.diet.includes('grain')) {
      if (/sans cereales|grain.free|sans céréales|grain-free/.test(hay)) {
        score += 0.12;
        reasons.push('Compatible régime sans céréales');
      }
    }
    if (context.diet.includes('digest') && /digest|sensible|stomach/.test(hay)) {
      score += 0.1;
      reasons.push('Digestion sensible');
    }
  }

  if (context.diagnosis) {
    if (context.diagnosis.includes('gastrite') && /digest|sensible|intestinal/.test(hay)) {
      score += 0.1;
      reasons.push('Recommandé après suivi vétérinaire');
    }
    if (context.diagnosis.includes('dent') && /dentaire|dental|hygiene/.test(hay)) {
      score += 0.1;
      reasons.push('Soin dentaire');
    }
  }

  if (context.allergies) {
    const allergenTokens = context.allergies.split(/[,;]+/).map((a) => a.trim()).filter(Boolean);
    const hit = allergenTokens.some((a) => a.length > 2 && hay.includes(a));
    if (hit) return { score: 0, reasons: [], skip: true };
  }

  const userPrefs = (() => {
    const prefs = user?.preferences;
    if (!prefs) return [];
    if (Array.isArray(prefs)) return prefs;
    try {
      const parsed = JSON.parse(prefs);
      return Array.isArray(parsed) ? parsed : String(prefs).split(',').map((t) => t.trim()).filter(Boolean);
    } catch {
      return String(prefs).split(',').map((t) => t.trim()).filter(Boolean);
    }
  })();
  if (userPrefs.some((pref) => hay.includes(String(pref).toLowerCase()))) {
    score += 0.08;
    reasons.push('Correspond à vos préférences');
  }

  const productId = product.id || product._id;
  if (boughtIds.has(productId)) {
    score += 0.06;
    reasons.push('Déjà acheté');
  }
  if (positiveIds.has(productId)) {
    score += 0.1;
    reasons.push('Bien noté par vous');
  }

  if (Number(product.discount) > 0) {
    score += (Number(product.discount) / 100) * 0.1;
    reasons.push(`-${product.discount}% promo`);
  }

  score += (Number(product.popularity || 0) / 100) * 0.08;
  if (Number(product.rating_avg) >= 4.5) {
    score += 0.06;
    reasons.push('⭐ Très bien noté');
  }

  if (Number(product.stock || 0) <= 0) {
    score *= 0.2;
  }

  return {
    score: Math.min(Math.max(score, 0), 1),
    reasons,
    skip: false,
  };
};

const getPetRecommendations = async (user, { petId, petName, limit = 8 } = {}) => {
  const ownerIds = await resolveOwnerIds(user);
  const dbUser = await prisma.user.findFirst({
    where: { id: { in: ownerIds } },
    select: {
      id: true,
      petType: true,
      petAge: true,
      preferences: true,
      favoriteCategories: true,
      name: true,
    },
  });
  const profile = dbUser || user;

  const pets = await loadPetsForUser(profile, petId);
  const resolvedPetId = petId || (petName
    ? pets.find((p) => String(p.name).toLowerCase() === String(petName).toLowerCase())?.id
    : null);
  const allProducts = await productRepository.findAll();

  const orders = await prisma.order.findMany({
    where: { userId: { in: ownerIds } },
    include: { items: { include: { product: true } } },
  });
  const boughtIds = new Set(
    orders.flatMap((o) => o.items.map((i) => i.productId || i.product?.id)).filter(Boolean)
  );

  const reviews = await prisma.review.findMany({
    where: { userId: { in: ownerIds } },
    select: { productId: true, rating: true, emotion: true },
  });
  const positiveIds = new Set(
    reviews.filter((r) => r.rating >= 4 || ['happy', 'satisfied'].includes(r.emotion)).map((r) => r.productId)
  );

  const scoreForPet = async (pet) => {
    const context = await loadVetContextByPet(ownerIds, pet.name);
    const scored = allProducts
      .map((product) => {
        const result = scoreProductForPet(product, pet, context, profile, boughtIds, positiveIds);
        if (result.skip) return null;
        return {
          ...product,
          score: result.score,
          recommendedReason: result.reasons[0] || 'Recommandé pour votre animal',
          reasons: result.reasons,
          petId: pet.id,
          petName: pet.name,
          petType: pet.type,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      pet: {
        id: pet.id,
        name: pet.name,
        type: pet.type,
        breed: pet.breed,
        lifeStage: getLifeStage(pet),
        emoji: PET_EMOJI[pet.type] || '🐾',
      },
      recommendations: scored,
    };
  };

  if (resolvedPetId && pets.length >= 1) {
    const targetPet = pets.find((p) => p.id === resolvedPetId) || pets[0];
    const single = await scoreForPet(targetPet);
    return {
      pets: pets.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        breed: p.breed,
        emoji: PET_EMOJI[p.type] || '🐾',
      })),
      selectedPetId: resolvedPetId,
      pet: single.pet,
      recommendations: single.recommendations,
    };
  }

  const grouped = await Promise.all(pets.map(scoreForPet));
  const merged = [];
  const seen = new Set();
  for (const group of grouped) {
    for (const item of group.recommendations) {
      const key = item.id || item._id;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  merged.sort((a, b) => b.score - a.score);

  return {
    pets: pets.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      breed: p.breed,
      emoji: PET_EMOJI[p.type] || '🐾',
    })),
    selectedPetId: petId || null,
    grouped,
    recommendations: merged.slice(0, limit),
  };
};

module.exports = {
  getPetRecommendations,
  getLifeStage,
  PET_EMOJI,
};

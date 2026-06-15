const { prisma, isDemoMode } = require('../../prismaClient');

const uid = (u) => String(u?.id || u?._id);

const PACK_TYPES = {
  puppy: {
    id: 'puppy',
    label: 'Pack Chiot',
    icon: '🐶',
    description: 'Croissance, éducation et premiers soins pour chiot (< 12 mois)',
    animalTypes: ['dog'],
    lifeStage: 'young',
    keywords: [/chiot|puppy|junior|croissance|starter|éducation|training/i],
    categories: ['nourriture', 'jouets', 'accessoires'],
    tips: [
      '3 à 4 repas par jour jusqu’à 6 mois',
      'Croquettes « junior » riches en protéines',
      'Socialisation et vaccins à planifier avec le vétérinaire',
    ],
  },
  kitten: {
    id: 'kitten',
    label: 'Pack Chaton',
    icon: '🐱',
    description: 'Alimentation et confort pour chaton (< 12 mois)',
    animalTypes: ['cat'],
    lifeStage: 'young',
    keywords: [/chaton|kitten|junior|croissance|starter|litière/i],
    categories: ['nourriture', 'jouets', 'accessoires'],
    tips: [
      'Alimentation kitten jusqu’à 12 mois',
      'Bac à litière adapté et griffoir',
      'Stérilisation à prévoir vers 6 mois',
    ],
  },
  senior: {
    id: 'senior',
    label: 'Pack Animal senior',
    icon: '🦴',
    description: 'Nutrition douce, confort articulaire et suivi pour 7 ans et +',
    animalTypes: ['dog', 'cat'],
    lifeStage: 'senior',
    keywords: [/senior|mature|7\+|10\+|âgé|articul|mobilit|digest/i],
    categories: ['nourriture', 'accessoires', 'jouets'],
    tips: [
      'Formule senior moins calorique',
      'Surveillance poids et hydratation',
      'Bilan vétérinaire semestriel recommandé',
    ],
  },
  sporty: {
    id: 'sporty',
    label: 'Pack Animal sportif',
    icon: '🏃',
    description: 'Énergie, récupération et entretien pour chiens/chats très actifs',
    animalTypes: ['dog', 'cat'],
    lifeStage: 'adult',
    keywords: [/sport|active|performance|énergie|endurance|récup|training|athl/i],
    categories: ['nourriture', 'accessoires', 'jouets'],
    tips: [
      'Apport calorique augmenté selon l’effort',
      'Hydratation renforcée après l’activité',
      'Compléments articulaires si compétition régulière',
    ],
  },
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

const loadPet = async (userId, petId, petName) => {
  if (petId) {
    const p = await prisma.pet.findFirst({ where: { id: petId, ownerId: userId } });
    if (p) return p;
  }
  if (petName) {
    const p = await prisma.pet.findFirst({ where: { ownerId: userId, name: petName } });
    if (p) return p;
  }
  return prisma.pet.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } });
};

const scoreProductForPack = (product, def) => {
  const hay = `${product.name} ${product.description || ''} ${product.category || ''} ${product.tags || ''}`.toLowerCase();
  let score = product.popularity || 0;
  if (def.keywords.some((re) => re.test(hay))) score += 5;
  if (def.categories.includes(product.category)) score += 2;
  if (def.animalTypes.includes(product.animalType) || product.animalType === 'other') score += 1;
  if (product.stock > 0) score += 1;
  return score;
};

const pickProductsForPack = (products, def, limit = 5) => {
  const filtered = products
    .filter(
      (p) =>
        def.animalTypes.includes(p.animalType) ||
        p.animalType === 'other' ||
        def.keywords.some((re) => re.test(`${p.name} ${p.description || ''}`)),
    )
    .map((p) => ({ product: p, score: scoreProductForPack(p, def) }))
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const items = [];
  for (const { product: p } of filtered) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const price = Number(p.discountPrice || p.price) || 0;
    items.push({
      productId: p.id,
      name: p.name,
      price,
      quantity: p.category === 'nourriture' ? 1 : 1,
      category: p.category,
      imageUrl: p.imageUrl || p.image,
      role: p.category === 'nourriture' ? 'food' : p.category === 'jouets' ? 'toy' : 'care',
    });
    if (items.length >= limit) break;
  }
  return items;
};

const demoProducts = () => [
  { id: 'dp1', name: 'Croquettes Premium Chiot 3 kg', price: 79, discountPrice: 71, category: 'nourriture', animalType: 'dog', stock: 50, popularity: 9 },
  { id: 'dp2', name: 'Friandises Training Chiot', price: 18, category: 'nourriture', animalType: 'dog', stock: 40, popularity: 7 },
  { id: 'dp3', name: 'Jouet Kong Junior', price: 25, category: 'jouets', animalType: 'dog', stock: 30, popularity: 6 },
  { id: 'dp4', name: 'Croquettes Kitten 2 kg', price: 65, category: 'nourriture', animalType: 'cat', stock: 45, popularity: 8 },
  { id: 'dp5', name: 'Litière agglomérante chaton', price: 22, category: 'accessoires', animalType: 'cat', stock: 35, popularity: 5 },
  { id: 'dp6', name: 'Croquettes Senior 4 kg', price: 85, discountPrice: 76, category: 'nourriture', animalType: 'dog', stock: 40, popularity: 8 },
  { id: 'dp7', name: 'Complément articulations senior', price: 42, category: 'accessoires', animalType: 'dog', stock: 25, popularity: 6 },
  { id: 'dp8', name: 'Croquettes Sport Performance', price: 95, category: 'nourriture', animalType: 'dog', stock: 28, popularity: 7 },
  { id: 'dp9', name: 'Barres énergétiques active dog', price: 28, category: 'nourriture', animalType: 'dog', stock: 20, popularity: 5 },
  { id: 'dp10', name: 'Croquettes Senior Chat 2 kg', price: 72, category: 'nourriture', animalType: 'cat', stock: 30, popularity: 7 },
];

const buildPack = (def, products, pet) => {
  const items = pickProductsForPack(products, def);
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const bundleDiscount = 0.08;
  const totalPrice = Math.round(subtotal * (1 - bundleDiscount) * 100) / 100;

  return {
    packType: def.id,
    label: def.label,
    icon: def.icon,
    description: def.description,
    lifeStage: def.lifeStage,
    animalTypes: def.animalTypes,
    items,
    itemCount: items.length,
    subtotal: Math.round(subtotal * 100) / 100,
    totalPrice,
    savingsPercent: bundleDiscount * 100,
    savingsAmount: Math.round((subtotal - totalPrice) * 100) / 100,
    tips: def.tips,
    autoGenerated: true,
    model: 'product_pack_v1',
    matchedPet: pet
      ? { id: pet.id, name: pet.name, type: pet.type, ageYears: getPetAgeYears(pet.birthDate) }
      : null,
  };
};

const detectSuggestedPackType = (pet, activityLevel = 'moderate') => {
  if (!pet) return 'puppy';
  const age = getPetAgeYears(pet.birthDate);
  const type = pet.type || 'dog';

  if (age != null && age < 1) {
    return type === 'cat' ? 'kitten' : 'puppy';
  }
  if (age != null && age >= 7 && ['dog', 'cat'].includes(type)) {
    return 'senior';
  }
  if (['high', 'very_high', 'sport'].includes(String(activityLevel).toLowerCase())) {
    return 'sporty';
  }
  if (/sport|actif|agility|course/i.test(pet.notes || '')) {
    return 'sporty';
  }
  if (type === 'cat') return 'kitten';
  return 'puppy';
};

const listAutoPacks = async (user, { petId, petName, activityLevel } = {}) => {
  const userId = uid(user);
  let pet = null;
  let products = [];

  if (isDemoMode()) {
    products = demoProducts();
    pet = petId || petName
      ? { id: petId || 'demo_pet', name: petName || 'Médor', type: 'dog', birthDate: new Date(Date.now() - 200 * 86400000) }
      : { id: 'demo_pet', name: 'Médor', type: 'dog', birthDate: new Date(Date.now() - 3 * 86400000) };
  } else {
    pet = await loadPet(userId, petId, petName);
    products = await prisma.product.findMany({
      where: { stock: { gt: 0 } },
      orderBy: [{ popularity: 'desc' }, { rating_avg: 'desc' }],
      take: 120,
    });
  }

  const suggestedType = detectSuggestedPackType(pet, activityLevel);
  const packs = Object.values(PACK_TYPES).map((def) => {
    const pack = buildPack(def, products, pet);
    pack.isSuggested = def.id === suggestedType;
    pack.applicable =
      !pet ||
      def.animalTypes.includes(pet.type) ||
      (def.id === 'puppy' && pet.type === 'dog') ||
      (def.id === 'kitten' && pet.type === 'cat');
    return pack;
  });

  return {
    packs: packs.filter((p) => p.applicable !== false && p.items.length > 0),
    suggestedPackType: suggestedType,
    pet: pet
      ? {
          id: pet.id,
          name: pet.name,
          type: pet.type,
          ageYears: getPetAgeYears(pet.birthDate),
        }
      : null,
    model: 'product_pack_auto_v1',
  };
};

const getPackByType = async (user, packType, query = {}) => {
  const { packs, suggestedPackType, pet } = await listAutoPacks(user, query);
  const pack = packs.find((p) => p.packType === packType);
  if (!pack) {
    const err = new Error('Pack introuvable ou vide pour cet animal');
    err.status = 404;
    throw err;
  }
  return { pack, suggestedPackType, pet };
};

const packToCart = (pack) => ({
  message: `Pack « ${pack.label} » prêt pour le panier`,
  items: pack.items.map((it) => ({
    productId: it.productId,
    name: it.name,
    price: it.price,
    quantity: it.quantity,
    imageUrl: it.imageUrl,
  })),
  totalPrice: pack.totalPrice,
  savingsAmount: pack.savingsAmount,
});

module.exports = {
  listAutoPacks,
  getPackByType,
  packToCart,
  detectSuggestedPackType,
  PACK_TYPES,
};

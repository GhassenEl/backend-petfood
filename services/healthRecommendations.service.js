const { prisma } = require('../prismaClient');

const VACCINES_BY_TYPE = {
  dog: ['Rage (annuelle)', 'Maladie de Carré', 'Hépatite canine', 'Parvovirose', 'Vermifuge (3-6 mois)'],
  cat: ['Coryza', 'Leucose féline', 'Rage', 'Vermifuge (3-6 mois)'],
  bird: ['Vermifuge annuel', 'Contrôle parasitaire'],
  fish: ['Stabilisation eau (hebdo)', 'Surveillance nitrites/nitrates'],
  other: ['Consultation NAC annuelle', 'Vermifuge adapté à l\'espèce'],
};

const STATIC_TIPS = {
  dog: {
    food: ['Croquettes riches en protéines (≥25 %)', 'Friandises naturelles sans additifs'],
    accessories: ['Gamelle anti-glouton', 'Brosse de toilettage', 'Laisse et collier réfléchissant'],
    medicines: ['Complément articulations (grandes races)', 'Antiparasitaire externe'],
  },
  cat: {
    food: ['Alimentation riche en taurine', 'Pâtée humide pour hydratation'],
    accessories: ['Fontaine à eau', 'Arbre à chat', 'Griffoir'],
    medicines: ['Antipuces/antitiques', 'Complément urinaire'],
  },
  bird: {
    food: ['Mélange de graines premium', 'Fruits et légumes frais'],
    accessories: ['Baignoire pour plumage', 'Perchoirs variés'],
    medicines: ['Complément vitamines', 'Vermifuge spécial oiseaux'],
  },
  fish: {
    food: ['Granulés équilibrés', 'Nourriture vivante/congelée 2×/semaine'],
    accessories: ['Testeur eau (pH, nitrites)', 'Programmateur éclairage'],
    medicines: ['Conditionneur eau', 'Traitement anti-algues préventif'],
  },
  other: {
    food: ['Alimentation spécifique espèce', 'Foin à volonté (rongeurs)'],
    accessories: ['Abri adapté', 'Enrichissement environnemental'],
    medicines: ['Vermifuge NAC', 'Complément vitamines'],
  },
};

const normalizePetType = (petType) => {
  const t = String(petType || 'dog').toLowerCase();
  return ['dog', 'cat', 'bird', 'fish', 'other'].includes(t) ? t : 'other';
};

const mapProduct = (p, reason) => ({
  id: p.id,
  _id: p.id,
  name: p.name,
  reason: reason || `Adapté aux ${p.animalType || 'animaux'}`,
  product: { name: p.name, category: p.category },
});

const getHealthRecommendations = async (petType = 'dog') => {
  const type = normalizePetType(petType);
  const staticTips = STATIC_TIPS[type] || STATIC_TIPS.other;

  const products = await prisma.product.findMany({
    where: {
      OR: [{ animalType: type }, { animalType: 'other' }],
    },
    orderBy: [{ popularity: 'desc' }, { rating_avg: 'desc' }],
    take: 40,
  });

  const foodProducts = products
    .filter((p) => ['nourriture', 'snack', 'food'].includes(String(p.category || '').toLowerCase()))
    .slice(0, 4)
    .map((p) => mapProduct(p, 'Alimentation recommandée pour votre compagnon'));

  const accessoryProducts = products
    .filter((p) => ['hygiène', 'hygiene', 'accessoire', 'accessoires', 'jouet'].includes(String(p.category || '').toLowerCase()))
    .slice(0, 4)
    .map((p) => mapProduct(p, 'Accessoire utile au quotidien'));

  const medicineProducts = products
    .filter((p) => ['santé', 'sante', 'medicament', 'médicament', 'soin'].includes(String(p.category || '').toLowerCase()))
    .slice(0, 3)
    .map((p) => mapProduct(p, 'Soin préventif ou complément'));

  const toStaticItems = (labels, prefix) =>
    (labels || []).map((name, i) => ({
      id: `${prefix}-${i}`,
      name,
      reason: 'Conseil vétérinaire général PetfoodTN',
    }));

  return {
    petType: type,
    source: 'petfoodtn',
    food: foodProducts.length ? foodProducts : toStaticItems(staticTips.food, 'food'),
    accessories: accessoryProducts.length ? accessoryProducts : toStaticItems(staticTips.accessories, 'acc'),
    medicines: medicineProducts.length ? medicineProducts : toStaticItems(staticTips.medicines, 'med'),
    vaccines: VACCINES_BY_TYPE[type] || VACCINES_BY_TYPE.other,
  };
};

module.exports = { getHealthRecommendations };

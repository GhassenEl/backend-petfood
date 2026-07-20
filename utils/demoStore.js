const { stringifyEventPrizes, DEFAULT_COMPETITION_PRIZES } = require('./eventPrizes');
const { resolveRegionFromAddress } = require('./regions');
const { catalogExpansionProducts } = require('./catalogExpansionProducts');

const now = () => new Date().toISOString();
const createId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

// demoUsers removed to eliminate demo accounts.
// Users are created via normal signup/admin flows.
const demoUsers = [];

const demoProducts = [
  {
    _id: 'prd_dog_1',
    name: 'Croquettes Premium Chien',
    price: 58,
    discount: 15,
    description: 'Recette riche en proteines pour chiens actifs et pelage brillant.',
    stock: 24,
    animalType: 'dog',
    category: 'nourriture',
    tags: ['premium', 'proteines'],
    popularity: 95,
    rating_avg: 4.7,
    rating_count: 42,
    imageUrl: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=900&q=80',
    icon: '🐶',
  },
  {
    _id: 'prd_cat_1',
    name: 'Patee Equilibre Chat',
    price: 24,
    discount: 10,
    description: 'Texture fondante pour chats adultes, digestion legere et gout saumon.',
    stock: 31,
    animalType: 'cat',
    category: 'nourriture',
    tags: ['bio', 'saumon'],
    popularity: 88,
    rating_avg: 4.5,
    rating_count: 35,
    imageUrl: 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=900&q=80',
    icon: '🐱',
  },
  {
    _id: 'prd_bird_1',
    name: 'Melange Vitalite Oiseaux',
    price: 19,
    discount: 5,
    description: 'Melange de graines premium pour oiseaux domestiques.',
    stock: 18,
    animalType: 'bird',
    category: 'nourriture',
    tags: ['graines', 'vitamines'],
    popularity: 65,
    rating_avg: 4.3,
    rating_count: 18,
    imageUrl: 'https://images.unsplash.com/photo-1444464666168-49d633b86797?auto=format&fit=crop&w=900&q=80',
    icon: '🐦',
  },
  {
    _id: 'prd_fish_1',
    name: 'Granules Aquarium Pro',
    price: 16,
    discount: 0,
    description: 'Granules digestes et faciles a doser pour poissons tropicaux.',
    stock: 42,
    animalType: 'fish',
    category: 'nourriture',
    tags: ['tropical', 'digestion'],
    popularity: 72,
    rating_avg: 4.4,
    rating_count: 22,
    imageUrl: 'https://images.unsplash.com/photo-1520301255226-bf5f144451c1?auto=format&fit=crop&w=900&q=80',
    icon: '🐠',
  },
  {
    _id: 'prd_dog_2',
    name: 'Snack Dentaire Naturel',
    price: 14,
    discount: 20,
    description: 'Snacks a macher pour hygiene dentaire et haleine fraiche.',
    stock: 53,
    animalType: 'dog',
    category: 'friandises',
    tags: ['dentaire', 'naturel'],
    popularity: 90,
    rating_avg: 4.8,
    rating_count: 56,
    imageUrl: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=80',
    icon: '🦴',
  },
  {
    _id: 'prd_cat_2',
    name: 'Litiere Confort Chat',
    price: 27,
    discount: 12,
    description: 'Litiere absorbante sans poussiere pour usage quotidien.',
    stock: 27,
    animalType: 'cat',
    category: 'accessoires',
    tags: ['absorbant', 'sans-poussiere'],
    popularity: 85,
    rating_avg: 4.6,
    rating_count: 31,
    imageUrl: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=900&q=80',
    icon: '🐾',
  },
  {
    _id: 'prd_dog_jouet_1',
    name: 'Balle Tennis Renforcée',
    price: 12,
    discount: 0,
    description: 'Balle résistante pour chiens actifs, jeu en extérieur.',
    stock: 40,
    animalType: 'dog',
    category: 'jouets',
    tags: ['jouet', 'plein-air'],
    popularity: 78,
    rating_avg: 4.5,
    rating_count: 19,
    imageUrl: 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=900&q=80',
    icon: '🎾',
  },
  {
    _id: 'prd_cat_jouet_1',
    name: 'Canne à Plumes Interactive',
    price: 18,
    discount: 10,
    description: 'Stimule l’instinct de chasse du chat d’intérieur.',
    stock: 35,
    animalType: 'cat',
    category: 'jouets',
    tags: ['jouet', 'interactif'],
    popularity: 82,
    rating_avg: 4.7,
    rating_count: 24,
    imageUrl: 'https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?auto=format&fit=crop&w=900&q=80',
    icon: '🪶',
  },
  {
    _id: 'prd_smart_bowl_1',
    name: 'Gamelle intelligente PetfoodTN',
    price: 349,
    discount: 10,
    description:
      'Gamelle connectée ESP32 : contrôle app, distribution auto, balance HX711, historique et alertes réservoir.',
    stock: 18,
    animalType: 'other',
    category: 'accessoires',
    productKind: 'iot_device',
    tags: ['gamelle', 'intelligente', 'iot', 'connectee', 'esp32', 'feeder'],
    popularity: 88,
    rating_avg: 4.8,
    rating_count: 26,
    imageUrl: '/images/products/smart-feeder.svg',
    icon: '🍽️',
  },
  {
    _id: 'prd_dog_acc_1',
    name: 'Laisse Rétractable 5 m',
    price: 32,
    discount: 5,
    description: 'Laisse confort poignée antidérapante, jusqu’à 25 kg.',
    stock: 22,
    animalType: 'dog',
    category: 'accessoires',
    tags: ['accessoire', 'promenade'],
    popularity: 70,
    rating_avg: 4.4,
    rating_count: 15,
    imageUrl: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=900&q=80',
    icon: '🦮',
  },
  {
    _id: 'prd_cat_acc_1',
    name: 'Arbre à Chat 120 cm',
    price: 89,
    discount: 15,
    description: 'Griffoir, plateformes et cachette pour chat.',
    stock: 8,
    animalType: 'cat',
    category: 'accessoires',
    tags: ['accessoire', 'griffoir'],
    popularity: 68,
    rating_avg: 4.6,
    rating_count: 12,
    imageUrl: 'https://images.unsplash.com/photo-1545249390-6bdfa286032f?auto=format&fit=crop&w=900&q=80',
    icon: '🌳',
  },
  {
    _id: 'prd_dog_niche_1',
    name: 'Niche bois isolée Chien M',
    price: 189,
    discount: 12,
    description:
      'Maison outdoor en bois traité, toit amovible, isolation thermique. Idéale pour chiens moyens (jusqu’à 25 kg).',
    stock: 10,
    animalType: 'dog',
    category: 'niches',
    tags: ['niche', 'maison', 'bois', 'outdoor', 'habitat'],
    popularity: 78,
    rating_avg: 4.6,
    rating_count: 19,
    imageUrl: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=900&q=80',
    icon: '🏠',
  },
  {
    _id: 'prd_dog_niche_2',
    name: 'Niche plastique XL outdoor',
    price: 149,
    discount: 10,
    description:
      'Niche résine robuste, ventilation latérale, fond surélevé. Facile à nettoyer, pour grands chiens.',
    stock: 14,
    animalType: 'dog',
    category: 'niches',
    tags: ['niche', 'plastique', 'xl', 'outdoor'],
    popularity: 74,
    rating_avg: 4.4,
    rating_count: 15,
    imageUrl: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=80',
    icon: '🏡',
  },
  {
    _id: 'prd_dog_niche_3',
    name: 'Lit orthopédique + couverture Chien',
    price: 79,
    discount: 15,
    description:
      'Coussin mémoire de forme avec housse déhoussable et couverture polaire assortie. Coin repos intérieur.',
    stock: 20,
    animalType: 'dog',
    category: 'niches',
    tags: ['lit', 'coussin', 'couverture', 'orthopedique', 'interieur'],
    popularity: 82,
    rating_avg: 4.7,
    rating_count: 28,
    imageUrl: 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=900&q=80',
    icon: '🛏️',
  },
  {
    _id: 'prd_dog_niche_4',
    name: 'Couverture polaire Chien 100×70',
    price: 29,
    discount: 5,
    description: 'Couverture douce anti-poil, lavable machine. À poser dans la niche ou sur le canapé.',
    stock: 35,
    animalType: 'dog',
    category: 'niches',
    tags: ['couverture', 'polaire', 'accessoire', 'habitat'],
    popularity: 71,
    rating_avg: 4.5,
    rating_count: 22,
    imageUrl: 'https://images.unsplash.com/photo-1544568100-847a948585b9?auto=format&fit=crop&w=900&q=80',
    icon: '🧣',
  },
  {
    _id: 'prd_cat_niche_1',
    name: 'Maison igloo Chat avec coussin',
    price: 59,
    discount: 10,
    description:
      'Cabane fermée type igloo, coussin amovible et entrée ronde. Coin cocooning pour siestes.',
    stock: 18,
    animalType: 'cat',
    category: 'niches',
    tags: ['maison', 'igloo', 'coussin', 'chat', 'habitat'],
    popularity: 80,
    rating_avg: 4.6,
    rating_count: 21,
    imageUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=900&q=80',
    icon: '🏠',
  },
  {
    _id: 'prd_cat_niche_2',
    name: 'Niche intérieure Chat + couverture',
    price: 69,
    discount: 12,
    description:
      'Petite maison pliable en tissu, toit amovible, couverture polaire incluse. Idéale salon / chambre.',
    stock: 16,
    animalType: 'cat',
    category: 'niches',
    tags: ['niche', 'maison', 'couverture', 'interieur'],
    popularity: 76,
    rating_avg: 4.5,
    rating_count: 14,
    imageUrl: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=900&q=80',
    icon: '🏡',
  },
  {
    _id: 'prd_cat_niche_3',
    name: 'Lit tunnel cachette Chat',
    price: 45,
    discount: 8,
    description: 'Tunnel + lit 2-en-1, tissu doux, lavable. Pour se cacher et se reposer.',
    stock: 22,
    animalType: 'cat',
    category: 'niches',
    tags: ['lit', 'tunnel', 'cachette', 'habitat'],
    popularity: 73,
    rating_avg: 4.4,
    rating_count: 17,
    imageUrl: 'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?auto=format&fit=crop&w=900&q=80',
    icon: '🐈',
  },
  {
    _id: 'prd_cat_niche_4',
    name: 'Couverture douce Chat 60×40',
    price: 22,
    discount: 0,
    description: 'Petite couverture molletonnée, antidérapante. À glisser dans la maison ou le panier.',
    stock: 40,
    animalType: 'cat',
    category: 'niches',
    tags: ['couverture', 'accessoire', 'habitat'],
    popularity: 69,
    rating_avg: 4.3,
    rating_count: 11,
    imageUrl: 'https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?auto=format&fit=crop&w=900&q=80',
    icon: '🧣',
  },
  {
    _id: 'prd_bird_niche_1',
    name: 'Cage maison Oiseaux + housse',
    price: 119,
    discount: 10,
    description:
      'Cage habitat avec perchoirs, mangeoire, abreuvoir et housse de nuit pour calme et obscurité.',
    stock: 12,
    animalType: 'bird',
    category: 'niches',
    tags: ['cage', 'maison', 'housse', 'oiseau', 'habitat'],
    popularity: 72,
    rating_avg: 4.5,
    rating_count: 13,
    imageUrl: 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=900&q=80',
    icon: '🏠',
  },
  {
    _id: 'prd_bird_niche_2',
    name: 'Abri perchoir Oiseaux intérieur',
    price: 49,
    discount: 5,
    description:
      'Petit abri / nichoir d’intérieur à fixer, avec coussinet et ouverture. Coin repos pour perruches et canaris.',
    stock: 20,
    animalType: 'bird',
    category: 'niches',
    tags: ['abri', 'perchoir', 'nichoir', 'oiseau'],
    popularity: 65,
    rating_avg: 4.3,
    rating_count: 9,
    imageUrl: 'https://images.unsplash.com/photo-1522926193341-e9ffd686c60f?auto=format&fit=crop&w=900&q=80',
    icon: '🪺',
  },
  {
    _id: 'prd_bird_niche_3',
    name: 'Housse de protection Cage Oiseaux',
    price: 34,
    discount: 8,
    description:
      'Couverture / housse opaque pour cage (nuit, stress, déplacement). Respirante, plusieurs tailles.',
    stock: 28,
    animalType: 'bird',
    category: 'niches',
    tags: ['housse', 'couverture', 'cage', 'accessoire'],
    popularity: 67,
    rating_avg: 4.4,
    rating_count: 10,
    imageUrl: 'https://images.unsplash.com/photo-1444464666168-49d633b86797?auto=format&fit=crop&w=900&q=80',
    icon: '🧣',
  },
  {
    _id: 'prd_bird_niche_4',
    name: 'Tapis & accessoires habitat Oiseaux',
    price: 27,
    discount: 0,
    description:
      'Kit : tapis de fond cage, jouets perchés et miroir. Complète la maison de vos oiseaux.',
    stock: 30,
    animalType: 'bird',
    category: 'niches',
    tags: ['tapis', 'accessoires', 'cage', 'habitat'],
    popularity: 64,
    rating_avg: 4.2,
    rating_count: 8,
    imageUrl: 'https://images.unsplash.com/photo-1452570053594-1b985d6ea890?auto=format&fit=crop&w=900&q=80',
    icon: '🪶',
  },
  {
    _id: 'prd_hyg_spray_1',
    name: 'Spray anti-odeur animaux 500 ml',
    price: 24,
    discount: 8,
    description:
      'Spray neutralisant d’odeurs pour canapé, tapis et litière. Formule enzymatique, sans parfum agressif, sûr autour des animaux.',
    stock: 40,
    animalType: 'other',
    category: 'hygiene',
    tags: ['spray', 'anti-odeur', 'hygiene', 'maison'],
    popularity: 79,
    rating_avg: 4.5,
    rating_count: 24,
    imageUrl: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=900&q=80',
    icon: '🧴',
  },
  {
    _id: 'prd_hyg_lingettes_1',
    name: 'Lingettes nettoyantes animaux (80 pcs)',
    price: 16,
    discount: 5,
    description:
      'Lingettes biodégradables pour pattes, pelage et surfaces. Sans alcool, pH neutre, idéales après promenade.',
    stock: 55,
    animalType: 'other',
    category: 'hygiene',
    tags: ['lingettes', 'nettoyage', 'hygiene', 'pattes'],
    popularity: 77,
    rating_avg: 4.4,
    rating_count: 31,
    imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=900&q=80',
    icon: '🧻',
  },
  {
    _id: 'prd_hyg_aspirateur_1',
    name: 'Aspirateur poils animaux portable',
    price: 129,
    discount: 12,
    description:
      'Aspirateur sans fil spécial poils de chien et chat : brosse anti-emmêlement, réservoir XL, autonomie 40 min. Canapé, voiture, tapis.',
    stock: 12,
    animalType: 'other',
    category: 'hygiene',
    tags: ['aspirateur', 'poils', 'hygiene', 'maison', 'portable'],
    popularity: 81,
    rating_avg: 4.6,
    rating_count: 18,
    imageUrl: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=900&q=80',
    icon: '🧹',
  },
  {
    _id: 'prd_hyg_tapis_1',
    name: 'Tapis anti-poil lavable 120×80',
    price: 49,
    discount: 10,
    description:
      'Tapis microfibre qui retient les poils, lavable en machine. Antidérapant, pour entrée, salon ou panier.',
    stock: 25,
    animalType: 'other',
    category: 'hygiene',
    tags: ['tapis', 'anti-poil', 'hygiene', 'lavable', 'maison'],
    popularity: 75,
    rating_avg: 4.5,
    rating_count: 20,
    imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80',
    icon: '🧺',
  },
  ...catalogExpansionProducts,
  {
    _id: 'prd_dog_fri_1',
    name: 'Friandises Poulet 200 g',
    price: 11,
    discount: 0,
    description: 'Bouchées tendres sans céréales, récompense quotidienne.',
    stock: 60,
    animalType: 'dog',
    category: 'friandises',
    tags: ['friandise', 'poulet'],
    popularity: 91,
    rating_avg: 4.8,
    rating_count: 48,
    imageUrl: 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=900&q=80',
    icon: '🦴',
  },
  {
    _id: 'prd_cat_fri_1',
    name: 'Friandises Saumon Chat 80 g',
    price: 9,
    discount: 8,
    description: 'Sticks croquants enrichis en oméga-3.',
    stock: 45,
    animalType: 'cat',
    category: 'friandises',
    tags: ['friandise', 'saumon'],
    popularity: 86,
    rating_avg: 4.7,
    rating_count: 33,
    imageUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=900&q=80',
    icon: '🐟',
  },
  {
    _id: 'prd_dog_vet_1',
    name: 'Manteau Hiver Chien Taille M',
    price: 45,
    discount: 12,
    description: 'Doublure polaire, coupe-vent, réglable au dos.',
    stock: 14,
    animalType: 'dog',
    category: 'vetements',
    tags: ['vetement', 'hiver'],
    popularity: 62,
    rating_avg: 4.3,
    rating_count: 9,
    imageUrl: 'https://images.unsplash.com/photo-1544568100-847a948585b9?auto=format&fit=crop&w=900&q=80',
    icon: '🧥',
  },
  {
    _id: 'prd_cat_vet_1',
    name: 'Pull Doux Chat Taille S',
    price: 28,
    discount: 0,
    description: 'Maille douce pour chats d’intérieur en saison froide.',
    stock: 20,
    animalType: 'cat',
    category: 'vetements',
    tags: ['vetement', 'chat'],
    popularity: 58,
    rating_avg: 4.2,
    rating_count: 7,
    imageUrl: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=900&q=80',
    icon: '👕',
  },
];

const { defaultBlogArticles } = require('./defaultBlogArticles');

const buildDefaultBlogStore = () =>
  defaultBlogArticles.map((article, index) => {
    const publishedAt = new Date();
    publishedAt.setDate(publishedAt.getDate() - index * 14);
    const id = `blog_default_${index + 1}`;
    return {
      _id: id,
      id,
      ...article,
      isPublished: true,
      publishedAt: publishedAt.toISOString(),
      date: publishedAt.toISOString(),
      createdAt: publishedAt.toISOString(),
      updatedAt: publishedAt.toISOString(),
    };
  });

// Keep store base structure but remove order/user references that depended on demoUsers.
let store = {
  users: clone(demoUsers),
  products: clone(demoProducts),
  orders: [],
  invoices: [],
  reviews: [],
  serviceRatings: [],
  complaints: [],
  messages: [],
  blogArticles: buildDefaultBlogStore(),
  eventRegistrations: [
    {
      id: 'reg_demo_win_1',
      eventId: 'event_comp_grand_prix',
      userId: 'demo_client',
      petName: 'Max',
      status: 'winner',
      entryNumber: 'PF-042',
      prizeLabel: 'Adoption gratuite — chiot refuge Nabeul',
      prizeType: 'free_animal',
      wonAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    },
  ],
  foundMeReports: [
    {
      id: 'fm_demo_lost_1',
      tagCode: 'FM-DEMO01',
      reportType: 'lost',
      reporterId: 'demo_client',
      petName: 'Rex',
      animalType: 'dog',
      breed: 'Berger allemand',
      color: 'noir et feu',
      distinctiveMarks: 'Collier rouge avec médaille FM-DEMO01',
      description: 'Fugue le 12/05 vers le lac 2. Très sociable.',
      photoUrl: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=600&q=80',
      lastSeenAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      location: 'Lac 2, Tunis',
      region: 'Grand Tunis',
      status: 'active',
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'fm_demo_found_1',
      tagCode: 'FM-DEMO02',
      reportType: 'found',
      reporterId: 'demo_client',
      petName: 'Chien trouvé',
      animalType: 'dog',
      breed: 'berger',
      color: 'noir',
      description: 'Vu près du parc, semble perdu, pas de puce visible.',
      photoUrl: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=600&q=80',
      lastSeenAt: new Date(Date.now() - 86400000).toISOString(),
      location: 'Ariana Ville',
      region: 'Grand Tunis',
      status: 'active',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'fm_demo_lost_2',
      tagCode: 'FM-DEMO03',
      reportType: 'lost',
      reporterId: 'demo_client',
      petName: 'Mimi',
      animalType: 'cat',
      breed: 'Européen',
      color: 'gris tigré',
      location: 'Manar 2',
      region: 'Grand Tunis',
      status: 'active',
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
};

const getUserById = (id) => store.users.find((user) => user._id === id);

const getProducts = () => {
  const list = clone(store.products);
  return Array.isArray(list) && list.length ? list : clone(demoProducts);
};
const getUsers = () => clone(store.users);

const createProduct = (payload) => {
  const product = {
    _id: createId('prd'),
    name: payload.name,
    price: Number(payload.price || 0),
    discount: Number(payload.discount || 0),
    description: payload.description || '',
    stock: Number(payload.stock || 0),
    animalType: payload.animalType || 'other',
    category: payload.category || 'nourriture',
    tags: payload.tags || [],
    popularity: Number(payload.popularity || 0),
    rating_avg: Number(payload.rating_avg || 0),
    rating_count: Number(payload.rating_count || 0),
    imageUrl: payload.imageUrl || payload.image || '',
    icon: payload.icon || '🐾',
  };
  store.products.unshift(product);
  return clone(product);
};

const updateProduct = (id, payload) => {
  const index = store.products.findIndex((product) => product._id === id);
  if (index === -1) return null;
  store.products[index] = {
    ...store.products[index],
    ...payload,
    price: Number(payload.price ?? store.products[index].price),
    discount: Number(payload.discount ?? store.products[index].discount),
    stock: Number(payload.stock ?? store.products[index].stock),
    imageUrl: payload.imageUrl || payload.image || store.products[index].imageUrl,
  };
  return clone(store.products[index]);
};

const deleteProduct = (id) => {
  const existing = store.products.find((product) => product._id === id);
  store.products = store.products.filter((product) => product._id !== id);
  return clone(existing);
};

const getOrders = (user) => {
  if (!user) return clone(store.orders);
  if (user.role === 'admin') return clone(store.orders);
  if (user.role === 'livreur') {
    const livreur = getUserById(user._id);
    if (livreur?.region) {
      return clone(store.orders.filter((order) => order.region === livreur.region));
    }
    return clone(store.orders);
  }
  return clone(store.orders.filter((order) => order.userId && order.userId._id === user._id));
};

const createOrder = (user, payload) => {
  const rawItems = payload.items || [];

  const items = [];
  for (const item of rawItems) {
    const product = store.products.find(
      (entry) => entry._id === item.productId || entry._id === item.productId?._id
    );

    const quantity = Number(item.quantity || 1);
    if (!product || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    // Option 2 (user request): retirer automatiquement les items en rupture
    if (product.stock < quantity) {
      continue;
    }

    // Decrement stock in demo
    product.stock = Number(product.stock) - quantity;

    const finalPrice = Number(
      item.price ?? ((product.price || 0) * (1 - (product.discount || 0) / 100)).toFixed(2)
    );

    items.push({
      productId: {
        _id: product._id,
        name: product.name,
        price: product.price,
        discount: product.discount,
        imageUrl: product.imageUrl,
      },
      quantity,
      price: finalPrice,
    });
  }

  if (!items.length) {
    const error = new Error('Aucun produit disponible en stock');
    error.status = 400;
    throw error;
  }

  const total = Number(items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
  const deliveryMode = payload.deliveryMode === 'relay' ? 'relay' : 'home';
  const order = {
    _id: createId('ord'),
    userId: { _id: user._id, email: user.email, name: user.name, role: user.role },
    items,
    total,
    status: payload.status || 'pending',
    paymentMethod: payload.paymentMethod || 'cash',
    address: payload.address || '',
    phone: payload.phone || '',
    region: resolveRegionFromAddress(payload.address),
    deliveryLocation: payload.location || payload.deliveryLocation || null,
    deliveryMode,
    deliveryStatus: deliveryMode === 'relay' ? 'awaiting_pickup' : 'pending',
    relayPointId: payload.relayPointId || null,
    relayPointName: payload.relayPointName || null,
    relayPointType: payload.relayPointType || null,
    createdAt: now(),
  };
  store.orders.unshift(order);

  const invoice = {
    _id: createId('inv'),
    userId: { _id: user._id, email: user.email, name: user.name, role: user.role },
    orderId: clone(order),
    amount: total,
    status: 'unpaid',
    paymentMethod: order.paymentMethod,
    issuedAt: now(),
    paidAt: null,
  };
  store.invoices.unshift(invoice);

  return { order: clone(order), invoice: clone(invoice) };
};


const updateOrder = (id, payload) => {
  const index = store.orders.findIndex((order) => order._id === id);
  if (index === -1) return null;
  store.orders[index] = { ...store.orders[index], ...payload };

  const invoiceIndex = store.invoices.findIndex((invoice) => invoice.orderId._id === id);
  if (invoiceIndex !== -1) {
    store.invoices[invoiceIndex].orderId = clone(store.orders[index]);
  }

  return clone(store.orders[index]);
};

const deleteOrder = (id) => {
  const existing = store.orders.find((order) => order._id === id);
  store.orders = store.orders.filter((order) => order._id !== id);
  store.invoices = store.invoices.filter((invoice) => invoice.orderId._id !== id);
  return clone(existing);
};

const CLIENT_CANCEL_STATUSES = new Set(['pending', 'paid']);

const cancelOrder = (id, user, { reason } = {}) => {
  const order = store.orders.find((o) => o._id === id || o.id === id);
  if (!order) return null;

  if (user.role !== 'admin') {
    const uid = user._id || user.id;
    const orderUid = order.userId?._id || order.userId?.id || order.userId;
    if (String(orderUid) !== String(uid)) {
      return { error: 'Non autorisé à annuler cette commande' };
    }
  }

  if (!CLIENT_CANCEL_STATUSES.has(order.status)) {
    return { error: 'Cette commande ne peut plus être annulée (déjà expédiée ou livrée)' };
  }

  order.status = 'cancelled';
  order.deliveryStatus = 'cancelled';
  order.cancelledAt = now();
  order.cancelReason = reason || 'Annulée par le client';

  const invoice = store.invoices.find(
    (inv) => (inv.orderId?._id || inv.orderId?.id || inv.orderId) === id,
  );
  if (invoice && invoice.status !== 'paid') {
    invoice.status = 'cancelled';
  }

  return clone(order);
};

const livreurCancelOrder = (id, livreurUserId, { reason } = {}) => {
  const order = store.orders.find((o) => o._id === id || o.id === id);
  if (!order) return null;

  if (order.status !== 'shipped') {
    return { error: 'Seules les courses en livraison peuvent être annulées' };
  }

  if (order.assignedLivreurId && String(order.assignedLivreurId) !== String(livreurUserId)) {
    return { error: 'Cette course ne vous est pas assignée' };
  }

  order.status = 'pending';
  order.deliveryStatus = 'pending';
  order.assignedLivreurId = null;
  order.shippedAt = null;
  order.livreurCancelReason = reason || 'Course abandonnée par le livreur';
  return clone(order);
};

const getInvoices = (user) => {
  if (!user) return clone(store.invoices);
  if (user.role === 'admin') return clone(store.invoices);
  return clone(store.invoices.filter((invoice) => {
    const invUid = invoice.userId && (invoice.userId._id || invoice.userId.id || invoice.userId);
    const userUid = user._id || user.id;
    return invUid === userUid;
  }));
};

const payInvoice = (user, invoiceId, paymentMethod) => {
  const index = store.invoices.findIndex((invoice) => invoice._id === invoiceId);
  if (index === -1) return null;
  const invUserId = store.invoices[index].userId && (store.invoices[index].userId._id || store.invoices[index].userId.id || store.invoices[index].userId);
  const userUid = user._id || user.id;
  if (user.role !== 'admin' && invUserId !== userUid) return null;

  store.invoices[index].status = 'paid';
  store.invoices[index].paidAt = now();
  store.invoices[index].paymentMethod = paymentMethod || store.invoices[index].paymentMethod;

  updateOrder(store.invoices[index].orderId._id, {
    status: 'paid',
    paymentMethod: store.invoices[index].paymentMethod,
  });

  store.invoices[index].orderId = clone(store.orders.find((order) => order._id === store.invoices[index].orderId._id));
  return clone(store.invoices[index]);
};

const getReviews = (user) => {
  if (!user) return clone(store.reviews);
  if (user.role === 'admin') return clone(store.reviews);
  return clone(store.reviews.filter((review) => {
    const uid = review.userId?._id || review.userId?.id || review.userId;
    const userUid = user._id || user.id;
    return uid === userUid;
  }));
};

const createReview = (user, payload) => {
  const product = store.products.find((entry) => entry._id === payload.productId);
  const review = {
    _id: createId('rev'),
    userId: { _id: user._id, email: user.email, name: user.name, role: user.role },
    productId: product
      ? { _id: product._id, name: product.name, imageUrl: product.imageUrl }
      : { _id: payload.productId, name: payload.productName || 'Produit' },
    rating: Number(payload.rating || 5),
    comment: payload.comment,
    emotion: payload.emotion || 'neutral',
    createdAt: now(),
  };
  store.reviews.unshift(review);
  return clone(review);
};

const updateReview = (id, payload) => {
  const index = store.reviews.findIndex((review) => review._id === id);
  if (index === -1) return null;
  store.reviews[index] = {
    ...store.reviews[index],
    rating: Number(payload.rating ?? store.reviews[index].rating),
    comment: payload.comment ?? store.reviews[index].comment,
    emotion: payload.emotion ?? store.reviews[index].emotion,
  };
  return clone(store.reviews[index]);
};

const deleteReview = (id) => {
  const existing = store.reviews.find((review) => review._id === id);
  store.reviews = store.reviews.filter((review) => review._id !== id);
  return clone(existing);
};

const getServiceRatings = (user) => {
  if (!user) return clone(store.serviceRatings);
  if (user.role === 'admin') return clone(store.serviceRatings);
  return clone(store.serviceRatings.filter((r) => r.userId._id === user._id));
};

const getEligibleServiceRatings = (user) => {
  const orders = getOrders(user)
    .filter((o) => o.status === 'delivered')
    .map((o) => ({
      orderId: o._id,
      region: o.region || user.region || 'Tunis',
      total: o.total,
      deliveredAt: o.deliveredAt || o.updatedAt,
    }));
  const ratedOrderIds = new Set(
    store.serviceRatings
      .filter((r) => r.userId._id === user._id && r.type === 'delivery')
      .map((r) => r.orderId)
  );
  const ratedBookingIds = new Set(
    store.serviceRatings
      .filter((r) => r.userId._id === user._id && r.bookingId)
      .map((r) => r.bookingId)
  );
  return {
    delivery: orders.filter((o) => !ratedOrderIds.has(o.orderId)),
    veterinary: [
      {
        appointmentId: 'demo_appt_vet_1',
        petName: 'Mimi',
        animalType: 'cat',
        date: now(),
        visitMode: 'cabinet',
        vetName: 'Dr. Ben Ali',
      },
    ].filter(
      (a) =>
        !store.serviceRatings.some(
          (r) => r.userId._id === user._id && r.appointmentId === a.appointmentId
        )
    ),
    grooming: [
      {
        bookingId: 'demo_svc_groom_1',
        petName: 'Rex',
        animalType: 'dog',
        serviceType: 'grooming',
        date: now(),
        price: 45,
        title: 'Toilettage — Rex',
      },
    ].filter((b) => !ratedBookingIds.has(b.bookingId)),
    boarding: [],
    training: [
      {
        bookingId: 'demo_svc_train_1',
        petName: 'Rex',
        animalType: 'dog',
        serviceType: 'training',
        date: now(),
        price: 60,
        title: 'Dressage — Rex',
      },
    ].filter((b) => !ratedBookingIds.has(b.bookingId)),
  };
};

const createServiceRating = (user, payload) => {
  const rating = {
    _id: createId('srv'),
    id: createId('srv'),
    userId: { _id: user._id, name: user.name, email: user.email },
    type: payload.type,
    rating: Number(payload.rating || 5),
    comment: payload.comment || '',
    emotion: payload.emotion || 'satisfied',
    sentimentScore: payload.sentimentScore ?? null,
    aiSuggested: Boolean(payload.aiSuggested),
    region: payload.region || user.region || 'Tunis',
    orderId: payload.orderId || null,
    appointmentId: payload.appointmentId || null,
    bookingId: payload.bookingId || null,
    targetUserId: payload.targetUserId || null,
    createdAt: now(),
  };
  store.serviceRatings.unshift(rating);
  return clone(rating);
};

const getOwnerEmotionDashboard = (user) => {
  const ratings = getServiceRatings(user);
  const reviews = getReviews(user);
  const entries = [
    ...ratings.map((r) => ({
      id: r.id || r._id,
      source: 'service_rating',
      type: r.type,
      serviceType: r.type,
      rating: r.rating,
      emotion: r.emotion || 'neutral',
      comment: r.comment,
      createdAt: r.createdAt,
      label: r.type,
    })),
    ...reviews.map((r) => ({
      id: r.id || r._id,
      source: 'product_review',
      type: 'products',
      serviceType: 'products',
      rating: r.rating,
      emotion: r.emotion || 'neutral',
      comment: r.comment,
      createdAt: r.createdAt,
      label: r.product?.name || 'Produit',
    })),
  ];
  const serviceTypes = ['grooming', 'boarding', 'training', 'delivery', 'veterinary', 'products'];
  const breakdown = serviceTypes.map((type) => {
    const rows = entries.filter((e) => e.serviceType === type);
    return {
      type,
      label: type,
      icon: '🐾',
      count: rows.length,
      moodScore: rows.length ? 0.5 : 0,
      dominantEmotion: rows[0]?.emotion || 'neutral',
      emotions: [],
    };
  });
  return {
    role: 'client',
    agent: 'owner_emotion_analysis',
    globalMood: entries.length ? 0.45 : 0,
    globalMoodLabel: entries.length ? 'Plutôt satisfait' : 'Neutre',
    totalFeedbacks: entries.length,
    serviceBreakdown: breakdown,
    recentFeedbacks: entries.slice(0, 10),
    positiveServices: [],
    needsAttention: [],
    recommendations: [
      { type: 'feedback', label: 'Noter un service après votre visite', link: '/client-emotions' },
      { type: 'try', label: 'Réserver toilettage ou dressage', link: '/client-services' },
    ],
    summary: 'Mode démo — exprimez votre ressenti sur chaque service PetfoodTN.',
    emotionsCatalog: [
      { id: 'happy', label: 'Très heureux', emoji: '😊' },
      { id: 'satisfied', label: 'Satisfait', emoji: '🙂' },
      { id: 'neutral', label: 'Neutre', emoji: '😐' },
      { id: 'disappointed', label: 'Déçu', emoji: '😞' },
      { id: 'frustrated', label: 'Frustré', emoji: '😠' },
    ],
    platformServices: [
      { type: 'grooming', label: 'Toilettage', icon: '✂️' },
      { type: 'boarding', label: 'Pension', icon: '🏠' },
      { type: 'training', label: 'Dressage', icon: '🎓' },
      { type: 'delivery', label: 'Livraison', icon: '🚚' },
      { type: 'veterinary', label: 'Vétérinaire', icon: '🩺' },
      { type: 'products', label: 'Produits boutique', icon: '🛒' },
    ],
  };
};

const getServiceRatingStats = (type = 'delivery') => {
  const rows = store.serviceRatings.filter((r) => r.type === type && r.region);
  const byRegion = {};
  rows.forEach((r) => {
    const key = r.region || 'Autre';
    if (!byRegion[key]) byRegion[key] = { sum: 0, count: 0 };
    byRegion[key].sum += r.rating;
    byRegion[key].count += 1;
  });
  return Object.entries(byRegion).map(([region, s]) => ({
    region,
    count: s.count,
    average: Number((s.sum / s.count).toFixed(1)),
  }));
};

const deleteServiceRating = (id, user) => {
  const existing = store.serviceRatings.find((r) => r._id === id || r.id === id);
  if (!existing) return null;
  if (user.role !== 'admin' && existing.userId._id !== user._id) return null;
  store.serviceRatings = store.serviceRatings.filter((r) => r._id !== id && r.id !== id);
  return clone(existing);
};

const getComplaints = (user) => {
  if (!user) return clone(store.complaints);
  if (user.role === 'admin') return clone(store.complaints);
  return clone(store.complaints.filter((complaint) => {
    const uid = complaint.userId?._id || complaint.userId?.id || complaint.userId;
    const userUid = user._id || user.id;
    return uid === userUid;
  }));
};

const createComplaint = (user, payload) => {
  const complaint = {
    _id: createId('cmp'),
    userId: { _id: user._id, email: user.email, name: user.name, role: user.role },
    subject: payload.subject,
    message: payload.message || payload.description || '',
    orderId: payload.orderId || '',
    status: 'pending',
    response: '',
    createdAt: now(),
  };
  store.complaints.unshift(complaint);
  return clone(complaint);
};

const updateComplaint = (id, payload) => {
  const index = store.complaints.findIndex(
    (complaint) => complaint._id === id || complaint.id === id
  );
  if (index === -1) return null;
  store.complaints[index] = {
    ...store.complaints[index],
    ...payload,
    response: payload.response ?? store.complaints[index].response,
    status: payload.status ?? store.complaints[index].status,
  };
  return clone(store.complaints[index]);
};

const processComplaintWithAi = (id) => {
  const index = store.complaints.findIndex(
    (c) => c._id === id || c.id === id
  );
  if (index === -1) return { error: 'not found' };
  const c = store.complaints[index];
  const proposed = `Bonjour ${c.userId?.name || 'Client'}, nous avons analysé votre demande « ${c.subject} ». Notre équipe valide cette réponse avant envoi officiel. Délai habituel : 48 h.`;
  store.complaints[index] = {
    ...c,
    status: 'ai_proposed',
    aiCategory: 'other',
    aiPriority: 'medium',
    aiProposedResponse: proposed,
    aiResolutionPlan: JSON.stringify({ steps: ['Vérifier commande', 'Validation admin'] }),
    aiConfidence: 0.72,
    aiProcessedAt: now(),
    response: proposed,
    adminValidated: false,
  };
  return { complaint: clone(store.complaints[index]), analysis: { status: 'ai_proposed' } };
};

const processAllPendingIncidentsAi = (limit = 20) => {
  const pending = store.complaints.filter((c) =>
    ['pending', 'in_progress'].includes(c.status)
  );
  const results = pending.slice(0, limit).map((c) => {
    const r = processComplaintWithAi(c._id || c.id);
    return { id: c._id, ok: !r.error, ...r.analysis };
  });
  return { processed: results.length, results };
};

const getIncidentValidationQueue = () => {
  const queue = store.complaints.filter(
    (c) => c.status === 'ai_proposed' && !c.adminValidated
  );
  return { role: 'admin', agent: 'incident_ml_agent', queue: clone(queue), stats: { awaitingValidation: queue.length } };
};

const getIncidentAgentPack = () => {
  const queue = store.complaints.filter((c) => c.status === 'ai_proposed');
  return {
    ...getIncidentValidationQueue(),
    summary: `${queue.length} proposition(s) IA à valider.`,
    platformStats: {
      awaitingValidation: queue.length,
      pendingForAgent: store.complaints.filter((c) => c.status === 'pending').length,
      validatedLast24h: 0,
    },
  };
};

const validateIncidentAi = (id, adminId, { approved, response, rejectReason }) => {
  const index = store.complaints.findIndex((c) => c._id === id || c.id === id);
  if (index === -1) return null;
  if (approved) {
    store.complaints[index] = {
      ...store.complaints[index],
      status: 'resolved',
      response: response || store.complaints[index].aiProposedResponse,
      adminValidated: true,
      validatedBy: adminId,
      validatedAt: now(),
    };
  } else {
    store.complaints[index] = {
      ...store.complaints[index],
      status: 'in_progress',
      adminValidated: false,
      response: rejectReason ? `[IA rejetée] ${rejectReason}` : store.complaints[index].response,
    };
  }
  return clone(store.complaints[index]);
};

const deleteComplaint = (id) => {
  const existing = store.complaints.find((complaint) => complaint._id === id);
  store.complaints = store.complaints.filter((complaint) => complaint._id !== id);
  return clone(existing);
};

// Messages helpers
const getMessages = (user) => {
  if (!user) return clone(store.messages);
  const uid = user.id || user._id;
  return clone(
    store.messages.filter((msg) => {
      const senderId = msg.senderId || msg.sender?.userId || msg.sender?.id;
      const receiverId = msg.receiverId || msg.receiver?.userId || msg.receiver?.id;
      return senderId === uid || receiverId === uid;
    })
  );
};

const createMessage = (user, payload) => {
  const senderId = user.id || user._id;
  const receiverId = payload.receiverId === 'admin' ? 'demo_admin' : (payload.receiverId || 'demo_admin');
  const message = {
    _id: createId('msg'),
    id: undefined,
    senderId,
    receiverId,
    senderType: user.role,
    receiverType: payload.receiverType || (receiverId === 'demo_admin' ? 'admin' : 'client'),
    sender: { type: user.role, role: user.role, userId: senderId, id: senderId, name: user.name },
    receiver: { type: payload.receiverType || 'admin', role: payload.receiverType || 'admin', userId: receiverId, id: receiverId, name: payload.receiverName || 'Administration' },
    message: payload.message.trim(),
    createdAt: now(),
    isRead: false,
  };
  message.id = message._id;
  store.messages.push(message);
  return clone(message);
};

// Veterinary contact requests (in-memory)
let veterinaryContactRequests = [];

const getVeterinaryContactRequests = (ownerId, isAdmin) => {
  const list = veterinaryContactRequests.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (isAdmin) return clone(list);
  return clone(list.filter(r => r.ownerId === ownerId));
};

const createVeterinaryContactRequest = (user, payload) => {
  if (!payload?.subject) throw new Error('Sujet requis');
  if (!payload?.message) throw new Error('Message requis');

  const ownerId = user?.id || user?._id;

  const reqItem = {
    _id: createId('vetreq'),
    ownerId,
    animalType: payload.animalType || 'other',
    petName: payload.petName || '',
    subject: payload.subject,
    message: payload.message,
    preferredDate: payload.preferredDate || '',
    visitMode: ['home', 'online'].includes(payload.visitMode) ? payload.visitMode : 'cabinet',
    homeAddress: payload.visitMode === 'home' ? (payload.homeAddress || '') : null,
    status: payload.status || 'pending',
    createdAt: now(),
  };

  veterinaryContactRequests.unshift(reqItem);
  return clone(reqItem);
};

const updateVeterinaryContactRequest = (id, payload) => {
  const index = veterinaryContactRequests.findIndex((req) => req._id === id || req.id === id);
  if (index === -1) {
    throw new Error('Demande introuvable');
  }
  veterinaryContactRequests[index] = {
    ...veterinaryContactRequests[index],
    ...payload,
    updatedAt: now(),
  };
  return clone(veterinaryContactRequests[index]);
};

// Demo appointments data
let demoAppointments = [];
const createPetAppointments = ({ ownerId, count = 10 } = {}) => {
  if (!ownerId) return [];
  
  const petNames = ['Fluffy', 'Max', 'Bella', 'Charlie', 'Luna', 'Buddy', 'Daisy', 'Rocky', 'Milo', 'Coco'];
  const animalTypes = ['cat', 'dog', 'rabbit', 'hamster', 'bird', 'fish'];
  const appointmentTypes = [
    'veterinary_consultation',
    'vaccination',
    'checkup',
    'dental_cleaning',
    'surgery_followup',
    'grooming',
  ];
  
  const randomCode = (length) =>
    Array.from({ length }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');

  const buildMeetingLink = (status) =>
    status === 'confirmed' ? `https://meet.google.com/${randomCode(3)}-${randomCode(4)}-${randomCode(3)}` : null;
  
  const appointments = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + (i % 30));
    date.setHours(9 + (i % 8), 0, 0, 0);
    const status = i % 3 === 0 ? 'confirmed' : i % 3 === 1 ? 'scheduled' : 'completed';
    
    appointments.push({
      _id: createId(`appt_${ownerId}`),
      id: createId(`appt_${ownerId}`),
      ownerId,
      petName: petNames[i % petNames.length],
      animalType: animalTypes[i % animalTypes.length],
      type: appointmentTypes[i % appointmentTypes.length],
      category: 'vet',
      date: date.toISOString(),
      status,
      notes: `Appointment ${i + 1}`,
      meetingLink: buildMeetingLink(status),
      reminderSent: i % 2 === 0,
      createdAt: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  
  return appointments;
};

const createPlatformEvents = ({ ownerId, count = 12 } = {}) => {
  if (!ownerId) return [];

  const adoptionPrizes = stringifyEventPrizes([
    { id: 'p1', rank: 1, type: 'free_animal', label: 'Adoption gratuite (chiot ou chaton)', description: 'Frais refuge offerts — vaccins inclus' },
    { id: 'p2', rank: 2, type: 'adoption_voucher', label: 'Bon adoption -50 %', description: 'Valable chez les refuges partenaires' },
    { id: 'p3', rank: 3, type: 'product_pack', label: 'Kit bienvenue 6 mois', description: 'Croquettes + accessoires' },
  ]);

  const agilityPrizes = stringifyEventPrizes(DEFAULT_COMPETITION_PRIZES);

  const samples = [
    {
      id: 'event_comp_grand_prix',
      type: 'concours',
      title: 'Grand Prix PetfoodTN — Agility',
      petName: 'Open',
      animalType: 'dog',
      notes: 'Parcours chronométré. Inscription avec le nom de votre chien. Lots : adoption gratuite, packs croquettes, bons d\'achat.',
      eventVenue: 'Parc Berge Lac, Tunis',
      eventCapacity: 40,
      eventPrizes: agilityPrizes,
      competitionStatus: 'open',
    },
    {
      id: 'event_comp_beaute',
      type: 'competitions',
      title: 'Concours beauté canin & félin',
      petName: 'Open',
      animalType: 'dog',
      notes: 'Catégories junior, senior et races tunisiennes (Sloughi).',
      eventVenue: 'Maison de la Culture, Tunis',
      eventCapacity: 50,
      eventPrizes: agilityPrizes,
      competitionStatus: 'open',
    },
    {
      id: 'event_adoption_nabeul',
      type: 'journee_adoption',
      title: 'Journée adoption — chiots & chatons gratuits',
      petName: 'Tous',
      animalType: 'other',
      notes: 'Tirage au sort : 3 adoptions entièrement offertes + kits de démarrage PetfoodTN.',
      eventVenue: 'Refuge Amis des Pattes, Nabeul',
      eventCapacity: 80,
      eventPrizes: adoptionPrizes,
      competitionStatus: 'open',
    },
    { type: 'exposition', title: 'Exposition chats & chiens', petName: 'Luna', animalType: 'dog', notes: 'Stand PetfoodTN + juges internationaux.', eventVenue: 'Cité des Sciences', eventCapacity: 120, eventPrizes: agilityPrizes, competitionStatus: 'open' },
    { type: 'cadeau', title: 'Tombola fidélité — animal à gagner', petName: 'Tous', animalType: 'other', notes: '1 lapin nain + 5 bons d\'achat à gagner pour les clients inscrits.', eventVenue: 'En ligne', eventCapacity: 200, eventPrizes: adoptionPrizes, competitionStatus: 'open' },
    { type: 'anniversaire', title: 'Anniversaire de Mimi', petName: 'Mimi', animalType: 'cat', notes: 'Gâteau et animations pour chats.' },
    { type: 'coiffure', title: 'Toilettage express', petName: 'Oscar', animalType: 'cat', notes: 'Bain + brushing, créneaux 14h-18h.' },
    { type: 'autre', title: 'Atelier nutrition', petName: 'Buddy', animalType: 'dog', notes: 'Conseils NutriPro avec un expert.' },
  ];

  const events = [];
  const now = new Date();

  for (let i = 0; i < count; i += 1) {
    const sample = samples[i % samples.length];
    const date = new Date(now);
    date.setDate(date.getDate() + (i % 21) + 1);
    date.setHours(10 + (i % 7), (i % 2) * 30, 0, 0);
    const eventId = sample.id || createId(`event_${ownerId}`);

    events.push({
      _id: eventId,
      id: eventId,
      ownerId,
      petName: sample.petName,
      title: sample.title,
      animalType: sample.animalType,
      type: sample.type,
      category: 'event',
      isPublic: true,
      date: date.toISOString(),
      status: i % 4 === 0 ? 'confirmed' : 'scheduled',
      notes: sample.notes,
      eventVenue: sample.eventVenue || null,
      eventCapacity: sample.eventCapacity ?? null,
      eventPrizes: sample.eventPrizes || null,
      competitionStatus: sample.competitionStatus || 'open',
      registrationsCount: (store.eventRegistrations || []).filter((r) => r.eventId === eventId).length || (i % 7),
      meetingLink: i % 5 === 0 ? `https://meet.google.com/demo-${i}` : null,
      reminderSent: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  return events;
};

const registerDemoEvent = ({ eventId, userId, petName }) => {
  const existing = (store.eventRegistrations || []).find(
    (r) => r.eventId === eventId && r.userId === userId,
  );
  if (existing) return { error: 'Déjà inscrit à cet événement', existing: clone(existing) };

  const entryNumber = `PF-${String((store.eventRegistrations?.length || 0) + 1).padStart(3, '0')}`;
  const reg = {
    id: createId('reg'),
    eventId,
    userId,
    petName: petName || null,
    status: 'registered',
    entryNumber,
    prizeLabel: null,
    prizeType: null,
    wonAt: null,
    createdAt: now(),
  };
  store.eventRegistrations = store.eventRegistrations || [];
  store.eventRegistrations.push(reg);
  return { registration: clone(reg) };
};

const getDemoEventRegistrationsForUser = (userId) =>
  clone((store.eventRegistrations || []).filter((r) => r.userId === userId));

const getDemoEventRegistration = (eventId, userId) => {
  const row = (store.eventRegistrations || []).find(
    (r) => r.eventId === eventId && r.userId === userId,
  );
  return row ? clone(row) : null;
};

const getBlogArticles = ({ publishedOnly = false } = {}) => {
  const list = clone(store.blogArticles || []);
  if (publishedOnly) return list.filter((a) => a.isPublished !== false);
  return list;
};

const createBlogArticle = (payload, authorId) => {
  const publishedAt = payload.publishedAt ? new Date(payload.publishedAt) : new Date();
  const article = {
    _id: createId('blog'),
    title: String(payload.title || '').trim(),
    category: String(payload.category || 'Guide').trim(),
    excerpt: String(payload.excerpt || '').trim(),
    body: String(payload.body || '').trim(),
    readMin: Math.max(1, Math.min(60, Number(payload.readMin) || 5)),
    isPublished: payload.isPublished !== false,
    publishedAt: publishedAt.toISOString(),
    date: publishedAt.toISOString(),
    authorId: authorId || null,
    createdAt: now(),
    updatedAt: now(),
  };
  article.id = article._id;
  store.blogArticles.unshift(article);
  return clone(article);
};

const updateBlogArticle = (id, payload) => {
  const idx = store.blogArticles.findIndex((a) => a._id === id || a.id === id);
  if (idx < 0) return null;
  const current = store.blogArticles[idx];
  const next = {
    ...current,
    ...payload,
    title: payload.title !== undefined ? String(payload.title).trim() : current.title,
    category: payload.category !== undefined ? String(payload.category).trim() : current.category,
    excerpt: payload.excerpt !== undefined ? String(payload.excerpt).trim() : current.excerpt,
    body: payload.body !== undefined ? String(payload.body).trim() : current.body,
    readMin: payload.readMin !== undefined ? Math.max(1, Math.min(60, Number(payload.readMin) || 5)) : current.readMin,
    isPublished: payload.isPublished !== undefined ? Boolean(payload.isPublished) : current.isPublished,
    updatedAt: now(),
  };
  if (payload.publishedAt) {
    next.publishedAt = new Date(payload.publishedAt).toISOString();
    next.date = next.publishedAt;
  }
  store.blogArticles[idx] = next;
  return clone(next);
};

const deleteBlogArticle = (id) => {
  const before = store.blogArticles.length;
  store.blogArticles = store.blogArticles.filter((a) => a._id !== id && a.id !== id);
  return store.blogArticles.length < before;
};

const getFoundMeReports = () => clone(store.foundMeReports || []);

const getFoundMeReportById = (id) => {
  const row = (store.foundMeReports || []).find((r) => r.id === id);
  return row ? clone(row) : null;
};

const getFoundMeReportByTag = (tagCode) => {
  const code = String(tagCode || '').trim().toUpperCase();
  const row = (store.foundMeReports || []).find((r) => r.tagCode === code);
  return row ? clone(row) : null;
};

const createFoundMeReport = (payload) => {
  const report = {
    id: createId('fm'),
    ...payload,
    tagCode: payload.tagCode || `FM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: payload.status || 'active',
    createdAt: now(),
    updatedAt: now(),
  };
  store.foundMeReports.unshift(report);
  return clone(report);
};

const updateFoundMeReport = (id, patch) => {
  const idx = (store.foundMeReports || []).findIndex((r) => r.id === id);
  if (idx < 0) return null;
  store.foundMeReports[idx] = { ...store.foundMeReports[idx], ...patch, updatedAt: now() };
  return clone(store.foundMeReports[idx]);
};

module.exports = {
  getUserById,
  getUsers,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder,
  cancelOrder,
  livreurCancelOrder,
  getInvoices,
  payInvoice,
  getReviews,
  createReview,
  updateReview,
  deleteReview,
  getServiceRatings,
  getEligibleServiceRatings,
  createServiceRating,
  getServiceRatingStats,
  deleteServiceRating,
  getOwnerEmotionDashboard,
  getComplaints,
  createComplaint,
  updateComplaint,
  deleteComplaint,
  processComplaintWithAi,
  processAllPendingIncidentsAi,
  getIncidentValidationQueue,
  getIncidentAgentPack,
  validateIncidentAi,
  getMessages,
  createMessage,
  getVeterinaryContactRequests,
  createVeterinaryContactRequest,
  updateVeterinaryContactRequest,
  createPetAppointments,
  createPlatformEvents,
  registerDemoEvent,
  getDemoEventRegistrationsForUser,
  getDemoEventRegistration,
  getBlogArticles,
  createBlogArticle,
  updateBlogArticle,
  deleteBlogArticle,
  getFoundMeReports,
  getFoundMeReportById,
  getFoundMeReportByTag,
  createFoundMeReport,
  updateFoundMeReport,
};


const clone = (value) => JSON.parse(JSON.stringify(value));
const createId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const now = () => new Date().toISOString();

// Demo products available
const demoProducts = [
  {
    _id: 'prd_dog_1',
    name: 'Croquettes Premium Chien',
    price: 58,
    discount: 15,
    imageUrl: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=900&q=80',
  },
  {
    _id: 'prd_cat_1',
    name: 'Patee Equilibre Chat',
    price: 24,
    discount: 10,
    imageUrl: 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=900&q=80',
  },
  {
    _id: 'prd_bird_1',
    name: 'Melange Vitalite Oiseaux',
    price: 19,
    discount: 5,
    imageUrl: 'https://images.unsplash.com/photo-1444464666168-49d633b86797?auto=format&fit=crop&w=900&q=80',
  },
  {
    _id: 'prd_fish_1',
    name: 'Granules Aquarium Pro',
    price: 16,
    discount: 0,
    imageUrl: 'https://images.unsplash.com/photo-1520301255226-bf5f144451c1?auto=format&fit=crop&w=900&q=80',
  },
  {
    _id: 'prd_dog_2',
    name: 'Snack Dentaire Naturel',
    price: 14,
    discount: 20,
    imageUrl: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=80',
  },
  {
    _id: 'prd_cat_2',
    name: 'Litiere Confort Chat',
    price: 27,
    discount: 12,
    imageUrl: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=900&q=80',
  },
  {
    _id: 'prd_dog_3',
    name: 'Patee Boite Chien Adulte',
    price: 9.5,
    discount: 0,
    imageUrl: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=900&q=80',
  },
  {
    _id: 'prd_cat_3',
    name: 'Croquettes Sans Cereales Chat',
    price: 42,
    discount: 8,
    imageUrl: 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?auto=format&fit=crop&w=900&q=80',
  },
];

// Demo client user
const demoClient = {
  _id: 'demo_client',
  email: 'client@petfood.tn',
  name: 'Client Test',
  role: 'client',
  phone: '+216 20 000 000',
  address: 'Ariana, Tunis',
};

// Realistic Tunis addresses with GPS coordinates
const tunisAddresses = [
  { address: '15 Rue de Marseille, Tunis 1000', phone: '+216 29 123 456', lat: 36.8065, lng: 10.1815 },
  { address: '32 Avenue Habib Bourguiba, Tunis 1000', phone: '+216 25 987 654', lat: 36.7990, lng: 10.1850 },
  { address: '7 Rue de Syrie, Tunis 1000', phone: '+216 52 345 678', lat: 36.8085, lng: 10.1785 },
  { address: '45 Avenue Mohamed V, Tunis 1002', phone: '+216 24 111 222', lat: 36.8105, lng: 10.1900 },
  { address: '12 Rue Lac Leman, Les Berges du Lac, Tunis', phone: '+216 55 444 333', lat: 36.8380, lng: 10.2750 },
  { address: '88 Rue du Lac Victoria, Tunis 1053', phone: '+216 22 555 777', lat: 36.8400, lng: 10.2800 },
  { address: '3 Rue de Carthage, La Marsa', phone: '+216 98 666 888', lat: 36.8760, lng: 10.3250 },
  { address: '21 Avenue de l\'Environnement, La Marsa', phone: '+216 20 999 111', lat: 36.8810, lng: 10.3300 },
  { address: '56 Rue de Kairouan, Ariana 2080', phone: '+216 27 222 333', lat: 36.8580, lng: 10.1850 },
  { address: '9 Avenue Ouled Haffouz, Ariana', phone: '+216 50 777 888', lat: 36.8650, lng: 10.1950 },
  { address: '4 Rue du 18 Janvier, Manouba 2010', phone: '+216 53 444 555', lat: 36.8080, lng: 10.0950 },
  { address: '17 Avenue de la Republique, Manouba', phone: '+216 28 999 000', lat: 36.8120, lng: 10.1000 },
  { address: '41 Rue Ibn Sina, Sidi Bou Said', phone: '+216 23 111 444', lat: 36.8700, lng: 10.3450 },
  { address: '6 Rue de la Medina, Sidi Bou Said', phone: '+216 54 888 999', lat: 36.8750, lng: 10.3500 },
  { address: '29 Avenue de Paris, Le Kram', phone: '+216 26 333 666', lat: 36.8450, lng: 10.3100 },
  { address: '14 Rue de Russie, Le Kram', phone: '+216 51 222 444', lat: 36.8500, lng: 10.3150 },
  { address: '38 Avenue Hedi Chaker, Carthage', phone: '+216 25 777 111', lat: 36.8580, lng: 10.3250 },
  { address: '2 Rue de Grece, Carthage', phone: '+216 20 444 888', lat: 36.8620, lng: 10.3300 },
  { address: '67 Rue du Maroc, Tunis 1002', phone: '+216 29 666 222', lat: 36.8050, lng: 10.1750 },
  { address: '11 Avenue de la Liberte, Tunis 1000', phone: '+216 55 999 333', lat: 36.8000, lng: 10.1800 },
];

const paymentMethods = ['cash', 'card', 'stripe', 'paypal', 'check', 'transfer', 'pro_card'];
const statuses = ['pending', 'shipped', 'delivered', 'cancelled', 'paid'];
const statusWeights = [0.35, 0.25, 0.25, 0.05, 0.10]; // 35% pending, 25% shipped, etc.

const { resolveRegionFromAddress } = require('./regions');

function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    if (random < weights[i]) return items[i];
    random -= weights[i];
  }
  return items[0];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBack = 30) {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(0, daysBack));
  date.setHours(randomInt(8, 20), randomInt(0, 59), randomInt(0, 59));
  return date.toISOString();
}

function generateOrderItems() {
  const numItems = randomInt(1, 4);
  const items = [];
  const usedIndices = new Set();

  for (let i = 0; i < numItems; i++) {
    let idx;
    do {
      idx = randomInt(0, demoProducts.length - 1);
    } while (usedIndices.has(idx));
    usedIndices.add(idx);

    const product = demoProducts[idx];
    const quantity = randomInt(1, 3);
    const finalPrice = Number((product.price * (1 - product.discount / 100)).toFixed(2));

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

  return items;
}

function generateOrders(count = 25) {
  const orders = [];

  for (let i = 0; i < count; i++) {
    const items = generateOrderItems();
    const total = Number(items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
    const addrInfo = tunisAddresses[i % tunisAddresses.length];
    const status = weightedRandom(statuses, statusWeights);
    const createdAt = randomDate(14); // Within last 14 days for recent data

    orders.push({
      _id: createId('ord'),
      userId: clone(demoClient),
      items,
      total,
      status,
      paymentMethod: paymentMethods[randomInt(0, paymentMethods.length - 1)],
      address: addrInfo.address,
      phone: addrInfo.phone,
      region: resolveRegionFromAddress(addrInfo.address),
      deliveryLocation: {
        lat: addrInfo.lat + (Math.random() - 0.5) * 0.005,
        lng: addrInfo.lng + (Math.random() - 0.5) * 0.005,
      },
      createdAt,
      updatedAt: createdAt,
    });
  }

  // Sort by date descending
  return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function generateMessages() {
  return [
    {
      _id: createId('msg'),
      sender: { type: 'admin', userId: 'demo_admin' },
      receiver: { type: 'livreur', userId: 'demo_livreur' },
      message: 'Bonjour, la livraison pour la Marsa est prioritaire aujourd\'hui.',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      isRead: true,
    },
    {
      _id: createId('msg'),
      sender: { type: 'livreur', userId: 'demo_livreur' },
      receiver: { type: 'admin', userId: 'demo_admin' },
      message: 'D\'accord, je commence par La Marsa. J\'ai 3 colis pour cette zone.',
      createdAt: new Date(Date.now() - 86400000 * 2 + 3600000).toISOString(),
      isRead: true,
    },
    {
      _id: createId('msg'),
      sender: { type: 'admin', userId: 'demo_admin' },
      receiver: { type: 'livreur', userId: 'demo_livreur' },
      message: 'Parfait. N\'oublie pas de scanner le QR code a la livraison.',
      createdAt: new Date(Date.now() - 86400000 * 2 + 7200000).toISOString(),
      isRead: true,
    },
    {
      _id: createId('msg'),
      sender: { type: 'livreur', userId: 'demo_livreur' },
      receiver: { type: 'admin', userId: 'demo_admin' },
      message: 'Client de Sidi Bou Said absent, j\'ai laisse le colis chez le voisin.',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      isRead: true,
    },
    {
      _id: createId('msg'),
      sender: { type: 'admin', userId: 'demo_admin' },
      receiver: { type: 'livreur', userId: 'demo_livreur' },
      message: 'Merci pour l\'info. Je vais notifier le client.',
      createdAt: new Date(Date.now() - 86400000 + 1800000).toISOString(),
      isRead: true,
    },
    {
      _id: createId('msg'),
      sender: { type: 'livreur', userId: 'demo_livreur' },
      receiver: { type: 'admin', userId: 'demo_admin' },
      message: 'J\'ai termine toutes les livraisons d\'aujourd\'hui. 8 colis livres!',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      isRead: false,
    },
    {
      _id: createId('msg'),
      sender: { type: 'admin', userId: 'demo_admin' },
      receiver: { type: 'livreur', userId: 'demo_livreur' },
      message: 'Excellent travail! Prepare les commandes de demain.',
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      isRead: false,
    },
  ];
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const animalTypes = ['dog', 'cat', 'bird', 'fish', 'rabbit', 'other'];

const veterinarySubjects = [
  'Contrôle digestion & selles',
  'Changement de croquettes',
  'Perte d’appétit',
  'Démangeaisons & peau sensible',
  'Manque d’énergie',
  'Problèmes urinaires',
  'Vomissements récents',
  'Ballonnements après repas',
  'Suivi vaccination / vermifuge',
  'Examen léger avant transition alimentaire',
];

const veterinaryDiagnoses = [
  'Gastro-entérite légère',
  'Intolérance à la transition',
  'Inflammation digestive modérée',
  'Troubles cutanés (allergie suspectée)',
  'Hydratation insuffisante',
  'Parasites digestifs suspectés',
  'Stress alimentaire (changement récent)',
  'Début de convalescence',
  'Baisse d’appétit (suspect digestif)',
  'Recommandation alimentation plus digeste',
];

const veterinaryTreatments = [
  'Hydratation + diète 24-48h, puis transition progressive.',
  'Retour à l’aliment stable + transition plus lente.',
  'Régime digestif + suivi des selles 5-7 jours.',
  'Compléments (probiotiques) + surveillance appétit.',
  'Plan de vermifugation + check selles.',
  'Adaptation dose et fractionnement repas.',
  'Routine peau: shampoing doux + suivi démangeaisons.',
  'Contrôle hydratation et activité, puis ajustement croquettes.',
  'Recommandation examens si symptômes persistent > 48h.',
];

const vetNotePhrases = [
  'Surveiller l’appétit et l’hydratation.',
  'Revoir si symptômes persistent > 48h.',
  'Noter fréquence/texture des selles.',
  'Vérifier zones sensibles et douleur à la palpation.',
  'Adapter l’alimentation en diminuant la fraction au repas suivant.',
];

const petNamePool = [
  'Rex', 'Mimi', 'Luna', 'Nina', 'Oscar', 'Bella', 'Sultan', 'Léo', 'Charly', 'Kira',
  'Moka', 'Atlas', 'Noa', 'Lola', 'Sam', 'Zara', 'Toby', 'Yuki', 'Milo', 'Pumba',
];

const createVeterinaryContactRequests = ({ ownerId, count }) => {
  const reqs = [];

  for (let i = 0; i < count; i++) {
    const animalType = randomFrom(animalTypes);
    const petName = randomFrom(petNamePool);
    const subject = randomFrom(veterinarySubjects);

    const message = [
      `Bonjour, je viens pour ${subject.toLowerCase()}.`,
      `Mon animal est ${animalType === 'other' ? 'général' : animalType}.`,
      `Depuis ${randomInt(1, 6)} jours, on observe une évolution avec quelques épisodes.`,
      randomFrom(vetNotePhrases),
      'Nous souhaitons un avis pour adapter l’alimentation et le suivi.',
    ].join(' ');

    reqs.push({
      ownerId,
      animalType,
      petName,
      subject,
      message,
      preferredDate: new Date(Date.now() + randomInt(0, 14) * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      createdAt: new Date(Date.now() - randomInt(0, 21) * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  return reqs;
};

const createVeterinaryRecords = ({ ownerId, count }) => {
  const records = [];

  for (let i = 0; i < count; i++) {
    const animalType = randomFrom(animalTypes);
    const petName = randomFrom(petNamePool);
    const diagnosis = randomFrom(veterinaryDiagnoses);
    const treatment = randomFrom(veterinaryTreatments);

    const weight = animalType === 'dog' ? Number((randomInt(8, 28) + Math.random()).toFixed(1)) :
      animalType === 'cat' ? Number((randomInt(2, 7) + Math.random()).toFixed(1)) :
      animalType === 'rabbit' ? Number((randomInt(1, 4) + Math.random()).toFixed(1)) :
      animalType === 'bird' ? Number((randomInt(0, 1) + Math.random() * 0.4).toFixed(2)) :
      animalType === 'fish' ? Number((randomInt(0, 2) + Math.random()).toFixed(1)) :
      Number((randomInt(2, 20) + Math.random()).toFixed(1));

    const temperature = Number((randomInt(37, 40) + Math.random()).toFixed(1));

    const nextVisit = Math.random() < 0.8
      ? new Date(Date.now() + randomInt(3, 30) * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const medications = JSON.stringify([
      {
        name: randomFrom(['Probiotiques', 'Support digestion', 'Complément fibres', 'Ajustement dose', 'Solution hydratation']),
        dosage: randomFrom(['1 gélule', '1 dose', '1 seringue', '2 ml', '1 comprimé']),
        frequency: randomFrom(['1x/j', '2x/j', '1 jour sur 2', '3x/j']),
        duration: randomFrom(['7 jours', '10 jours', '14 jours', '21 jours']),
        quantity: randomInt(7, 28),
      },
    ]);

    records.push({
      ownerId,
      petName,
      animalType,
      visitDate: new Date(Date.now() - randomInt(0, 90) * 24 * 60 * 60 * 1000).toISOString(),
      diagnosis,
      treatment,
      vetNotes: `${randomFrom(vetNotePhrases)} ${Math.random() < 0.5 ? 'Objectif: observation des selles et de l’énergie.' : 'Prévoir contrôle si aggravation.'}`,
      nextVisit: nextVisit ? nextVisit : undefined,
      weight,
      temperature,
      medications,
      status: randomFrom(['active', 'active', 'completed']),
    });
  }

  // tri par date desc (comme la plupart des écrans)
  return records.sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate));
};

const vaccineTypesByAnimal = {
  dog: ['Rage', 'Parvovirose', 'Hépatite', 'Leptospirose', 'Toux du chenil'],
  cat: ['Rage', 'Coryza', 'Leucose', 'Chlamydiose', 'Typhus'],
  bird: ['Paramyxovirose', 'Polyomavirus', 'Salmonellose'],
  rabbit: ['Myxomatose', 'VHD', 'Pasteurellose'],
  fish: ['Vaccin préventif aquarium'],
  other: ['Rage', 'Contrôle annuel'],
};

const createPetVaccines = ({ ownerId, count }) => {
  const vaccines = [];

  for (let i = 0; i < count; i++) {
    const animalType = randomFrom(animalTypes);
    const petName = randomFrom(petNamePool);
    const options = vaccineTypesByAnimal[animalType] || vaccineTypesByAnimal.other;
    const vaccineType = randomFrom(options);
    const daysAgo = randomInt(30, 720);
    const dateAdministered = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const nextDue = new Date(dateAdministered);
    nextDue.setMonth(nextDue.getMonth() + randomFrom([6, 12, 12, 24]));
    const isOverdue = nextDue < new Date();

    vaccines.push({
      ownerId,
      petName,
      animalType,
      vaccineType,
      dateAdministered,
      expiryDate: new Date(dateAdministered.getTime() + 365 * 24 * 60 * 60 * 1000),
      nextDue,
      batchNumber: `B${randomInt(10000, 99999)}`,
      vetNotes: randomFrom(vetNotePhrases),
      status: isOverdue ? 'due_soon' : 'up_to_date',
    });
  }

  return vaccines.sort((a, b) => b.dateAdministered - a.dateAdministered);
};

const createPetAppointments = ({ ownerId, count }) => {
  const appts = [];
  const notes = [
    'Contrôle digestion + suivi alimentation.',
    'Transition croquettes + observation selles.',
    'Check hydratation, appétit et énergie.',
    'Suivi démangeaisons / peau sensible.',
    'Première consultation et plan de suivi.',
  ];

  for (let i = 0; i < count; i++) {
    const animalType = randomFrom(animalTypes);
    const petName = randomFrom(petNamePool);

    const type = 'veterinary_consultation';
    const isFuture = Math.random() < 0.55; // ~55% futurs
    const dayOffset = isFuture ? randomInt(0, 25) : -randomInt(1, 25);

    const hour = randomInt(9, 17);
    const minutes = randomInt(0, 59);

    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setHours(hour, minutes, 0, 0);

    appts.push({
      ownerId,
      petName,
      animalType,
      type,
      date: date.toISOString(),
      status: isFuture ? randomFrom(['scheduled', 'scheduled', 'confirmed']) : randomFrom(['confirmed', 'completed']),
      notes: randomFrom(notes),
      reminderSent: isFuture ? Math.random() < 0.45 : true,
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
    });
  }

  return appts;
};

module.exports = {
  generateOrders,
  generateMessages,
  demoProducts,
  demoClient,
  tunisAddresses,
  createVeterinaryContactRequests,
  createVeterinaryRecords,
  createPetAppointments,
  createPetVaccines,
};





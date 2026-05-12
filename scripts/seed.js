const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const Review = require('../models/Review');
const Complaint = require('../models/Complaint');
const Message = require('../models/Message');
const VeterinaryRecord = require('../models/VeterinaryRecord');

// 3 comptes demo (mêmes mots de passe que la page de login)
const DEMO_USERS = [
  {
    email: 'admin@petfood.tn',
    password: 'PetfoodTN2024!',
    name: 'El Jezi Ghassen',
    role: 'admin',
    phone: '+216 70 100 100',
    address: 'Lac 2, Tunis',
    petType: 'dog',
    petAge: 3,
    preferences: ['premium'],
    favoriteCategories: ['nourriture', 'snack'],
    pets: [{ name: 'Tweety', type: 'bird', breed: 'Perroquet', birthDate: new Date('2024-01-01'), weight: 0.035, notes: 'Oiseau actif' }],
  },
  {
    email: 'client@petfood.tn',
    password: 'MonChat123!',
    name: 'Client Test',
    role: 'client',
    phone: '+216 20 000 000',
    address: 'Ariana, Tunis',
    petType: 'cat',
    petAge: 2,
    preferences: ['bio'],
    favoriteCategories: ['nourriture', 'hygiène'],
    pets: [
      { name: 'Rex', type: 'dog', breed: 'Labrador', birthDate: new Date('2023-04-01'), weight: 28.5, notes: 'Chien sportif' },
      { name: 'Mimi', type: 'cat', breed: 'Persan', birthDate: new Date('2024-03-01'), weight: 4.2, notes: 'Chat calme' },
    ],
  },
  {
    email: 'livreur@petfood.tn',
    password: 'Livreur123!',
    name: 'Ahmed Ben Salah',
    role: 'livreur',
    phone: '+216 55 123 456',
    address: 'Centre-ville Tunis, Rue de Marseille',
    petType: 'dog',
    petAge: 4,
    preferences: ['sport'],
    favoriteCategories: [],
    pets: [{ name: 'Max', type: 'dog', breed: 'Berger Allemand', birthDate: new Date('2022-06-01'), weight: 35, notes: 'Chien de garde' }],
  },
];

const DEMO_PRODUCTS = [
  {
    name: 'Croquettes Premium Chien',
    price: 58, discount: 15, isOnSale: true,
    description: 'Recette riche en proteines pour chiens actifs et pelage brillant.',
    stock: 24, animalType: 'dog', category: 'nourriture',
    tags: ['premium', 'proteines'], popularity: 95, rating_avg: 4.7, rating_count: 42,
    icon: '🐶',
  },
  {
    name: 'Patee Equilibre Chat',
    price: 24, discount: 10, isOnSale: true,
    description: 'Texture fondante pour chats adultes, digestion legere et gout saumon.',
    stock: 31, animalType: 'cat', category: 'nourriture',
    tags: ['bio', 'saumon'], popularity: 88, rating_avg: 4.5, rating_count: 35,
    icon: '🐱',
  },
  {
    name: 'Melange Vitalite Oiseaux',
    price: 19, discount: 5, isOnSale: true,
    description: 'Melange de graines premium pour oiseaux domestiques.',
    stock: 18, animalType: 'bird', category: 'nourriture',
    tags: ['graines', 'vitamines'], popularity: 65, rating_avg: 4.3, rating_count: 18,
    icon: '🐦',
  },
  {
    name: 'Granules Aquarium Pro',
    price: 16, discount: 0, isOnSale: false,
    description: 'Granules digestes et faciles a doser pour poissons tropicaux.',
    stock: 42, animalType: 'fish', category: 'nourriture',
    tags: ['tropical', 'digestion'], popularity: 72, rating_avg: 4.4, rating_count: 22,
    icon: '🐠',
  },
  {
    name: 'Snack Dentaire Naturel',
    price: 14, discount: 20, isOnSale: true,
    description: 'Snacks a macher pour hygiene dentaire et haleine fraiche.',
    stock: 53, animalType: 'dog', category: 'snack',
    tags: ['dentaire', 'naturel'], popularity: 90, rating_avg: 4.8, rating_count: 56,
    icon: '🦴',
  },
  {
    name: 'Litiere Confort Chat',
    price: 27, discount: 12, isOnSale: true,
    description: 'Litiere absorbante sans poussiere pour usage quotidien.',
    stock: 27, animalType: 'cat', category: 'hygiène',
    tags: ['absorbant', 'sans-poussiere'], popularity: 85, rating_avg: 4.6, rating_count: 31,
    icon: '🐾',
  },
];

const TUNIS_ADDRESSES = [
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
];

const PAYMENT_METHODS = ['cash', 'card', 'check', 'transfer'];
const STATUSES = ['pending', 'shipped', 'delivered', 'cancelled', 'paid'];
const STATUS_WEIGHTS = [0.35, 0.25, 0.25, 0.05, 0.10];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pickWeighted(items, weights) {
  let r = Math.random();
  for (let i = 0; i < items.length; i++) {
    if (r < weights[i]) return items[i];
    r -= weights[i];
  }
  return items[0];
}
function randDate(daysBack = 14) {
  const d = new Date();
  d.setDate(d.getDate() - rand(0, daysBack));
  d.setHours(rand(8, 20), rand(0, 59), rand(0, 59));
  return d;
}

async function seed() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI manquant dans backend/.env');

  console.log('🌱 Connexion à MongoDB Atlas...');
  await mongoose.connect(uri);
  console.log('✅ Connecté');

  console.log('🧹 Nettoyage des collections...');
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    Invoice.deleteMany({}),
    Review.deleteMany({}),
    Complaint.deleteMany({}),
    Message.deleteMany({}),
    VeterinaryRecord.deleteMany({}),
  ]);

  console.log('👤 Création des 3 comptes...');
  const users = [];
  for (const u of DEMO_USERS) {
    const hash = await bcrypt.hash(u.password, 12);
    const doc = await User.create({ ...u, email: u.email.toLowerCase(), password: hash });
    users.push(doc);
    console.log(`   - ${doc.email} [${doc.role}]`);
  }
  const adminUser = users.find(u => u.role === 'admin');
  const clientUser = users.find(u => u.role === 'client');
  const livreurUser = users.find(u => u.role === 'livreur');

  console.log('📦 Création des produits...');
  const products = await Product.insertMany(DEMO_PRODUCTS);
  console.log(`   ${products.length} produits`);

  console.log('🛒 Création de 28 commandes + factures...');
  const orders = [];
  const invoices = [];
  for (let i = 0; i < 28; i++) {
    const numItems = rand(1, 4);
    const usedIdx = new Set();
    const items = [];
    for (let j = 0; j < numItems; j++) {
      let idx;
      do { idx = rand(0, products.length - 1); } while (usedIdx.has(idx));
      usedIdx.add(idx);
      const p = products[idx];
      const finalPrice = Number((p.price * (1 - (p.discount || 0) / 100)).toFixed(2));
      items.push({ productId: p._id, quantity: rand(1, 3), price: finalPrice });
    }
    const total = Number(items.reduce((s, it) => s + it.price * it.quantity, 0).toFixed(2));
    const addr = TUNIS_ADDRESSES[i % TUNIS_ADDRESSES.length];
    const status = pickWeighted(STATUSES, STATUS_WEIGHTS);
    const paymentMethod = PAYMENT_METHODS[rand(0, PAYMENT_METHODS.length - 1)];
    const createdAt = randDate(14);

    const order = await Order.create({
      userId: clientUser._id,
      items,
      total,
      status,
      paymentMethod,
      address: addr.address,
      phone: addr.phone,
      deliveryLocation: {
        lat: addr.lat + (Math.random() - 0.5) * 0.005,
        lng: addr.lng + (Math.random() - 0.5) * 0.005,
      },
      createdAt,
      updatedAt: createdAt,
    });
    orders.push(order);

    const invStatus = ['paid', 'delivered', 'shipped'].includes(status) ? 'paid' : 'unpaid';
    const invoice = await Invoice.create({
      userId: clientUser._id,
      orderId: order._id,
      amount: total,
      status: invStatus,
      paymentMethod,
      issuedAt: createdAt,
      paidAt: invStatus === 'paid' ? createdAt : undefined,
    });
    invoices.push(invoice);
  }
  console.log(`   ${orders.length} commandes, ${invoices.length} factures`);

  console.log('⭐ Reviews + Complaints...');
  await Review.create({
    userId: clientUser._id,
    productId: products[0]._id,
    rating: 5,
    comment: 'Produit tres apprecie par mon chien, livraison rapide et emballage propre.',
    emotion: 'happy',
  });
  await Review.create({
    userId: clientUser._id,
    productId: products[1]._id,
    rating: 4,
    comment: 'Bonne pâtée, mon chat apprécie. Un peu cher mais qualité au rendez-vous.',
    emotion: 'satisfied',
  });
  await Complaint.create({
    userId: clientUser._id,
    subject: 'Delai de livraison',
    message: 'Je souhaite un suivi plus detaille pour ma prochaine livraison.',
    orderId: orders[0]?._id?.toString() || '',
    status: 'pending',
  });

  console.log('🩺 Veterinary records...');
  await VeterinaryRecord.create([
    {
      petName: 'Rex', animalType: 'dog',
      ownerId: clientUser._id, ownerName: clientUser.name,
      visitDate: new Date('2026-04-20T10:00:00Z'),
      diagnosis: 'Vaccination annuelle', treatment: 'Vaccin DHLPP',
      vetNotes: 'Chien en bonne santé, prochain rappel dans 1 an',
      nextVisit: new Date('2027-04-20T10:00:00Z'),
      weight: 28.5, temperature: 38.5,
      medications: [{ name: 'Vaccin DHLPP', dosage: '1 dose', frequency: 'unique' }],
      status: 'active',
    },
    {
      petName: 'Mimi', animalType: 'cat',
      ownerId: clientUser._id, ownerName: clientUser.name,
      visitDate: new Date('2026-04-15T14:30:00Z'),
      diagnosis: 'Contrôle dentaire', treatment: 'Nettoyage dentaire',
      vetNotes: 'Légère plaque dentaire, recommandé brossage régulier',
      nextVisit: new Date('2026-10-15T14:30:00Z'),
      weight: 4.2, temperature: 38.2,
      medications: [{ name: 'Pâte dentifrice', dosage: 'petit pois', frequency: 'quotidien' }],
      status: 'active',
    },
    {
      petName: 'Tweety', animalType: 'bird',
      ownerId: adminUser._id, ownerName: adminUser.name,
      visitDate: new Date('2026-04-10T09:00:00Z'),
      diagnosis: 'Contrôle général', treatment: 'Suppléments vitamines',
      vetNotes: 'Oiseau actif, plumes en bon état',
      nextVisit: new Date('2026-07-10T09:00:00Z'),
      weight: 0.035, temperature: 41.0,
      medications: [{ name: 'Vitamines oiseaux', dosage: '2 gouttes', frequency: 'quotidien' }],
      status: 'active',
    },
  ]);

  console.log('💬 Messages livreur/admin...');
  const baseTime = Date.now();
  await Message.insertMany([
    {
      sender: { type: 'admin', userId: adminUser._id.toString() },
      receiver: { type: 'livreur', userId: livreurUser._id.toString() },
      message: 'Bonjour, la livraison pour la Marsa est prioritaire aujourd\'hui.',
      createdAt: new Date(baseTime - 86400000 * 2),
      isRead: true,
    },
    {
      sender: { type: 'livreur', userId: livreurUser._id.toString() },
      receiver: { type: 'admin', userId: adminUser._id.toString() },
      message: 'D\'accord, je commence par La Marsa. J\'ai 3 colis pour cette zone.',
      createdAt: new Date(baseTime - 86400000 * 2 + 3600000),
      isRead: true,
    },
    {
      sender: { type: 'livreur', userId: livreurUser._id.toString() },
      receiver: { type: 'admin', userId: adminUser._id.toString() },
      message: 'J\'ai termine toutes les livraisons d\'aujourd\'hui. 8 colis livres!',
      createdAt: new Date(baseTime - 3600000),
      isRead: false,
    },
  ]);

  console.log('\n✅ Seed terminé.');
  console.log(`   Users:    ${await User.countDocuments()}`);
  console.log(`   Products: ${await Product.countDocuments()}`);
  console.log(`   Orders:   ${await Order.countDocuments()}`);
  console.log(`   Invoices: ${await Invoice.countDocuments()}`);
  console.log(`   Reviews:  ${await Review.countDocuments()}`);
  console.log(`   Complaints: ${await Complaint.countDocuments()}`);
  console.log(`   Vet records: ${await VeterinaryRecord.countDocuments()}`);
  console.log(`   Messages: ${await Message.countDocuments()}`);

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});

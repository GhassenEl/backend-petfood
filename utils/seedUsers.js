const bcrypt = require('bcryptjs');
const { prisma } = require('../prismaClient');

const DEMO_ACCOUNTS = [
  { email: 'admin@petfood.tn', password: 'PetfoodTN2024!', name: 'El Jezi Ghassen', role: 'admin' },
  {
    email: 'client@petfood.tn',
    password: 'MonChat123!',
    name: 'Client Test',
    role: 'client',
    petType: 'cat',
    phone: '+216 20 000 000',
    address: 'Ariana, Tunis',
    region: 'Ariana',
  },
  {
    email: 'livreur@petfood.tn',
    password: 'Livreur123!',
    name: 'Livreur Test',
    role: 'livreur',
    region: 'Tunis',
    phone: '+216 50 111 222',
  },
  {
    email: 'vet@petfood.tn',
    password: 'Vet2024!',
    name: 'Dr. Salma Khelifi',
    role: 'vet',
    phone: '+216 22 111 222',
    address: 'Clinique PetfoodTN, Ariana',
    region: 'Ariana',
    location: { lat: 36.855, lng: 10.196 },
  },
  { email: 'amina@petfood.tn', password: 'Amina2024!', name: 'Amina Ben Ali', role: 'client', petType: 'dog' },
  { email: 'youssef@petfood.tn', password: 'Youssef2024!', name: 'Youssef Trabelsi', role: 'client', petType: 'cat' },
  {
    email: 'sami.livreur@petfood.tn',
    password: 'SamiLivreur2024!',
    name: 'Sami Livreur',
    role: 'livreur',
    region: 'Ariana',
    phone: '+216 50 333 444',
  },
];

const DEMO_PETS = [
  { ownerEmail: 'client@petfood.tn', name: 'Mimi', type: 'cat', breed: 'Européen', weight: 4.3 },
  { ownerEmail: 'client@petfood.tn', name: 'Rex', type: 'dog', breed: 'Berger', weight: 19.2 },
  { ownerEmail: 'amina@petfood.tn', name: 'Luna', type: 'dog', breed: 'Labrador', weight: 22 },
  { ownerEmail: 'youssef@petfood.tn', name: 'Oscar', type: 'cat', breed: 'Siamois', weight: 4.8 },
];

const ensureDemoUsers = async () => {
  let created = 0;
  for (const account of DEMO_ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    if (existing) continue;
    const hashedPassword = await bcrypt.hash(account.password, 12);
    await prisma.user.create({
      data: {
        email: account.email,
        password: hashedPassword,
        name: account.name,
        role: account.role,
        region: account.region || null,
        petType: account.petType || null,
        phone: account.phone || null,
        address: account.address || null,
        location: account.location || null,
        walletBalance: account.role === 'client' ? 50 : 0,
      },
    });
    created += 1;
  }
  if (created) console.log(`✅ ${created} compte(s) démo créé(s)`);
  return created;
};

const ensureDemoPets = async () => {
  let created = 0;
  for (const pet of DEMO_PETS) {
    const owner = await prisma.user.findUnique({ where: { email: pet.ownerEmail } });
    if (!owner) continue;
    const existing = await prisma.pet.findFirst({
      where: { ownerId: owner.id, name: pet.name },
    });
    if (existing) continue;
    await prisma.pet.create({
      data: {
        ownerId: owner.id,
        name: pet.name,
        type: pet.type,
        breed: pet.breed,
        birthDate: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000),
        weight: pet.weight ?? (pet.type === 'dog' ? 18.5 : 4.2),
      },
    });
    created += 1;
  }
  if (created) console.log(`✅ ${created} animal(aux) créé(s)`);
  return created;
};

module.exports = { DEMO_ACCOUNTS, DEMO_PETS, ensureDemoUsers, ensureDemoPets };

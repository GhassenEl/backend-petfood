const { prisma, isDemoMode } = require('../../prismaClient');

const uid = (u) => String(u?.id || u?._id);
const demoProviders = [];
const demoBookings = [];

const CARE_CATALOG = [
  { type: 'pet_sitting', label: 'Garde à domicile', icon: '🏠', hourlyRate: 28, unit: 'heure' },
  { type: 'dog_walking', label: 'Promenade certifiée', icon: '🦮', hourlyRate: 22, unit: 'heure' },
  { type: 'home_visit', label: 'Visite à domicile', icon: '🚪', hourlyRate: 35, unit: 'visite' },
];

const seedProviders = async () => {
  if (isDemoMode()) {
    if (!demoProviders.length) {
      demoProviders.push(
        { id: 'p1', displayName: 'Amira — Pet sitter', types: 'pet_sitting,home_visit', certified: true, hourlyRate: 28, region: 'Tunis', ratingAvg: 4.9 },
        { id: 'p2', displayName: 'Karim — Promeneur', types: 'dog_walking', certified: true, hourlyRate: 22, region: 'Ariana', ratingAvg: 4.8 }
      );
    }
    return;
  }
  if ((await prisma.petCareProvider.count()) > 0) return;
  const users = await prisma.user.findMany({ where: { role: { in: ['client', 'livreur'] } }, take: 2 });
  const specs = [
    { displayName: 'Amira — Pet sitter', types: 'pet_sitting,home_visit', certified: true },
    { displayName: 'Karim — Promeneur canin', types: 'dog_walking', certified: true },
  ];
  for (let i = 0; i < users.length && i < specs.length; i++) {
    await prisma.petCareProvider.create({
      data: { userId: users[i].id, ...specs[i], hourlyRate: 25 + i * 3, region: 'Grand Tunis' },
    });
  }
};

const listCatalog = () => ({ catalog: CARE_CATALOG });

const listProviders = async (type) => {
  await seedProviders();
  if (isDemoMode()) {
    let list = demoProviders;
    if (type) list = list.filter((p) => p.types.includes(type));
    return { providers: list };
  }
  const where = { isActive: true };
  if (type) where.types = { contains: type };
  const providers = await prisma.petCareProvider.findMany({ where, orderBy: { ratingAvg: 'desc' } });
  return { providers };
};

const bookCare = async (user, body) => {
  const clientId = uid(user);
  const { providerId, type, petName, animalType, startAt, endAt, address, notes } = body;
  const entry = CARE_CATALOG.find((c) => c.type === type);
  if (!entry) {
    const err = new Error('Type de service invalide');
    err.status = 400;
    throw err;
  }

  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : new Date(start.getTime() + 60 * 60 * 1000);
  const hours = Math.max(1, (end - start) / 3600000);
  const price = Math.round(entry.hourlyRate * hours * 100) / 100;

  if (isDemoMode()) {
    const row = {
      id: `pcb_${Date.now()}`,
      clientId,
      providerId,
      type,
      petName,
      animalType,
      startAt: start,
      endAt: end,
      price,
      status: 'confirmed',
    };
    demoBookings.push(row);
    return row;
  }

  const provider = await prisma.petCareProvider.findUnique({ where: { id: providerId } });
  if (!provider) {
    const err = new Error('Prestataire introuvable');
    err.status = 404;
    throw err;
  }

  return prisma.petCareBooking.create({
    data: {
      clientId,
      providerId,
      type,
      petName: petName || 'Animal',
      animalType: animalType || 'dog',
      startAt: start,
      endAt: end,
      address,
      notes,
      price,
      status: 'confirmed',
    },
    include: { provider: true },
  });
};

const myBookings = async (user) => {
  const clientId = uid(user);
  if (isDemoMode()) return { bookings: demoBookings.filter((b) => b.clientId === clientId) };
  const bookings = await prisma.petCareBooking.findMany({
    where: { clientId },
    include: { provider: true },
    orderBy: { startAt: 'desc' },
  });
  return { bookings };
};

module.exports = { listCatalog, listProviders, bookCare, myBookings, CARE_CATALOG };

const { prisma, isDemoMode } = require('../../prismaClient');

const uid = (u) => String(u?.id || u?._id);

const seedShelters = async () => {
  if (isDemoMode()) return;
  if ((await prisma.shelter.count()) > 0) return;
  const s = await prisma.shelter.create({
    data: {
      name: 'Refuge Les Amis à Quatre Pattes',
      region: 'Tunis',
      address: 'Mégrine',
      phone: '+216 00 000 000',
      description: 'Refuge associatif — adoptions responsables',
    },
  });
  await prisma.shelterAnimal.createMany({
    data: [
      { shelterId: s.id, name: 'Rex', species: 'dog', breed: 'Berger', ageYears: 3, status: 'available' },
      { shelterId: s.id, name: 'Mina', species: 'cat', breed: 'Européen', ageYears: 2, status: 'available' },
    ],
  });
};

const listShelters = async () => {
  await seedShelters();
  if (isDemoMode()) {
    return {
      shelters: [
        {
          id: 'sh1',
          name: 'Refuge Les Amis à Quatre Pattes',
          region: 'Tunis',
          animals: [
            { id: 'a1', name: 'Rex', species: 'dog', breed: 'Berger', ageYears: 3, status: 'available' },
            { id: 'a2', name: 'Mina', species: 'cat', status: 'available' },
            {
              id: 'a_scared_1',
              name: 'Shadow',
              species: 'dog',
              breed: 'Croisé',
              ageYears: 2,
              status: 'in_rehab',
              isScared: true,
              fearLevel: 5,
              rehabStatus: 'in_rehab',
              origin: 'abandoned',
            },
            {
              id: 'a_scared_2',
              name: 'Plume',
              species: 'cat',
              status: 'in_rehab',
              isScared: true,
              fearLevel: 4,
              rehabStatus: 'in_rehab',
              origin: 'stray',
            },
          ],
        },
      ],
    };
  }
  const shelters = await prisma.shelter.findMany({
    where: { isActive: true },
    include: { animals: { where: { status: 'available' } } },
  });
  return { shelters };
};

const applyAdoption = async (user, { shelterAnimalId, message }) => {
  const userId = uid(user);
  if (!shelterAnimalId) {
    const err = new Error('Animal requis');
    err.status = 400;
    throw err;
  }
  if (isDemoMode()) {
    return { id: 'demo_app', status: 'pending', message: 'Demande enregistrée (démo)' };
  }
  const animal = await prisma.shelterAnimal.findUnique({ where: { id: shelterAnimalId } });
  if (!animal || animal.status !== 'available') {
    const err = new Error('Animal non disponible');
    err.status = 400;
    throw err;
  }
  return prisma.adoptionApplication.create({
    data: { shelterAnimalId, userId, message: message || null },
  });
};

const myAdoptionRequests = async (user) => {
  const userId = uid(user);
  if (isDemoMode()) return { applications: [] };
  const apps = await prisma.adoptionApplication.findMany({
    where: { userId },
    include: { animal: { include: { shelter: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return { applications: apps };
};

module.exports = { listShelters, applyAdoption, myAdoptionRequests };

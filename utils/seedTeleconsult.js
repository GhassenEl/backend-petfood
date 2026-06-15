const { prisma } = require('../prismaClient');
const { generateGoogleMeetLink } = require('./googleMeet');

const seedTeleconsultAppointments = async () => {
  const client = await prisma.user.findFirst({ where: { email: 'client@petfood.tn' } });
  const vet = await prisma.user.findFirst({ where: { email: 'vet@petfood.tn' } });
  if (!client || !vet) return 0;

  const existing = await prisma.petAppointment.count({
    where: { visitMode: 'online', type: 'veterinary_teleconsultation' },
  });
  if (existing > 0) {
    console.log(`ℹ️  ${existing} téléconsultation(s) déjà présentes`);
    return existing;
  }

  const confirmedDate = new Date();
  confirmedDate.setDate(confirmedDate.getDate() + 1);
  confirmedDate.setHours(10, 30, 0, 0);

  const pendingDate = new Date();
  pendingDate.setDate(pendingDate.getDate() + 3);
  pendingDate.setHours(15, 0, 0, 0);

  await prisma.petAppointment.createMany({
    data: [
      {
        ownerId: client.id,
        vetId: vet.id,
        petName: 'Mimi',
        animalType: 'cat',
        type: 'veterinary_teleconsultation',
        visitMode: 'online',
        date: confirmedDate,
        status: 'confirmed',
        meetingLink: generateGoogleMeetLink(),
        notes: 'Suivi post-vaccination — téléconsultation confirmée',
        reminderSent: true,
      },
      {
        ownerId: client.id,
        petName: 'Rex',
        animalType: 'dog',
        type: 'veterinary_teleconsultation',
        visitMode: 'online',
        date: pendingDate,
        status: 'scheduled',
        meetingLink: generateGoogleMeetLink(),
        notes: 'Boiterie légère — à confirmer par le vétérinaire',
      },
    ],
  });

  console.log('✅ 2 téléconsultations Google Meet créées (Mimi confirmée, Rex en attente)');
  return 2;
};

module.exports = { seedTeleconsultAppointments };

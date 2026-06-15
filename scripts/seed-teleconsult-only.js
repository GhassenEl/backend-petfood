const { connectDB, prisma } = require('../prismaClient');
const { seedTeleconsultAppointments } = require('../utils/seedTeleconsult');

(async () => {
  await connectDB();
  await seedTeleconsultAppointments();
  await prisma.$disconnect();
})();

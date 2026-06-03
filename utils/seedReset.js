const { prisma } = require('../prismaClient');

const isPostgres = () => String(process.env.DATABASE_URL || '').startsWith('postgresql');

/**
 * Vide les tables dans l'ordre des dépendances (SQLite + PostgreSQL).
 */
const resetWithDeleteMany = async () => {
  const del = [
    () => prisma.medicalDossierEntry.deleteMany(),
    () => prisma.petMedicalDossier.deleteMany(),
    () => prisma.feederLog.deleteMany(),
    () => prisma.feederSchedule.deleteMany(),
    () => prisma.petFeeder.deleteMany(),
    () => prisma.nutritionPlan.deleteMany(),
    () => prisma.walletTransaction.deleteMany(),
    () => prisma.loyaltyLedger.deleteMany(),
    () => prisma.loyaltyVoucher.deleteMany(),
    () => prisma.productFavorite.deleteMany(),
    () => prisma.serviceRating.deleteMany(),
    () => prisma.orderItem.deleteMany(),
    () => prisma.invoice.deleteMany(),
    () => prisma.message.deleteMany(),
    () => prisma.vetConsultation.deleteMany(),
    () => prisma.prescription.deleteMany(),
    () => prisma.order.deleteMany(),
    () => prisma.petAppointment.deleteMany(),
    () => prisma.petVaccine.deleteMany(),
    () => prisma.veterinaryRecord.deleteMany(),
    () => prisma.veterinaryContactRequest.deleteMany(),
    () => prisma.diseaseTreatment.deleteMany(),
    () => prisma.vetMedication.deleteMany(),
    () => prisma.pharmacyImport.deleteMany(),
    () => prisma.pharmacy.deleteMany(),
    () => prisma.disease.deleteMany(),
    () => prisma.leaveRequest.deleteMany(),
    () => prisma.chatMessage.deleteMany(),
    () => prisma.complaint.deleteMany(),
    () => prisma.review.deleteMany(),
    () => prisma.blogArticle.deleteMany(),
    () => prisma.pet.deleteMany(),
    () => prisma.product.deleteMany(),
    () => prisma.promoCode.deleteMany(),
    () => prisma.user.deleteMany(),
  ];

  for (const fn of del) {
    await fn();
  }
};

/**
 * PostgreSQL : TRUNCATE … CASCADE (plus rapide et fiable).
 */
const resetPostgresCascade = async () => {
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  const names = tables.map((r) => r.tablename).filter(Boolean);
  if (!names.length) return;

  const quoted = names.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
};

const resetDatabase = async () => {
  if (isPostgres()) {
    try {
      await resetPostgresCascade();
      console.log('🧹 PostgreSQL : tables vidées (TRUNCATE CASCADE)');
      return;
    } catch (err) {
      console.warn('⚠️ TRUNCATE CASCADE échoué, fallback deleteMany:', err.message);
    }
  }
  await resetWithDeleteMany();
  console.log('🧹 Base vidée (deleteMany)');
};

module.exports = { resetDatabase, isPostgres };

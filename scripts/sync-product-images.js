/**
 * Sync product imageUrl from demo catalog into DB (fix broken Unsplash URLs).
 */
const { prisma, connectDB } = require('../prismaClient');
const { demoProducts } = require('../utils/demoData');

async function main() {
  await connectDB();
  let updated = 0;
  for (const p of demoProducts) {
    if (!p._id || !p.imageUrl) continue;
    try {
      const existing = await prisma.product.findUnique({ where: { id: p._id }, select: { imageUrl: true } });
      if (!existing) continue;
      if (existing.imageUrl === p.imageUrl) continue;
      await prisma.product.update({ where: { id: p._id }, data: { imageUrl: p.imageUrl } });
      updated += 1;
      console.log('updated', p._id);
    } catch (e) {
      console.warn('skip', p._id, e.message);
    }
  }
  console.log('Done. Updated', updated, 'products');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * Seed avis produits pour enrichir le NLP (exécution manuelle).
 * Usage: node scripts/seed-review-samples.js
 */
require('dotenv').config();
const { prisma } = require('../prismaClient');
const { buildSyntheticFromProducts } = require('../services/reviewEnrichment.service');

const mapReview = (r) => ({
  productId: String(r.productId),
  rating: Number(r.rating),
  comment: String(r.comment),
  userId: r.userId || null,
  emotion: r.rating >= 4 ? 'happy' : r.rating <= 2 ? 'disappointed' : 'neutral',
  sentiment: r.rating >= 4 ? 'positive' : r.rating <= 2 ? 'negative' : 'neutral',
});

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      animalType: true,
      rating_avg: true,
    },
    take: 120,
  });

  const existing = await prisma.review.findMany({ select: { productId: true } });
  const hasReview = new Set(existing.map((r) => r.productId));

  const synthetic = buildSyntheticFromProducts(
    products.filter((p) => !hasReview.has(p.id)),
    hasReview,
  );

  if (!synthetic.length) {
    console.log('Aucun avis à créer — corpus déjà suffisant.');
    return;
  }

  let client = await prisma.user.findFirst({ where: { role: 'client' }, select: { id: true } });
  if (!client) {
    console.warn('Aucun client trouvé — avis créés sans userId.');
  }

  const batch = synthetic.slice(0, 60).map((r) =>
    prisma.review.create({
      data: {
        ...mapReview(r),
        userId: client?.id || undefined,
        productId: r.productId,
      },
    }),
  );

  await prisma.$transaction(batch);
  console.log(`✅ ${batch.length} avis produits créés (${products.length} produits en catalogue).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

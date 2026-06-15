const { prisma } = require('../prismaClient');
const { spamScore } = require('../services/ecosystem/moderator.service');

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'boutique';

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const seedModeratorData = async () => {
  const vendorUser = await prisma.user.findUnique({ where: { email: 'vendor@petfood.tn' } });
  const clientUser = await prisma.user.findUnique({ where: { email: 'youssef@petfood.tn' } });
  const products = await prisma.product.findMany({ take: 6 });

  if (vendorUser) {
    const existingVendor = await prisma.vendor.findUnique({
      where: { ownerUserId: vendorUser.id },
    });
    if (!existingVendor) {
      const v = await prisma.vendor.create({
        data: {
          ownerUserId: vendorUser.id,
          shopName: 'Animalerie Tunis Centre',
          slug: `animalerie-tunis-${Date.now().toString(36).slice(-4)}`,
          region: 'Tunis',
          applicationStatus: 'approved',
          isActive: true,
          commercialSiret: 'MF-2024-1001',
          commercialAddress: 'Avenue Habib Bourguiba, Tunis',
          commercialCategory: 'Animalerie',
          commercialVerified: true,
          totalSales: 1240,
        },
      });
      for (const p of products.slice(0, 3)) {
        await prisma.vendorProduct.create({
          data: {
            vendorId: v.id,
            productId: p.id,
            price: p.price,
            stock: p.stock || 10,
            moderationStatus: 'approved',
          },
        });
      }
      console.log('✅ Vendeur démo approuvé (vendor@petfood.tn)');
    }
  }

  const pendingOwner = clientUser || vendorUser;
  if (pendingOwner) {
    const pendingEmail = 'fares.aqua@email.tn';
    let pendingUser = await prisma.user.findUnique({ where: { email: pendingEmail } });
    if (!pendingUser) {
      const bcrypt = require('bcryptjs');
      pendingUser = await prisma.user.create({
        data: {
          email: pendingEmail,
          password: await bcrypt.hash('Partner2024!', 12),
          name: 'Fares M.',
          role: 'client',
          region: 'Bizerte',
          phone: '+216 21 999 888',
        },
      });
    }
    const pendingVendor = await prisma.vendor.findUnique({
      where: { ownerUserId: pendingUser.id },
    });
    if (!pendingVendor) {
      await prisma.vendor.create({
        data: {
          ownerUserId: pendingUser.id,
          shopName: 'Aquarium Plus Bizerte',
          slug: `aqua-bizerte-${Date.now().toString(36).slice(-4)}`,
          region: 'Bizerte',
          applicationStatus: 'pending',
          isActive: false,
          commercialSiret: 'MF-2024-8891',
          commercialAddress: 'Zone industrielle, Bizerte',
          commercialCategory: 'Aquariophilie',
        },
      });
      console.log('✅ Demande vendeur en attente (Aquarium Plus Bizerte)');
    }
  }

  const approvedVendor = await prisma.vendor.findFirst({
    where: { applicationStatus: 'approved' },
  });
  if (approvedVendor && products.length > 3) {
    const pendingCount = await prisma.vendorProduct.count({
      where: { moderationStatus: 'pending' },
    });
    if (pendingCount === 0) {
      const pendingProducts = [
        { product: products[3], flag: null },
        { product: products[4], flag: 'low_quality' },
        { product: products[5], flag: 'misleading' },
      ];
      for (const row of pendingProducts) {
        if (!row.product) continue;
        await prisma.vendorProduct.create({
          data: {
            vendorId: approvedVendor.id,
            productId: row.product.id,
            price: row.product.price,
            stock: 5,
            moderationStatus: 'pending',
            imageFlag: row.flag,
            submittedAt: daysAgo(1),
          },
        });
      }
      console.log('✅ Produits vendeur en attente de modération');
    }
  }

  const reviewCount = await prisma.review.count({
    where: { moderationStatus: { in: ['flagged', 'pending'] } },
  });
  if (reviewCount === 0 && clientUser && products[0]) {
    const spamComments = [
      'Meilleur produit !!! achetez maintenant !!!',
      '★★★★★ parfait parfait parfait',
      'Arnaque totale arnaque arnaque',
    ];
    for (let i = 0; i < spamComments.length; i += 1) {
      const existing = await prisma.review.findFirst({
        where: { userId: clientUser.id, productId: products[i % products.length].id },
      });
      if (existing) continue;
      await prisma.review.create({
        data: {
          userId: clientUser.id,
          productId: products[i % products.length].id,
          rating: i === 2 ? 1 : 5,
          comment: spamComments[i],
          sentimentScore: 1 - spamScore(spamComments[i]),
          moderationStatus: 'flagged',
        },
      });
    }
    console.log('✅ Avis suspects NLP créés');
  }

  const actionCount = await prisma.moderationAction.count();
  if (actionCount === 0) {
    const moderator = await prisma.user.findUnique({ where: { email: 'moderator@petfood.tn' } });
    const samples = [
      { action: 'approve_vendor', target: 'Animalerie Tunis Centre' },
      { action: 'flag_abusive', target: 'Compte signalé' },
      { action: 'resolve_dispute', target: 'CMD-8755' },
    ];
    for (const s of samples) {
      await prisma.moderationAction.create({
        data: {
          ...s,
          moderatorId: moderator?.id,
          moderatorName: moderator?.name || 'Nour Modération',
          createdAt: daysAgo(Math.floor(Math.random() * 3)),
        },
      });
    }
    console.log('✅ Historique modération initialisé');
  }
};

module.exports = { seedModeratorData };

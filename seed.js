/**
 * Seed principal PetfoodTN — PostgreSQL (recommandé) ou SQLite.
 *
 * Usage :
 *   npm run db:setup     # docker + push + seed
 *   npm run seed         # seed seul (vide puis remplit)
 *   SEED_SKIP_RESET=1 npm run seed   # sans vider les tables
 */
const { prisma, connectDB } = require('./prismaClient');
const { resetDatabase, isPostgres } = require('./utils/seedReset');
const { ensureDemoUsers, ensureDemoPets } = require('./utils/seedUsers');
const {
  generateOrders,
  generateMessages,
  demoProducts,
  createVeterinaryContactRequests,
  createVeterinaryRecords,
  createPetAppointments,
  createPetVaccines,
  createFoundMeDemoReports,
} = require('./utils/demoData');
const { defaultBlogArticles } = require('./utils/defaultBlogArticles');
const { seedRefunds } = require('./utils/seedRefunds');
const { seedTeleconsultAppointments } = require('./utils/seedTeleconsult');
const { seedModeratorData } = require('./utils/seedModerator');

const mapProductRow = (product) => ({
  id: product._id,
  name: product.name,
  price: Number(product.price || 0),
  discount: Number(product.discount || 0),
  discountPrice: product.discountPrice != null ? Number(product.discountPrice) : undefined,
  imageUrl: product.imageUrl || product.image || '',
  description: product.description || '',
  category: product.category || 'nourriture',
  animalType: product.animalType || 'other',
  popularity: Number(product.popularity || 0),
  rating_avg: Number(product.rating_avg || 0),
  rating_count: Number(product.rating_count || 0),
  stock: Number(product.stock ?? 50),
  tags: product.tags || [],
  stockHistory: product.stockHistory || [],
});

const seedBlogArticles = async () => {
  const count = await prisma.blogArticle.count();
  if (count > 0) {
    console.log(`ℹ️  ${count} article(s) blog déjà présents`);
    return;
  }
  for (let i = 0; i < defaultBlogArticles.length; i += 1) {
    const article = defaultBlogArticles[i];
    const publishedAt = new Date();
    publishedAt.setDate(publishedAt.getDate() - i * 14);
    await prisma.blogArticle.create({
      data: {
        ...article,
        isPublished: true,
        publishedAt,
      },
    });
  }
  console.log(`✅ ${defaultBlogArticles.length} article(s) blog créés`);
};

const seedData = async () => {
  try {
    await connectDB();
    console.log(`🌱 Seed PetfoodTN (${isPostgres() ? 'PostgreSQL' : 'SQLite'})`);

    if (process.env.SEED_SKIP_RESET !== '1') {
      await resetDatabase();
    } else {
      console.log('ℹ️  SEED_SKIP_RESET=1 — tables non vidées');
    }

    await ensureDemoUsers();
    await ensureDemoPets();

    console.log('📦 Création des produits…');
    const productRows = demoProducts.map(mapProductRow);
    await prisma.product.createMany({ data: productRows });
    console.log(`✅ ${productRows.length} produits`);

    const clientUsers = await prisma.user.findMany({
      where: { role: 'client' },
      orderBy: { createdAt: 'asc' },
    });

    if (!clientUsers.length) {
      console.log('⚠️ Aucun client — fin du seed.');
      await prisma.$disconnect();
      return;
    }

    const primaryClient = clientUsers[0];

    const contactRequests = createVeterinaryContactRequests({
      ownerId: primaryClient.id,
      count: 40,
    });
    await prisma.veterinaryContactRequest.createMany({
      data: contactRequests.map((r) => ({
        ownerId: r.ownerId,
        animalType: r.animalType,
        petName: r.petName,
        subject: r.subject,
        message: r.message,
        preferredDate: r.preferredDate ? new Date(r.preferredDate) : undefined,
        status: r.status,
        createdAt: new Date(r.createdAt || Date.now()),
      })),
    });
    console.log(`✅ ${contactRequests.length} demandes vétérinaires`);

    const vetRecords = createVeterinaryRecords({ ownerId: primaryClient.id, count: 60 });
    await prisma.veterinaryRecord.createMany({
      data: vetRecords.map((r) => ({
        ownerId: r.ownerId,
        petName: r.petName,
        animalType: r.animalType,
        visitDate: new Date(r.visitDate),
        diagnosis: r.diagnosis,
        treatment: r.treatment,
        vetNotes: r.vetNotes,
        nextVisit: r.nextVisit ? new Date(r.nextVisit) : undefined,
        weight: r.weight,
        temperature: r.temperature,
        medications: r.medications || undefined,
        status: r.status,
        createdAt: r.visitDate,
        updatedAt: r.visitDate,
      })),
    });
    console.log(`✅ ${vetRecords.length} fiches vétérinaires`);

    const allAppointments = clientUsers.flatMap((u) =>
      createPetAppointments({ ownerId: u.id, count: 12 })
    );
    await prisma.petAppointment.createMany({
      data: allAppointments.map((a) => ({
        ownerId: a.ownerId,
        petName: a.petName,
        animalType: a.animalType,
        type: a.type,
        category: a.category || 'vet',
        date: a.date,
        status: a.status,
        notes: a.notes,
        meetingLink: a.meetingLink || null,
        reminderSent: Boolean(a.reminderSent),
        createdAt: a.date,
        updatedAt: a.date,
      })),
    });
    console.log(`✅ ${allAppointments.length} rendez-vous`);

    const allVaccines = clientUsers.flatMap((u) => createPetVaccines({ ownerId: u.id, count: 10 }));
    await prisma.petVaccine.createMany({
      data: allVaccines.map((v) => ({
        ownerId: v.ownerId,
        petName: v.petName,
        animalType: v.animalType,
        vaccineType: v.vaccineType,
        dateAdministered: v.dateAdministered,
        expiryDate: v.expiryDate,
        nextDue: v.nextDue,
        batchNumber: v.batchNumber,
        vetNotes: v.vetNotes,
        status: v.status,
      })),
    });
    console.log(`✅ ${allVaccines.length} vaccins`);

    await seedBlogArticles();
    await seedRefunds();
    await seedTeleconsultAppointments();
    await seedModeratorData();

    const fmCount = await prisma.petFoundMeReport.count();
    if (fmCount === 0) {
      const fmClient =
        clientUsers.find((u) => u.email === 'client@petfood.tn') || clientUsers[0];
      const fmRows = createFoundMeDemoReports(fmClient.id);
      for (const row of fmRows) {
        await prisma.petFoundMeReport.create({
          data: {
            ...row,
            lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt) : undefined,
          },
        });
      }
      console.log(`✅ ${fmRows.length} signalements Retrouvé Moi`);
    }

    const orderClient =
      clientUsers.find((u) => u.email === 'client@petfood.tn') || clientUsers[0];
    const livreur = await prisma.user.findFirst({ where: { role: 'livreur' } });

    console.log('🛒 Création des commandes…');
    const orders = generateOrders(50);
    let orderCount = 0;
    let invoiceCount = 0;
    for (const order of orders) {
      const items = order.items
        .map((item) => ({
          productId: item.productId?._id || item.productId,
          quantity: Number(item.quantity),
          price: Number(item.price),
        }))
        .filter((item) => item.productId);

      if (!items.length) continue;

      const resolvedRegion = order.region || resolveRegionFromAddress(order.address);
      const regionLivreur = resolvedRegion
        ? await prisma.user.findFirst({ where: { role: 'livreur', region: resolvedRegion } })
        : null;
      const assignedLivreurId =
        order.status !== 'pending' && order.status !== 'cancelled'
          ? regionLivreur?.id || livreur?.id
          : null;

      const createdOrder = await prisma.order.create({
        data: {
          userId: orderClient.id,
          total: Number(order.total),
          status: order.status,
          paymentMethod: order.paymentMethod || 'cash',
          address: order.address,
          phone: order.phone,
          region: resolvedRegion,
          deliveryLocation: order.deliveryLocation || {},
          assignedLivreurId,
          createdAt: new Date(order.createdAt),
          updatedAt: new Date(order.updatedAt || order.createdAt),
          items: { create: items },
        },
      });
      orderCount += 1;

      if (order.status !== 'cancelled') {
        await prisma.invoice.create({
          data: {
            userId: orderClient.id,
            orderId: createdOrder.id,
            amount: Number(order.total),
            status: order.status === 'paid' ? 'paid' : 'pending',
            paymentMethod: order.paymentMethod || 'cash',
            issuedAt: new Date(order.createdAt),
            paidAt:
              order.status === 'paid'
                ? new Date(order.updatedAt || order.createdAt)
                : null,
          },
        });
        invoiceCount += 1;
      }
    }
    console.log(`✅ ${orderCount} commandes`);
    console.log(`✅ ${invoiceCount} factures créées`);

    console.log('💬 Création des messages…');
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true, role: true },
    });
    const userIdByRole = (role) => allUsers.find((u) => u.role === role)?.id;
    const userIdByEmail = (email) => allUsers.find((u) => u.email === email)?.id;
    const resolveDemoUserId = (demoId, type) => {
      const map = {
        demo_admin: userIdByEmail('admin@petfood.tn'),
        demo_client: userIdByEmail('client@petfood.tn'),
        demo_livreur: userIdByEmail('livreur@petfood.tn'),
        demo_vet: userIdByEmail('vet@petfood.tn'),
      };
      if (map[demoId]) return map[demoId];
      if (String(demoId).includes('@')) return userIdByEmail(demoId);
      return userIdByRole(type) || orderClient.id;
    };

    const messages = generateMessages();
    const messageInserts = messages
      .map((msg) => {
        const senderId = resolveDemoUserId(msg.sender?.userId, msg.sender?.type);
        const receiverId = resolveDemoUserId(msg.receiver?.userId, msg.receiver?.type);
        if (!senderId || !receiverId) return null;
        return {
          senderType: msg.sender?.type || 'client',
          senderId,
          receiverType: msg.receiver?.type || 'admin',
          receiverId,
          orderId: msg.orderId || null,
          message: msg.message,
          isRead: Boolean(msg.isRead),
          createdAt: new Date(msg.createdAt),
          updatedAt: msg.updatedAt ? new Date(msg.updatedAt) : new Date(msg.createdAt),
        };
      })
      .filter(Boolean);

    if (messageInserts.length) {
      await prisma.message.createMany({ data: messageInserts });
    }
    console.log(`✅ ${messageInserts.length} messages`);

    const counts = {
      users: await prisma.user.count(),
      pets: await prisma.pet.count(),
      products: await prisma.product.count(),
      orders: await prisma.order.count(),
      blogArticles: await prisma.blogArticle.count(),
    };
    console.log('📊 Totaux :', counts);
    console.log('✅ Seed terminé. Comptes : client@petfood.tn / admin@petfood.tn / vet@petfood.tn / livreur@petfood.tn');
    console.log('   Enrichissement optionnel : npm run seed:platform');
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Seed error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
};

seedData();

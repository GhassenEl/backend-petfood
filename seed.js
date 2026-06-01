const bcrypt = require('bcryptjs');
const { prisma, connectDB } = require('./prismaClient');
const {
  generateOrders,
  generateMessages,
  demoProducts,
  createVeterinaryContactRequests,
  createVeterinaryRecords,
  createPetAppointments,
  createPetVaccines,
} = require('./utils/demoData');





/**
 * Seed minimal demo data.
 */
const seedData = async () => {
  try {
    await connectDB();
    console.log('🧹 Clearing existing data...');

    await Promise.all([
      prisma.message.deleteMany(),
      prisma.orderItem.deleteMany(),
      prisma.order.deleteMany(),
      prisma.product.deleteMany(),
      prisma.chatMessage.deleteMany(),
      prisma.invoice.deleteMany(),
      prisma.review.deleteMany(),
      prisma.complaint.deleteMany(),

      // Veterinary
      prisma.veterinaryContactRequest.deleteMany(),
      prisma.petAppointment.deleteMany(),
      prisma.petVaccine.deleteMany(),
      prisma.veterinaryRecord.deleteMany(),
    ]);

    console.log('📦 Creating products...');
    const productData = demoProducts.map((product) => ({
      id: product._id,
      name: product.name,
      price: Number(product.price || 0),
      discount: Number(product.discount || 0),
      imageUrl: product.imageUrl || '',
      category: product.category || 'nourriture',
      animalType: product.animalType || 'other',
      popularity: Number(product.popularity || 0),
      rating_avg: Number(product.rating_avg || 0),
      rating_count: Number(product.rating_count || 0),
      stock: Number(product.stock || 0),
      tags: product.tags || [],
      stockHistory: product.stockHistory || [],
    }));

    await prisma.product.createMany({ data: productData });
    console.log(`✅ ${demoProducts.length} products created`);

    const clientUsers = await prisma.user.findMany({
      where: { role: 'client' },
      orderBy: { createdAt: 'asc' },
    });

    if (!clientUsers.length) {
      console.log(' No client users found. Skipping veterinary seeding.');
      await prisma.$disconnect();
      return;
    }

    const clientUser = clientUsers[0];

    // Create veterinary contact requests (more data)
    const contactRequests = createVeterinaryContactRequests({ ownerId: clientUser.id, count: 120 });

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

    // Create veterinary records (history) (more data)
    const vetRecords = createVeterinaryRecords({ ownerId: clientUser.id, count: 160 });

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

    // (legacy hardcoded vetRecords removed)

    /*
    const vetRecords = [
      {
        ownerId: clientUser.id,
        petName: 'Rex',
        animalType: 'dog',
        visitDate: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
        diagnosis: 'Gastro-entérite légère',
        treatment: 'Hydratation + diète 24-48h, puis transition progressive.',
        vetNotes: 'Revoir si symptômes persistent > 48h.',
        nextVisit: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000 + 21 * 24 * 60 * 60 * 1000),
        weight: 18.4,
        temperature: 38.7,
        medications: JSON.stringify([
          { name: 'Probiotiques', dosage: '1 gélule', frequency: '1x/j' },
        ]),
        status: 'active',
      },
      {
        ownerId: clientUser.id,
        petName: 'Rex',
        animalType: 'dog',
        visitDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
        diagnosis: 'Amélioration - contrôle digestion',
        treatment: 'Poursuite alimentation digestive, contrôle selles.',
        vetNotes: 'Transition croquettes achevée.',
        nextVisit: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
        weight: 18.9,
        temperature: 38.3,
        medications: JSON.stringify([
          { name: 'Complément fibres', dosage: '1 dose', frequency: '1x/j' },
        ]),
        status: 'active',
      },
      {
        ownerId: clientUser.id,
        petName: 'Mimi',
        animalType: 'cat',
        visitDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        diagnosis: 'Intolérance légère à la transition',
        treatment: 'Retour à l’aliment stable + transition plus lente.',
        vetNotes: 'Surveiller appétit + hydratation.',
        nextVisit: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        weight: 4.2,
        temperature: 38.6,
        medications: JSON.stringify([
          { name: 'Probiotiques', dosage: '1 dose', frequency: '1x/j' },
        ]),
        status: 'active',
      },
      {
        ownerId: clientUser.id,
        petName: 'Luna',
        animalType: 'rabbit',
        visitDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        diagnosis: 'Baisse d’appétit (suspect digestif)',
        treatment: 'Contrôle foin + hydratation + surveillance.',
        vetNotes: 'Si reprise faible, prévoir recontrôle.',
        nextVisit: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        weight: 1.8,
        temperature: 38.4,
        medications: JSON.stringify([
          { name: 'Support digestion', dosage: '1 seringue', frequency: '2x/j' },
        ]),
        status: 'active',
      },
    ];

    */

    // Create pet appointments (more data)
    // IMPORTANT: seed RDVs for ALL demo clients so that /veterinary/appointments works for any client account.
    const appointmentsPerClient = clientUsers.map((u) => ({ ownerId: u.id, count: 20 }));
    const allAppointments = appointmentsPerClient.flatMap(({ ownerId, count }) =>
      createPetAppointments({ ownerId, count })
    );

    await prisma.petAppointment.createMany({
      data: allAppointments.map((a) => ({
        ownerId: a.ownerId,
        petName: a.petName,
        animalType: a.animalType,
        type: a.type,
        date: a.date,
        status: a.status,
        notes: a.notes,
        meetingLink: a.meetingLink || null,
        reminderSent: Boolean(a.reminderSent),
        createdAt: a.date,
        updatedAt: a.date,
      })),
    });

    const allVaccines = clientUsers.flatMap((u) => createPetVaccines({ ownerId: u.id, count: 18 }));
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
    console.log(`✅ ${allVaccines.length} pet vaccines created`);


    /*
    // legacy hardcoded appointments removed

    const upcomingBase = Date.now();
    const appointments = [
      {
        ownerId: clientUser.id,
        petName: 'Rex',
        animalType: 'dog',
        type: 'veterinary_consultation',
        date: new Date(upcomingBase + 3 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000),
        status: 'scheduled',
        notes: 'Contrôle digestion + suivi croquettes.',
        reminderSent: false,
      },
      {
        ownerId: clientUser.id,
        petName: 'Mimi',
        animalType: 'cat',
        type: 'veterinary_consultation',
        date: new Date(upcomingBase + 6 * 24 * 60 * 60 * 1000 + 14 * 60 * 60 * 1000),
        status: 'scheduled',
        notes: 'Transition alimentation + check ballonnements.',
        reminderSent: false,
      },
      {
        ownerId: clientUser.id,
        petName: 'Luna',
        animalType: 'rabbit',
        type: 'veterinary_consultation',
        date: new Date(upcomingBase - 10 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000),
        status: 'confirmed',
        notes: 'Première consultation, suivi reprise appétit.',
        reminderSent: true,
      },
    ];

    await prisma.petAppointment.createMany({
      data: appointments.map((a) => ({
        ownerId: a.ownerId,
        petName: a.petName,
        animalType: a.animalType,
        type: a.type,
        date: a.date,
        status: a.status,
        notes: a.notes,
        reminderSent: Boolean(a.reminderSent),
        createdAt: a.date,
        updatedAt: a.date,
      })),
    });

    */

    // Existing (products/orders/messages) seeding
    const usersCount = await prisma.user.count();
    if (usersCount === 0) {
      console.log(' No users found after creating demo accounts. Skipping orders/messages seeding.');
      await prisma.$disconnect();
      return;
    }

    const anyUser = await prisma.user.findFirst({
      where: { role: { in: ['livreur', 'client', 'admin'] } }
    });
    if (!anyUser) {
      console.log('ℹ️ No compatible user found. Skipping orders/messages seeding.');
      await prisma.$disconnect();
      return;
    }

    console.log('🛒 Creating orders...');
    const orders = generateOrders(50);
    for (const order of orders) {
      const items = order.items.map((item) => ({
        productId: item.productId._id,
        quantity: Number(item.quantity),
        price: Number(item.price),
      }));
      await prisma.order.create({
        data: {
          userId: anyUser.id,
          total: Number(order.total),
          status: order.status,
          paymentMethod: order.paymentMethod,
          address: order.address,
          phone: order.phone,
          deliveryLocation: order.deliveryLocation || {},
          createdAt: new Date(order.createdAt),
          updatedAt: new Date(order.updatedAt || order.createdAt),
          items: {
            create: items,
          },
        },
      });
    }
    console.log(`✅ ${orders.length} orders created`);

    console.log('💬 Creating messages...');
    const messages = generateMessages();
    const messageInserts = messages.map((msg) => ({
      senderType: msg.sender.type,
      senderId: msg.sender.userId,
      receiverType: msg.receiver.type,
      receiverId: msg.receiver.userId,
      orderId: msg.orderId || null,
      message: msg.message,
      isRead: Boolean(msg.isRead),
      createdAt: new Date(msg.createdAt),
      updatedAt: msg.updatedAt ? new Date(msg.updatedAt) : new Date(msg.createdAt),
    }));
    await prisma.message.createMany({ data: messageInserts });
    console.log(`✅ ${messages.length} messages created`);

    console.log('✅ SEEDING COMPLETE.');
    console.log('Restart backend and verify routes.');
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Seed error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
};

seedData();



const bcrypt = require('bcryptjs');
const { prisma, connectDB } = require('../prismaClient');
const { resolveRegionFromAddress } = require('../utils/regions');
const {
  demoProducts,
  generateOrders,
  generateMessages,
  generateInvoices,
  createVeterinaryContactRequests,
  createVeterinaryRecords,
  createPetAppointments,
  createPetVaccines,
} = require('../utils/demoData');
const { createPlatformEvents } = require('../utils/demoStore');

const DEMO_ACCOUNTS = [
  { email: 'admin@petfood.tn', password: 'PetfoodTN2024!', name: 'El Jezi Ghassen', role: 'admin' },
  { email: 'client@petfood.tn', password: 'MonChat123!', name: 'Client Test', role: 'client', petType: 'cat', phone: '+216 20 000 000', address: 'Ariana, Tunis' },
  { email: 'livreur@petfood.tn', password: 'Livreur123!', name: 'Livreur Test', role: 'livreur', region: 'Tunis', phone: '+216 50 111 222' },
  {
    email: 'vet@petfood.tn',
    password: 'Vet2024!',
    name: 'Dr. Salma Khelifi',
    role: 'vet',
    phone: '+216 22 111 222',
    address: 'Clinique PetfoodTN, Ariana',
    region: 'Ariana',
    location: { lat: 36.855, lng: 10.196 },
  },
  { email: 'amina@petfood.tn', password: 'Amina2024!', name: 'Amina Ben Ali', role: 'client', petType: 'dog' },
  { email: 'youssef@petfood.tn', password: 'Youssef2024!', name: 'Youssef Trabelsi', role: 'client', petType: 'cat' },
  { email: 'sami.livreur@petfood.tn', password: 'SamiLivreur2024!', name: 'Sami Livreur', role: 'livreur', region: 'Ariana', phone: '+216 50 333 444' },
];

const DEMO_PETS = [
  { ownerEmail: 'client@petfood.tn', name: 'Mimi', type: 'cat', breed: 'Européen' },
  { ownerEmail: 'client@petfood.tn', name: 'Rex', type: 'dog', breed: 'Berger' },
  { ownerEmail: 'amina@petfood.tn', name: 'Luna', type: 'dog', breed: 'Labrador' },
  { ownerEmail: 'youssef@petfood.tn', name: 'Oscar', type: 'cat', breed: 'Siamois' },
];

async function ensureUsers() {
  let created = 0;
  for (const account of DEMO_ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    if (existing) continue;
    const hashedPassword = await bcrypt.hash(account.password, 12);
    await prisma.user.create({
      data: {
        email: account.email,
        password: hashedPassword,
        name: account.name,
        role: account.role,
        region: account.region || null,
        petType: account.petType || null,
        phone: account.phone || null,
        address: account.address || null,
        location: account.location || null,
      },
    });
    created += 1;
  }
  if (created) console.log(`✅ ${created} demo user(s) created`);

  const vetGeo = {
    'vet@petfood.tn': {
      address: 'Clinique PetfoodTN, Ariana',
      region: 'Ariana',
      location: { lat: 36.855, lng: 10.196 },
    },
  };
  for (const [email, geo] of Object.entries(vetGeo)) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u || u.role !== 'vet') continue;
    if (!u.location || !u.address) {
      await prisma.user.update({
        where: { email },
        data: geo,
      });
    }
  }

  return created;
}

async function ensurePets() {
  let created = 0;
  for (const pet of DEMO_PETS) {
    const owner = await prisma.user.findUnique({ where: { email: pet.ownerEmail } });
    if (!owner) continue;
    const existing = await prisma.pet.findFirst({ where: { ownerId: owner.id, name: pet.name } });
    if (existing) continue;
    await prisma.pet.create({
      data: {
        ownerId: owner.id,
        name: pet.name,
        type: pet.type,
        breed: pet.breed,
        birthDate: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000),
        weight: pet.type === 'dog' ? 18.5 : 4.2,
      },
    });
    created += 1;
  }
  if (created) console.log(`✅ ${created} pet(s) created`);
  return created;
}

async function ensureBlogArticles() {
  const count = await prisma.blogArticle.count();
  if (count > 0) return 0;

  const { defaultBlogArticles } = require('../utils/defaultBlogArticles');
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
  return defaultBlogArticles.length;
}

async function ensureProducts() {
  const existingIds = new Set(
    (await prisma.product.findMany({ select: { id: true } })).map((p) => p.id)
  );
  const missing = demoProducts.filter((p) => !existingIds.has(p._id));
  if (!missing.length) return 0;

  await prisma.product.createMany({
    data: missing.map((product) => ({
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
      stock: Number(product.stock || 50),
      tags: product.tags || [],
      stockHistory: product.stockHistory || [],
    })),
  });
  console.log(`✅ ${missing.length} product(s) added`);
  return missing.length;
}

async function ensurePetVaccines() {
  const count = await prisma.petVaccine.count();
  if (count > 0) return 0;

  const clients = await prisma.user.findMany({ where: { role: 'client' } });
  if (!clients.length) return 0;

  const vaccines = clients.flatMap((client) => createPetVaccines({ ownerId: client.id, count: 18 }));
  await prisma.petVaccine.createMany({
    data: vaccines.map((v) => ({
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
  console.log(`✅ ${vaccines.length} pet vaccine(s) created`);
  return vaccines.length;
}

async function ensureVetSampleData() {
  const vet = await prisma.user.findUnique({ where: { email: 'vet@petfood.tn' } });
  const clientUser =
    (await prisma.user.findUnique({ where: { email: 'client@petfood.tn' } })) ||
    (await prisma.user.findFirst({ where: { role: 'client' } }));
  if (!vet || !clientUser) return;

  const clientApptCount = await prisma.petAppointment.count({ where: { ownerId: clientUser.id } });
  if (clientApptCount === 0) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(15, 30, 0, 0);

    const scheduledAppt = await prisma.petAppointment.create({
      data: {
        ownerId: clientUser.id,
        vetId: vet.id,
        petName: 'Mimi',
        animalType: 'cat',
        type: 'veterinary_consultation',
        date: tomorrow,
        status: 'scheduled',
        notes: 'Contrôle post-consultation',
      },
    });

    const confirmedAppt = await prisma.petAppointment.create({
      data: {
        ownerId: clientUser.id,
        vetId: vet.id,
        petName: 'Rex',
        animalType: 'dog',
        type: 'veterinary_consultation',
        date: nextWeek,
        status: 'confirmed',
        meetingLink: 'https://meet.google.com/abc-defg-hij',
        notes: 'Suivi nutritionnel',
      },
    });

    await prisma.vetConsultation.create({
      data: {
        appointmentId: confirmedAppt.id,
        vetId: vet.id,
        ownerId: clientUser.id,
        petName: confirmedAppt.petName,
        animalType: confirmedAppt.animalType,
        symptoms: 'Léthargie, perte d\'appétit légère',
        clinicalExam: 'Température 38.8°C, muqueuses roses',
        analysis: 'Suspicion gastrite légère',
        diagnosis: 'Gastrite aiguë bénigne',
        recommendations: 'Régime digeste 48h, surveillance',
        status: 'finalized',
      },
    });

    console.log('✅ Client demo appointments + consultation created for', clientUser.email);
    void scheduledAppt;
  }

  const appointments = await prisma.petAppointment.findMany({ take: 3, orderBy: { date: 'desc' } });

  for (const appt of appointments) {
    if (!appt.vetId) {
      await prisma.petAppointment.update({
        where: { id: appt.id },
        data: { vetId: vet.id, meetingLink: appt.meetingLink || 'https://meet.google.com/abc-defg-hij' },
      });
    }
  }

  const consultForClient = await prisma.vetConsultation.count({
    where: { ownerId: clientUser.id, status: 'finalized' },
  });
  if (consultForClient === 0 && appointments.length > 0) {
    const appt =
      appointments.find((a) => a.ownerId === clientUser.id) ||
      (await prisma.petAppointment.findFirst({ where: { ownerId: clientUser.id } }));
    if (appt) {
      await prisma.vetConsultation.create({
      data: {
        appointmentId: appt.id,
        vetId: vet.id,
        ownerId: appt.ownerId,
        petName: appt.petName,
        animalType: appt.animalType,
        symptoms: 'Léthargie, perte d\'appétit légère',
        clinicalExam: 'Température 38.8°C, muqueuses roses',
        analysis: 'Suspicion gastrite légère',
        diagnosis: 'Gastrite aiguë bénigne',
        recommendations: 'Régime digeste 48h, surveillance',
        status: 'finalized',
      },
      });
      console.log('✅ Sample vet consultation created');
    }
  }

  const rxCount = await prisma.prescription.count();
  if (rxCount === 0) {
    const consultation = await prisma.vetConsultation.findFirst();
    const pets = await prisma.pet.findMany({ where: { ownerId: clientUser.id }, take: 3 });
    const targets = pets.length ? pets : [{ name: 'Mimi', type: 'cat' }];
    for (const pet of targets) {
      await prisma.prescription.create({
        data: {
          consultationId: consultation?.id || null,
          vetId: vet.id,
          ownerId: clientUser.id,
          petName: pet.name,
          medications: JSON.stringify([
            {
              name: pet.type === 'cat' ? 'Oméprazole' : 'Antiparasitaire',
              dosage: pet.type === 'cat' ? '5mg' : '1 comprimé',
              frequency: pet.type === 'cat' ? '1x/jour' : '1x/mois',
              duration: pet.type === 'cat' ? '5 jours' : '1 dose',
            },
          ]),
          instructions: pet.type === 'cat' ? 'Administrer le matin à jeun' : 'Administrer avec un repas',
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'active',
        },
      });
    }
    console.log(`✅ ${targets.length} ordonnance(s) démo créée(s)`);
  }

  const clientContactCount = await prisma.veterinaryContactRequest.count({
    where: { ownerId: clientUser.id },
  });
  if (clientContactCount === 0) {
    await prisma.veterinaryContactRequest.createMany({
      data: [
        {
          ownerId: clientUser.id,
          animalType: 'cat',
          petName: 'Mimi',
          subject: 'Question alimentation',
          message: 'Mon chat refuse ses croquettes depuis 2 jours.',
          status: 'pending',
        },
        {
          ownerId: clientUser.id,
          animalType: 'dog',
          petName: 'Rex',
          subject: 'Validation plan NutriPro',
          message: 'Pouvez-vous valider le plan nutritionnel proposé ?',
          status: 'confirmed',
        },
      ],
    });
    console.log('✅ Client contact requests created');
  }
}

async function ensureVeterinaryData() {
  const clientUsers = await prisma.user.findMany({ where: { role: 'client' } });
  if (!clientUsers.length) return;

  const clientUser = clientUsers[0];

  if ((await prisma.veterinaryContactRequest.count()) === 0) {
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
    console.log(`✅ ${contactRequests.length} veterinary contact request(s) created`);
  }

  if ((await prisma.veterinaryRecord.count()) === 0) {
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
    console.log(`✅ ${vetRecords.length} veterinary record(s) created`);
  }

  if ((await prisma.petAppointment.count()) === 0) {
    const allAppointments = clientUsers.flatMap((u) => createPetAppointments({ ownerId: u.id, count: 20 }));
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
    console.log(`✅ ${allAppointments.length} pet appointment(s) created`);
  }

  const eventCount = await prisma.petAppointment.count({ where: { category: 'event' } });
  if (eventCount === 0) {
    const clientUsers = await prisma.user.findMany({ where: { role: 'client' }, take: 5 });
    const platformEvents = clientUsers.flatMap((u) =>
      createPlatformEvents({ ownerId: u.id, count: 6 })
    );
    if (platformEvents.length > 0) {
      await prisma.petAppointment.createMany({
        data: platformEvents.map((e) => ({
          ownerId: e.ownerId,
          petName: e.petName,
          title: e.title,
          animalType: e.animalType,
          type: e.type,
          category: 'event',
          isPublic: Boolean(e.isPublic),
          date: new Date(e.date),
          status: e.status,
          notes: e.notes,
          meetingLink: e.meetingLink || null,
          reminderSent: false,
          createdAt: new Date(e.date),
          updatedAt: new Date(e.date),
        })),
      });
      console.log(`✅ ${platformEvents.length} platform event(s) created`);
    }
  }

  await ensureVetSampleData();
}

async function ensureOrdersAndMessages() {
  const clientUser = await prisma.user.findFirst({ where: { role: 'client' } });
  const livreurUser = await prisma.user.findFirst({ where: { role: 'livreur' } });
  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
  const vetUser = await prisma.user.findFirst({ where: { role: 'vet' } });
  if (!clientUser) return;

  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
  const resolveDemoUserId = (demoId, type) => {
    const map = {
      demo_admin: adminUser?.id,
      demo_client: clientUser?.id,
      demo_livreur: livreurUser?.id,
      demo_vet: vetUser?.id,
    };
    if (map[demoId]) return map[demoId];
    if (typeof demoId === 'string' && demoId.includes('@')) {
      const user = users.find((u) => u.email === demoId);
      return user?.id;
    }
    const roleMatch = users.find((u) => u.role === type);
    return roleMatch?.id;
  };

  if ((await prisma.order.count()) === 0) {
    const orders = generateOrders(50);
    for (const order of orders) {
      const resolvedRegion = order.region || resolveRegionFromAddress(order.address);
      const regionLivreur = resolvedRegion
        ? await prisma.user.findFirst({ where: { role: 'livreur', region: resolvedRegion } })
        : null;
      const assignedLivreurId =
        order.status !== 'pending' && order.status !== 'cancelled'
          ? regionLivreur?.id || livreurUser?.id
          : null;

      await prisma.order.create({
        data: {
          userId: clientUser.id,
          total: Number(order.total),
          status: order.status,
          paymentMethod: order.paymentMethod,
          address: order.address,
          phone: order.phone,
          region: resolvedRegion,
          deliveryLocation: order.deliveryLocation || {},
          assignedLivreurId,
          createdAt: new Date(order.createdAt),
          updatedAt: new Date(order.updatedAt || order.createdAt),
          items: {
            create: order.items.map((item) => ({
              productId: item.productId._id,
              quantity: Number(item.quantity),
              price: Number(item.price),
            })),
          },
        },
      });
    }
    console.log(`✅ ${orders.length} order(s) created`);
  }

  if ((await prisma.invoice.count()) === 0) {
    const orders = await prisma.order.findMany();
    const invoices = generateInvoices(orders);
    if (invoices.length) {
      await prisma.invoice.createMany({
        data: invoices.map((inv) => ({
          userId: inv.userId,
          orderId: inv.orderId,
          amount: inv.amount,
          status: inv.status,
          paymentMethod: inv.paymentMethod,
          issuedAt: new Date(inv.issuedAt),
          paidAt: inv.paidAt ? new Date(inv.paidAt) : null,
        }))
      });
    }
    console.log(`✅ ${invoices.length} facture(s) created`);
  }

  if ((await prisma.message.count()) === 0) {
    const users = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
    const messages = generateMessages();
    const validMessages = messages
      .map((msg) => {
        const senderId = resolveDemoUserId(msg.sender?.userId, msg.sender?.type);
        const receiverId = resolveDemoUserId(msg.receiver?.userId, msg.receiver?.type);
        if (!senderId || !receiverId) return null;
        return {
          senderType: msg.sender.type,
          senderId,
          receiverType: msg.receiver.type,
          receiverId,
          orderId: msg.orderId || null,
          message: msg.message,
          isRead: Boolean(msg.isRead),
          createdAt: new Date(msg.createdAt),
          updatedAt: msg.updatedAt ? new Date(msg.updatedAt) : new Date(msg.createdAt),
        };
      })
      .filter(Boolean);

    if (validMessages.length) {
      await prisma.message.createMany({ data: validMessages });
    }
    console.log(`✅ ${validMessages.length} message(s) created`);
  }
}

async function ensureLivreurRegions() {
  const livreurRegions = {
    'livreur@petfood.tn': 'Tunis',
    'sami.livreur@petfood.tn': 'Ariana',
  };

  for (const [email, region] of Object.entries(livreurRegions)) {
    await prisma.user.updateMany({
      where: { email, role: 'livreur', region: null },
      data: { region },
    });
  }

  const ordersWithoutRegion = await prisma.order.findMany({
    where: { region: null },
    select: { id: true, address: true },
  });

  for (const order of ordersWithoutRegion) {
    await prisma.order.update({
      where: { id: order.id },
      data: { region: resolveRegionFromAddress(order.address) },
    });
  }
}

async function createDemoFeederLogs(feederId) {
  const dispenseLogs = [
    { feederId, eventType: 'dispense', portionGrams: 30, animalDetected: true, message: 'Distribution OK — LED verte', createdAt: new Date(Date.now() - 6 * 24 * 3600 * 1000) },
    { feederId, eventType: 'dispense', portionGrams: 30, animalDetected: true, message: 'Repas matin — planning auto', createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000) },
    { feederId, eventType: 'dispense', portionGrams: 30, animalDetected: false, message: 'Repas soir', createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000 + 10 * 3600 * 1000) },
    { feederId, eventType: 'dispense', portionGrams: 28, animalDetected: true, message: 'Distribution OK', createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) },
    { feederId, eventType: 'dispense', portionGrams: 32, animalDetected: true, message: 'Distribution OK', createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000) },
    { feederId, eventType: 'dispense', portionGrams: 30, animalDetected: true, message: 'Repas matin — aujourd\'hui', createdAt: new Date(new Date().setHours(8, 5, 0, 0)) },
    { feederId, eventType: 'refill', foodGrams: 500, message: 'Réservoir rechargé (~500 g)', createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) },
  ];

  const sensorLogs = [];
  for (let day = 6; day >= 0; day -= 1) {
    for (let hour = 8; hour <= 20; hour += 4) {
      const at = new Date(Date.now() - day * 24 * 3600 * 1000);
      at.setHours(hour, 0, 0, 0);
      sensorLogs.push({
        feederId,
        eventType: 'sensor',
        reservoirCm: 6 + day * 0.4 + (hour % 12) * 0.05,
        foodGrams: 480 - day * 8 - hour,
        temperature: 22 + (hour % 5),
        humidity: 48 + (hour % 8),
        animalDetected: hour === 8 || hour === 12,
        message: 'Relevé capteurs automatique (ESP32)',
        createdAt: at,
      });
    }
  }

  await prisma.feederLog.createMany({ data: [...dispenseLogs, ...sensorLogs] });
}

async function refreshDemoFeeder(feeder) {
  await prisma.petFeeder.update({
    where: { id: feeder.id },
    data: {
      status: 'online',
      reservoirCm: 8.5,
      foodGrams: 420,
      temperature: 24,
      humidity: 52,
      animalPresent: false,
      isLowFood: false,
      lastSeenAt: new Date(),
    },
  });
  const logCount = await prisma.feederLog.count({ where: { feederId: feeder.id } });
  const sensorCount = await prisma.feederLog.count({ where: { feederId: feeder.id, eventType: 'sensor' } });
  if (logCount < 5 || sensorCount < 10) {
    if (logCount >= 5 && sensorCount < 10) {
      await prisma.feederLog.deleteMany({ where: { feederId: feeder.id, eventType: 'sensor' } });
    }
    await createDemoFeederLogs(feeder.id);
    console.log('✅ Demo feeder logs backfilled (dispense + capteurs SQL)');
  } else {
    console.log('✅ Demo feeder refreshed (online, capteurs à jour)');
  }
  return 1;
}

async function ensureDemoFeeder() {
  const client = await prisma.user.findUnique({ where: { email: 'client@petfood.tn' } });
  if (!client) return 0;

  const existing = await prisma.petFeeder.findFirst({ where: { ownerId: client.id } });
  if (existing) return refreshDemoFeeder(existing);

  const mimi = await prisma.pet.findFirst({ where: { ownerId: client.id, name: 'Mimi' } });
  const deviceKey = 'pf_demo_client_feeder_2024';

  const feeder = await prisma.petFeeder.create({
    data: {
      ownerId: client.id,
      petId: mimi?.id || null,
      name: 'Distributeur Mimi',
      deviceKey,
      status: 'online',
      reservoirCm: 8.5,
      foodGrams: 450,
      temperature: 24,
      humidity: 55,
      animalPresent: false,
      isLowFood: false,
      lastSeenAt: new Date(),
    },
  });

  await prisma.feederSchedule.createMany({
    data: [
      { feederId: feeder.id, time: '08:00', portionGrams: 30, label: 'Petit-déjeuner', petName: 'Mimi', enabled: true },
      { feederId: feeder.id, time: '18:00', portionGrams: 30, label: 'Dîner', petName: 'Mimi', enabled: true },
    ],
  });

  await createDemoFeederLogs(feeder.id);

  console.log('✅ Demo pet feeder created (deviceKey: pf_demo_client_feeder_2024)');
  return 1;
}

async function ensureDemoNutritionPlans() {
  const client = await prisma.user.findUnique({ where: { email: 'client@petfood.tn' } });
  if (!client) return 0;

  const existing = await prisma.nutritionPlan.count({ where: { ownerId: client.id } });
  if (existing > 0) return 0;

  const mimi = await prisma.pet.findFirst({ where: { ownerId: client.id, name: 'Mimi' } });
  const planMimi = [
    'Plan NutriPro pour Mimi',
    'Profil : chat, adulte, 4.2 kg, Européen.',
    'Objectif : maintien. Activité : moyen. État corporel : idéal.',
    'Repère : environ 129 g/jour, soit 65 g × 2 repas.',
    'Routine : 2 repas/jour, eau fraîche, transition sur 7 jours si changement.',
    'Préférence : croquettes premium + pâtée en complément.',
    'Validation vétérinaire : contrôle annuel recommandé.',
  ].join('\n');

  await prisma.nutritionPlan.createMany({
    data: [
      {
        ownerId: client.id,
        petId: mimi?.id || null,
        petName: 'Mimi',
        petType: 'cat',
        goal: 'maintien',
        planText: planMimi,
        source: 'nutripro',
        createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000),
      },
      {
        ownerId: client.id,
        petId: mimi?.id || null,
        petName: 'Mimi',
        petType: 'cat',
        goal: 'maintien',
        planText: `${planMimi}\n\nMise à jour : portions ajustées après pesée vétérinaire (4.2 kg stable).`,
        source: 'nutripro',
        createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      },
    ],
  });

  console.log('✅ Demo nutrition plans created for client@petfood.tn');
  return 1;
}

async function ensurePromoCodes() {
  const demos = [
    {
      code: 'CHAT10',
      label: 'Promo chats — 10 %',
      discountType: 'percent',
      discountValue: 10,
      minOrderAmount: 30,
      maxDiscount: 25,
      maxUses: 100,
    },
    {
      code: 'BIENVENUE20',
      label: 'Bienvenue — 20 DT',
      discountType: 'fixed',
      discountValue: 20,
      minOrderAmount: 80,
      maxUses: 50,
    },
    {
      code: 'FIDELITE15',
      label: 'Fidélité — 15 %',
      discountType: 'percent',
      discountValue: 15,
      minOrderAmount: 50,
      maxDiscount: 40,
      validUntil: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    },
  ];

  let created = 0;
  for (const promo of demos) {
    const existing = await prisma.promoCode.findUnique({ where: { code: promo.code } });
    if (existing) continue;
    await prisma.promoCode.create({ data: promo });
    created += 1;
  }
  if (created) console.log(`✅ ${created} demo promo code(s) created`);
  return created;
}

async function ensureLivreurOrderAssignments() {
  const assigned = await prisma.order.count({ where: { assignedLivreurId: { not: null } } });
  if (assigned >= 20) return 0;

  const livreurs = await prisma.user.findMany({ where: { role: 'livreur' } });
  const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' } });
  if (!livreurs.length || !orders.length) return 0;

  const livreurByRegion = {};
  for (const l of livreurs) {
    const r = l.region || 'Tunis';
    if (!livreurByRegion[r]) livreurByRegion[r] = l;
  }

  let updated = 0;
  for (let i = 0; i < orders.length; i += 1) {
    const order = orders[i];
    const livreur =
      livreurByRegion[order.region] ||
      livreurs[i % livreurs.length];
    const mod = i % 10;
    let data;

    if (mod < 3) {
      data = {
        status: 'pending',
        assignedLivreurId: null,
        deliveryStatus: 'pending',
        shippedAt: null,
        deliveredAt: null,
      };
    } else if (mod < 6) {
      data = {
        status: 'shipped',
        assignedLivreurId: livreur.id,
        deliveryStatus: 'in_transit',
        shippedAt: order.shippedAt || new Date(Date.now() - 2 * 3600 * 1000),
        deliveredAt: null,
      };
    } else if (mod < 9) {
      data = {
        status: 'delivered',
        assignedLivreurId: livreur.id,
        deliveryStatus: 'delivered',
        shippedAt: order.shippedAt || new Date(Date.now() - 48 * 3600 * 1000),
        deliveredAt: order.deliveredAt || new Date(Date.now() - 24 * 3600 * 1000),
        deliveryNote: order.deliveryNote || 'Livraison effectuée — client satisfait.',
      };
    } else {
      data = {
        status: 'paid',
        assignedLivreurId: null,
        deliveryStatus: 'pending',
      };
    }

    await prisma.order.update({ where: { id: order.id }, data });
    updated += 1;
  }

  console.log(`✅ ${updated} commande(s) réparties pour livreurs (pool + actives + livrées)`);
  return updated;
}

async function ensureVetAppointmentsAssigned() {
  const unassigned = await prisma.petAppointment.count({
    where: { vetId: null, category: { not: 'event' } },
  });
  if (unassigned === 0) return 0;

  const vets = await prisma.user.findMany({ where: { role: 'vet' }, orderBy: { createdAt: 'asc' } });
  if (!vets.length) return 0;

  const appts = await prisma.petAppointment.findMany({
    where: { vetId: null, category: { not: 'event' } },
    orderBy: { date: 'asc' },
  });

  for (let i = 0; i < appts.length; i += 1) {
    const vet = vets[i % vets.length];
    await prisma.petAppointment.update({
      where: { id: appts[i].id },
      data: {
        vetId: vet.id,
        meetingLink: appts[i].meetingLink || 'https://meet.google.com/petfoodtn-vet-demo',
      },
    });
  }

  console.log(`✅ ${appts.length} RDV vétérinaire(s) assignés`);
  return appts.length;
}

async function ensureVetClinicProfiles() {
  const vets = await prisma.user.findMany({ where: { role: 'vet' } });
  let updated = 0;

  for (const vet of vets) {
    let prefs = {};
    try {
      prefs = vet.preferences ? JSON.parse(vet.preferences) : {};
    } catch {
      prefs = {};
    }
    if (prefs.clinic?.clinicName) continue;

    prefs.clinic = {
      clinicName: vet.email === 'vet@petfood.tn' ? 'Clinique PetfoodTN Ariana' : `Cabinet ${vet.name}`,
      phone: vet.phone || '+216 71 000 000',
      address: vet.address || 'Tunis, Tunisie',
      region: vet.region || 'Tunis',
      openingHours: {
        mon: '09:00-18:00', tue: '09:00-18:00', wed: '09:00-18:00',
        thu: '09:00-18:00', fri: '09:00-18:00', sat: '09:00-13:00', sun: 'Fermé',
      },
      services: ['Consultation', 'Vaccination', 'Chirurgie', 'Urgences', 'Téléconsultation'],
      acceptsHomeVisit: true,
      acceptsTeleconsult: true,
      emergencyPhone: vet.phone || '+216 71 000 000',
      description: 'Cabinet partenaire PetfoodTN — soins et nutrition animale.',
    };

    await prisma.user.update({
      where: { id: vet.id },
      data: { preferences: JSON.stringify(prefs) },
    });
    updated += 1;
  }

  if (updated) console.log(`✅ ${updated} profil(s) clinique vétérinaire`);
  return updated;
}

async function ensureMedicalDossiers() {
  const vet =
    (await prisma.user.findUnique({ where: { email: 'vet@petfood.tn' } })) ||
    (await prisma.user.findFirst({ where: { role: 'vet' } }));
  if (!vet) return 0;

  const pets = await prisma.pet.findMany();
  let created = 0;

  for (const pet of pets) {
    const ownerId = typeof pet.ownerId === 'object' && pet.ownerId?.id ? pet.ownerId.id : pet.ownerId;
    const existing = await prisma.petMedicalDossier.findFirst({
      where: { OR: [{ petId: pet.id }, { ownerId, petName: pet.name }] },
    });
    if (existing) continue;

    const year = new Date().getFullYear();
    const num = String((await prisma.petMedicalDossier.count()) + 1).padStart(5, '0');
    const dossier = await prisma.petMedicalDossier.create({
      data: {
        dossierNumber: `DMP-${year}-${num}`,
        ownerId,
        petId: pet.id,
        petName: pet.name,
        animalType: pet.type,
        breed: pet.breed,
        birthDate: pet.birthDate,
        diet: pet.type === 'cat' ? 'Croquettes premium + pâtée' : 'Croquettes chien adulte',
        createdByVetId: vet.id,
      },
    });

    await prisma.medicalDossierEntry.createMany({
      data: [
        {
          dossierId: dossier.id,
          vetId: vet.id,
          entryType: 'consultation',
          title: 'Consultation de contrôle',
          symptoms: 'Aucun signe alarmant',
          clinicalExam: 'État général bon, hydratation normale',
          diagnosis: 'Animal en bonne santé',
          treatment: 'Poursuite alimentation actuelle',
          recommendations: 'Contrôle annuel',
          weight: pet.weight,
          temperature: 38.5,
          visitDate: new Date(Date.now() - 30 * 24 * 3600 * 1000),
          status: 'signed',
          isSigned: true,
          signedAt: new Date(Date.now() - 29 * 24 * 3600 * 1000),
          signedByVetId: vet.id,
        },
        {
          dossierId: dossier.id,
          vetId: vet.id,
          entryType: 'vaccination',
          title: 'Rappel vaccinal',
          diagnosis: 'Vaccination à jour',
          medications: JSON.stringify({ vaccineType: 'Rage + typhus', batchNumber: 'VAC-2024-001' }),
          visitDate: new Date(Date.now() - 7 * 24 * 3600 * 1000),
          status: 'signed',
          isSigned: true,
          signedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
          signedByVetId: vet.id,
        },
        {
          dossierId: dossier.id,
          vetId: vet.id,
          entryType: 'consultation',
          title: 'Suivi nutrition — brouillon',
          symptoms: 'Légère prise de poids',
          recommendations: 'Ajuster portions NutriPro',
          visitDate: new Date(),
          status: 'draft',
          isSigned: false,
        },
      ],
    });
    created += 1;
  }

  if (created) console.log(`✅ ${created} dossier(s) médical(aux) + entrées`);
  return created;
}

async function ensureLeaveRequests() {
  const count = await prisma.leaveRequest.count();
  if (count >= 6) return 0;

  const livreur = await prisma.user.findUnique({ where: { email: 'livreur@petfood.tn' } });
  const vet = await prisma.user.findUnique({ where: { email: 'vet@petfood.tn' } });
  const admin = await prisma.user.findUnique({ where: { email: 'admin@petfood.tn' } });
  const rows = [];

  if (livreur) {
    rows.push(
      {
        userId: livreur.id,
        staffRole: 'livreur',
        type: 'sick',
        startDate: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        endDate: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        reason: 'Arrêt maladie — certificat transmis',
        status: 'pending',
      },
      {
        userId: livreur.id,
        staffRole: 'livreur',
        type: 'vacation',
        startDate: new Date(Date.now() - 60 * 24 * 3600 * 1000),
        endDate: new Date(Date.now() - 55 * 24 * 3600 * 1000),
        reason: 'Congés annuels',
        status: 'approved',
        reviewedBy: admin?.id || null,
        reviewedAt: new Date(Date.now() - 65 * 24 * 3600 * 1000),
      }
    );
  }

  if (vet) {
    rows.push(
      {
        userId: vet.id,
        staffRole: 'vet',
        type: 'vacation',
        startDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        endDate: new Date(Date.now() + 21 * 24 * 3600 * 1000),
        reason: 'Formation continue — Lyon',
        status: 'pending',
      },
      {
        userId: vet.id,
        staffRole: 'vet',
        type: 'sick',
        startDate: new Date(Date.now() - 10 * 24 * 3600 * 1000),
        endDate: new Date(Date.now() - 8 * 24 * 3600 * 1000),
        reason: 'Grippe',
        status: 'approved',
        reviewedBy: admin?.id || null,
        reviewedAt: new Date(Date.now() - 12 * 24 * 3600 * 1000),
      }
    );
  }

  const existing = await prisma.leaveRequest.findMany({ select: { userId: true, type: true, startDate: true } });
  const toCreate = rows.filter(
    (r) => !existing.some((e) => e.userId === r.userId && e.type === r.type)
  );
  if (!toCreate.length) return 0;

  await prisma.leaveRequest.createMany({ data: toCreate });
  console.log(`✅ ${toCreate.length} demande(s) congé / maladie`);
  return toCreate.length;
}

async function ensureProductPromotions() {
  const onSale = await prisma.product.count({ where: { isOnSale: true } });
  if (onSale >= 3) return 0;

  const products = await prisma.product.findMany({ where: { discount: { gt: 0 } }, take: 5 });
  let updated = 0;
  for (const p of products) {
    const d = Number(p.discount || 0);
    if (d <= 0) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        isOnSale: true,
        discountPrice: Number((p.price * (1 - d / 100)).toFixed(2)),
      },
    });
    updated += 1;
  }
  if (updated) console.log(`✅ ${updated} promotion(s) produit activées`);
  return updated;
}

async function ensureReviewsAndComplaints() {
  const clients = await prisma.user.findMany({ where: { role: 'client' } });
  const products = await prisma.product.findMany({ take: 8 });
  if (!clients.length || !products.length) return 0;

  let created = 0;

  if ((await prisma.review.count()) < 20) {
    const comments = [
      'Excellent produit, mon chat adore !',
      'Livraison rapide, emballage soigné.',
      'Bon rapport qualité-prix.',
      'Mon chien digère très bien ces croquettes.',
      'Service client réactif.',
    ];
    for (let i = 0; i < 15; i += 1) {
      const client = clients[i % clients.length];
      const product = products[i % products.length];
      const exists = await prisma.review.findFirst({
        where: { userId: client.id, productId: product.id },
      });
      if (exists) continue;
      await prisma.review.create({
        data: {
          userId: client.id,
          productId: product.id,
          rating: 3 + (i % 3),
          comment: comments[i % comments.length],
          emotion: i % 2 === 0 ? 'positive' : 'neutral',
        },
      });
      created += 1;
    }
  }

  if ((await prisma.complaint.count()) < 15) {
    const subjects = ['Retard livraison', 'Produit endommagé', 'Question facture', 'Doublon commande'];
    for (let i = 0; i < 8; i += 1) {
      const client = clients[i % clients.length];
      await prisma.complaint.create({
        data: {
          userId: client.id,
          email: client.email,
          name: client.name,
          subject: subjects[i % subjects.length],
          message: 'Merci de traiter ma demande dans les plus brefs délais.',
          status: i % 3 === 0 ? 'pending' : i % 3 === 1 ? 'in_progress' : 'resolved',
          response: i % 3 === 2 ? 'Votre réclamation a été traitée. Merci de votre confiance.' : null,
        },
      });
      created += 1;
    }
  }

  if (created) console.log(`✅ ${created} avis / réclamation(s) ajoutés`);
  return created;
}

async function ensureNutritionPlansAllClients() {
  const clients = await prisma.user.findMany({ where: { role: 'client' } });
  let created = 0;

  for (const client of clients) {
    const existing = await prisma.nutritionPlan.count({ where: { ownerId: client.id } });
    if (existing > 0) continue;

    const pet = await prisma.pet.findFirst({ where: { ownerId: client.id } });
    const petName = pet?.name || 'Mon animal';
    const petType = pet?.type || 'dog';

    await prisma.nutritionPlan.create({
      data: {
        ownerId: client.id,
        petId: pet?.id || null,
        petName,
        petType,
        goal: 'maintien',
        planText: [
          `Plan NutriPro — ${petName}`,
          `Profil : ${petType}, adulte.`,
          'Repère : 2 repas/jour, eau fraîche à volonté.',
          'Validation vétérinaire recommandée.',
        ].join('\n'),
        source: 'nutripro',
      },
    });
    created += 1;
  }

  if (created) console.log(`✅ ${created} plan(s) nutrition client`);
  return created;
}

async function ensureVetConsultationsDrafts() {
  const vet = await prisma.user.findUnique({ where: { email: 'vet@petfood.tn' } });
  if (!vet) return 0;

  const drafts = await prisma.vetConsultation.count({ where: { vetId: vet.id, status: 'draft' } });
  if (drafts >= 2) return 0;

  const appts = await prisma.petAppointment.findMany({
    where: { vetId: vet.id, status: { in: ['scheduled', 'confirmed'] } },
    take: 3,
    orderBy: { date: 'asc' },
  });

  let created = 0;
  for (const appt of appts) {
    const exists = await prisma.vetConsultation.findUnique({ where: { appointmentId: appt.id } });
    if (exists) continue;
    await prisma.vetConsultation.create({
      data: {
        appointmentId: appt.id,
        vetId: vet.id,
        ownerId: appt.ownerId,
        petName: appt.petName,
        animalType: appt.animalType,
        symptoms: 'À compléter lors de la consultation',
        status: 'draft',
      },
    });
    created += 1;
  }

  if (created) console.log(`✅ ${created} consultation(s) brouillon vétérinaire`);
  return created;
}

async function ensureProductRichDetails() {
  const { PRODUCT_DETAILS } = require('../utils/productDetailsCatalog');
  let updated = 0;
  for (const [id, detail] of Object.entries(PRODUCT_DETAILS)) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) continue;
    const tagsJson = JSON.stringify(detail.tags || []);
    const needsUpdate =
      !existing.description ||
      existing.description.length < 40 ||
      existing.category !== detail.category;
    if (!needsUpdate) continue;
    await prisma.product.update({
      where: { id },
      data: {
        description: detail.description,
        category: detail.category,
        tags: tagsJson,
      },
    });
    updated += 1;
  }
  if (updated) console.log(`✅ ${updated} fiche(s) produit enrichie(s)`);
  return updated;
}

async function ensurePlatformEnrichment() {
  const { ensureVetBiSeed } = require('../utils/vetBiSeed');
  await ensureVetBiSeed();
  await ensureLivreurOrderAssignments();
  await ensureVetAppointmentsAssigned();
  await ensureVetClinicProfiles();
  await ensureMedicalDossiers();
  await ensureLeaveRequests();
  await ensureProductPromotions();
  await ensureProductRichDetails();
  await ensureReviewsAndComplaints();
  await ensureNutritionPlansAllClients();
  await ensureVetConsultationsDrafts();
}

async function seedMissing() {
  try {
    await connectDB();
    console.log('🔍 Checking SQLite for missing data...');

    await ensureUsers();
    const { ensureSingleAdmin } = require('../utils/singleAdmin');
    await ensureSingleAdmin();
    await ensurePets();
    const { ensureVetsByRegion } = require('../utils/ensureVetsByRegion');
    await ensureVetsByRegion();
    await ensureProducts();
    await ensureBlogArticles();
    await ensurePetVaccines();
    await ensureVeterinaryData();
    await ensureOrdersAndMessages();
    await ensureLivreurRegions();
    await ensureDemoFeeder();
    await ensureDemoNutritionPlans();
    await ensurePromoCodes();
    await ensurePlatformEnrichment();

    const counts = {
      users: await prisma.user.count(),
      products: await prisma.product.count(),
      orders: await prisma.order.count(),
      ordersAssigned: await prisma.order.count({ where: { assignedLivreurId: { not: null } } }),
      pets: await prisma.pet.count(),
      feeders: await prisma.petFeeder.count(),
      nutritionPlans: await prisma.nutritionPlan.count(),
      petVaccines: await prisma.petVaccine.count(),
      appointments: await prisma.petAppointment.count(),
      appointmentsWithVet: await prisma.petAppointment.count({ where: { vetId: { not: null } } }),
      consultations: await prisma.vetConsultation.count(),
      prescriptions: await prisma.prescription.count(),
      records: await prisma.veterinaryRecord.count(),
      promoCodes: await prisma.promoCode.count(),
      reviews: await prisma.review.count(),
      complaints: await prisma.complaint.count(),
      invoices: await prisma.invoice.count(),
      leaveRequests: await prisma.leaveRequest.count(),
      dossiers: await prisma.petMedicalDossier.count(),
      diseases: await prisma.disease.count(),
      medications: await prisma.vetMedication.count(),
      blogArticles: await prisma.blogArticle.count(),
    };
    console.log('📊 Current counts:', counts);
    console.log('✅ Done — missing data filled where needed.');
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ seed-missing error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

seedMissing();

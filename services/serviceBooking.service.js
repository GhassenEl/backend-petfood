const { prisma, isDemoMode } = require('../prismaClient');
const { useDemoStore } = require('../utils/demoUser');
const walletService = require('./wallet.service');
const { emitToUser } = require('../utils/notificationHub');

const SERVICE_CATALOG = [
  {
    type: 'grooming',
    label: 'Toilettage',
    description: 'Bain, coupe, griffes et soins esthétiques pour votre compagnon.',
    basePrice: 45,
    unit: 'session',
    durationHours: 2,
    icon: '✂️',
  },
  {
    type: 'boarding',
    label: 'Pension',
    description: 'Hébergement sécurisé avec repas et promenades quotidiennes.',
    basePrice: 35,
    unit: 'jour',
    durationHours: 24,
    icon: '🏠',
  },
  {
    type: 'training',
    label: 'Dressage',
    description: 'Séance d’éducation canine avec éducateur certifié PetfoodTN.',
    basePrice: 60,
    unit: 'session',
    durationHours: 1,
    icon: '🎓',
  },
  {
    type: 'pet_sitting',
    label: 'Garde d\'animaux',
    description: 'Garde à domicile par pet-sitter certifié.',
    basePrice: 28,
    unit: 'heure',
    durationHours: 2,
    icon: '🏠',
  },
  {
    type: 'dog_walking',
    label: 'Promenade',
    description: 'Promeneur canin certifié — sorties sécurisées.',
    basePrice: 22,
    unit: 'heure',
    durationHours: 1,
    icon: '🦮',
  },
  {
    type: 'home_visit',
    label: 'Visite à domicile',
    description: 'Visite de contrôle, repas, jeux à domicile.',
    basePrice: 35,
    unit: 'visite',
    durationHours: 1,
    icon: '🚪',
  },
];

const demoBookings = [];

const getUserId = (user) => user?.id || user?._id;

const shouldUseDemo = (user) => isDemoMode() || useDemoStore(user);

const catalogEntry = (type) => SERVICE_CATALOG.find((s) => s.type === type);

const computePrice = (type, startDate, endDate) => {
  const entry = catalogEntry(type);
  if (!entry) return 0;
  if (type === 'boarding' && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
    return days * entry.basePrice;
  }
  return entry.basePrice;
};

const buildDemoSlots = (dateStr) => {
  const base = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(base.getTime())) return [];
  const slots = [];
  for (const h of [9, 10, 11, 14, 15, 16, 17]) {
    const start = new Date(base);
    start.setHours(h, 0, 0, 0);
    slots.push({
      start: start.toISOString(),
      end: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      isAvailable: true,
    });
  }
  return slots;
};

const normalizeBooking = (row) => {
  if (!row) return row;
  const entry = catalogEntry(row.type);
  return {
    ...row,
    serviceLabel: entry?.label || row.type,
    serviceIcon: entry?.icon || '🐾',
  };
};

const getCatalog = () => SERVICE_CATALOG;

const getSlots = async (dateStr) => {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  if (isDemoMode()) {
    return { date, slots: buildDemoSlots(date) };
  }

  const slots = buildDemoSlots(date);
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const taken = await prisma.petAppointment.findMany({
    where: {
      category: 'service',
      date: { gte: dayStart, lt: dayEnd },
      status: { in: ['scheduled', 'confirmed'] },
    },
    select: { date: true },
  });

  const takenHours = new Set(
    taken.map((t) => new Date(t.date).getHours())
  );

  return {
    date,
    slots: slots.map((s) => ({
      ...s,
      isAvailable: !takenHours.has(new Date(s.start).getHours()),
    })),
  };
};

const listBookings = async (user) => {
  const userId = getUserId(user);
  if (shouldUseDemo(user)) {
    const list = demoBookings.filter(
      (b) => user.role === 'admin' || b.ownerId === userId
    );
    return list.map(normalizeBooking).sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  const where = user.role === 'admin'
    ? { category: 'service' }
    : { category: 'service', ownerId: userId };

  const rows = await prisma.petAppointment.findMany({
    where,
    orderBy: { date: 'desc' },
    include: {
      owner: { select: { id: true, name: true, email: true } },
    },
  });
  return rows.map(normalizeBooking);
};

const createBooking = async (user, payload) => {
  const userId = getUserId(user);
  const { type, petName, animalType, date, endDate, notes, slotStart } = payload;

  if (!catalogEntry(type)) {
    const err = new Error('Type de service invalide');
    err.status = 400;
    throw err;
  }
  if (!petName?.trim()) {
    const err = new Error('Nom de l’animal requis');
    err.status = 400;
    throw err;
  }

  const startDate = slotStart ? new Date(slotStart) : new Date(date);
  if (Number.isNaN(startDate.getTime())) {
    const err = new Error('Date invalide');
    err.status = 400;
    throw err;
  }

  if (type === 'boarding' && !endDate) {
    const err = new Error('Date de fin requise pour la pension');
    err.status = 400;
    throw err;
  }

  const price = computePrice(type, startDate, endDate ? new Date(endDate) : null);
  const entry = catalogEntry(type);
  const title = `${entry.label} — ${petName.trim()}`;

  if (shouldUseDemo(user)) {
    const booking = {
      id: `svc_${Date.now()}`,
      _id: `svc_${Date.now()}`,
      ownerId: userId,
      petName: petName.trim(),
      animalType: animalType || 'dog',
      type,
      category: 'service',
      title,
      date: startDate.toISOString(),
      endDate: endDate ? new Date(endDate).toISOString() : null,
      status: 'scheduled',
      notes: notes || null,
      price,
      paymentStatus: 'unpaid',
      paymentMethod: null,
      createdAt: new Date().toISOString(),
    };
    demoBookings.unshift(booking);

    try {
      const { emitToRole } = require('../utils/notificationHub');
      emitToRole('admin', {
        id: `booking-${booking.id}`,
        type: 'new_service_booking',
        title: `Réservation ${entry.label}`,
        description: `${petName} — ${price} DT`,
        link: '/admin/events',
        read: false,
        createdAt: booking.createdAt,
      });
    } catch { /* optional */ }

    return normalizeBooking(booking);
  }

  const booking = await prisma.petAppointment.create({
    data: {
      ownerId: userId,
      petName: petName.trim(),
      animalType: animalType || 'dog',
      type,
      category: 'service',
      title,
      date: startDate,
      endDate: endDate ? new Date(endDate) : null,
      notes: notes || null,
      price,
      paymentStatus: 'unpaid',
      status: 'scheduled',
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  try {
    const { emitToRole } = require('../utils/notificationHub');
    emitToRole('admin', {
      id: `booking-${booking.id}`,
      type: 'new_service_booking',
      title: `Réservation ${entry.label}`,
      description: `${petName} — ${price} DT`,
      link: '/admin/events',
      read: false,
      createdAt: booking.createdAt,
    });
  } catch { /* optional */ }

  return normalizeBooking(booking);
};

const payBooking = async (user, bookingId, paymentMethod) => {
  const userId = getUserId(user);
  const method = paymentMethod || 'wallet';

  let booking;
  if (shouldUseDemo(user)) {
    booking = demoBookings.find((b) => b.id === bookingId || b._id === bookingId);
    if (!booking) {
      const err = new Error('Réservation introuvable');
      err.status = 404;
      throw err;
    }
    if (booking.ownerId !== userId && user.role !== 'admin') {
      const err = new Error('Non autorisé');
      err.status = 403;
      throw err;
    }
    if (booking.paymentStatus === 'paid') {
      return normalizeBooking(booking);
    }

    if (method === 'wallet') {
      await walletService.debitWallet(
        booking.ownerId,
        booking.price,
        `Réservation ${booking.type}`,
        bookingId,
        user
      );
    }

    booking.paymentStatus = 'paid';
    booking.paymentMethod = method;
    booking.status = 'confirmed';

    emitToUser(booking.ownerId, {
      id: `pay-${bookingId}`,
      type: 'booking_paid',
      title: 'Réservation confirmée',
      description: `${booking.title} — paiement reçu`,
      link: '/client-services',
      read: false,
      createdAt: new Date().toISOString(),
    });

    return normalizeBooking(booking);
  }

  booking = await prisma.petAppointment.findUnique({ where: { id: bookingId } });
  if (!booking || booking.category !== 'service') {
    const err = new Error('Réservation introuvable');
    err.status = 404;
    throw err;
  }
  if (booking.ownerId !== userId && user.role !== 'admin') {
    const err = new Error('Non autorisé');
    err.status = 403;
    throw err;
  }
  if (booking.paymentStatus === 'paid') {
    return normalizeBooking(booking);
  }

  const price = booking.price || 0;
  if (method === 'wallet') {
    await walletService.debitWallet(userId, price, `Réservation ${booking.type}`, bookingId, user);
  }

  const updated = await prisma.petAppointment.update({
    where: { id: bookingId },
    data: {
      paymentStatus: 'paid',
      paymentMethod: method,
      status: 'confirmed',
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  emitToUser(booking.ownerId, {
    id: `pay-${bookingId}`,
    type: 'booking_paid',
    title: 'Réservation confirmée',
    description: `${updated.title || updated.type} — paiement reçu`,
    link: '/client-services',
    read: false,
    createdAt: new Date().toISOString(),
  });

  return normalizeBooking(updated);
};

const cancelBooking = async (user, bookingId) => {
  const userId = getUserId(user);

  if (shouldUseDemo(user)) {
    const idx = demoBookings.findIndex((b) => b.id === bookingId || b._id === bookingId);
    if (idx === -1) {
      const err = new Error('Réservation introuvable');
      err.status = 404;
      throw err;
    }
    const booking = demoBookings[idx];
    if (booking.ownerId !== userId && user.role !== 'admin') {
      const err = new Error('Non autorisé');
      err.status = 403;
      throw err;
    }
    if (booking.paymentStatus === 'paid') {
      await walletService.creditWallet(
        booking.ownerId,
        booking.price,
        'Remboursement annulation',
        bookingId,
        user
      );
    }
    booking.status = 'cancelled';
    return normalizeBooking(booking);
  }

  const booking = await prisma.petAppointment.findUnique({ where: { id: bookingId } });
  if (!booking || booking.category !== 'service') {
    const err = new Error('Réservation introuvable');
    err.status = 404;
    throw err;
  }
  if (booking.ownerId !== userId && user.role !== 'admin') {
    const err = new Error('Non autorisé');
    err.status = 403;
    throw err;
  }

  if (booking.paymentStatus === 'paid' && booking.price) {
    await walletService.creditWallet(
      booking.ownerId,
      booking.price,
      'Remboursement annulation',
      bookingId,
      user
    );
  }

  const updated = await prisma.petAppointment.update({
    where: { id: bookingId },
    data: { status: 'cancelled', paymentStatus: booking.paymentStatus === 'paid' ? 'refunded' : booking.paymentStatus },
  });
  return normalizeBooking(updated);
};

module.exports = {
  SERVICE_CATALOG,
  getCatalog,
  getSlots,
  listBookings,
  createBooking,
  payBooking,
  cancelBooking,
  computePrice,
};

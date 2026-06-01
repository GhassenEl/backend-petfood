const { prisma } = require('../prismaClient');

const COMMISSION_DT = 5;
const REGION_CENTERS = {
  Tunis: { lat: 36.8065, lng: 10.1815 },
  Ariana: { lat: 36.8625, lng: 10.1956 },
  Manouba: { lat: 36.8101, lng: 10.095 },
  Ben_Arous: { lat: 36.7533, lng: 10.2282 },
  'Ben Arous': { lat: 36.7533, lng: 10.2282 },
  Nabeul: { lat: 36.4513, lng: 10.7357 },
  Bizerte: { lat: 37.2744, lng: 9.8739 },
  Sousse: { lat: 35.8256, lng: 10.63699 },
  Sfax: { lat: 34.7406, lng: 10.7603 },
};

const parseCoords = (order) => {
  const raw = order.deliveryLocation;
  if (!raw) return null;
  try {
    const loc = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const lat = Number(loc?.lat);
    const lng = Number(loc?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  } catch { /* ignore */ }
  return null;
};

const haversineKm = (a, b) => {
  if (!a || !b) return 999;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const getLivreurContext = async (userId) => {
  const livreur = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, region: true, preferences: true, phone: true },
  });
  if (!livreur) return null;

  let availability = { isAvailable: true };
  try {
    if (livreur.preferences) {
      const prefs = JSON.parse(livreur.preferences);
      if (prefs.availability) availability = prefs.availability;
    }
  } catch { /* ignore */ }

  return { ...livreur, availability };
};

const regionOrderFilter = (region) => {
  if (!region) return {};
  return { OR: [{ region }, { region: null }] };
};

const getDashboard = async (userId) => {
  const ctx = await getLivreurContext(userId);
  if (!ctx) throw Object.assign(new Error('Livreur introuvable'), { status: 404 });

  const regionWhere = regionOrderFilter(ctx.region);
  const orders = await prisma.order.findMany({
    where: regionWhere,
    include: { items: { include: { product: true } }, user: { select: { name: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const today = new Date().toISOString().slice(0, 10);
  const mine = orders.filter((o) => o.assignedLivreurId === userId);
  const pool = orders.filter((o) => o.status === 'pending' && !o.assignedLivreurId);
  const active = orders.filter((o) => o.status === 'shipped' && o.assignedLivreurId === userId);
  const deliveredToday = orders.filter(
    (o) => o.status === 'delivered'
      && o.assignedLivreurId === userId
      && o.deliveredAt
      && o.deliveredAt.toISOString().slice(0, 10) === today
  );

  const alerts = [];
  if (!ctx.availability.isAvailable) {
    alerts.push({ level: 'info', code: 'offline', message: 'Vous êtes en pause — repassez disponible pour recevoir des courses.' });
  }
  if (pool.length > 0 && ctx.availability.isAvailable) {
    alerts.push({ level: 'warning', code: 'pool', message: `${pool.length} commande(s) en attente dans votre zone.` });
  }
  active.forEach((o) => {
    if (o.shippedAt) {
      const hours = (Date.now() - new Date(o.shippedAt).getTime()) / 3600000;
      if (hours > 4) {
        alerts.push({ level: 'critical', code: 'late', message: `Commande #${o.id.slice(-6)} en livraison depuis ${Math.round(hours)}h` });
      }
    }
  });

  return {
    livreur: { name: ctx.name, region: ctx.region, isAvailable: ctx.availability.isAvailable ?? true },
    stats: {
      todayDeliveries: deliveredToday.length,
      todayEarnings: deliveredToday.length * COMMISSION_DT,
      pendingPool: pool.length,
      activeDeliveries: active.length,
      totalDelivered: orders.filter((o) => o.status === 'delivered' && o.assignedLivreurId === userId).length,
      commissionPerDelivery: COMMISSION_DT,
    },
    alerts,
    pool: pool.slice(0, 8),
    active: active.slice(0, 8),
    recentDelivered: deliveredToday.slice(0, 5),
  };
};

const optimizeRoute = async (userId, { lat, lng } = {}) => {
  const ctx = await getLivreurContext(userId);
  const center = (Number.isFinite(lat) && Number.isFinite(lng))
    ? { lat, lng }
    : REGION_CENTERS[ctx?.region] || REGION_CENTERS.Tunis;

  const orders = await prisma.order.findMany({
    where: {
      ...regionOrderFilter(ctx?.region),
      status: { in: ['pending', 'shipped'] },
      OR: [{ assignedLivreurId: userId }, { assignedLivreurId: null }],
    },
    include: { user: { select: { name: true, phone: true } } },
  });

  const enriched = orders.map((o) => {
    const coords = parseCoords(o);
    const dist = coords ? haversineKm(center, coords) : 8 + (o.address?.length || 0) / 50;
    return { ...o, _distanceKm: Math.round(dist * 10) / 10, _hasGps: !!coords };
  });

  enriched.sort((a, b) => {
    if (a.status === 'shipped' && b.status !== 'shipped') return -1;
    if (b.status === 'shipped' && a.status !== 'shipped') return 1;
    if (a.assignedLivreurId === userId && b.assignedLivreurId !== userId) return -1;
    return a._distanceKm - b._distanceKm;
  });

  const totalKm = enriched.reduce((s, o) => s + o._distanceKm, 0);

  return {
    center,
    stops: enriched.map((o, i) => ({
      order: o,
      stopNumber: i + 1,
      distanceKm: o._distanceKm,
      hasGps: o._hasGps,
      mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.address || 'Tunis')}`,
    })),
    summary: {
      stopCount: enriched.length,
      estimatedKm: Math.round(totalKm * 10) / 10,
      estimatedMinutes: Math.round(totalKm * 4 + enriched.length * 8),
    },
  };
};

const getAdvancedStats = async (userId) => {
  const ctx = await getLivreurContext(userId);
  const orders = await prisma.order.findMany({
    where: { assignedLivreurId: userId },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const delivered = orders.filter((o) => o.status === 'delivered');
  const durations = delivered
    .filter((o) => o.shippedAt && o.deliveredAt)
    .map((o) => (new Date(o.deliveredAt) - new Date(o.shippedAt)) / 60000);

  const avgMinutes = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const weekDelivered = delivered.filter((o) => o.deliveredAt && new Date(o.deliveredAt) >= weekAgo);

  const byDay = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    byDay[key] = { date: key, label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }), count: 0, commission: 0 };
  }
  weekDelivered.forEach((o) => {
    const key = o.deliveredAt.toISOString().slice(0, 10);
    if (byDay[key]) {
      byDay[key].count += 1;
      byDay[key].commission += COMMISSION_DT;
    }
  });

  const statusBreakdown = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  return {
    region: ctx?.region,
    totalDelivered: delivered.length,
    totalCommission: delivered.length * COMMISSION_DT,
    weekDelivered: weekDelivered.length,
    weekCommission: weekDelivered.length * COMMISSION_DT,
    avgDeliveryMinutes: avgMinutes,
    onTimeRate: avgMinutes != null ? Math.min(100, Math.round(100 - Math.max(0, avgMinutes - 45) * 0.5)) : 95,
    commissionPerDelivery: COMMISSION_DT,
    dailyChart: Object.values(byDay),
    statusBreakdown,
  };
};

const reportIssue = async (userId, orderId, { subject, message }) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw Object.assign(new Error('Commande introuvable'), { status: 404 });

  const complaint = await prisma.complaint.create({
    data: {
      userId,
      subject: subject || `Problème livraison #${orderId.slice(-6)}`,
      message: message || 'Signalement livreur',
      orderId,
      status: 'pending',
    },
  });
  return complaint;
};

const updateGpsPosition = async (userId, { lat, lng }) => {
  const livreur = await prisma.user.findUnique({ where: { id: userId } });
  if (!livreur) throw Object.assign(new Error('Livreur introuvable'), { status: 404 });

  let prefs = {};
  try { prefs = livreur.preferences ? JSON.parse(livreur.preferences) : {}; } catch { prefs = {}; }
  prefs.lastGps = { lat, lng, at: new Date().toISOString() };

  await prisma.user.update({
    where: { id: userId },
    data: { preferences: JSON.stringify(prefs) },
  });
  return prefs.lastGps;
};

const claimOrder = async (userId, orderId) => {
  const ctx = await getLivreurContext(userId);
  if (!ctx?.availability?.isAvailable) {
    throw Object.assign(new Error('Passez en disponible pour prendre une course'), { status: 403 });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw Object.assign(new Error('Commande introuvable'), { status: 404 });
  if (order.status !== 'pending') {
    throw Object.assign(new Error('Cette commande n\'est plus disponible'), { status: 400 });
  }
  if (order.assignedLivreurId && order.assignedLivreurId !== userId) {
    throw Object.assign(new Error('Commande déjà prise par un autre livreur'), { status: 409 });
  }
  if (ctx.region && order.region && order.region !== ctx.region) {
    throw Object.assign(new Error('Commande hors de votre région'), { status: 403 });
  }

  const orderService = require('./order.service');
  return orderService.livreurUpdateStatus(orderId, { id: userId, role: 'livreur' }, 'shipped');
};

const getActiveMission = async (userId) => {
  const order = await prisma.order.findFirst({
    where: { assignedLivreurId: userId, status: 'shipped' },
    orderBy: { shippedAt: 'asc' },
    include: {
      user: { select: { name: true, phone: true } },
      items: { include: { product: { select: { name: true } } } },
    },
  });

  if (!order) return { active: false };

  let livreurGps = null;
  const livreur = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  try {
    const prefs = livreur?.preferences ? JSON.parse(livreur.preferences) : {};
    livreurGps = prefs.lastGps;
  } catch { /* ignore */ }

  const dest = parseCoords(order);
  const distanceKm = dest && livreurGps
    ? Math.round(haversineKm(livreurGps, dest) * 10) / 10
    : null;

  return {
    active: true,
    order: {
      id: order.id,
      total: order.total,
      address: order.address,
      phone: order.phone,
      status: order.status,
      shippedAt: order.shippedAt,
      clientName: order.user?.name,
      items: order.items,
    },
    navigation: {
      distanceKm,
      mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.address || 'Tunis')}`,
      hasGps: !!dest,
    },
  };
};

const completeDelivery = async (userId, orderId, payload) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw Object.assign(new Error('Commande introuvable'), { status: 404 });
  if (order.assignedLivreurId !== userId) {
    throw Object.assign(new Error('Cette course ne vous est pas assignée'), { status: 403 });
  }
  if (order.status !== 'shipped') {
    throw Object.assign(new Error('Statut invalide pour clôturer la livraison'), { status: 400 });
  }

  const orderService = require('./order.service');
  return orderService.livreurUpdateStatus(
    orderId,
    { id: userId, role: 'livreur' },
    'delivered',
    {
      deliveryNote: payload.deliveryNote,
    }
  );
};

module.exports = {
  COMMISSION_DT,
  getDashboard,
  optimizeRoute,
  getAdvancedStats,
  reportIssue,
  updateGpsPosition,
  claimOrder,
  getActiveMission,
  completeDelivery,
  parseCoords,
  haversineKm,
};

const { prisma, isDemoMode } = require('../../prismaClient');

const uid = (u) => String(u?.id || u?._id);

/** Coordonnées démo Tunis */
const TUNIS_CENTER = { lat: 36.8065, lng: 10.1815 };

const REGION_COORDS = {
  tunis: { lat: 36.8065, lng: 10.1815 },
  ariana: { lat: 36.8665, lng: 10.1647 },
  ben_arous: { lat: 36.7533, lng: 10.2283 },
  manouba: { lat: 36.8101, lng: 10.0972 },
  sfax: { lat: 34.7406, lng: 10.7603 },
  sousse: { lat: 35.8256, lng: 10.63699 },
};

const regionToCoords = (region) => {
  const key = String(region || 'tunis')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  return REGION_COORDS[key] || TUNIS_CENTER;
};

const haversineKm = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const etaMinutesFromKm = (km, avgSpeedKmh = 28) => Math.max(5, Math.round((km / avgSpeedKmh) * 60));

const simulateLivreurPosition = (dest, progress) => {
  const warehouse = { lat: TUNIS_CENTER.lat + 0.02, lng: TUNIS_CENTER.lng - 0.03 };
  const p = Math.min(0.98, Math.max(0.05, progress));
  return {
    lat: warehouse.lat + (dest.lat - warehouse.lat) * p,
    lng: warehouse.lng + (dest.lng - warehouse.lng) * p,
    heading: Math.round(Math.atan2(dest.lat - warehouse.lat, dest.lng - warehouse.lng) * (180 / Math.PI)),
  };
};

const trackOneOrder = (order, now = Date.now()) => {
  const dest = regionToCoords(order.region);
  const shippedAt = order.shippedAt ? new Date(order.shippedAt).getTime() : now - 20 * 60000;
  const elapsedMin = (now - shippedAt) / 60000;
  const totalEta = order._demoTotalEta || 35;
  const progress = Math.min(0.95, elapsedMin / totalEta);
  const livreur = simulateLivreurPosition(dest, progress);
  const kmLeft = haversineKm(livreur, dest) * (1 - progress * 0.3);
  const etaMinutes = Math.max(3, Math.round(totalEta * (1 - progress)));

  return {
    orderId: order.id,
    status: order.deliveryStatus || order.status,
    address: order.address,
    region: order.region,
    destination: dest,
    livreur: {
      ...livreur,
      name: order.livreurName || 'Livreur PetfoodTN',
      speedKmh: 28,
    },
    distanceKmRemaining: Math.round(kmLeft * 100) / 100,
    etaMinutes,
    etaWindow: `${etaMinutes - 5}-${etaMinutes + 10} min`,
    estimatedArrival: new Date(now + etaMinutes * 60000).toISOString(),
    progressPercent: Math.round(progress * 100),
    live: true,
    model: 'geo_eta_v1',
  };
};

const getActiveDeliveries = async (user) => {
  const userId = uid(user);

  if (isDemoMode()) {
    const now = Date.now();
    return {
      active: [
        {
          orderId: 'demo_order_live',
          status: 'en_route',
          address: '12 Rue de la Liberté, Tunis',
          region: 'Tunis',
          destination: TUNIS_CENTER,
          livreur: simulateLivreurPosition(TUNIS_CENTER, 0.62),
          distanceKmRemaining: 2.1,
          etaMinutes: 14,
          etaWindow: '10-24 min',
          estimatedArrival: new Date(now + 14 * 60000).toISOString(),
          progressPercent: 62,
          live: true,
          model: 'geo_eta_v1',
        },
      ],
      mapCenter: TUNIS_CENTER,
    };
  }

  const orders = await prisma.order.findMany({
    where: {
      userId,
      status: { in: ['processing', 'shipped', 'paid'] },
      OR: [
        { deliveryStatus: { in: ['pending', 'assigned', 'en_route', 'shipped'] } },
        { shippedAt: { not: null } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });

  const active = orders
    .filter((o) => !o.deliveredAt)
    .map((o) => trackOneOrder(o));

  return {
    active,
    mapCenter: active[0]?.destination || TUNIS_CENTER,
  };
};

const getDeliveryByOrderId = async (user, orderId) => {
  const userId = uid(user);
  if (isDemoMode() && String(orderId).startsWith('demo')) {
    return getActiveDeliveries(user).then((r) => ({ tracking: r.active[0] }));
  }
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) {
    const err = new Error('Commande introuvable');
    err.status = 404;
    throw err;
  }
  return { tracking: trackOneOrder(order) };
};

module.exports = { getActiveDeliveries, getDeliveryByOrderId, regionToCoords, haversineKm };

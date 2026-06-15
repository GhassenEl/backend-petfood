const { prisma, isDemoMode } = require('../../prismaClient');

const RELAY_TYPES = {
  pet_shop: { id: 'pet_shop', label: 'Animalerie partenaire', icon: '🏪' },
  vet_clinic: { id: 'vet_clinic', label: 'Clinique vétérinaire', icon: '🩺' },
};

const DEMO_RELAY_POINTS = [
  {
    id: 'relay_anim_1',
    name: 'Animalerie Les Pattes Heureuses',
    type: 'pet_shop',
    address: '12 Av. de la République, Tunis',
    region: 'Tunis',
    city: 'Tunis',
    lat: 36.8065,
    lng: 10.1815,
    phone: '+216 71 200 101',
    hours: 'Lun-Sam 09:00-20:00',
    partnerCode: 'ANIM-TUN-01',
    pickupFee: 0,
    etaHours: 24,
  },
  {
    id: 'relay_anim_2',
    name: 'Pet Shop La Marsa',
    type: 'pet_shop',
    address: '45 Rue de France, La Marsa',
    region: 'Tunis',
    city: 'La Marsa',
    lat: 36.878,
    lng: 10.325,
    phone: '+216 71 745 220',
    hours: 'Tous les jours 10:00-21:00',
    partnerCode: 'ANIM-MAR-02',
    pickupFee: 0,
    etaHours: 24,
  },
  {
    id: 'relay_anim_3',
    name: 'Animalerie Sfax Centre',
    type: 'pet_shop',
    address: 'Bd Majida Boulilla, Sfax',
    region: 'Sfax',
    city: 'Sfax',
    lat: 34.74,
    lng: 10.76,
    phone: '+216 74 294 110',
    hours: '08:30-19:30',
    partnerCode: 'ANIM-SFX-03',
    pickupFee: 0,
    etaHours: 48,
  },
  {
    id: 'relay_vet_1',
    name: 'Clinique Vétérinaire Carthage',
    type: 'vet_clinic',
    address: 'Rue Hannibal, Carthage Byrsa',
    region: 'Tunis',
    city: 'Carthage',
    lat: 36.854,
    lng: 10.323,
    phone: '+216 71 733 400',
    hours: 'Lun-Ven 08:00-18:00, Sam 09:00-13:00',
    partnerCode: 'VET-CAR-01',
    pickupFee: 0,
    etaHours: 24,
  },
  {
    id: 'relay_vet_2',
    name: 'Cabinet Vet\'Ariana',
    type: 'vet_clinic',
    address: 'Cité Ennasr, Ariana',
    region: 'Ariana',
    city: 'Ariana',
    lat: 36.862,
    lng: 10.195,
    phone: '+216 71 717 550',
    hours: 'Lun-Sam 08:30-19:00',
    partnerCode: 'VET-ARI-02',
    pickupFee: 0,
    etaHours: 24,
  },
  {
    id: 'relay_vet_3',
    name: 'Clinique du Parc — Sousse',
    type: 'vet_clinic',
    address: 'Av. Habib Bourguiba, Sousse',
    region: 'Sousse',
    city: 'Sousse',
    lat: 35.825,
    lng: 10.636,
    phone: '+216 73 220 880',
    hours: 'Lun-Ven 09:00-17:30',
    partnerCode: 'VET-SOU-03',
    pickupFee: 0,
    etaHours: 48,
  },
];

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const mapPoint = (p, distanceKm = null) => ({
  ...p,
  typeLabel: RELAY_TYPES[p.type]?.label || p.type,
  typeIcon: RELAY_TYPES[p.type]?.icon || '📍',
  distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
});

const seedRelayPoints = async () => {
  if (isDemoMode()) return;
  try {
    const count = await prisma.partnerRelayPoint.count();
    if (count > 0) return;
    await prisma.partnerRelayPoint.createMany({
      data: DEMO_RELAY_POINTS.map(({ pickupFee, etaHours, ...rest }) => rest),
    });
  } catch (err) {
    console.warn('Points relais: seed ignoré', err.message);
  }
};

const listRelayPoints = async (query = {}) => {
  await seedRelayPoints();

  const typeFilter = query.type;
  const regionFilter = query.region;
  const lat = query.lat != null ? parseFloat(query.lat) : null;
  const lng = query.lng != null ? parseFloat(query.lng) : null;
  const radius = parseFloat(query.radius || 50);

  let points = [];

  if (isDemoMode()) {
    points = [...DEMO_RELAY_POINTS];
  } else {
    const where = { isActive: true };
    if (typeFilter && RELAY_TYPES[typeFilter]) where.type = typeFilter;
    if (regionFilter) where.region = { contains: regionFilter };
    points = await prisma.partnerRelayPoint.findMany({ where, orderBy: { name: 'asc' } });
    if (!points.length) points = [...DEMO_RELAY_POINTS];
  }

  if (typeFilter && isDemoMode()) {
    points = points.filter((p) => p.type === typeFilter);
  }
  if (regionFilter && isDemoMode()) {
    points = points.filter(
      (p) => p.region?.toLowerCase().includes(String(regionFilter).toLowerCase())
    );
  }

  let mapped = points.map((p) => mapPoint(p));
  if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    mapped = mapped
      .map((p) => {
        if (p.lat == null || p.lng == null) return { ...p, distanceKm: null };
        const d = haversineKm(lat, lng, p.lat, p.lng);
        return mapPoint(p, d);
      })
      .filter((p) => p.distanceKm == null || p.distanceKm <= radius)
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  }

  const petShops = mapped.filter((p) => p.type === 'pet_shop').length;
  const vetClinics = mapped.filter((p) => p.type === 'vet_clinic').length;

  return {
    types: Object.values(RELAY_TYPES),
    kpis: { total: mapped.length, petShops, vetClinics },
    points: mapped,
    pickupInfo: {
      label: 'Retrait gratuit en point relais partenaire',
      maxWaitDays: 5,
      idRequired: true,
    },
  };
};

const getRelayPointById = async (id) => {
  if (isDemoMode()) {
    const found = DEMO_RELAY_POINTS.find((p) => p.id === id);
    if (!found) {
      const err = new Error('Point relais introuvable');
      err.status = 404;
      throw err;
    }
    return mapPoint(found);
  }
  const row = await prisma.partnerRelayPoint.findFirst({
    where: { id, isActive: true },
  });
  if (!row) {
    const err = new Error('Point relais introuvable');
    err.status = 404;
    throw err;
  }
  return mapPoint(row);
};

module.exports = {
  RELAY_TYPES,
  listRelayPoints,
  getRelayPointById,
  seedRelayPoints,
};

const { prisma, isDemoMode } = require('../prismaClient');
const {
  DEFAULT_PLATFORM_CITIES,
  slugify,
  cityToStore,
} = require('../utils/tunisiaCities');

let memCities = DEFAULT_PLATFORM_CITIES.map((c, i) => ({
  ...c,
  id: `city-${i + 1}`,
  slug: slugify(c.name),
  isActive: true,
  deliveryEnabled: true,
  pickupEnabled: true,
  launchDate: new Date(Date.now() - (90 - i * 5) * 86400000).toISOString(),
}));

const ensureSeeded = async () => {
  if (isDemoMode()) return memCities;
  try {
    const count = await prisma.platformCity.count();
    if (count > 0) return prisma.platformCity.findMany({ orderBy: [{ priority: 'desc' }, { name: 'asc' }] });

    for (const c of DEFAULT_PLATFORM_CITIES) {
      await prisma.platformCity.upsert({
        where: { slug: slugify(c.name) },
        create: {
          name: c.name,
          slug: slugify(c.name),
          governorate: c.governorate,
          lat: c.lat,
          lng: c.lng,
          isActive: true,
          deliveryEnabled: true,
          pickupEnabled: true,
          priority: c.priority,
          storeAddress: c.storeAddress,
          storePhone: c.storePhone,
          storeHours: c.storeHours,
          launchDate: new Date(),
        },
        update: {},
      });
    }
    return prisma.platformCity.findMany({ orderBy: [{ priority: 'desc' }, { name: 'asc' }] });
  } catch {
    return DEFAULT_PLATFORM_CITIES.map((c, i) => ({
      ...c,
      id: `city-${i + 1}`,
      slug: slugify(c.name),
      isActive: true,
      deliveryEnabled: true,
      pickupEnabled: true,
    }));
  }
};

const countByRegion = async (role) => {
  if (isDemoMode()) {
    return {
      Tunis: 3, Ariana: 2, 'La Marsa': 1, Sfax: 2, Sousse: 2, Nabeul: 1, Hammamet: 1,
      Bizerte: 1, Monastir: 1, Mahdia: 1, Gabès: 1, Kairouan: 1, Gafsa: 1, Djerba: 1, Tozeur: 1,
    };
  }
  const rows = await prisma.user.groupBy({
    by: ['region'],
    where: { role, isActive: true, region: { not: null } },
    _count: { id: true },
  });
  const map = {};
  rows.forEach((r) => { map[r.region] = r._count.id; });
  return map;
};

const buildCityStats = async (cities) => {
  let livreurs = {};
  let vendors = {};
  let vets = {};
  let relays = {};
  try {
    [livreurs, vendors, vets, relays] = await Promise.all([
      countByRegion('livreur'),
      isDemoMode()
        ? { Tunis: 2, Sfax: 1, Sousse: 1, Nabeul: 1 }
        : prisma.vendor.groupBy({ by: ['region'], where: { isActive: true }, _count: { id: true } })
            .then((rows) => Object.fromEntries(rows.map((r) => [r.region, r._count.id])))
            .catch(() => ({})),
      countByRegion('vet'),
      isDemoMode()
        ? { Tunis: 3, Sfax: 2, Sousse: 2, Nabeul: 1, Bizerte: 1 }
        : prisma.partnerRelayPoint.groupBy({ by: ['region'], where: { isActive: true }, _count: { id: true } })
            .then((rows) => Object.fromEntries(rows.map((r) => [r.region || 'Autre', r._count.id])))
            .catch(() => ({})),
    ]);
  } catch {
    livreurs = await countByRegion('livreur');
    vendors = {};
    vets = await countByRegion('vet');
    relays = {};
  }

  return cities.map((city) => {
    const name = city.name;
    const gov = city.governorate;
    return {
      ...city,
      stats: {
        livreurs: livreurs[name] || livreurs[gov] || 0,
        vendors: vendors[name] || vendors[gov] || 0,
        vets: vets[name] || vets[gov] || 0,
        relayPoints: relays[name] || relays[gov] || 0,
        coverageScore: Math.min(100, (
          (livreurs[name] ? 25 : 0)
          + (vendors[name] || vendors[gov] ? 25 : 0)
          + (vets[name] || vets[gov] ? 25 : 0)
          + (relays[name] || relays[gov] ? 25 : 0)
        )),
      },
    };
  });
};

const getPack = async () => {
  const cities = await ensureSeeded();
  const enriched = await buildCityStats(cities);
  const active = enriched.filter((c) => c.isActive);
  return {
    mode: isDemoMode() ? 'demo' : 'live',
    stats: {
      totalCities: enriched.length,
      activeCities: active.length,
      governorates: [...new Set(enriched.map((c) => c.governorate))].length,
      deliveryZones: active.filter((c) => c.deliveryEnabled).length,
      pickupPoints: active.filter((c) => c.pickupEnabled).length,
    },
    cities: enriched,
    governorates: [...new Set(enriched.map((c) => c.governorate))].sort(),
  };
};

const getPublicCities = async () => {
  const pack = await getPack();
  return {
    cities: pack.cities
      .filter((c) => c.isActive)
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        governorate: c.governorate,
        lat: c.lat,
        lng: c.lng,
        deliveryEnabled: c.deliveryEnabled,
        pickupEnabled: c.pickupEnabled,
        store: cityToStore(c),
        stats: c.stats,
      })),
    stats: pack.stats,
  };
};

const getStoreLocations = async (query = {}) => {
  const pack = await getPublicCities();
  let stores = pack.cities.map((c) => c.store);

  const { lat, lng, radius = 80, city } = query;
  if (city) {
    const q = String(city).toLowerCase();
    stores = stores.filter((s) => s.city?.toLowerCase() === q || s.governorate?.toLowerCase() === q);
  }

  if (lat && lng) {
    const haversine = (lat1, lng1, lat2, lng2) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    const plat = parseFloat(lat);
    const plng = parseFloat(lng);
    const pr = parseFloat(radius);
    stores = stores
      .map((s) => ({ ...s, distanceKm: Number(haversine(plat, plng, s.lat, s.lng).toFixed(1)) }))
      .filter((s) => s.distanceKm <= pr)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  return stores;
};

const updateCity = async (id, patch) => {
  if (isDemoMode()) {
    memCities = memCities.map((c) => (c.id === id ? { ...c, ...patch } : c));
    return memCities.find((c) => c.id === id);
  }
  return prisma.platformCity.update({ where: { id }, data: patch });
};

const upsertCity = async (body) => {
  const data = {
    name: body.name?.trim(),
    slug: slugify(body.name),
    governorate: body.governorate,
    lat: Number(body.lat),
    lng: Number(body.lng),
    isActive: body.isActive !== false,
    deliveryEnabled: body.deliveryEnabled !== false,
    pickupEnabled: body.pickupEnabled !== false,
    priority: Number(body.priority || 0),
    storeAddress: body.storeAddress,
    storePhone: body.storePhone,
    storeHours: body.storeHours,
  };
  if (isDemoMode()) {
    const existing = memCities.find((c) => c.slug === slugify(body.name) || c.name === body.name);
    if (existing) {
      memCities = memCities.map((c) => (c.id === existing.id ? { ...c, ...data } : c));
      return memCities.find((c) => c.id === existing.id);
    }
    const row = { ...data, id: body.id || `city-${Date.now()}`, launchDate: new Date().toISOString() };
    memCities = [...memCities, row];
    return row;
  }
  if (body.id) return prisma.platformCity.update({ where: { id: body.id }, data });
  return prisma.platformCity.upsert({
    where: { slug: slugify(body.name) },
    create: { ...data, launchDate: new Date() },
    update: data,
  });
};

const exportCities = async () => {
  const pack = await getPack();
  return {
    exportedAt: new Date().toISOString(),
    stats: pack.stats,
    cities: pack.cities.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      governorate: c.governorate,
      lat: c.lat,
      lng: c.lng,
      isActive: c.isActive,
      deliveryEnabled: c.deliveryEnabled,
      pickupEnabled: c.pickupEnabled,
      priority: c.priority,
      storeAddress: c.storeAddress,
      storePhone: c.storePhone,
      storeHours: c.storeHours,
      coverageScore: c.stats?.coverageScore,
    })),
  };
};

const importCities = async (rows) => {
  if (!Array.isArray(rows) || !rows.length) {
    const err = new Error('Aucune ville à importer');
    err.status = 400;
    throw err;
  }
  const results = [];
  const errors = [];
  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) {
      errors.push({ row, error: 'name requis' });
      continue;
    }
    try {
      const r = await upsertCity({
        id: row.id || undefined,
        name,
        governorate: row.governorate || row.gouvernorat || 'Tunis',
        lat: Number(row.lat),
        lng: Number(row.lng),
        isActive: row.isActive !== false && String(row.isactive ?? row.is_active ?? 'true').toLowerCase() !== 'false',
        deliveryEnabled: row.deliveryenabled !== false && String(row.delivery_enabled ?? 'true').toLowerCase() !== 'false',
        pickupEnabled: row.pickupenabled !== false && String(row.pickup_enabled ?? 'true').toLowerCase() !== 'false',
        priority: Number(row.priority || 0),
        storeAddress: row.storeaddress || row.store_address || row.address,
        storePhone: row.storephone || row.store_phone || row.phone,
        storeHours: row.storehours || row.store_hours || row.hours,
      });
      results.push(r);
    } catch (e) {
      errors.push({ name, error: e.message });
    }
  }
  return { imported: results.length, errors: errors.length, results, errors };
};

/** Liste des noms de villes/régions actives — source unique pour tous les acteurs. */
const getRegionNames = async () => {
  const pack = await getPublicCities();
  const names = (pack.cities || [])
    .filter((c) => c.isActive !== false)
    .map((c) => c.name)
    .filter(Boolean);
  return [...new Set(names)];
};

module.exports = {
  getPack,
  getPublicCities,
  getStoreLocations,
  getRegionNames,
  updateCity,
  upsertCity,
  ensureSeeded,
  exportCities,
  importCities,
};

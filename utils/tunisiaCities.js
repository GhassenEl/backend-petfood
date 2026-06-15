/** Villes et zones de couverture PetfoodTN — Tunisie */

const slugify = (name) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const DEFAULT_PLATFORM_CITIES = [
  { name: 'Tunis', governorate: 'Tunis', lat: 36.8065, lng: 10.1815, priority: 100, storeAddress: 'Centre-ville Tunis', storePhone: '+216 71 960 000', storeHours: '09:00 - 21:00' },
  { name: 'Ariana', governorate: 'Ariana', lat: 36.8625, lng: 10.1956, priority: 95, storeAddress: 'Route Ariana La Soukra', storePhone: '+216 71 717 171', storeHours: '08:00 - 20:00' },
  { name: 'La Marsa', governorate: 'Tunis', lat: 36.878, lng: 10.3247, priority: 90, storeAddress: 'Av. Habib Bourguiba, La Marsa', storePhone: '+216 71 745 000', storeHours: '09:00 - 22:00' },
  { name: 'Lac 1', governorate: 'Tunis', lat: 36.837, lng: 10.242, priority: 88, storeAddress: 'Les Berges du Lac 1', storePhone: '+216 71 960 100', storeHours: '09:00 - 21:00' },
  { name: 'Sfax', governorate: 'Sfax', lat: 34.7406, lng: 10.7603, priority: 85, storeAddress: 'Route Sfax Gabès Km 4', storePhone: '+216 74 294 000', storeHours: '08:30 - 19:30' },
  { name: 'Sousse', governorate: 'Sousse', lat: 35.8256, lng: 10.637, priority: 84, storeAddress: 'Avenue Habib Bourguiba, Sousse', storePhone: '+216 73 220 000', storeHours: '08:30 - 20:00' },
  { name: 'Nabeul', governorate: 'Nabeul', lat: 36.4513, lng: 10.7357, priority: 80, storeAddress: 'Centre-ville Nabeul', storePhone: '+216 72 280 000', storeHours: '09:00 - 19:00' },
  { name: 'Hammamet', governorate: 'Nabeul', lat: 36.4, lng: 10.6167, priority: 78, storeAddress: 'Zone touristique Hammamet', storePhone: '+216 72 260 000', storeHours: '09:00 - 20:00' },
  { name: 'Bizerte', governorate: 'Bizerte', lat: 37.2744, lng: 9.8739, priority: 75, storeAddress: 'Port de Bizerte', storePhone: '+216 72 430 000', storeHours: '08:30 - 19:00' },
  { name: 'Monastir', governorate: 'Monastir', lat: 35.7643, lng: 10.8113, priority: 74, storeAddress: 'Avenue de la République', storePhone: '+216 73 460 000', storeHours: '08:30 - 19:30' },
  { name: 'Mahdia', governorate: 'Mahdia', lat: 35.5028, lng: 11.0627, priority: 72, storeAddress: 'Centre Mahdia', storePhone: '+216 73 690 000', storeHours: '09:00 - 19:00' },
  { name: 'Gabès', governorate: 'Gabès', lat: 33.8815, lng: 10.0982, priority: 70, storeAddress: 'Zone industrielle Gabès', storePhone: '+216 75 270 000', storeHours: '08:30 - 18:30' },
  { name: 'Kairouan', governorate: 'Kairouan', lat: 35.6781, lng: 10.0963, priority: 68, storeAddress: 'Médina Kairouan', storePhone: '+216 77 230 000', storeHours: '09:00 - 18:00' },
  { name: 'Gafsa', governorate: 'Gafsa', lat: 34.425, lng: 8.7842, priority: 65, storeAddress: 'Avenue Habib Bourguiba, Gafsa', storePhone: '+216 76 220 000', storeHours: '08:30 - 18:00' },
  { name: 'Djerba', governorate: 'Médenine', lat: 33.875, lng: 10.8575, priority: 64, storeAddress: 'Houmt Souk, Djerba', storePhone: '+216 75 650 000', storeHours: '09:00 - 20:00' },
  { name: 'Tozeur', governorate: 'Tozeur', lat: 33.9197, lng: 8.1335, priority: 60, storeAddress: 'Avenue Bourguiba, Tozeur', storePhone: '+216 76 452 000', storeHours: '09:00 - 18:00' },
];

const DELIVERY_REGIONS = DEFAULT_PLATFORM_CITIES.map((c) => c.name);

const REGION_MATCHERS = [
  { region: 'Djerba', patterns: ['djerba', 'houmt souk', 'midoun'] },
  { region: 'Hammamet', patterns: ['hammamet', 'yasmine'] },
  { region: 'Sidi Bou Said', patterns: ['sidi bou said', 'sidi-bou-said'] },
  { region: 'La Marsa', patterns: ['la marsa', 'marsa'] },
  { region: 'Le Kram', patterns: ['le kram', 'kram'] },
  { region: 'Carthage', patterns: ['carthage'] },
  { region: 'Lac 1', patterns: ['lac leman', 'lac victoria', 'berges du lac', 'les berges du lac', 'lac 1', 'lac 2', 'lac'] },
  { region: 'Ariana', patterns: ['ariana', 'la soukra', 'soukra', 'raoued', 'mnihla'] },
  { region: 'Manouba', patterns: ['manouba', 'oued ellil'] },
  { region: 'Sfax', patterns: ['sfax'] },
  { region: 'Sousse', patterns: ['sousse', 'msaken', 'kalaa'] },
  { region: 'Nabeul', patterns: ['nabeul', 'korba', 'kelibia'] },
  { region: 'Bizerte', patterns: ['bizerte', 'menzel bourguiba'] },
  { region: 'Monastir', patterns: ['monastir', 'moknine'] },
  { region: 'Mahdia', patterns: ['mahdia', 'chebba'] },
  { region: 'Gabès', patterns: ['gabes', 'gabès', 'matmata'] },
  { region: 'Kairouan', patterns: ['kairouan'] },
  { region: 'Gafsa', patterns: ['gafsa', 'metlaoui'] },
  { region: 'Tozeur', patterns: ['tozeur', 'nefta'] },
  { region: 'Tunis', patterns: ['tunis', 'bardo', 'le belvédère'] },
];

const resolveRegionFromAddress = (address) => {
  if (!address || typeof address !== 'string') return null;
  const normalized = address.toLowerCase();

  for (const { region, patterns } of REGION_MATCHERS) {
    if (patterns.some((pattern) => normalized.includes(pattern))) {
      return region;
    }
  }

  return 'Tunis';
};

const cityToStore = (city) => ({
  id: city.slug || slugify(city.name),
  name: `PetfoodTN ${city.name}`,
  city: city.name,
  governorate: city.governorate,
  address: city.storeAddress || `${city.name}, Tunisie`,
  lat: city.lat,
  lng: city.lng,
  phone: city.storePhone || '+216 71 000 000',
  hours: city.storeHours || '09:00 - 20:00',
  deliveryEnabled: city.deliveryEnabled !== false,
  pickupEnabled: city.pickupEnabled !== false,
});

module.exports = {
  DEFAULT_PLATFORM_CITIES,
  DELIVERY_REGIONS,
  REGION_MATCHERS,
  resolveRegionFromAddress,
  slugify,
  cityToStore,
};

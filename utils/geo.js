const REGION_COORDS = {
  Tunis: { lat: 36.8065, lng: 10.1815 },
  Ariana: { lat: 36.855, lng: 10.196 },
  Manouba: { lat: 36.8101, lng: 10.0972 },
  'La Marsa': { lat: 36.867, lng: 10.32 },
  Carthage: { lat: 36.8528, lng: 10.3236 },
  'Le Kram': { lat: 36.8331, lng: 10.3057 },
  'Sidi Bou Said': { lat: 36.8687, lng: 10.3417 },
  Lac: { lat: 36.837, lng: 10.242 },
};

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const parseUserLocation = (location) => {
  if (!location) return null;

  if (typeof location === 'object') {
    const lat = parseFloat(location.lat);
    const lng = parseFloat(location.lng);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { lat, lng };
    }
    return null;
  }

  if (typeof location !== 'string') return null;

  const trimmed = location.trim();
  if (trimmed.startsWith('{')) {
    try {
      return parseUserLocation(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  const parts = trimmed.split(',').map((s) => parseFloat(s.trim()));
  if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
};

const coordsFromRegion = (region) => {
  if (!region) return REGION_COORDS.Tunis;
  return REGION_COORDS[region] || REGION_COORDS.Tunis;
};

const sortByDistance = (items, lat, lng) =>
  items
    .map((item) => ({
      ...item,
      distance: Math.round(haversineKm(lat, lng, item.lat, item.lng) * 10) / 10,
    }))
    .sort((a, b) => a.distance - b.distance);

module.exports = {
  REGION_COORDS,
  haversineKm,
  parseUserLocation,
  coordsFromRegion,
  sortByDistance,
};

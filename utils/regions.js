const DELIVERY_REGIONS = [
  'Tunis',
  'Ariana',
  'Manouba',
  'La Marsa',
  'Carthage',
  'Le Kram',
  'Sidi Bou Said',
  'Lac',
];

const REGION_MATCHERS = [
  { region: 'Sidi Bou Said', patterns: ['sidi bou said', 'sidi-bou-said'] },
  { region: 'La Marsa', patterns: ['la marsa'] },
  { region: 'Le Kram', patterns: ['le kram'] },
  { region: 'Carthage', patterns: ['carthage'] },
  { region: 'Ariana', patterns: ['ariana', 'la soukra', 'soukra'] },
  { region: 'Manouba', patterns: ['manouba'] },
  { region: 'Lac', patterns: ['lac leman', 'lac victoria', 'berges du lac', 'les berges du lac', 'lac 1', 'lac 2'] },
  { region: 'Tunis', patterns: ['tunis'] },
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

module.exports = {
  DELIVERY_REGIONS,
  resolveRegionFromAddress,
};

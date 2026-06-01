const PLATFORM_EVENT_TYPES = [
  { value: 'anniversaire', label: 'Anniversaire' },
  { value: 'competitions', label: 'Compétition' },
  { value: 'salle de sport', label: 'Salle de sport' },
  { value: 'coiffure', label: 'Coiffure / toilettage' },
  { value: 'cadeau', label: 'Cadeau / promo' },
  { value: 'autre', label: 'Autre' },
];

const PLATFORM_EVENT_TYPE_VALUES = new Set(PLATFORM_EVENT_TYPES.map((t) => t.value));

const VET_APPOINTMENT_TYPES = new Set([
  'veterinary_consultation',
  'veterinary_home_visit',
  'veterinary_teleconsultation',
  'vaccination',
  'checkup',
  'dental_cleaning',
  'surgery_followup',
  'grooming',
]);

const inferCategory = (record) => {
  if (record?.category === 'event' || record?.category === 'vet') {
    return record.category;
  }
  if (record?.type && PLATFORM_EVENT_TYPE_VALUES.has(record.type)) {
    return 'event';
  }
  return 'vet';
};

const eventTypeLabel = (value) =>
  PLATFORM_EVENT_TYPES.find((t) => t.value === value)?.label || value || 'Autre';

const normalizeEventRow = (row) => {
  if (!row) return row;
  const category = inferCategory(row);
  return {
    ...row,
    category,
    title: row.title || row.petName || eventTypeLabel(row.type),
    description: row.notes || row.description || null,
  };
};

module.exports = {
  PLATFORM_EVENT_TYPES,
  PLATFORM_EVENT_TYPE_VALUES,
  VET_APPOINTMENT_TYPES,
  inferCategory,
  eventTypeLabel,
  normalizeEventRow,
};

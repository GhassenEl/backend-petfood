const PLATFORM_EVENT_TYPES = [
  { value: 'anniversaire', label: 'Anniversaire' },
  { value: 'competitions', label: 'Concours' },
  { value: 'concours', label: 'Concours canin / félin' },
  { value: 'exposition', label: 'Exposition' },
  { value: 'journee_adoption', label: "Journée d'adoption" },
  { value: 'salle de sport', label: 'Salle de sport' },
  { value: 'coiffure', label: 'Coiffure / toilettage' },
  { value: 'cadeau', label: 'Cadeau / promo' },
  { value: 'autre', label: 'Autre' },
];

const ANIMAL_EVENT_TYPE_VALUES = new Set([
  'competitions',
  'concours',
  'exposition',
  'journee_adoption',
  'cadeau',
]);

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

const {
  parseEventPrizes,
  isCompetitionEvent,
  DEFAULT_COMPETITION_PRIZES,
} = require('./eventPrizes');

const isAnimalCommunityEvent = (type) => ANIMAL_EVENT_TYPE_VALUES.has(type) || isCompetitionEvent(type);

const normalizeEventRow = (row) => {
  if (!row) return row;
  const category = inferCategory(row);
  const registrations = row.registrations || row._count?.registrations;
  const regCount = Array.isArray(registrations)
    ? registrations.length
    : typeof row.registrationsCount === 'number'
      ? row.registrationsCount
      : row._count?.registrations ?? 0;
  return {
    ...row,
    category,
    isAnimalEvent: isAnimalCommunityEvent(row.type),
    isCompetition: isCompetitionEvent(row.type),
    title: row.title || row.petName || eventTypeLabel(row.type),
    description: row.notes || row.description || null,
    eventVenue: row.eventVenue || null,
    eventCapacity: row.eventCapacity ?? null,
    competitionStatus: row.competitionStatus || 'open',
    prizes: parseEventPrizes(row.eventPrizes).length
      ? parseEventPrizes(row.eventPrizes)
      : isCompetitionEvent(row.type)
        ? DEFAULT_COMPETITION_PRIZES
        : [],
    registrationsCount: regCount,
    userRegistered: Boolean(row.userRegistered),
    userPrize: row.userPrize || null,
  };
};

module.exports = {
  PLATFORM_EVENT_TYPES,
  PLATFORM_EVENT_TYPE_VALUES,
  ANIMAL_EVENT_TYPE_VALUES,
  VET_APPOINTMENT_TYPES,
  inferCategory,
  isAnimalCommunityEvent,
  eventTypeLabel,
  normalizeEventRow,
};

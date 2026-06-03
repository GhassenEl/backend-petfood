const SPECIES = [
  { id: 'dog', label: 'Chien', feederDefaultGrams: 35 },
  { id: 'cat', label: 'Chat', feederDefaultGrams: 25 },
  { id: 'bird', label: 'Oiseau', feederDefaultGrams: 8 },
  { id: 'fish', label: 'Poisson', feederDefaultGrams: 3 },
  { id: 'rabbit', label: 'Lapin', feederDefaultGrams: 15 },
  { id: 'hamster', label: 'Hamster', feederDefaultGrams: 5 },
  { id: 'reptile', label: 'Reptile', feederDefaultGrams: 4 },
  { id: 'other', label: 'Autre', feederDefaultGrams: 20 },
];

const gramsForPet = (pet) => {
  const base = SPECIES.find((s) => s.id === pet?.type)?.feederDefaultGrams ?? 20;
  const w = Number(pet?.weight);
  if (!w || w <= 0) return base;
  if (pet.type === 'dog') return Math.min(80, Math.round(w * 1.8));
  if (pet.type === 'cat') return Math.min(55, Math.round(w * 2.2));
  if (pet.type === 'rabbit') return Math.min(40, Math.round(w * 3));
  if (pet.type === 'bird') return Math.min(15, Math.round(w * 4));
  return base;
};

module.exports = { SPECIES, gramsForPet };

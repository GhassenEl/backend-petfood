const bcrypt = require('bcryptjs');
const { prisma, isDemoMode } = require('../prismaClient');
const { DELIVERY_REGIONS } = require('./regions');
const { REGION_COORDS } = require('./geo');

const DEFAULT_VET_PASSWORD = 'Vet2024!';

/** Un profil vétérinaire par région de livraison PetfoodTN */
const REGION_VET_PROFILES = [
  {
    region: 'Tunis',
    email: 'vet.tunis@petfood.tn',
    name: 'Dr. Karim Ben Ammar',
    phone: '+216 71 240 100',
    address: 'Cabinet vétérinaire Tunis Centre, Avenue Habib Bourguiba',
  },
  {
    region: 'Ariana',
    email: 'vet@petfood.tn',
    name: 'Dr. Salma Khelifi',
    phone: '+216 22 111 222',
    address: 'Clinique PetfoodTN, Ariana',
  },
  {
    region: 'Manouba',
    email: 'vet.manouba@petfood.tn',
    name: 'Dr. Fares Jebali',
    phone: '+216 71 520 300',
    address: 'Clinique vétérinaire Manouba, Avenue de la République',
  },
  {
    region: 'La Marsa',
    email: 'vet.lamarsa@petfood.tn',
    name: 'Dr. Nadia Bouzid',
    phone: '+216 71 745 100',
    address: 'Cabinet vétérinaire La Marsa',
  },
  {
    region: 'Carthage',
    email: 'vet.carthage@petfood.tn',
    name: 'Dr. Leila Gharbi',
    phone: '+216 71 730 200',
    address: 'Centre véto Carthage, Rue de Rome',
  },
  {
    region: 'Le Kram',
    email: 'vet.lekram@petfood.tn',
    name: 'Dr. Mohamed Sassi',
    phone: '+216 71 735 400',
    address: 'Cabinet vétérinaire Le Kram',
  },
  {
    region: 'Sidi Bou Said',
    email: 'vet.sidibousaid@petfood.tn',
    name: 'Dr. Yasmine Mejri',
    phone: '+216 71 740 500',
    address: 'Clinique vétérinaire Sidi Bou Said',
  },
  {
    region: 'Lac',
    email: 'vet.lac@petfood.tn',
    name: 'Dr. Ines Trabelsi',
    phone: '+216 71 960 200',
    address: 'Centre véto Berges du Lac',
  },
];

const locationJson = (region) => {
  const coords = REGION_COORDS[region] || REGION_COORDS.Tunis;
  return JSON.stringify({ lat: coords.lat, lng: coords.lng });
};

const buildDemoVetLocations = () =>
  REGION_VET_PROFILES.map((profile) => {
    const coords = REGION_COORDS[profile.region] || REGION_COORDS.Tunis;
    return {
      id: `vet_${profile.region.replace(/\s+/g, '_').toLowerCase()}`,
      ...profile,
      lat: coords.lat,
      lng: coords.lng,
    };
  });

const getRegionVetCoverage = async () => {
  if (isDemoMode()) {
    return DELIVERY_REGIONS.map((region) => ({
      region,
      vetCount: 1,
      covered: true,
      vets: buildDemoVetLocations()
        .filter((v) => v.region === region)
        .map((v) => ({ name: v.name, email: v.email, phone: v.phone })),
    }));
  }

  const vets = await prisma.user.findMany({
    where: { role: 'vet', isActive: true },
    select: { id: true, name: true, email: true, phone: true, region: true },
  });

  return DELIVERY_REGIONS.map((region) => {
    const regionVets = vets.filter((v) => v.region === region);
    return {
      region,
      vetCount: regionVets.length,
      covered: regionVets.length > 0,
      vets: regionVets.map((v) => ({ id: v.id, name: v.name, email: v.email, phone: v.phone })),
    };
  });
};

const ensureVetsByRegion = async () => {
  if (isDemoMode()) {
    return { created: 0, updated: 0, skipped: true };
  }

  const hashedPassword = await bcrypt.hash(DEFAULT_VET_PASSWORD, 12);
  let created = 0;
  let updated = 0;

  for (const profile of REGION_VET_PROFILES) {
    const existingInRegion = await prisma.user.count({
      where: { role: 'vet', region: profile.region, isActive: true },
    });
    if (existingInRegion > 0) continue;

    const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });

    if (byEmail) {
      if (byEmail.role === 'vet') {
        await prisma.user.update({
          where: { email: profile.email },
          data: {
            region: profile.region,
            address: profile.address,
            phone: profile.phone,
            location: locationJson(profile.region),
            isActive: true,
          },
        });
        updated += 1;
      }
      continue;
    }

    await prisma.user.create({
      data: {
        email: profile.email,
        password: hashedPassword,
        name: profile.name,
        role: 'vet',
        region: profile.region,
        phone: profile.phone,
        address: profile.address,
        location: locationJson(profile.region),
        isActive: true,
      },
    });
    created += 1;
  }

  const coverage = await getRegionVetCoverage();
  const uncovered = coverage.filter((c) => !c.covered).map((c) => c.region);

  if (created || updated) {
    console.log(`🩺 Vétérinaires par région : ${created} créé(s), ${updated} mis à jour`);
  }
  if (uncovered.length) {
    console.warn(`⚠️ Régions sans vétérinaire actif : ${uncovered.join(', ')}`);
  } else {
    console.log(`✅ Couverture vétérinaire : ${DELIVERY_REGIONS.length}/${DELIVERY_REGIONS.length} régions`);
  }

  return { created, updated, coverage, uncovered };
};

module.exports = {
  REGION_VET_PROFILES,
  DEFAULT_VET_PASSWORD,
  buildDemoVetLocations,
  getRegionVetCoverage,
  ensureVetsByRegion,
};

const { prisma, isDemoMode } = require('../prismaClient');
const { isVetOrAdmin } = require('../middleware/auth');
const { parseUserLocation, coordsFromRegion, sortByDistance } = require('../utils/geo');
const { resolveRegionFromAddress, DELIVERY_REGIONS } = require('../utils/regions');
const {
  buildDemoVetLocations,
  getRegionVetCoverage,
} = require('../utils/ensureVetsByRegion');

const DEMO_VET_LOCATIONS = buildDemoVetLocations();
const getUserId = (req) => req.user?.id || req.user?._id;

const demoVeterinaryRecords = [
  {
    _id: 'vet_demo_1',
    petName: 'Rex',
    animalType: 'dog',
    breed: 'Berger allemand',
    sex: 'male',
    birthDate: new Date('2021-03-12T00:00:00Z'),
    identificationNumber: 'TN-DOG-0001',
    sterilized: false,
    allergies: 'Aucune allergie connue',
    diet: 'Croquettes premium chien actif',
    activityLevel: 'high',
    chronicDiseases: '',
    ownerId: { _id: 'demo_client', name: 'Client Test', email: 'client@petfood.tn' },
    ownerName: 'Client Test',
    visitDate: new Date('2026-04-20T10:00:00Z'),
    diagnosis: 'Vaccination annuelle',
    treatment: 'Vaccin DHLPP',
    vetNotes: 'Chien en bonne santé, prochain rappel dans 1 an',
    nextVisit: new Date('2027-04-20T10:00:00Z'),
    weight: 28.5,
    temperature: 38.5,
    medications: [{ name: 'Vaccin DHLPP', dosage: '1 dose', frequency: 'unique' }],
    status: 'active',
    createdAt: new Date('2026-04-20T10:00:00Z'),
    updatedAt: new Date('2026-04-20T10:00:00Z')
  },
  {
    _id: 'vet_demo_2',
    petName: 'Mimi',
    animalType: 'cat',
    breed: 'Europeen',
    sex: 'female',
    birthDate: new Date('2022-09-08T00:00:00Z'),
    identificationNumber: 'TN-CAT-0002',
    sterilized: true,
    allergies: 'Sensibilite saumon',
    diet: 'Patee equilibree chat adulte',
    activityLevel: 'normal',
    chronicDiseases: '',
    ownerId: { _id: 'demo_client', name: 'Client Test', email: 'client@petfood.tn' },
    ownerName: 'Client Test',
    visitDate: new Date('2026-04-15T14:30:00Z'),
    diagnosis: 'Contrôle dentaire',
    treatment: 'Nettoyage dentaire',
    vetNotes: 'Légère plaque dentaire, recommandé brossage régulier',
    nextVisit: new Date('2026-10-15T14:30:00Z'),
    weight: 4.2,
    temperature: 38.2,
    medications: [{ name: 'Pâte dentifrice', dosage: 'petit pois', frequency: 'quotidien' }],
    status: 'active',
    createdAt: new Date('2026-04-15T14:30:00Z'),
    updatedAt: new Date('2026-04-15T14:30:00Z')
  },
  {
    _id: 'vet_demo_3',
    petName: 'Tweety',
    animalType: 'bird',
    breed: 'Canari',
    sex: 'unknown',
    birthDate: new Date('2023-01-20T00:00:00Z'),
    identificationNumber: '',
    sterilized: null,
    allergies: '',
    diet: 'Melange graines et vitamines',
    activityLevel: 'normal',
    chronicDiseases: '',
    ownerId: { _id: 'demo_admin', name: 'El JEzi Ghassen', email: 'admin@petfood.tn' },
    ownerName: 'El JEzi Ghassen',
    visitDate: new Date('2026-04-10T09:00:00Z'),
    diagnosis: 'Contrôle général',
    treatment: 'Suppléments vitamines',
    vetNotes: 'Oiseau actif, plumes en bon état',
    nextVisit: new Date('2026-07-10T09:00:00Z'),
    weight: 0.035,
    temperature: 41.0,
    medications: [{ name: 'Vitamines oiseaux', dosage: '2 gouttes', frequency: 'quotidien' }],
    status: 'active',
    createdAt: new Date('2026-04-10T09:00:00Z'),
    updatedAt: new Date('2026-04-10T09:00:00Z')
  }
];

const getRecords = async (req, res) => {
  try {
    if (isDemoMode()) {
      const records = isVetOrAdmin(req)
        ? demoVeterinaryRecords
        : demoVeterinaryRecords.filter(r => r.ownerId._id === req.user.id);
      return res.json(records);
    }

    const where = isVetOrAdmin(req) ? {} : { ownerId: getUserId(req) };
    const records = await prisma.veterinaryRecord.findMany({
      where,
      orderBy: { visitDate: 'desc' },
      include: { owner: { select: { name: true, email: true } } }
    });
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getRecord = async (req, res) => {
  try {
    if (isDemoMode()) {
      const record = demoVeterinaryRecords.find(r => r._id === req.params.id);
      if (!record) return res.status(404).json({ error: 'Record not found' });
      if (req.user.role !== 'admin' && req.user.role !== 'vet' && record.ownerId._id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      return res.json(record);
    }

    const record = await prisma.veterinaryRecord.findUnique({
      where: { id: req.params.id },
      include: { owner: { select: { name: true, email: true, phone: true } } }
    });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    // ownerId can be stored as a scalar or relation id depending on Prisma schema.
    const recordOwnerId = record.ownerId ?? record.owner?._id ?? record.owner?.id;
    if (req.user.role !== 'admin' && req.user.role !== 'vet' && String(recordOwnerId) !== String(getUserId(req))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    res.json(record);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createRecord = async (req, res) => {
  try {
    if (isDemoMode()) {
      const newRecord = {
        _id: `vet_demo_${Date.now()}`,
        ...req.body,
        ownerId: { _id: req.body.ownerId, name: 'Client', email: 'client@demo.tn' },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      demoVeterinaryRecords.unshift(newRecord);
      return res.status(201).json(newRecord);
    }

    const record = await prisma.veterinaryRecord.create({
      data: {
        ownerId: req.body.ownerId || getUserId(req),
        petName: req.body.petName,
        animalType: req.body.animalType,
        breed: req.body.breed || null,
        sex: req.body.sex || null,
        birthDate: req.body.birthDate ? new Date(req.body.birthDate) : null,
        identificationNumber: req.body.identificationNumber || null,
        sterilized: req.body.sterilized === undefined || req.body.sterilized === '' ? null : Boolean(req.body.sterilized),
        allergies: req.body.allergies || null,
        diet: req.body.diet || null,
        activityLevel: req.body.activityLevel || null,
        chronicDiseases: req.body.chronicDiseases || null,
        ownerName: req.body.ownerName,
        visitDate: new Date(req.body.visitDate),
        diagnosis: req.body.diagnosis,
        treatment: req.body.treatment,
        vetNotes: req.body.vetNotes,
        nextVisit: req.body.nextVisit ? new Date(req.body.nextVisit) : null,
        weight: req.body.weight,
        temperature: req.body.temperature,
        medications: req.body.medications,
        status: req.body.status || 'active'
      },
      include: { owner: { select: { name: true, email: true } } }
    });

    res.status(201).json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateRecord = async (req, res) => {
  try {
    if (isDemoMode()) {
      const idx = demoVeterinaryRecords.findIndex(r => r._id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Record not found' });
      demoVeterinaryRecords[idx] = {
        ...demoVeterinaryRecords[idx],
        ...req.body,
        updatedAt: new Date()
      };
      return res.json(demoVeterinaryRecords[idx]);
    }

    const existing = await prisma.veterinaryRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Record not found' });

    const existingOwnerId = existing.ownerId ?? existing.owner?._id ?? existing.owner?.id;
    if (req.user.role !== 'admin' && req.user.role !== 'vet' && String(existingOwnerId) !== String(getUserId(req))) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // If record doesn't match the provided id, Prisma would throw. We prefer a consistent 404.
    const record = await prisma.veterinaryRecord.update({
      where: { id: req.params.id },
      data: {

        ...req.body,
        birthDate: req.body.birthDate ? new Date(req.body.birthDate) : existing.birthDate,
        visitDate: req.body.visitDate ? new Date(req.body.visitDate) : existing.visitDate,
        nextVisit: req.body.nextVisit ? new Date(req.body.nextVisit) : existing.nextVisit,
        updatedAt: new Date()
      },
      include: { owner: { select: { name: true, email: true } } }
    });


    res.json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteRecord = async (req, res) => {
  try {
    if (isDemoMode()) {
      const idx = demoVeterinaryRecords.findIndex(r => r._id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Record not found' });
      demoVeterinaryRecords.splice(idx, 1);
      return res.json({ message: 'Record deleted' });
    }

    const existing = await prisma.veterinaryRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Record not found' });

    const existingOwnerId = existing.ownerId ?? existing.owner?._id ?? existing.owner?.id;
    if (req.user.role !== 'admin' && req.user.role !== 'vet' && String(existingOwnerId) !== String(getUserId(req))) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.veterinaryRecord.delete({ where: { id: req.params.id } });

    res.json({ message: 'Record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUpcomingVisits = async (req, res) => {
  try {
    if (isDemoMode()) {
      const now = new Date();
      const records = demoVeterinaryRecords
        .filter(r => new Date(r.nextVisit) >= now && r.status === 'active')
        .sort((a, b) => new Date(a.nextVisit) - new Date(b.nextVisit));
      const filtered = isVetOrAdmin(req)
        ? records
        : records.filter(r => r.ownerId._id === req.user.id);
      return res.json(filtered.slice(0, 10));
    }

    const where = {
      nextVisit: { gte: new Date() },
      status: 'active',
      ...(req.user.role !== 'admin' && req.user.role !== 'vet' ? { ownerId: getUserId(req) } : {})
    };

    const records = await prisma.veterinaryRecord.findMany({
      where,
      orderBy: { nextVisit: 'asc' },
      take: 10,
      include: { owner: { select: { name: true, email: true } } }
    });
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const demoVaccines = [
  {
    _id: 'vaccine1',
    petId: 'demo_pet1',
    vaccineName: 'DHLPP',
    dateAdministered: new Date('2026-04-01'),
    nextDue: new Date('2027-04-01'),
    vetName: 'Dr. Smith'
  },
  {
    _id: 'vaccine2',
    petId: 'demo_pet1',
    vaccineName: 'Rage',
    dateAdministered: new Date('2026-03-15'),
    nextDue: new Date('2028-03-15'),
    vetName: 'Dr. Smith'
  }
];

const demoAppointments = [
  {
    _id: 'appt1',
    petId: 'demo_pet1',
    date: new Date('2026-05-15'),
    reason: 'Contrôle annuel',
    status: 'confirmed'
  }
];

const getVaccines = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoVaccines);
    }
    const vaccines = await prisma.petVaccine.findMany({
      where: { ownerId: getUserId(req) },
      orderBy: { dateAdministered: 'desc' }
    });
    res.json(vaccines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createVaccine = async (req, res) => {
  try {
    if (isDemoMode()) {
      const newVaccine = { _id: `vaccine${demoVaccines.length + 1}`, ...req.body, dateAdministered: new Date() };
      demoVaccines.unshift(newVaccine);
      return res.status(201).json(newVaccine);
    }

    const vaccine = await prisma.petVaccine.create({
      data: {
        ownerId: getUserId(req),
        petName: req.body.petName,
        animalType: req.body.animalType,
        vaccineType: req.body.vaccineType,
        dateAdministered: req.body.dateAdministered ? new Date(req.body.dateAdministered) : new Date(),
        expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : null,
        nextDue: req.body.nextDue ? new Date(req.body.nextDue) : null,
        batchNumber: req.body.batchNumber,
        vetNotes: req.body.vetNotes,
        status: req.body.status || 'up_to_date'
      }
    });

    res.status(201).json(vaccine);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAppointments = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoAppointments);
    }
    const appointments = await prisma.petAppointment.findMany({
      where: { ownerId: getUserId(req) },
      orderBy: { date: 'asc' }
    });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createAppointment = async (req, res) => {
  try {
    if (isDemoMode()) {
      const newAppt = { _id: `appt${demoAppointments.length + 1}`, ...req.body, date: new Date(req.body.date) };
      demoAppointments.unshift(newAppt);
      return res.status(201).json(newAppt);
    }
    const appointment = await prisma.petAppointment.create({
      data: {
        ownerId: getUserId(req),
        petName: req.body.petName,
        animalType: req.body.animalType,
        type: req.body.type,
        date: new Date(req.body.date),
        status: req.body.status || 'scheduled',
        notes: req.body.notes,
        reminderSent: req.body.reminderSent || false
      }
    });
    res.status(201).json(appointment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getPetRecords = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoVeterinaryRecords);
    }
    const records = await prisma.veterinaryRecord.findMany({
      where: { ownerId: getUserId(req) }
    });
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const buildVetLocation = (user) => {
  const parsed = parseUserLocation(user.location);
  const coords = parsed || coordsFromRegion(user.region);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    address: user.address || user.region || null,
    region: user.region || null,
    lat: coords.lat,
    lng: coords.lng,
  };
};

const getNearbyVets = async (req, res) => {
  try {
    const { lat, lng, radius = 80, region: regionParam } = req.query;
    let vets = [];
    let clientRegion = regionParam ? String(regionParam).trim() : null;
    let searchMode = 'default';
    let userLat;
    let userLng;

    if (!isDemoMode() && req.user?.id) {
      const client = await prisma.user.findUnique({
        where: { id: getUserId(req) },
        select: { region: true, address: true, location: true },
      });
      if (client && !clientRegion) {
        clientRegion = client.region || resolveRegionFromAddress(client.address);
      }
      if (!lat && !lng && client?.location) {
        const parsed = parseUserLocation(client.location);
        if (parsed) {
          userLat = parsed.lat;
          userLng = parsed.lng;
        }
      }
    }

    if (lat && lng) {
      userLat = parseFloat(lat);
      userLng = parseFloat(lng);
      if (!Number.isNaN(userLat) && !Number.isNaN(userLng)) {
        searchMode = 'gps';
      }
    }

    if ((userLat == null || userLng == null) && clientRegion) {
      const coords = coordsFromRegion(clientRegion);
      userLat = coords.lat;
      userLng = coords.lng;
      if (searchMode === 'default') searchMode = 'region';
    }

    if (userLat == null || userLng == null) {
      userLat = 36.8065;
      userLng = 10.1815;
      clientRegion = clientRegion || 'Tunis';
      searchMode = 'default';
    }

    if (isDemoMode()) {
      vets = DEMO_VET_LOCATIONS.map((v) => ({ ...v }));
    } else {
      const dbVets = await prisma.user.findMany({
        where: { role: 'vet' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          region: true,
          location: true,
        },
      });
      vets = dbVets.map(buildVetLocation);
      const knownEmails = new Set(vets.map((v) => v.email).filter(Boolean));
      for (const demo of DEMO_VET_LOCATIONS) {
        if (!knownEmails.has(demo.email)) {
          vets.push({ ...demo });
        }
      }
      if (vets.length === 0) {
        vets = DEMO_VET_LOCATIONS.map((v) => ({ ...v }));
      }
    }

    const maxKm = parseFloat(radius) || 80;
    const normalizedClientRegion = clientRegion?.toLowerCase();

    const allVetsSorted = sortByDistance(vets, userLat, userLng);

    vets = allVetsSorted
      .filter((v) => v.distance <= maxKm)
      .map((v) => ({
        ...v,
        sameRegion: Boolean(
          normalizedClientRegion &&
          v.region &&
          v.region.toLowerCase() === normalizedClientRegion
        ),
      }))
      .sort((a, b) => {
        if (a.sameRegion && !b.sameRegion) return -1;
        if (!a.sameRegion && b.sameRegion) return 1;
        return a.distance - b.distance;
      });

    if (clientRegion) {
      const hasRegionVet = vets.some(
        (v) => v.region && v.region.toLowerCase() === normalizedClientRegion
      );
      if (!hasRegionVet) {
        const regionVet = allVetsSorted.find(
          (v) => v.region && v.region.toLowerCase() === normalizedClientRegion
        );
        if (regionVet) {
          vets.unshift({ ...regionVet, sameRegion: true, regionalPrimary: true });
        }
      }
    }

    const regionCoverage = isDemoMode()
      ? DELIVERY_REGIONS.map((region) => ({
          region,
          vetCount: 1,
          covered: true,
        }))
      : await getRegionVetCoverage();

    res.json({
      vets,
      meta: {
        clientRegion: clientRegion || null,
        searchMode,
        regions: DELIVERY_REGIONS,
        center: { lat: userLat, lng: userLng },
        regionCoverage,
        allRegionsCovered: regionCoverage.every((c) => c.covered),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getUpcomingVisits,
  getVaccines,
  createVaccine,
  getAppointments,
  createAppointment,
  getPetRecords,
  getNearbyVets,
};



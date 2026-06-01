const crypto = require('crypto');
const { prisma, isDemoMode } = require('../prismaClient');

const resolveOwnerId = (value) => {
  if (value == null) return null;
  if (typeof value === 'object') return value.id || value._id || null;
  return value;
};

const demoDossiers = [];
const demoEntries = [];

const generateDossierNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `DMP-${year}-`;
  const count = await prisma.petMedicalDossier.count({
    where: { dossierNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(5, '0')}`;
};

const buildSignaturePayload = (entry, vetId, signedAt) =>
  JSON.stringify({
    entryId: entry.id,
    dossierId: entry.dossierId,
    title: entry.title,
    diagnosis: entry.diagnosis,
    treatment: entry.treatment,
    symptoms: entry.symptoms,
    clinicalExam: entry.clinicalExam,
    medications: entry.medications,
    recommendations: entry.recommendations,
    visitDate: entry.visitDate?.toISOString?.() || entry.visitDate,
    vetId,
    signedAt: signedAt.toISOString(),
  });

const computeSignatureHash = (payload) =>
  crypto.createHash('sha256').update(payload).digest('hex');

const mapDossier = (d) => ({
  ...d,
  _id: d.id,
  entryCount: d._count?.entries ?? d.entries?.length ?? 0,
  signedCount: d.entries?.filter((e) => e.isSigned).length ?? d.signedCount ?? 0,
  prescriptionCount: d.prescriptionCount ?? d.prescriptions?.length ?? 0,
});

const fetchPrescriptionsForDossier = async (dossier) => {
  if (isDemoMode()) {
    return [
      {
        id: `demo_rx_${dossier.id}`,
        petName: dossier.petName,
        animalType: dossier.animalType,
        medications: JSON.stringify([
          { name: 'Antiparasitaire', dosage: '1 comprimé', frequency: '1x/mois' },
        ]),
        instructions: 'Administrer avec un repas.',
        status: 'active',
        validUntil: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        vet: { id: 'demo_vet', name: 'Dr. Ben Ali', email: 'vet@petfood.tn' },
        consultation: { diagnosis: 'Contrôle de routine' },
      },
    ];
  }

  return prisma.prescription.findMany({
    where: {
      ownerId: resolveOwnerId(dossier.ownerId) || dossier.ownerId,
      petName: dossier.petName,
    },
    include: {
      vet: { select: { id: true, name: true, email: true, phone: true } },
      consultation: { select: { id: true, diagnosis: true, appointmentId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

const attachPrescriptionCounts = async (dossiers, ownerId) => {
  if (!ownerId || !dossiers.length || isDemoMode()) {
    return dossiers.map((d) => ({ ...d, prescriptionCount: isDemoMode() ? 1 : 0 }));
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { ownerId },
    select: { petName: true },
  });

  const countByPet = prescriptions.reduce((acc, rx) => {
    const key = String(rx.petName || '').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return dossiers.map((d) => ({
    ...d,
    prescriptionCount: countByPet[String(d.petName || '').toLowerCase()] || 0,
  }));
};

const listDossiers = async ({ ownerId, vetId } = {}) => {
  if (isDemoMode()) {
    let list = demoDossiers.map((d) => ({
      ...d,
      entries: demoEntries.filter((e) => e.dossierId === d.id),
    }));
    if (ownerId) list = list.filter((d) => d.ownerId === ownerId);
    if (vetId) {
      list = list.filter(
        (d) => d.createdByVetId === vetId || d.entries.some((e) => e.vetId === vetId)
      );
    }
    return list.map((d) =>
      mapDossier({
        ...d,
        _count: { entries: d.entries.length },
        signedCount: d.entries.filter((e) => e.isSigned).length,
        prescriptionCount: 1,
      })
    );
  }

  const where = {};
  if (ownerId) where.ownerId = ownerId;
  if (vetId) {
    where.OR = [
      { createdByVetId: vetId },
      { entries: { some: { vetId } } },
    ];
  }

  const dossiers = await prisma.petMedicalDossier.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { entries: true } },
      entries: { where: { isSigned: true }, select: { id: true } },
    },
  });

  return attachPrescriptionCounts(
    dossiers.map((d) =>
      mapDossier({
        ...d,
        signedCount: d.entries.length,
        entries: undefined,
      })
    ),
    ownerId
  );
};

const getDossierById = async (id, { ownerId } = {}) => {
  if (isDemoMode()) {
    const dossier = demoDossiers.find((d) => d.id === id);
    if (!dossier) return null;
    if (ownerId && dossier.ownerId !== ownerId) return null;
    const entries = demoEntries
      .filter((e) => e.dossierId === id)
      .sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate));
    const prescriptions = await fetchPrescriptionsForDossier(dossier);
    return mapDossier({ ...dossier, entries, prescriptions, _count: { entries: entries.length } });
  }

  const dossier = await prisma.petMedicalDossier.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true } },
      creator: { select: { id: true, name: true } },
      pet: true,
      entries: {
        orderBy: { visitDate: 'desc' },
        include: { signer: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!dossier) return null;
  const dossierOwnerId = resolveOwnerId(dossier.ownerId);
  if (ownerId && String(dossierOwnerId) !== String(ownerId)) return null;

  const prescriptions = await fetchPrescriptionsForDossier({ ...dossier, ownerId: dossierOwnerId });
  return mapDossier({ ...dossier, prescriptions });
};

const createDossierFromPet = async ({ ownerId, petId, petName, vetId }) => {
  if (isDemoMode()) {
    const existing = demoDossiers.find(
      (d) => d.ownerId === ownerId && (petId ? d.petId === petId : d.petName === petName)
    );
    if (existing) return mapDossier(existing);

    const dossier = {
      id: `demo_dossier_${Date.now()}`,
      dossierNumber: `DMP-${new Date().getFullYear()}-${String(demoDossiers.length + 1).padStart(5, '0')}`,
      ownerId,
      petId: petId || null,
      petName: petName || 'Animal',
      animalType: 'dog',
      status: 'active',
      createdByVetId: vetId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    demoDossiers.unshift(dossier);
    return mapDossier(dossier);
  }

  if (petId) {
    const byPet = await prisma.petMedicalDossier.findUnique({ where: { petId } });
    if (byPet) return mapDossier(byPet);
  }

  const existing = await prisma.petMedicalDossier.findFirst({
    where: { ownerId, petName },
  });
  if (existing) return mapDossier(existing);

  let pet = null;
  if (petId) {
    pet = await prisma.pet.findUnique({ where: { id: petId } });
  } else if (petName) {
    pet = await prisma.pet.findFirst({ where: { ownerId, name: petName } });
  }

  const dossierNumber = await generateDossierNumber();
  const dossier = await prisma.petMedicalDossier.create({
    data: {
      dossierNumber,
      ownerId,
      petId: pet?.id || petId || null,
      petName: pet?.name || petName,
      animalType: pet?.type || 'dog',
      breed: pet?.breed || null,
      birthDate: pet?.birthDate || null,
      allergies: null,
      chronicDiseases: null,
      diet: null,
      createdByVetId: vetId || null,
    },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });

  return mapDossier(dossier);
};

const updateDossierIdentity = async (id, data) => {
  const allowed = [
    'breed', 'sex', 'birthDate', 'identificationNumber', 'sterilized',
    'allergies', 'chronicDiseases', 'diet', 'bloodType', 'status',
  ];
  const patch = {};
  for (const key of allowed) {
    if (data[key] !== undefined) patch[key] = data[key];
  }
  if (patch.birthDate) patch.birthDate = new Date(patch.birthDate);

  if (isDemoMode()) {
    const idx = demoDossiers.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    demoDossiers[idx] = { ...demoDossiers[idx], ...patch, updatedAt: new Date() };
    return mapDossier(demoDossiers[idx]);
  }

  const updated = await prisma.petMedicalDossier.update({
    where: { id },
    data: patch,
  });
  return mapDossier(updated);
};

const parseVaccineMeta = (body, medications) => {
  if (body.vaccineType) {
    return {
      vaccineType: body.vaccineType,
      batchNumber: body.batchNumber || null,
      nextDue: body.nextDue ? new Date(body.nextDue) : null,
    };
  }
  try {
    const parsed = typeof medications === 'string' ? JSON.parse(medications) : medications;
    if (parsed?.vaccineType) return parsed;
  } catch { /* ignore */ }
  return null;
};

const syncPetVaccine = async (entry, dossier, vetId) => {
  const meta = parseVaccineMeta({}, entry.medications);
  if (!meta?.vaccineType) return null;

  return prisma.petVaccine.create({
    data: {
      ownerId: dossier.ownerId,
      petName: dossier.petName,
      animalType: dossier.animalType,
      vaccineType: meta.vaccineType,
      dateAdministered: entry.visitDate || new Date(),
      nextDue: meta.nextDue,
      batchNumber: meta.batchNumber,
      vetNotes: entry.treatment || entry.recommendations || null,
      status: meta.nextDue && meta.nextDue < new Date() ? 'overdue' : 'up_to_date',
    },
  });
};

const addEntry = async (dossierId, vetId, body) => {
  let medicationsPayload = body.medications;
  if (body.entryType === 'vaccination' && body.vaccineType) {
    medicationsPayload = JSON.stringify({
      vaccineType: body.vaccineType,
      batchNumber: body.batchNumber || null,
      nextDue: body.nextDue || null,
    });
  }

  const entryData = {
    dossierId,
    vetId,
    entryType: body.entryType || 'consultation',
    title: body.title || 'Consultation',
    symptoms: body.symptoms || null,
    clinicalExam: body.clinicalExam || null,
    diagnosis: body.diagnosis || null,
    treatment: body.treatment || null,
    medications: medicationsPayload
      ? typeof medicationsPayload === 'string'
        ? medicationsPayload
        : JSON.stringify(medicationsPayload)
      : body.medications
        ? typeof body.medications === 'string'
          ? body.medications
          : JSON.stringify(body.medications)
        : null,
    recommendations: body.recommendations || null,
    weight: body.weight != null && body.weight !== '' ? Number(body.weight) : null,
    temperature: body.temperature != null && body.temperature !== '' ? Number(body.temperature) : null,
    visitDate: body.visitDate ? new Date(body.visitDate) : new Date(),
    status: 'draft',
    isSigned: false,
  };

  if (isDemoMode()) {
    const entry = {
      id: `demo_entry_${Date.now()}`,
      ...entryData,
      signedAt: null,
      signedByVetId: null,
      vetSignatureImage: null,
      signatureHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      signer: null,
    };
    demoEntries.unshift(entry);
    const dIdx = demoDossiers.findIndex((d) => d.id === dossierId);
    if (dIdx >= 0) demoDossiers[dIdx].updatedAt = new Date();
    return entry;
  }

  const entry = await prisma.medicalDossierEntry.create({
    data: entryData,
    include: { signer: { select: { id: true, name: true } } },
  });

  await prisma.petMedicalDossier.update({
    where: { id: dossierId },
    data: { updatedAt: new Date() },
  });

  return entry;
};

const updateEntry = async (entryId, vetId, body) => {
  if (isDemoMode()) {
    const idx = demoEntries.findIndex((e) => e.id === entryId);
    if (idx === -1) return null;
    if (demoEntries[idx].isSigned) throw new Error('Entrée signée — modification impossible');
    demoEntries[idx] = {
      ...demoEntries[idx],
      ...body,
      medications: body.medications
        ? typeof body.medications === 'string'
          ? body.medications
          : JSON.stringify(body.medications)
        : demoEntries[idx].medications,
      updatedAt: new Date(),
    };
    return demoEntries[idx];
  }

  const existing = await prisma.medicalDossierEntry.findUnique({ where: { id: entryId } });
  if (!existing) return null;
  if (existing.isSigned) throw new Error('Entrée signée — modification impossible');

  const data = {};
  const fields = [
    'entryType', 'title', 'symptoms', 'clinicalExam', 'diagnosis', 'treatment',
    'recommendations', 'weight', 'temperature',
  ];
  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  if (body.medications !== undefined) {
    data.medications =
      typeof body.medications === 'string' ? body.medications : JSON.stringify(body.medications);
  }
  if (body.visitDate) data.visitDate = new Date(body.visitDate);

  return prisma.medicalDossierEntry.update({
    where: { id: entryId },
    data,
    include: { signer: { select: { id: true, name: true } } },
  });
};

const signEntry = async (entryId, vetId, vetSignatureImage) => {
  if (!vetSignatureImage || !String(vetSignatureImage).trim()) {
    throw new Error('Signature requise');
  }

  if (isDemoMode()) {
    const idx = demoEntries.findIndex((e) => e.id === entryId);
    if (idx === -1) return null;
    if (demoEntries[idx].isSigned) throw new Error('Entrée déjà signée');
    const signedAt = new Date();
    const payload = buildSignaturePayload(demoEntries[idx], vetId, signedAt);
    const signatureHash = computeSignatureHash(payload);
    demoEntries[idx] = {
      ...demoEntries[idx],
      isSigned: true,
      status: 'signed',
      signedAt,
      signedByVetId: vetId,
      vetSignatureImage,
      signatureHash,
      signer: { id: vetId, name: 'Dr. Vétérinaire' },
      updatedAt: signedAt,
    };
    return demoEntries[idx];
  }

  const entry = await prisma.medicalDossierEntry.findUnique({ where: { id: entryId } });
  if (!entry) return null;
  if (entry.isSigned) throw new Error('Entrée déjà signée');

  const signedAt = new Date();
  const payload = buildSignaturePayload(entry, vetId, signedAt);
  const signatureHash = computeSignatureHash(payload);

  const updated = await prisma.medicalDossierEntry.update({
    where: { id: entryId },
    data: {
      isSigned: true,
      status: 'signed',
      signedAt,
      signedByVetId: vetId,
      vetSignatureImage,
      signatureHash,
    },
    include: { signer: { select: { id: true, name: true, email: true } } },
  });

  if (entry.entryType === 'vaccination') {
    const dossier = await prisma.petMedicalDossier.findUnique({ where: { id: entry.dossierId } });
    if (dossier) {
      try {
        await syncPetVaccine(updated, dossier, vetId);
      } catch { /* non bloquant */ }
    }
  }

  return updated;
};

const verifyEntrySignature = async (entryId) => {
  if (isDemoMode()) {
    const entry = demoEntries.find((e) => e.id === entryId);
    if (!entry || !entry.isSigned) {
      return { valid: false, reason: 'Entrée non signée ou introuvable' };
    }
    const payload = buildSignaturePayload(entry, entry.signedByVetId, new Date(entry.signedAt));
    const expected = computeSignatureHash(payload);
    return {
      valid: expected === entry.signatureHash,
      signatureHash: entry.signatureHash,
      signedAt: entry.signedAt,
      signer: entry.signer,
    };
  }

  const entry = await prisma.medicalDossierEntry.findUnique({
    where: { id: entryId },
    include: { signer: { select: { id: true, name: true, email: true } } },
  });
  if (!entry || !entry.isSigned) {
    return { valid: false, reason: 'Entrée non signée ou introuvable' };
  }

  const payload = buildSignaturePayload(entry, entry.signedByVetId, entry.signedAt);
  const expected = computeSignatureHash(payload);
  return {
    valid: expected === entry.signatureHash,
    signatureHash: entry.signatureHash,
    signedAt: entry.signedAt,
    signer: entry.signer,
  };
};

const finalizeConsultationToDossier = async (consultationId, vetId) => {
  if (isDemoMode()) {
    return {
      dossier: { id: 'demo_dossier', dossierNumber: 'DMP-DEMO' },
      entry: { id: 'demo_entry', title: 'Consultation archivée' },
    };
  }

  const consult = await prisma.vetConsultation.findUnique({
    where: { id: consultationId },
    include: { appointment: true },
  });
  if (!consult) {
    const error = new Error('Consultation introuvable');
    error.status = 404;
    throw error;
  }
  if (consult.vetId && consult.vetId !== vetId) {
    const error = new Error('Consultation d\'un autre vétérinaire');
    error.status = 403;
    throw error;
  }

  const dossier = await createDossierFromPet({
    ownerId: consult.ownerId,
    petName: consult.petName,
    vetId,
  });

  const entry = await addEntry(dossier.id, vetId, {
    entryType: 'consultation',
    title: `Consultation du ${new Date().toLocaleDateString('fr-FR')} — ${consult.petName}`,
    symptoms: consult.symptoms,
    clinicalExam: consult.clinicalExam,
    diagnosis: consult.diagnosis,
    treatment: consult.analysis,
    recommendations: consult.recommendations,
    visitDate: consult.appointment?.date || new Date(),
  });

  await prisma.vetConsultation.update({
    where: { id: consultationId },
    data: { status: 'finalized' },
  });

  if (consult.appointmentId) {
    await prisma.petAppointment.update({
      where: { id: consult.appointmentId },
      data: { status: 'completed' },
    }).catch(() => {});
  }

  return { dossier, entry };
};

const listVaccinations = async (vetId) => {
  if (isDemoMode()) {
    return [];
  }

  const consults = await prisma.vetConsultation.findMany({
    where: { vetId },
    select: { ownerId: true },
    distinct: ['ownerId'],
  });
  const ownerIds = consults.map((c) => c.ownerId);
  if (!ownerIds.length) {
    const all = await prisma.petVaccine.findMany({
      take: 50,
      orderBy: { nextDue: 'asc' },
      include: { owner: { select: { id: true, name: true, phone: true } } },
    });
    return all;
  }

  return prisma.petVaccine.findMany({
    where: { ownerId: { in: ownerIds } },
    orderBy: { nextDue: 'asc' },
    include: { owner: { select: { id: true, name: true, phone: true } } },
  });
};

module.exports = {
  listDossiers,
  getDossierById,
  createDossierFromPet,
  updateDossierIdentity,
  addEntry,
  updateEntry,
  signEntry,
  verifyEntrySignature,
  finalizeConsultationToDossier,
  listVaccinations,
};

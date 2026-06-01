const {
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
} = require('../services/medicalDossier.service');

const getUserId = (req) => req.user?.id || req.user?._id;

const listVetDossiers = async (req, res) => {
  try {
    const { ownerId, mine } = req.query;
    const vetId = mine === 'true' || mine === '1' ? getUserId(req) : undefined;
    const dossiers = await listDossiers({
      ownerId: ownerId || undefined,
      vetId: req.user?.role === 'admin' ? undefined : vetId,
    });
    return res.json(dossiers);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur liste dossiers' });
  }
};

const listClientDossiers = async (req, res) => {
  try {
    const dossiers = await listDossiers({ ownerId: getUserId(req) });
    return res.json(dossiers);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur liste dossiers' });
  }
};

const getDossier = async (req, res) => {
  try {
    const ownerScope = req.user.role === 'client' ? getUserId(req) : undefined;
    const dossier = await getDossierById(req.params.id, { ownerId: ownerScope });
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    return res.json(dossier);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur dossier' });
  }
};

const createDossier = async (req, res) => {
  try {
    const { ownerId, petId, petName } = req.body || {};
    if (!ownerId || (!petId && !petName)) {
      return res.status(400).json({ error: 'ownerId et petId ou petName requis' });
    }
    const dossier = await createDossierFromPet({
      ownerId,
      petId,
      petName,
      vetId: getUserId(req),
    });
    return res.status(201).json(dossier);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur création dossier' });
  }
};

const patchDossier = async (req, res) => {
  try {
    const updated = await updateDossierIdentity(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Dossier introuvable' });
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur mise à jour' });
  }
};

const createEntry = async (req, res) => {
  try {
    const dossier = await getDossierById(req.params.id);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });

    const entry = await addEntry(req.params.id, getUserId(req), req.body || {});
    return res.status(201).json(entry);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur ajout entrée' });
  }
};

const patchEntry = async (req, res) => {
  try {
    const entry = await updateEntry(req.params.entryId, getUserId(req), req.body || {});
    if (!entry) return res.status(404).json({ error: 'Entrée introuvable' });
    return res.json(entry);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur mise à jour entrée' });
  }
};

const signEntryHandler = async (req, res) => {
  try {
    const { signature } = req.body || {};
    const entry = await signEntry(req.params.entryId, getUserId(req), signature);
    if (!entry) return res.status(404).json({ error: 'Entrée introuvable' });
    return res.json(entry);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur signature' });
  }
};

const verifySignature = async (req, res) => {
  try {
    const result = await verifyEntrySignature(req.params.entryId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur vérification' });
  }
};

const archiveConsultation = async (req, res) => {
  try {
    const result = await finalizeConsultationToDossier(req.params.consultationId, getUserId(req));
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Erreur archivage dossier' });
  }
};

const listVaccines = async (req, res) => {
  try {
    const rows = await listVaccinations(getUserId(req));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur liste vaccins' });
  }
};

module.exports = {
  listVetDossiers,
  listClientDossiers,
  getDossier,
  createDossier,
  patchDossier,
  createEntry,
  patchEntry,
  signEntryHandler,
  verifySignature,
  archiveConsultation,
  listVaccines,
};

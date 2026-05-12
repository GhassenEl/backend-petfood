const mongoose = require('mongoose');
const VeterinaryRecord = require('../models/VeterinaryRecord');
const PetVaccine = require('../models/PetVaccine');
const PetAppointment = require('../models/PetAppointment');
const demoStore = require('../utils/demoStore');

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

const demoVeterinaryRecords = [
  {
    _id: 'vet_demo_1',
    petName: 'Rex',
    animalType: 'dog',
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
      const records = req.user.role === 'admin'
        ? demoVeterinaryRecords
        : demoVeterinaryRecords.filter(r => r.ownerId._id === req.user.id);
      return res.json(records);
    }
    const query = req.user.role === 'admin' ? {} : { ownerId: req.user._id };
    const records = await VeterinaryRecord.find(query)
      .populate('ownerId', 'name email')
      .sort({ visitDate: -1 });
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
      if (req.user.role !== 'admin' && record.ownerId._id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      return res.json(record);
    }
    const record = await VeterinaryRecord.findById(req.params.id)
      .populate('ownerId', 'name email phone');
    if (!record) return res.status(404).json({ error: 'Record not found' });
    if (req.user.role !== 'admin' && record.ownerId._id.toString() !== req.user._id.toString()) {
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
    const record = new VeterinaryRecord(req.body);
    await record.save();
    const populated = await VeterinaryRecord.findById(record._id)
      .populate('ownerId', 'name email');
    res.status(201).json(populated);
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
    const record = await VeterinaryRecord.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    ).populate('ownerId', 'name email');
    if (!record) return res.status(404).json({ error: 'Record not found' });
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
    const record = await VeterinaryRecord.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
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
      const filtered = req.user.role === 'admin'
        ? records
        : records.filter(r => r.ownerId._id === req.user.id);
      return res.json(filtered.slice(0, 10));
    }
    const query = req.user.role === 'admin'
      ? { nextVisit: { $gte: new Date() }, status: 'active' }
      : { ownerId: req.user._id, nextVisit: { $gte: new Date() }, status: 'active' };
    const records = await VeterinaryRecord.find(query)
      .populate('ownerId', 'name email')
      .sort({ nextVisit: 1 })
      .limit(10);
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
    const vaccines = await PetVaccine.find({ ownerId: req.user._id }).sort({ dateAdministered: -1 });
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
    const vaccine = new PetVaccine({ ...req.body, ownerId: req.user._id });
    await vaccine.save();
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
    const appointments = await PetAppointment.find({ ownerId: req.user._id }).sort({ date: 1 });
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
    const appointment = new PetAppointment({ ...req.body, ownerId: req.user._id });
    await appointment.save();
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
    const records = await VeterinaryRecord.find({ 'ownerId': req.user._id });
    res.json(records);
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
  getPetRecords
};



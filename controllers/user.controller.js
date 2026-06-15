const bcrypt = require('bcryptjs');
const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { DELIVERY_REGIONS, resolveRegionFromAddress } = require('../utils/tunisiaCities');
const { assertSingleAdminPolicy } = require('../utils/singleAdmin');

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  address: true,
  location: true,
  region: true,
  role: true,
  isActive: true,
  petType: true,
  petAge: true,
  preferences: true,
  favoriteCategories: true,
  createdAt: true,
};

const getUserId = (user) => user?.id || user?._id;

const getProfile = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getUserById(req.user._id));
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.id || req.user._id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        address: true,
        location: true,
        region: true,
        role: true,
        petType: true,
        petAge: true,
        preferences: true,
        favoriteCategories: true,
        createdAt: true,
      }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUserPets = async (req, res) => {
  try {
    if (isDemoMode()) {
      const user = demoStore.getUserById(req.user._id);
      return res.json(user?.pets || []);
    }
    const ownerIds = [req.user.id || req.user._id];
    if (req.user?.email) {
      const dbUser = await prisma.user.findUnique({
        where: { email: String(req.user.email).toLowerCase() },
        select: { id: true },
      });
      if (dbUser?.id && !ownerIds.includes(dbUser.id)) ownerIds.push(dbUser.id);
    }
    const pets = await prisma.pet.findMany({
      where: { ownerId: { in: ownerIds } }
    });
    res.json(pets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const addPet = async (req, res) => {
  try {
    const petData = req.body;
    if (isDemoMode()) {
      const user = demoStore.getUserById(req.user._id);
      user.pets = user.pets || [];
      user.pets.push(petData);
      return res.json(petData);
    }
    const pet = await prisma.pet.create({
      data: {
        ownerId: req.user.id || req.user._id,
        name: petData.name,
        type: petData.type,
        breed: petData.breed || '',
        birthDate: petData.birthDate ? new Date(petData.birthDate) : null,
        weight: petData.weight ?? null,
        notes: petData.notes || ''
      }
    });
    res.json(pet);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updatePet = async (req, res) => {
  try {
    const { petId } = req.params;
    const petData = req.body;
    if (isDemoMode()) {
      const user = demoStore.getUserById(req.user._id);
      user.pets[petId] = { ...user.pets[petId], ...petData };
      return res.json(user.pets[petId]);
    }
    const pet = await prisma.pet.update({
      where: { id: petId },
      data: {
        name: petData.name,
        type: petData.type,
        breed: petData.breed,
        birthDate: petData.birthDate ? new Date(petData.birthDate) : undefined,
        weight: petData.weight,
        notes: petData.notes
      }
    });
    res.json(pet);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Pet not found' });
    }
    res.status(400).json({ error: error.message });
  }
};

const deletePet = async (req, res) => {
  try {
    const { petId } = req.params;
    if (isDemoMode()) {
      const user = demoStore.getUserById(req.user._id);
      user.pets = user.pets || [];
      user.pets = user.pets.filter((pet) => pet._id !== petId);
      return res.json({ message: 'Pet deleted' });
    }
    await prisma.pet.delete({ where: { id: petId } });
    res.json({ message: 'Pet deleted' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Pet not found' });
    }
    res.status(500).json({ error: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    if (isDemoMode()) {
      const current = demoStore.getUserById(req.user._id);
      return res.json({ ...current, ...req.body });
    }
    const {
      name,
      phone,
      address,
      location,
      region,
      petType,
      petAge,
      preferences,
      favoriteCategories,
      availability,
    } = req.body;

    let mergedPreferences = preferences;
    if (availability !== undefined) {
      const current = await prisma.user.findUnique({
        where: { id: req.user.id || req.user._id },
        select: { preferences: true },
      });
      let prefs = {};
      try {
        prefs = current?.preferences ? JSON.parse(current.preferences) : {};
      } catch {
        prefs = {};
      }
      prefs.availability = availability;
      mergedPreferences = JSON.stringify(prefs);
    } else if (preferences && typeof preferences === 'object') {
      mergedPreferences = JSON.stringify(preferences);
    }

    const updateData = {
      name,
      phone,
      address,
      location: location || null,
      region: region !== undefined ? region || null : undefined,
      petType: petType !== undefined ? petType || null : undefined,
      petAge: petAge !== undefined ? petAge : undefined,
      preferences: mergedPreferences !== undefined ? mergedPreferences : undefined,
      favoriteCategories: favoriteCategories !== undefined ? favoriteCategories : undefined,
    };

    if (address !== undefined && (region === undefined || region === null || region === '')) {
      const inferred = resolveRegionFromAddress(address);
      if (inferred) updateData.region = inferred;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id || req.user._id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        address: true,
        location: true,
        region: true,
        role: true,
        petType: true,
        petAge: true,
        preferences: true,
        favoriteCategories: true,
        createdAt: true,
      }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getUsers());
    }
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: USER_SELECT,
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    if (isDemoMode()) {
      const user = demoStore.createUser(req.body);
      return res.status(201).json(user);
    }
    const data = { ...req.body };
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 12);
    }
    try {
      await assertSingleAdminPolicy({ role: data.role, email: data.email });
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
    const user = await prisma.user.create({
      data: {
        ...data,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      },
      select: USER_SELECT,
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const adminId = getUserId(req.user);
    if (userId === adminId) {
      return res.status(403).json({ error: 'Vous ne pouvez pas modifier votre propre compte depuis cette page. Utilisez Mon profil.' });
    }
    if (isDemoMode()) {
      const user = demoStore.updateUser(userId, req.body);
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
      return res.json(user);
    }
    const data = { ...req.body };
    if (data.isActive !== undefined) {
      data.isActive = Boolean(data.isActive);
    }
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 12);
    }
    try {
      await assertSingleAdminPolicy({ role: data.role, userId, email: data.email });
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: USER_SELECT,
    });
    res.json(user);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }
    res.status(400).json({ error: error.message });
  }
};

const toggleUserActive = async (req, res) => {
  try {
    const userId = req.params.id;
    const adminId = getUserId(req.user);
    if (userId === adminId) {
      return res.status(403).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' });
    }

    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'Le champ isActive (booléen) est requis.' });
    }

    if (isDemoMode()) {
      const user = demoStore.updateUser(userId, { isActive });
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
      return res.json(user);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: USER_SELECT,
    });
    res.json(user);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }
    res.status(400).json({ error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId === getUserId(req.user)) {
      return res.status(403).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }
    if (isDemoMode()) {
      const success = demoStore.deleteUser(req.params.id);
      if (!success) return res.status(404).json({ error: 'User not found' });
      return res.json({ message: 'User deleted' });
    }
    await prisma.user.delete({ where: { id: userId } });
    res.json({ message: 'User deleted' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }
    res.status(500).json({ error: error.message });
  }
};

const getUserCount = async (req, res) => {
  try {
    if (isDemoMode()) {
      const list = demoStore.getUsers();
      return res.json({
        count: list.length,
        byRole: {
          admin: list.filter((u) => u.role === 'admin').length,
          client: list.filter((u) => u.role === 'client').length,
          livreur: list.filter((u) => u.role === 'livreur').length,
          vet: list.filter((u) => u.role === 'vet').length,
        },
        active: list.filter((u) => u.isActive !== false).length,
        inactive: list.filter((u) => u.isActive === false).length,
      });
    }
    const [count, admins, clients, livreurs, vets, active, inactive] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { role: 'client' } }),
      prisma.user.count({ where: { role: 'livreur' } }),
      prisma.user.count({ where: { role: 'vet' } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
    ]);
    res.json({
      count,
      byRole: { admin: admins, client: clients, livreur: livreurs, vet: vets },
      active,
      inactive,
    });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger les statistiques utilisateurs.' });
  }
};

const getStoreLocations = async (req, res) => {
  try {
    const citySvc = require('../services/platformCities.service');
    const stores = await citySvc.getStoreLocations(req.query);
    res.json(stores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getDeliveryRegions = async (_req, res) => {
  try {
    const citySvc = require('../services/platformCities.service');
    const regions = await citySvc.getRegionNames();
    res.json(regions.length ? regions : DELIVERY_REGIONS);
  } catch {
    res.json(DELIVERY_REGIONS);
  }
};

module.exports = {
  getProfile,
  getUserPets,
  addPet,
  updatePet,
  deletePet,
  updateProfile,
  getAllUsers,
  createUser,
  updateUser,
  toggleUserActive,
  deleteUser,
  getUserCount,
  getStoreLocations,
  getDeliveryRegions,
};

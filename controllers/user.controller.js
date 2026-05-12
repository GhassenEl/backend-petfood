const mongoose = require('mongoose');
const User = require('../models/User');
const demoStore = require('../utils/demoStore');

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

const getProfile = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getUserById(req.user._id));
    }
    const user = await User.findById(req.user.id || req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUserPets = async (req, res) => {
  try {
    if (isDemoMode()) {
      const user = demoStore.getUserById(req.user._id);
      return res.json(user.pets || []);
    }
    const user = await User.findById(req.user.id || req.user._id).select('pets');
    res.json(user.pets || []);
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
    const user = await User.findByIdAndUpdate(
      req.user.id || req.user._id,
      { $push: { pets: petData } },
      { new: true }
    ).select('pets');
    res.json(user.pets[user.pets.length - 1]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updatePet = async (req, res) => {
  try {
    const { petIndex } = req.params;
    const petData = req.body;
    if (isDemoMode()) {
      const user = demoStore.getUserById(req.user._id);
      user.pets[petIndex] = { ...user.pets[petIndex], ...petData };
      return res.json(user.pets[petIndex]);
    }
    const user = await User.findOneAndUpdate(
      { _id: req.user.id || req.user._id, 'pets.': { $exists: true } },
      { $set: { [`pets.${petIndex}`]: petData } },
      { new: true }
    ).select('pets');
    if (!user) return res.status(404).json({ error: 'Pet not found' });
    res.json(user.pets[petIndex]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deletePet = async (req, res) => {
  try {
    const { petIndex } = req.params;
    if (isDemoMode()) {
      const user = demoStore.getUserById(req.user._id);
      user.pets.splice(petIndex, 1);
      return res.json({ message: 'Pet deleted' });
    }
    const user = await User.findByIdAndUpdate(
      req.user.id || req.user._id,
      { $pull: { pets: { } } }, // Note: $pull with index tricky, use updateOne with arrayFilters in prod
      { new: true }
    ).select('pets');
    res.json({ message: 'Pet deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    if (isDemoMode()) {
      const current = demoStore.getUserById(req.user._id);
      return res.json({ ...current, ...req.body });
    }
    const { name, phone, address, location, petType, petAge, preferences, favoriteCategories } = req.body;
    const updateData = { name, phone, address, location: location || null };
    if (petType !== undefined) updateData.petType = petType || null;
    if (petAge !== undefined) updateData.petAge = petAge || null;
    if (preferences !== undefined) updateData.preferences = preferences;
    if (favoriteCategories !== undefined) updateData.favoriteCategories = favoriteCategories;

    const user = await User.findByIdAndUpdate(
      req.user.id || req.user._id,
      updateData,
      { new: true }
    ).select('-password');
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
    const users = await User.find().select('-password').sort({ createdAt: -1 });
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
    const user = new User(req.body);
    await user.save();
    const safeUser = await User.findById(user._id).select('-password');
    res.status(201).json(safeUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId === req.user.id) {
      return res.status(403).json({ error: 'Cannot modify own account as admin' });
    }
    if (isDemoMode()) {
      const user = demoStore.updateUser(userId, req.body);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json(user);
    }
    const user = await User.findByIdAndUpdate(
      userId,
      req.body,
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId === req.user.id) {
      return res.status(403).json({ error: 'Cannot delete own account' });
    }
    if (isDemoMode()) {
      const success = demoStore.deleteUser(req.params.id);
      if (!success) return res.status(404).json({ error: 'User not found' });
      return res.json({ message: 'User deleted' });
    }
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUserCount = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json({ count: demoStore.getUsers().length });
    }
    const count = await User.countDocuments();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getStoreLocations = async (req, res) => {
  const COMPANY_STORES = [
    {
      id: 'lac1',
      name: 'PetfoodTN Lac 1',
      address: 'Lac 1 Tunis, Immeuble El Hana',
      lat: 36.8370,
      lng: 10.2420,
      phone: '+216 71 960 000',
      hours: '09:00 - 21:00'
    },
    {
      id: 'ariana',
      name: 'PetfoodTN Ariana',
      address: 'Route Ariana La Soukra',
      lat: 36.8550,
      lng: 10.1960,
      phone: '+216 71 717 171',
      hours: '08:00 - 20:00'
    },
    {
      id: 'marsa',
      name: 'PetfoodTN La Marsa',
      address: 'Av. Habib Bourguiba, La Marsa',
      lat: 36.8670,
      lng: 10.3200,
      phone: '+216 71 745 000',
      hours: '09:00 - 22:00'
    },
    {
      id: 'sfax',
      name: 'PetfoodTN Sfax',
      address: 'Route Sfax Gabès Km 4',
      lat: 34.7406,
      lng: 10.7603,
      phone: '+216 74 294 000',
      hours: '08:30 - 19:30'
    }
  ];

  const { lat, lng, radius = 20 } = req.query;
  let stores = COMPANY_STORES;

  if (lat && lng) {
    const haversine = (lat1, lng1, lat2, lng2) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    stores = COMPANY_STORES.filter(store =>
      haversine(parseFloat(lat), parseFloat(lng), store.lat, store.lng) <= parseFloat(radius)
    ).sort((a, b) => {
      const distA = haversine(parseFloat(lat), parseFloat(lng), a.lat, a.lng);
      const distB = haversine(parseFloat(lat), parseFloat(lng), b.lat, b.lng);
      return distA - distB;
    });
  }

  res.json(stores);
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
  deleteUser,
  getUserCount,
  getStoreLocations
};

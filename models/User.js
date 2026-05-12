const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  location: {
    type: { lat: { type: Number }, lng: { type: Number } },
    default: null
  },
  role: { type: String, enum: ['client', 'admin', 'livreur'], default: 'client' },
  petType: { type: String, enum: ['dog', 'cat', 'bird', 'fish', 'other'], default: null },
  petAge: { type: Number, default: null },
  pets: [{
    name: { type: String, required: true },
    type: { type: String, enum: ['dog', 'cat', 'bird', 'fish', 'rabbit', 'other'], default: 'dog' },
    breed: { type: String, default: '' },
    birthDate: { type: Date },
    weight: { type: Number },
    notes: { type: String }
  }],
  preferences: { type: [String], default: [] },
  favoriteCategories: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);

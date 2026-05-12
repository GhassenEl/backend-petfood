const mongoose = require('mongoose');

const petVaccineSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  petName: { type: String, required: true },
  animalType: { type: String, enum: ['dog', 'cat', 'bird', 'fish', 'rabbit', 'other'], required: true },
  vaccineType: { 
    type: String, 
    enum: ['DHPPI', 'Rabies', 'Leptospirose', 'Toux kennel', 'Core feline', 'FIP', 'Checkup', 'Sterilization', 'Other'],
    required: true 
  },
  dateAdministered: { type: Date, default: Date.now },
  expiryDate: { type: Date },
  nextDue: { type: Date },
  batchNumber: { type: String },
  vetNotes: { type: String },
  status: { type: String, enum: ['up-to-date', 'due', 'overdue', 'cancelled'], default: 'up-to-date' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

petVaccineSchema.index({ ownerId: 1, petName: 1, vaccineType: 1 });

module.exports = mongoose.model('PetVaccine', petVaccineSchema);

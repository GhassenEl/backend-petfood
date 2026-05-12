const mongoose = require('mongoose');

const petAppointmentSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  petName: { type: String, required: true },
  animalType: { type: String, enum: ['dog', 'cat', 'bird', 'fish', 'rabbit', 'other'], required: true },
  type: { 
    type: String, 
    enum: ['vaccine_recall', 'routine_checkup', 'dental', 'vaccination', 'sterilization', 'emergency'],
    required: true 
  },
  date: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'], default: 'scheduled' },
  notes: { type: String },
  reminderSent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

petAppointmentSchema.index({ ownerId: 1, petName: 1, status: 1 });
petAppointmentSchema.index({ date: 1 });

module.exports = mongoose.model('PetAppointment', petAppointmentSchema);

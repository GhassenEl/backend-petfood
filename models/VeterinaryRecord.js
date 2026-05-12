const mongoose = require('mongoose');

const veterinaryRecordSchema = new mongoose.Schema({
    petName: { type: String, required: true },
    animalType: { type: String, enum: ['dog', 'cat', 'bird', 'fish', 'rabbit', 'other'], default: 'dog' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    petIndex: { type: Number }, // index in user.pets array
    ownerName: { type: String },
    visitDate: { type: Date, default: Date.now },
    diagnosis: { type: String, required: true },
    treatment: { type: String },
    vetNotes: { type: String },
    nextVisit: { type: Date },
    weight: { type: Number }, // kg
    temperature: { type: Number }, // celsius
    medications: [{ name: String, dosage: String, frequency: String }],
    status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('VeterinaryRecord', veterinaryRecordSchema);

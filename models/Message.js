const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: { type: String, enum: ['client', 'admin', 'livreur'] },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  receiver: {
    type: { type: String, enum: ['client', 'admin', 'livreur'] },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  message: { type: String, required: true, maxlength: 1000 },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);

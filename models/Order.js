const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: Number,
    price: Number
  }],
  total: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
  paymentMethod: { type: String, enum: ['cash', 'check', 'card', 'transfer'], default: 'cash' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  deliveryLocation: {
    type: { lat: { type: Number }, lng: { type: Number } },
    default: null
  },
  deliveryStatus: { type: String, enum: ['pending', 'in_transit', 'delivered'], default: 'pending' },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);

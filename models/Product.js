const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  discountPrice: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  isOnSale: { type: Boolean, default: false },
  imageUrl: { type: String, default: '' },
  image: { type: String, default: '' },
  icon: { type: String },
  description: String,
  stock: { type: Number, default: 0, min: 0 },
  category: { type: String, default: 'nourriture' },
  animalType: { type: String, enum: ['dog', 'cat', 'bird', 'fish', 'other'], default: 'other' },
  tags: { type: [String], default: [] },
  popularity: { type: Number, default: 0 },
  rating_avg: { type: Number, default: 0 },
  rating_count: { type: Number, default: 0 },
  stockHistory: [{
    adjustment: { type: Number, required: true },
    newStock: { type: Number, required: true },
    reason: { type: String, default: 'Ajustement manuel' },
    date: { type: Date, default: Date.now },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);

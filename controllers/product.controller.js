const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const Review = require('../models/Review');
const demoStore = require('../utils/demoStore');

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

const getProducts = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getProducts());
    }
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createProduct = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.status(201).json(demoStore.createProduct(req.body));
    }
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    if (isDemoMode()) {
      const product = demoStore.updateProduct(req.params.id, req.body);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      return res.json(product);
    }
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    if (isDemoMode()) {
      const product = demoStore.deleteProduct(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      return res.json({ message: 'Product deleted' });
    }
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getRecommendations = async (req, res) => {
  try {
    if (isDemoMode()) {
      const all = demoStore.getProducts();
      const user = req.user;
      const scored = all.map(p => {
        let score = 0;
        let reasons = [];
        if (user.petType && p.animalType === user.petType) {
          score += 0.35;
          reasons.push(`Adapté à votre ${user.petType}`);
        }
        if (p.discount > 0) {
          score += (p.discount / 100) * 0.20;
          reasons.push(`-${p.discount}% réduction`);
        }
        if (p.popularity > 80) {
          score += 0.15;
          reasons.push('Très populaire');
        }
        if (p.rating_avg >= 4.5) {
          score += 0.10;
          reasons.push('Bien noté');
        }
        return { ...p, score, recommendedReason: reasons[0] || 'Recommandé pour vous' };
      });
      scored.sort((a, b) => b.score - a.score);
      return res.json(scored.slice(0, 8));
    }

    const user = await User.findById(req.user._id);
    const userOrders = await Order.find({ userId: req.user._id }).populate('items.productId');
    const boughtProductIds = userOrders.flatMap(o => o.items.map(i => i.productId?._id?.toString()));

    const userReviews = await Review.find({ userId: req.user._id }).populate('productId');
    const positiveProductIds = userReviews
      .filter(r => ['happy', 'satisfied'].includes(r.emotion) && r.rating >= 4)
      .map(r => r.productId?._id?.toString());
    const negativeProductIds = userReviews
      .filter(r => ['disappointed', 'frustrated'].includes(r.emotion) || r.rating <= 2)
      .map(r => r.productId?._id?.toString());

    const allProducts = await Product.find();

    const scoredProducts = allProducts.map(p => {
      const pId = p._id.toString();
      let score = 0;
      const reasons = [];

      if (user.petType && p.animalType === user.petType) {
        score += 0.30;
        reasons.push(`🐾 Pour votre ${p.animalType}`);
      }
      if (user.favoriteCategories?.includes(p.category)) {
        score += 0.20;
        reasons.push(`❤️ Catégorie préférée`);
      }
      if (positiveProductIds.includes(pId)) {
        score += 0.15;
        reasons.push('😊 Vous avez adoré !');
      }
      const likedProducts = userReviews.filter(r => positiveProductIds.includes(r.productId?._id?.toString()));
      const likedTypes = likedProducts.map(r => r.productId?.animalType).filter(Boolean);
      const likedCats = likedProducts.map(r => r.productId?.category).filter(Boolean);
      if (likedTypes.includes(p.animalType)) {
        score += 0.10;
        reasons.push('Similaire à vos coups de cœur');
      }
      if (likedCats.includes(p.category)) {
        score += 0.08;
        reasons.push('Même catégorie que vos favoris');
      }
      if (negativeProductIds.includes(pId)) {
        score -= 0.25;
      }
      if (boughtProductIds.includes(pId)) {
        score += 0.05;
        reasons.push('Déjà acheté');
      }
      if (p.discount > 0) {
        score += (p.discount / 100) * 0.12;
        reasons.push(`💰 -${p.discount}%`);
      }
      score += (p.popularity / 100) * 0.10;
      if (p.popularity > 85) reasons.push('🔥 Très populaire');
      if (p.rating_avg >= 4.5) {
        score += 0.08;
        reasons.push('⭐ Bien noté');
      }
      const prefMatch = p.tags?.some(t => user.preferences?.includes(t));
      if (prefMatch) {
        score += 0.07;
        reasons.push('Correspond à vos préférences');
      }

      return {
        ...p.toObject(),
        score: Math.min(Math.max(score, 0), 1),
        recommendedReason: reasons[0] || (p.discount > 0 ? `-${p.discount}%` : 'Recommandé pour vous')
      };
    });

    scoredProducts.sort((a, b) => b.score - a.score);
    const recs = scoredProducts.filter(p => p.score > 0).slice(0, 8);
    res.json(recs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getNearbyProducts = async (req, res) => {
  try {
    if (isDemoMode()) {
      const all = demoStore.getProducts();
      const nearby = all.slice(0, 6).map(p => ({
        ...p,
        distance: Math.round(Math.random() * 5 + 1),
        recommendedReason: `À ${Math.round(Math.random() * 5 + 1)}km de chez vous`
      })).sort((a, b) => a.distance - b.distance);
      return res.json(nearby);
    }

    const user = await User.findById(req.user._id).select('location');
    if (!user.location) {
      return res.json([]);
    }

    const products = await Product.find().limit(6);
    const nearby = products.map(p => ({
      ...p.toObject(),
      distance: Math.round(Math.random() * 5 + 1),
      recommendedReason: `À ${Math.round(Math.random() * 5 + 1)}km de chez vous`
    })).sort((a, b) => a.distance - b.distance);

    res.json(nearby);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const adjustStock = async (req, res) => {
  try {
    const adjustment = Number(req.body.adjustment);
    const reason = req.body.reason || 'Ajustement manuel';
    if (!Number.isFinite(adjustment) || adjustment === 0) {
      return res.status(400).json({ error: 'Adjustment must be a non-zero number' });
    }

    if (isDemoMode()) {
      const existing = demoStore.getProducts().find((entry) => entry._id === req.params.id);
      if (!existing) return res.status(404).json({ error: 'Product not found' });
      const newStock = Math.max(0, Number(existing.stock || 0) + adjustment);
      const product = demoStore.updateProduct(req.params.id, { stock: newStock });
      if (!product) return res.status(404).json({ error: 'Product not found' });
      return res.json({ message: 'Stock ajusté', product, adjustment: req.body.adjustment, reason: req.body.reason });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const newStock = Math.max(0, Number(product.stock || 0) + adjustment);
    product.stock = newStock;
    product.stockHistory = product.stockHistory || [];
    product.stockHistory.push({ adjustment, newStock, reason, date: new Date(), adminId: req.user._id });
    await product.save();
    res.json({ message: `Stock ajusté: ${adjustment > 0 ? '+' : ''}${adjustment} (${newStock} restant)`, product, adjustment, reason });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getLowStock = async (req, res) => {
  try {
    if (isDemoMode()) {
      const threshold = Number(req.query.threshold) || 10;
      const products = demoStore.getProducts().filter(p => p.stock < threshold && p.stock >= 0);
      return res.json(products);
    }
    const threshold = Number(req.query.threshold) || 10;
    const products = await Product.find({ stock: { $lt: threshold, $gte: 0 } }).sort({ stock: 1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const bulkUpdateStock = async (req, res) => {
  try {
    if (isDemoMode()) {
      const results = req.body.updates.map(up => {
        const p = demoStore.updateProduct(up.id, { stock: up.stock });
        return p ? { id: up.id, success: true, newStock: p.stock } : { id: up.id, success: false };
      });
      return res.json({ results, summary: `${results.filter(r => r.success).length}/${req.body.updates.length} mis à jour` });
    }
    const results = [];
    for (const up of req.body.updates) {
      const product = await Product.findById(up.id);
      if (!product) {
        results.push({ id: up.id, success: false, error: 'Not found' });
        continue;
      }
      product.stock = Math.max(0, Number(up.stock));
      await product.save();
      results.push({ id: up.id, success: true, newStock: product.stock });
    }
    const successCount = results.filter(r => r.success).length;
    res.json({ results, summary: `${successCount}/${req.body.updates.length} mis à jour` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getRecommendations,
  getNearbyProducts,
  adjustStock,
  getLowStock,
  bulkUpdateStock
};


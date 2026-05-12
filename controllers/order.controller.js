const mongoose = require('mongoose');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const demoStore = require('../utils/demoStore');

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

const getOrders = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getOrders(req.user));
    }
    const query = (req.user.role === 'admin' || req.user.role === 'livreur') ? {} : { userId: req.user._id };
    const orders = await Order.find(query).populate('items.productId', 'name price discount').sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getStats = async (req, res) => {
  try {
    if (isDemoMode()) {
      const orders = demoStore.getOrders(req.user);
      const total = orders.length;
      const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
      const pending = orders.filter((order) => order.status === 'pending').length;
      return res.json({ total, revenue, pending });
    }
    const total = await Order.countDocuments();
    const revenue = await Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]);
    const pending = await Order.countDocuments({ status: 'pending' });
    res.json({ total, revenue: revenue[0]?.total || 0, pending });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createOrder = async (req, res) => {
  try {
    if (isDemoMode()) {
      const result = demoStore.createOrder(req.user, req.body);
      return res.status(201).json(result);
    }
    req.body.userId = req.user._id;
    
    // Stock check and decrement
    for (const item of req.body.items) {
      const product = await Product.findById(item.productId);
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({ error: `Stock insuffisant pour ${product?.name || item.productId}: ${product?.stock || 0}/${item.quantity}` });
      }
      product.stock -= item.quantity;
      await product.save();
    }
    
    const order = new Order(req.body);
    await order.save();
    const invoice = new Invoice({
      userId: req.user._id,
      orderId: order._id,
      amount: order.total,
      paymentMethod: req.body.paymentMethod || 'cash',
    });
    await invoice.save();
    res.status(201).json({ order, invoice });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const createAdminOrder = async (req, res) => {
  try {
    const { userId, items, total, address, phone, paymentMethod, location } = req.body;
    
    // Stock check and decrement for admin orders
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({ error: `Stock insuffisant pour ${product?.name || item.productId}: ${product?.stock || 0}/${item.quantity}` });
      }
      product.stock -= item.quantity;
      await product.save();
    }
    
    if (isDemoMode()) {
      const result = demoStore.createOrder({ _id: userId }, { items, total, address, phone, paymentMethod, location });
      return res.status(201).json(result);
    }
    const order = new Order({
      userId,
      items,
      total,
      address,
      phone,
      paymentMethod: paymentMethod || 'cash',
      location: location || null,
    });
    await order.save();
    const invoice = new Invoice({
      userId,
      orderId: order._id,
      amount: total,
      paymentMethod: paymentMethod || 'cash',
    });
    await invoice.save();
    res.status(201).json({ order, invoice });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateOrder = async (req, res) => {
  try {
    if (isDemoMode()) {
      const order = demoStore.updateOrder(req.params.id, req.body);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      return res.json(order);
    }
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('items.productId', 'name price discount');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteOrder = async (req, res) => {
  try {
    if (isDemoMode()) {
      const order = demoStore.deleteOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      return res.json({ message: 'Order deleted' });
    }
    let order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.user.role !== 'admin' && req.user._id.toString() !== order.userId.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getOrders, getStats, createOrder, createAdminOrder, updateOrder, deleteOrder };

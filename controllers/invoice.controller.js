const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const { auth, adminAuth } = require('../middleware/auth');
const demoStore = require('../utils/demoStore');

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

const getMyInvoices = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getInvoices(req.user));
    }
    const invoices = await Invoice.find({ userId: req.user._id }).populate('orderId');
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const payInvoice = async (req, res) => {
  try {
    if (isDemoMode()) {
      const invoice = demoStore.payInvoice(req.user, req.params.id, req.body.paymentMethod);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      return res.json(invoice);
    }

    const invoice = await Invoice.findOne({ _id: req.params.id, userId: req.user._id });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'paid') return res.status(400).json({ error: 'Already paid' });

    invoice.status = 'paid';
    invoice.paymentMethod = req.body.paymentMethod || invoice.paymentMethod;
    invoice.paidAt = Date.now();
    await invoice.save();
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllInvoices = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getInvoices(req.user));
    }
    const invoices = await Invoice.find().populate('userId', 'name email').populate('orderId');
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMyInvoices,
  payInvoice,
  getAllInvoices
};


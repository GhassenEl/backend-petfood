const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const demoStore = require('../utils/demoStore');

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

// demo_ accounts should always use demoStore to avoid ObjectId cast errors
const isDemoUser = (user) => {
  const id = user?._id ?? user?.id;
  return typeof id === 'string' && id.startsWith('demo_');
};


const getMyComplaints = async (req, res) => {
  try {
    if (isDemoMode() || isDemoUser(req.user)) {
      return res.json(demoStore.getComplaints(req.user));
    }

    const complaints = await Complaint.find({ userId: req.user._id });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createComplaint = async (req, res) => {
  try {
    const { subject, orderId } = req.body;
    const message = req.body.message || req.body.description;

    if (isDemoMode() || isDemoUser(req.user)) {
      return res.status(201).json(demoStore.createComplaint(req.user, { subject, message, orderId }));
    }


    const complaint = new Complaint({
      userId: req.user._id,
      subject,
      message,
      orderId
    });
    await complaint.save();
    res.status(201).json(complaint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getComplaintCount = async (req, res) => {
  try {
    if (isDemoMode() || isDemoUser(req.user)) {
      return res.json({ count: demoStore.getComplaints(req.user).length });
    }

    const count = await Complaint.countDocuments();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createAdminComplaint = async (req, res) => {
  try {
    const { userId, subject, message, orderId } = req.body;
    if (isDemoMode() || isDemoUser(req.user)) {
      return res.status(201).json(demoStore.createComplaint({ _id: userId }, { subject, message, orderId }));
    }

    const complaint = new Complaint({
      userId,
      subject,
      message,
      orderId: orderId || null,
    });
    await complaint.save();
    const populated = await complaint.populate('userId', 'name email');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllComplaints = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getComplaints(req.user));
    }
    const complaints = await Complaint.find().populate('userId', 'name email');
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateComplaint = async (req, res) => {
  try {
    const { response, status } = req.body;
    if (isDemoMode()) {
      const complaint = demoStore.updateComplaint(req.params.id, { response, status });
      if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
      return res.json(complaint);
    }
    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { response, status: status || 'resolved' },
      { new: true }
    );
    res.json(complaint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteComplaint = async (req, res) => {
  try {
    if (isDemoMode()) {
      const complaint = demoStore.deleteComplaint?.(req.params.id) || { message: 'Deleted' };
      return res.json(complaint);
    }
    let complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    if (req.user._id.toString() !== complaint.userId.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await Complaint.findByIdAndDelete(req.params.id);
    res.json({ message: 'Complaint deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMyComplaints,
  createComplaint,
  getComplaintCount,
  createAdminComplaint,
  getAllComplaints,
  updateComplaint,
  deleteComplaint
};


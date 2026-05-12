const mongoose = require('mongoose');
const Message = require('../models/Message');
const demoStore = require('../utils/demoStore');

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

const getMessages = async (req, res) => {
  try {
    const { orderId } = req.query;
    let query = {
      $or: [
        { 'sender.userId': req.user.id },
        { 'receiver.userId': req.user.id }
      ]
    };
    if (orderId) query.orderId = orderId;

    if (isDemoMode()) {
      return res.json(demoStore.getMessages(req.user));
    }

    const messages = await Message.find(query)
      .populate('sender.userId', 'name role')
      .populate('receiver.userId', 'name role')
      .sort({ createdAt: 1 });

    await Message.updateMany({ receiver: req.user.id, isRead: false }, { isRead: true });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, orderId, message } = req.body;
    if (!message || !receiverId) {
      return res.status(400).json({ error: 'Receiver and message required' });
    }

    const newMessage = new Message({
      sender: { type: req.user.role, userId: req.user.id },
      receiver: { type: req.user.role === 'client' ? 'admin' : 'client', userId: receiverId },
      orderId,
      message: message.trim()
    });

    await newMessage.save();
    const populated = await Message.findById(newMessage._id)
      .populate('sender.userId', 'name')
      .populate('receiver.userId', 'name');

    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    if (isDemoMode()) return res.json({ unread: 0 });

    const unread = await Message.countDocuments({
      receiver: req.user.id,
      isRead: false
    });
    res.json({ unread });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMessages,
  sendMessage,
  getUnreadCount
};


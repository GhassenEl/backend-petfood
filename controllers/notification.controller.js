const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');
const Order = require('../models/Order');
const Complaint = require('../models/Complaint');
const Review = require('../models/Review');

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

const getTodayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getNotifications = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json([]);
    }

    const isAdmin = req.user.role === 'admin';

    if (isAdmin) {
      const todayStart = getTodayStart();

      const newOrders = await Order.find({
        status: 'pending',
        createdAt: { $gte: todayStart }
      }).sort({ createdAt: -1 }).limit(10).populate('userId', 'name');

      const pendingComplaints = await Complaint.find({
        status: 'pending'
      }).sort({ createdAt: -1 }).limit(10).populate('userId', 'name');

      const newReviews = await Review.find({
        createdAt: { $gte: todayStart }
      }).sort({ createdAt: -1 }).limit(10).populate('userId', 'name');

      const adminMessages = await Message.find({
        'receiver.userId': req.user.id,
        isRead: false
      }).sort({ createdAt: -1 }).limit(10);

      const notifications = [
        ...newOrders.map(o => ({
          id: `new-order-${o._id}`,
          type: 'new_order',
          title: `Nouvelle commande #${o._id.toString().slice(-6)}`,
          description: `${o.userId?.name || 'Client'} — ${o.total} DT`,
          createdAt: o.createdAt,
          link: '/admin/orders'
        })),
        ...pendingComplaints.map(c => ({
          id: `complaint-${c._id}`,
          type: 'new_complaint',
          title: `Réclamation: ${c.subject}`,
          description: `${c.userId?.name || 'Client'} — ${c.message.substring(0, 40)}...`,
          createdAt: c.createdAt,
          link: '/admin/complaints'
        })),
        ...newReviews.map(r => ({
          id: `review-${r._id}`,
          type: 'new_review',
          title: `Nouvel avis (${r.rating}⭐)`,
          description: `${r.userId?.name || 'Client'} — ${r.comment.substring(0, 40)}...`,
          createdAt: r.createdAt,
          link: '/admin/reviews'
        })),
        ...adminMessages.map(m => ({
          id: m._id,
          type: 'admin_message',
          title: `Nouveau message`,
          description: m.message.substring(0, 50) + '...',
          createdAt: m.createdAt,
          link: '/admin/messages'
        }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return res.json(notifications);
    }

    const messages = await Message.find({
      receiver: req.user.id,
      isRead: false
    }).populate('orderId', 'status total').sort({ createdAt: -1 }).limit(10);

    const orders = await Order.find({
      userId: req.user.id,
      status: { $in: ['shipped', 'delivered'] }
    }).sort({ updatedAt: -1 }).limit(5);

    const notifications = [
      ...messages.map(m => ({
        id: m._id,
        type: 'message',
        title: `Nouveau message`,
        description: m.message.substring(0, 50) + '...',
        createdAt: m.createdAt,
        data: m
      })),
      ...orders.map(o => ({
        id: `order-${o._id}`,
        type: 'order',
        title: `Commande #${o._id.slice(-6)} ${o.status}`,
        description: `Total: ${o.total} DT`,
        createdAt: o.updatedAt || o.createdAt,
        data: o
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const notifId = req.params.id;

    if (isDemoMode()) {
      return res.json({ message: 'Marked as read' });
    }

    if (!notifId.startsWith('new-order-') && !notifId.startsWith('complaint-') && !notifId.startsWith('review-')) {
      await Message.updateOne({ _id: notifId, receiver: req.user.id }, { isRead: true });
    }

    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json({ unread: 0 });
    }

    const isAdmin = req.user.role === 'admin';

    if (isAdmin) {
      const todayStart = getTodayStart();

      const newOrdersCount = await Order.countDocuments({
        status: 'pending',
        createdAt: { $gte: todayStart }
      });

      const pendingComplaintsCount = await Complaint.countDocuments({
        status: 'pending'
      });

      const newReviewsCount = await Review.countDocuments({
        createdAt: { $gte: todayStart }
      });

      const unreadMessagesCount = await Message.countDocuments({
        'receiver.userId': req.user.id,
        isRead: false
      });

      return res.json({
        unread: newOrdersCount + pendingComplaintsCount + newReviewsCount + unreadMessagesCount
      });
    }

    const unreadMessages = await Message.countDocuments({
      receiver: req.user.id,
      isRead: false
    });

    const unreadOrders = await Order.countDocuments({
      userId: req.user.id,
      status: 'shipped'
    });

    res.json({ unread: unreadMessages + unreadOrders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  getUnreadCount
};


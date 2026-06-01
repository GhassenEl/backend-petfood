const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const orderService = require('../services/order.service');

const getUserId = (req) => req.user?.id || req.user?._id || req.user?.userId;


const handleError = (res, error, defaultStatus = 500) => {
  return res.status(error.status || defaultStatus).json({ error: error.message });
};

const getOrders = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getOrders(req.user));
    }

    const orders = await orderService.getOrders(req.user);
    res.json(orders);
  } catch (error) {
    handleError(res, error);
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

    const stats = await orderService.getStats(req.user.role);
    res.json(stats);
  } catch (error) {
    handleError(res, error);
  }
};

const createOrder = async (req, res) => {
  try {
    if (isDemoMode()) {
      const result = demoStore.createOrder(req.user, req.body);
      return res.status(201).json(result);
    }

    const result = await orderService.createOrder(getUserId(req), req.body);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, error.status || 400);
  }
};

const createAdminOrder = async (req, res) => {
  try {
    if (isDemoMode()) {
      const result = demoStore.createOrder({ _id: req.body.userId }, req.body);
      return res.status(201).json(result);
    }

    const result = await orderService.createAdminOrder(req.body);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, error.status || 400);
  }
};

const updateOrder = async (req, res) => {
  try {
    if (isDemoMode()) {
      const order = demoStore.updateOrder(req.params.id, req.body);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      return res.json(order);
    }

    const order = await orderService.updateOrder(req.params.id, req.body);
    res.json(order);
  } catch (error) {
    handleError(res, error, error.status || 400);
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { status, deliveryNote } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    if (isDemoMode()) {
      if (req.user.role === 'livreur') {
        const order = demoStore.getOrders(req.user).find((o) => o._id === req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        const flow = { pending: 'shipped', shipped: 'delivered' };
        if (flow[order.status] !== status) {
          return res.status(400).json({ error: 'Invalid status transition' });
        }
      }
      const updated = demoStore.updateOrder(req.params.id, { status });
      if (!updated) return res.status(404).json({ error: 'Order not found' });
      return res.json(updated);
    }

    const order = await orderService.livreurUpdateStatus(req.params.id, req.user, status, {
      deliveryNote,
    });
    res.json(order);
  } catch (error) {
    handleError(res, error, error.status || 400);
  }
};

const deleteOrder = async (req, res) => {
  try {
    if (isDemoMode()) {
      const order = demoStore.deleteOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      return res.json({ message: 'Order deleted' });
    }

    await orderService.deleteOrder(req.params.id, req.user);
    res.json({ message: 'Order deleted' });
  } catch (error) {
    handleError(res, error, error.status || 500);
  }
};

const getOrderTracking = async (req, res) => {
  try {
    if (isDemoMode()) {
      const order = demoStore.getOrders(req.user).find((o) => o._id === req.params.id);
      if (!order) return res.status(404).json({ error: 'Commande introuvable' });
      return res.json({
        orderId: order._id,
        status: order.status,
        livreur: order.status === 'shipped' ? { name: 'Livreur démo' } : null,
      });
    }

    const data = await orderService.getOrderTracking(req.params.id, req.user);
    res.json(data);
  } catch (error) {
    handleError(res, error, error.status || 500);
  }
};

module.exports = {
  getOrders,
  getStats,
  createOrder,
  createAdminOrder,
  updateOrder,
  updateOrderStatus,
  deleteOrder,
  getOrderTracking,
};
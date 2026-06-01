const serviceBookingService = require('../services/serviceBooking.service');

const getCatalog = async (_req, res) => {
  res.json(serviceBookingService.getCatalog());
};

const getSlots = async (req, res) => {
  try {
    const result = await serviceBookingService.getSlots(req.query.date);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const listBookings = async (req, res) => {
  try {
    const list = await serviceBookingService.listBookings(req.user);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createBooking = async (req, res) => {
  try {
    const booking = await serviceBookingService.createBooking(req.user, req.body);
    res.status(201).json(booking);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

const payBooking = async (req, res) => {
  try {
    const booking = await serviceBookingService.payBooking(
      req.user,
      req.params.id,
      req.body?.paymentMethod
    );
    res.json(booking);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const booking = await serviceBookingService.cancelBooking(req.user, req.params.id);
    res.json(booking);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

const estimatePrice = async (req, res) => {
  try {
    const { type, date, endDate } = req.query;
    const price = serviceBookingService.computePrice(
      type,
      date || new Date(),
      endDate ? new Date(endDate) : null
    );
    res.json({ price, type });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getCatalog,
  getSlots,
  listBookings,
  createBooking,
  payBooking,
  cancelBooking,
  estimatePrice,
};

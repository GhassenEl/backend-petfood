const leaveRequestService = require('../services/leaveRequest.service');

const handleError = (res, error, fallback = 500) => {
  res.status(error.status || fallback).json({ error: error.message });
};

const createRequest = async (req, res) => {
  try {
    const row = await leaveRequestService.createLeaveRequest(req.user, req.body);
    res.status(201).json(row);
  } catch (error) {
    handleError(res, error, 400);
  }
};

const getMine = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const rows = await leaveRequestService.getMyLeaveRequests(userId);
    res.json(rows);
  } catch (error) {
    handleError(res, error);
  }
};

const getAll = async (req, res) => {
  try {
    const rows = await leaveRequestService.getAllLeaveRequests({
      status: req.query.status,
      staffRole: req.query.staffRole,
    });
    res.json(rows);
  } catch (error) {
    handleError(res, error);
  }
};

const review = async (req, res) => {
  try {
    const row = await leaveRequestService.reviewLeaveRequest(req.user, req.params.id, req.body);
    res.json(row);
  } catch (error) {
    handleError(res, error, 400);
  }
};

const cancel = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const result = await leaveRequestService.cancelLeaveRequest(userId, req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error, 400);
  }
};

module.exports = {
  createRequest,
  getMine,
  getAll,
  review,
  cancel,
};

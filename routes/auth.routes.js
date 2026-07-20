const express = require('express');
const { auth } = require('../middleware/auth');
const { loginLimiter, forgotPasswordLimiter, registerLimiter } = require('../middleware/rateLimit');
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  changePassword,
  me,
  logout,
  refresh,
} = require('../controllers/auth.controller');
const router = express.Router();

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', registerLimiter, resetPassword);
router.put('/change-password', auth, registerLimiter, changePassword);
router.get('/me', auth, me);
router.post('/logout', auth, logout);
router.post('/refresh', auth, refresh);

module.exports = router;


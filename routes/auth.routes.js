const express = require('express');
const { auth } = require('../middleware/auth');
const { loginLimiter, forgotPasswordLimiter, registerLimiter } = require('../middleware/rateLimit');
const { register, login, forgotPassword, resetPassword, changePassword } = require('../controllers/auth.controller');
const router = express.Router();

// Register
router.post('/register', registerLimiter, register);

// Login
router.post('/login', loginLimiter, login);

// Forgot password - send reset email simulation
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);

// Reset password with token
router.post('/reset-password', registerLimiter, resetPassword);

// Change password (authenticated)
router.put('/change-password', auth, registerLimiter, changePassword);

module.exports = router;


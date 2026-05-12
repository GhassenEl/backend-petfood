const express = require('express');
const { loginLimiter, forgotPasswordLimiter, registerLimiter } = require('../middleware/rateLimit');
const { register, login, forgotPassword, resetPassword } = require('../controllers/auth.controller');
const router = express.Router();

// Register
router.post('/register', registerLimiter, register);

// Login
router.post('/login', loginLimiter, login);

// Forgot password - send reset email simulation
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);

// Reset password with token
router.post('/reset-password', registerLimiter, resetPassword);

module.exports = router;


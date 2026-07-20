const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  skipSuccessfulRequests: true,
  message: { error: 'Trop de tentatives de connexion. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Trop de tentatives de récupération. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Trop de tentatives d\'inscription. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const securityScanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Trop de scans sécurité. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  registerLimiter,
  securityScanLimiter,
};
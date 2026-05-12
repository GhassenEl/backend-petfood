const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const demoUsers = {
  'admin@petfood.tn': {
    _id: 'demo_admin',
    email: 'admin@petfood.tn',
    name: 'El Jezi Ghassen',
    role: 'admin',
    demoPassword: 'PetfoodTN2024!'
  },
  'client@petfood.tn': {
    _id: 'demo_client',
    email: 'client@petfood.tn',
    name: 'Client Test',
    role: 'client',
    demoPassword: 'MonChat123!'
  },
  'livreur@petfood.tn': {
    _id: 'demo_livreur',
    email: 'livreur@petfood.tn',
    name: 'Livreur Test',
    role: 'livreur',
    demoPassword: 'Livreur123!'
  },
};

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

const register = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.status(400).json({ error: 'Register disabled in demo mode - use demo accounts' });
    }
    const { email, password, role } = req.body;
    const name = req.body.name || [req.body.prenom, req.body.nom].filter(Boolean).join(' ').trim();

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password and name are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      phone: req.body.phone || req.body.telephone || '',
      address: req.body.address || '',
      role: role || 'client',
    });
    await user.save();
    const token = jwt.sign(
      { id: String(user._id), email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(201).json({ token, user: { id: user._id, email, name, role } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(400).json({ error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    let user;

    // Prefer DB lookup (gives real ObjectId so the rest of the API works)
    if (!isDemoMode()) {
      try {
        user = await User.findOne({ email: email.toLowerCase() });
      } catch (e) {
        console.error('Login DB error:', e);
      }
      if (user) {
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
      }
    }

    // Fallback: hard-coded demo accounts (only used when DB is offline)
    if (!user) {
      const demo = demoUsers[email.toLowerCase()];
      if (demo) {
        if (password !== demo.demoPassword) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        user = demo;
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const normalizedUser = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = jwt.sign(
      { id: normalizedUser.id, email: normalizedUser.email, name: normalizedUser.name, role: normalizedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: normalizedUser });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    let user;
    if (isDemoMode()) {
      user = demoUsers[email.toLowerCase()];
      if (!user) {
        return res.status(404).json({ error: 'Email not found' });
      }
    } else {
      user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(404).json({ error: 'Email not found' });
      }
    }

    // Generate reset token (15min expiry)
    const resetToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // In production: sendEmail(email, resetToken)
    console.log(`🔄 Reset token for ${email}: ${resetToken}`);
    console.log(`💡 Use this token in /reset-password within 15min`);

    res.json({
      message: 'Reset link sent to email (check console for token in dev)',
      expiresIn: 15 * 60 * 1000 // ms
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password required' });
    }

    // Verify reset token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user;
    if (isDemoMode()) {
      user = demoUsers[decoded.email];
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      // Demo: log password change (no real DB update)
      console.log(`🔓 Demo password reset for ${decoded.email} - NEW: ${password}`);
      return res.json({ message: 'Password reset successful (demo mode - logged)' });
    } else {
      user = await User.findById(decoded.id);
      if (!user || user.email !== decoded.email) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Update password
      user.password = await bcrypt.hash(password, 12);
      await user.save();
    }

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired (15min)' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: error.message });
  }
};

module.exports = { register, login, forgotPassword, resetPassword };

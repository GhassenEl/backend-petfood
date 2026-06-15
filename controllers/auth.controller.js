const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma, isDemoMode } = require('../prismaClient');
const { normalizeEmail, validateEmail, validatePassword } = require('../utils/authValidation');
const { recordFailedLogin, resetFailedLogin } = require('../services/intrusionDetection.service');
const { logFromRequest } = require('../services/activityLog.service');

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
    region: 'Tunis',
    demoPassword: 'Livreur123!'
  },
  'vet@petfood.tn': {
    _id: 'demo_vet',
    email: 'vet@petfood.tn',
    name: 'Dr. Salma Khelifi',
    role: 'vet',
    demoPassword: 'Vet2024!'
  },
  'moderator@petfood.tn': {
    _id: 'demo_moderator',
    email: 'moderator@petfood.tn',
    name: 'Nour Modération',
    role: 'moderator',
    demoPassword: 'Mod2024!'
  },
  'vendor@petfood.tn': {
    _id: 'demo_vendor',
    email: 'vendor@petfood.tn',
    name: 'Leila Mansouri',
    role: 'vendor',
    demoPassword: 'Vendor2024!'
  },
};

const register = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.status(400).json({
        error: 'Inscription désactivée en mode démo. Utilisez un compte de démonstration.',
      });
    }

    const { password, role } = req.body;
    const email = normalizeEmail(req.body.email);
    const name = (req.body.name || [req.body.prenom, req.body.nom].filter(Boolean).join(' ')).trim();

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, mot de passe et nom requis.' });
    }

    const emailErr = validateEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });

    const passwordErr = validatePassword(password);
    if (passwordErr) return res.status(400).json({ error: passwordErr });

    if (role === 'admin') {
      return res.status(403).json({ error: 'Création de compte administrateur interdite.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone: req.body.phone || req.body.telephone || '',
        address: req.body.address || '',
        region: req.body.region || null,
        role: 'client',
      }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    console.error('Register error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Un compte existe déjà avec cet email.' });
    }
    res.status(400).json({ error: error.message || 'Erreur lors de l\'inscription.' });
  }
};

const login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }

    const emailErr = validateEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });

    const passwordErr = validatePassword(password);
    if (passwordErr) return res.status(400).json({ error: passwordErr });

    let user;
    if (!isDemoMode()) {
      user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        if (user.isActive === false) {
          return res.status(403).json({ error: 'Compte désactivé. Contactez l\'administration.' });
        }
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
          recordFailedLogin(req.ip, email);
          await logFromRequest(req, {
            actorRole: 'client',
            actorName: email,
            action: 'login_failed',
            target: email,
            details: 'Identifiants incorrects',
            module: 'auth',
          });
          return res.status(401).json({ error: 'Identifiants incorrects. Vérifiez votre email et mot de passe.' });
        }
      }
    }

    if (!user) {
      const demo = demoUsers[email];
      if (demo) {
        if (password !== demo.demoPassword) {
          recordFailedLogin(req.ip, email);
          await logFromRequest(req, {
            actorRole: 'client',
            actorName: email,
            action: 'login_failed',
            target: email,
            module: 'auth',
          });
          return res.status(401).json({ error: 'Identifiants incorrects. Vérifiez votre email et mot de passe.' });
        }
        user = demo;
      }
    }

    if (!user) {
      recordFailedLogin(req.ip, email);
      return res.status(401).json({ error: 'Identifiants incorrects. Vérifiez votre email et mot de passe.' });
    }

    resetFailedLogin(req.ip);

    const normalizedUser = {
      id: String(user.id || user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    await logFromRequest(req, {
      actorRole: normalizedUser.role,
      actorName: normalizedUser.name,
      action: 'login_success',
      target: normalizedUser.email,
      module: 'auth',
    });

    const token = jwt.sign(
      { id: normalizedUser.id, email: normalizedUser.email, name: normalizedUser.name, role: normalizedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: normalizedUser });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ error: 'Adresse email requise.' });
    }

    const emailErr = validateEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });

    let user;
    if (isDemoMode()) {
      user = demoUsers[email];
      if (!user) {
        return res.status(404).json({ error: 'Aucun compte associé à cet email.' });
      }
    } else {
      user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return res.status(404).json({ error: 'Aucun compte associé à cet email.' });
      }
      if (user.isActive === false) {
        return res.status(403).json({ error: 'Compte désactivé. Contactez l\'administration.' });
      }
    }

    const resetToken = jwt.sign(
      { id: user.id || user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    console.log(`🔄 Reset token for ${email}: ${resetToken}`);
    console.log('💡 Lien dev : /reset-password?token=...');

    const response = {
      message: 'Si un compte existe, un lien de réinitialisation a été envoyé par email.',
      expiresIn: 15 * 60 * 1000,
    };

    if (process.env.NODE_ENV !== 'production') {
      response.resetToken = resetToken;
      response.devNote = 'Mode développement : utilisez le lien ci-dessous (valide 15 min).';
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Impossible d\'envoyer le lien. Réessayez plus tard.' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token et mot de passe requis.' });
    }

    const passwordErr = validatePassword(password);
    if (passwordErr) return res.status(400).json({ error: passwordErr });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user;
    if (isDemoMode()) {
      user = demoUsers[decoded.email];
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur introuvable.' });
      }
      console.log(`🔓 Demo password reset for ${decoded.email} - NEW: ${password}`);
      return res.json({ message: 'Mot de passe réinitialisé avec succès.' });
    }

    user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || user.email !== decoded.email) {
      return res.status(401).json({ error: 'Lien invalide ou expiré.' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ error: 'Compte désactivé. Contactez l\'administration.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(password, 12) }
    });

    res.json({ message: 'Mot de passe réinitialisé avec succès.' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Lien expiré (15 minutes). Demandez un nouveau lien.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Lien invalide ou expiré.' });
    }
    res.status(500).json({ error: 'Impossible de réinitialiser le mot de passe.' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis.' });
    }

    const passwordErr = validatePassword(newPassword);
    if (passwordErr) return res.status(400).json({ error: passwordErr });

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit être différent de l\'actuel.' });
    }

    const userId = req.user.id || req.user._id;

    if (isDemoMode() || String(userId).startsWith('demo_')) {
      const email = normalizeEmail(req.user.email);
      const demo = demoUsers[email];
      if (!demo || currentPassword !== demo.demoPassword) {
        return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
      }
      demo.demoPassword = newPassword;
      console.log(`🔐 Demo password changed for ${email}`);
      return res.json({ message: 'Mot de passe modifié avec succès.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { password: await bcrypt.hash(newPassword, 12) },
    });

    res.json({ message: 'Mot de passe modifié avec succès.' });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de modifier le mot de passe.' });
  }
};

module.exports = { register, login, forgotPassword, resetPassword, changePassword };

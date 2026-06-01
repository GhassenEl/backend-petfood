const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const validateEmail = (email) => {
  const value = normalizeEmail(email);
  if (!value) return 'L\'adresse email est requise';
  if (value.length > 254) return 'L\'email ne peut pas dépasser 254 caractères';
  if (!EMAIL_REGEX.test(value)) return 'Format d\'email invalide';
  return null;
};

const validatePassword = (password) => {
  if (password == null || password === '') return 'Le mot de passe est requis';
  if (password.length < 6) return 'Le mot de passe doit contenir au moins 6 caractères';
  if (password.length > 128) return 'Le mot de passe ne peut pas dépasser 128 caractères';
  if (/\s/.test(password)) return 'Le mot de passe ne doit pas contenir d\'espaces';
  return null;
};

module.exports = { normalizeEmail, validateEmail, validatePassword };

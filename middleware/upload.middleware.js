const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

const ALLOWED_FOLDERS = new Set(['products', 'vendors', 'blog', 'misc']);

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const isAllowedFolder = (folder) => ALLOWED_FOLDERS.has(String(folder || '').toLowerCase());

const createUploader = (folder) => {
  const safeFolder = String(folder || 'products').toLowerCase();
  if (!isAllowedFolder(safeFolder)) {
    throw new Error('Dossier upload invalide');
  }

  const dest = path.join(UPLOAD_ROOT, safeFolder);
  ensureDir(dest);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dest),
    filename: (_req, file, cb) => {
      const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.jpg';
      const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      cb(null, name);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME.has(file.mimetype)) {
        cb(null, true);
        return;
      }
      cb(new Error('Format non supporté — JPEG, PNG, WebP ou GIF uniquement'));
    },
  }).single('image');
};

const authorizeUpload = (req, res, next) => {
  const folder = String(req.params.folder || '').toLowerCase();
  if (!isAllowedFolder(folder)) {
    return res.status(400).json({ error: 'Dossier upload invalide' });
  }

  const role = req.user?.role;
  if (role === 'admin' || role === 'moderator') return next();
  if (role === 'vendor' && (folder === 'products' || folder === 'vendors')) return next();

  return res.status(403).json({ error: 'Rôle non autorisé pour cet upload' });
};

const handleUpload = (req, res, next) => {
  try {
    const upload = createUploader(req.params.folder);
    upload(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? 'Image trop volumineuse (max 5 Mo)'
          : (err.message || 'Upload échoué');
        return res.status(400).json({ error: message });
      }
      next();
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Upload échoué' });
  }
};

module.exports = {
  UPLOAD_ROOT,
  ALLOWED_FOLDERS,
  isAllowedFolder,
  authorizeUpload,
  handleUpload,
};

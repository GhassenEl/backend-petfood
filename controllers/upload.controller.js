const uploadImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Fichier image requis (champ « image »)' });
  }

  const folder = String(req.params.folder || 'products').toLowerCase();
  const url = `/api/uploads/${folder}/${req.file.filename}`;

  try {
    const { logFromRequest } = require('../services/activityLog.service');
    await logFromRequest(req, {
      action: 'upload_image',
      target: url,
      details: `${req.file.mimetype} · ${req.file.size} o`,
      module: folder === 'products' ? 'admin' : folder,
    });
  } catch {
    /* non bloquant */
  }

  return res.status(201).json({
    url,
    filename: req.file.filename,
    folder,
    size: req.file.size,
    mimeType: req.file.mimetype,
  });
};

module.exports = { uploadImage };

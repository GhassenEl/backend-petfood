const { prisma } = require('../prismaClient');

const feederDeviceAuth = async (req, res, next) => {
  try {
    const deviceKey = req.header('X-Device-Key') || req.header('x-device-key');
    if (!deviceKey) {
      return res.status(401).json({ error: 'X-Device-Key requis' });
    }

    const feeder = await prisma.petFeeder.findUnique({ where: { deviceKey: String(deviceKey) } });
    if (!feeder) {
      return res.status(401).json({ error: 'Appareil non reconnu' });
    }

    req.feeder = feeder;
    next();
  } catch (error) {
    console.error('feederDeviceAuth error:', error);
    res.status(500).json({ error: 'Erreur authentification appareil' });
  }
};

module.exports = feederDeviceAuth;

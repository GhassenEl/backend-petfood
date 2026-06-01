const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');

const {
  getAvailabilitySlots,
  getMyAppointments,
  createAppointment,
  confirmAppointment,
  updateAppointment,
  deleteAppointment,
} = require('../controllers/veterinaryAppointments.controller');

const router = express.Router();

// Alias routes (in case frontend or proxy hits older/newer paths)
// Support both:
//  - /api/veterinary/appointments...
//  - /api/veterinaryAppointments...

router.get('/appointments', auth, getMyAppointments);
router.get('/appointments/all', auth, async (req, res, next) => {
  try {
    const { prisma, isDemoMode } = require('../prismaClient');
    if (isDemoMode()) {
      const { createPetAppointments } = require('../utils/demoStore');
      return res.json(createPetAppointments({ ownerId: req.user?.id || req.user?._id || 'demo_admin', count: 25 }));
    }

    const isAdmin = req.user?.role === 'admin';
    const appointments = await prisma.petAppointment.findMany({
      where: {
        type: {
          notIn: ['anniversaire', 'competitions', 'salle de sport', 'coiffure', 'cadeau', 'autre'],
        },
      },
      orderBy: { date: 'asc' },
      ...(isAdmin ? { include: { owner: { select: { id: true, name: true, email: true } } } } : {}),
    });
    return res.json(appointments);
  } catch (e) {
    return next(e);
  }
});

router.post('/appointments', auth, createAppointment);
router.put('/appointments/:id', auth, adminAuth, updateAppointment);
router.delete('/appointments/:id', auth, adminAuth, deleteAppointment);
router.put('/appointments/:id/confirm', auth, adminAuth, confirmAppointment);
router.get('/availability', auth, getAvailabilitySlots);

module.exports = router;


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

// Client (consult only)
router.get('/availability', auth, getAvailabilitySlots);
router.get('/appointments', auth, getMyAppointments);

// Admin/Vet confirm
router.put('/appointments/:id/confirm', auth, adminAuth, confirmAppointment);


// Admin: list all appointments
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

// Clients can create their own appointments; admins can create for a selected owner.
router.post('/appointments', auth, createAppointment);
router.put('/appointments/:id', auth, adminAuth, updateAppointment);
router.delete('/appointments/:id', auth, adminAuth, deleteAppointment);



module.exports = router;


const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');

const getUserId = (req) => req.user?.id || req.user?._id || req.user?.userId;

const isDemoUser = (user) => {
  const id = user?.id ?? user?._id;
  return typeof id === 'string' && id.startsWith('demo_');
};

const getMyComplaints = async (req, res) => {
  try {
    if (isDemoMode() || isDemoUser(req.user)) {
      return res.json(demoStore.getComplaints(req.user));
    }

    const complaints = await prisma.complaint.findMany({
      where: { userId: getUserId(req) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createComplaint = async (req, res) => {
  try {
    const { subject, orderId } = req.body;
    const message = req.body.message || req.body.description;

    if (isDemoMode() || isDemoUser(req.user)) {
      return res.status(201).json(demoStore.createComplaint(req.user, { subject, message, orderId }));
    }

    const complaint = await prisma.complaint.create({
      data: {
        userId: getUserId(req),
        subject,
        message,
        orderId: orderId || null,
        status: 'pending'
      }
    });

    try {
      const { emitToRole } = require('../utils/notificationHub');
      emitToRole('admin', {
        id: `complaint-${complaint.id}`,
        type: 'new_complaint',
        title: `Réclamation : ${subject}`,
        description: String(message || '').slice(0, 120),
        link: '/admin/complaints',
        read: false,
        createdAt: complaint.createdAt,
      });
    } catch {
      /* notification optional */
    }

    res.status(201).json(complaint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getComplaintCount = async (req, res) => {
  try {
    if (isDemoMode() || isDemoUser(req.user)) {
      return res.json({ count: demoStore.getComplaints(req.user).length });
    }

    const count = await prisma.complaint.count();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createAdminComplaint = async (req, res) => {
  try {
    const { userId, subject, message, orderId } = req.body;
    if (isDemoMode() || isDemoUser(req.user)) {
      return res.status(201).json(demoStore.createComplaint({ _id: userId }, { subject, message, orderId }));
    }

    const complaint = await prisma.complaint.create({
      data: {
        userId: userId || null,
        subject,
        message,
        orderId: orderId || null,
        status: 'pending'
      }
    });

    const populated = await prisma.complaint.findUnique({
      where: { id: complaint.id },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllComplaints = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getComplaints(req.user));
    }
    const complaints = await prisma.complaint.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateComplaint = async (req, res) => {
  try {
    const { response, status } = req.body;
    if (isDemoMode()) {
      const complaint = demoStore.updateComplaint(req.params.id, { response, status });
      if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
      return res.json(complaint);
    }

    const existing = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Complaint not found' });

    const data = {};
    if (response !== undefined) data.response = response;
    if (status !== undefined) data.status = status;
    if (req.body.subject !== undefined) data.subject = req.body.subject;
    if (req.body.message !== undefined) data.message = req.body.message;
    if (req.body.orderId !== undefined) data.orderId = req.body.orderId || null;
    if (req.body.userId !== undefined) data.userId = req.body.userId || null;

    const complaint = await prisma.complaint.update({
      where: { id: req.params.id },
      data: Object.keys(data).length ? data : { status: 'resolved' },
    });
    res.json(complaint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteComplaint = async (req, res) => {
  try {
    if (isDemoMode()) {
      const complaint = demoStore.deleteComplaint?.(req.params.id) || { message: 'Deleted' };
      return res.json(complaint);
    }

    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    if (req.user.role !== 'admin' && getUserId(req) !== complaint.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.complaint.delete({ where: { id: req.params.id } });
    res.json({ message: 'Complaint deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMyComplaints,
  createComplaint,
  getComplaintCount,
  createAdminComplaint,
  getAllComplaints,
  updateComplaint,
  deleteComplaint
};


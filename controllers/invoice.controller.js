const { prisma, isDemoMode } = require('../prismaClient');
const {
  normalizePaymentMethod,
  isValidPaymentMethod,
} = require('../utils/paymentMethods');

const getUserId = (req) => req.user?.id || req.user?._id || req.user?.userId;


const getMyInvoices = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(require('../utils/demoStore').getInvoices(req.user));
    }
    const invoices = await prisma.invoice.findMany({
      where: { userId: getUserId(req) },
      orderBy: { issuedAt: 'desc' },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, price: true, discount: true, imageUrl: true } }
              }
            }
          }
        }
      }
    });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const payInvoice = async (req, res) => {
  try {
    const rawMethod = req.body.paymentMethod;
    if (rawMethod && !isValidPaymentMethod(rawMethod)) {
      return res.status(400).json({ error: 'Méthode de paiement non reconnue' });
    }
    const paymentMethod = normalizePaymentMethod(rawMethod);

    if (isDemoMode()) {
      const invoice = require('../utils/demoStore').payInvoice(req.user, req.params.id, paymentMethod);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      return res.json(invoice);
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice || invoice.userId !== getUserId(req)) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (invoice.status === 'paid') return res.status(400).json({ error: 'Already paid' });

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        status: 'paid',
        paymentMethod: paymentMethod || invoice.paymentMethod,
        paidAt: new Date()
      }
    });
    await prisma.order.update({
      where: { id: invoice.orderId },
      data: {
        status: 'paid',
        paymentMethod: paymentMethod || invoice.paymentMethod
      }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllInvoices = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(require('../utils/demoStore').getInvoices(req.user));
    }
    const invoices = await prisma.invoice.findMany({
      orderBy: { issuedAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: {
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, price: true, discount: true, imageUrl: true } }
              }
            }
          }
        }
      }
    });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createInvoice = async (req, res) => {
  try {
    const invoice = await prisma.invoice.create({
      data: {
        userId: req.body.userId,
        orderId: req.body.orderId,
        amount: Number(req.body.amount || 0),
        status: req.body.status || 'unpaid',
        paymentMethod: req.body.paymentMethod || 'cash',
        paidAt: req.body.status === 'paid' ? new Date() : null
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: {
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, price: true, discount: true, imageUrl: true } }
              }
            }
          }
        }
      }
    });
    res.status(201).json(invoice);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateInvoice = async (req, res) => {
  try {
    const data = {};
    if (req.body.userId) data.userId = req.body.userId;
    if (req.body.orderId) data.orderId = req.body.orderId;
    if (req.body.amount !== undefined) data.amount = Number(req.body.amount);
    if (req.body.status) {
      data.status = req.body.status;
      data.paidAt = req.body.status === 'paid' ? new Date() : null;
    }
    if (req.body.paymentMethod) data.paymentMethod = req.body.paymentMethod;

    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: {
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, price: true, discount: true, imageUrl: true } }
              }
            }
          }
        }
      }
    });
    res.json(invoice);
  } catch (error) {
    res.status(error.code === 'P2025' ? 404 : 400).json({ error: error.message });
  }
};

const deleteInvoice = async (req, res) => {
  try {
    await prisma.invoice.delete({ where: { id: req.params.id } });
    res.json({ message: 'Invoice deleted' });
  } catch (error) {
    res.status(error.code === 'P2025' ? 404 : 500).json({ error: error.message });
  }
};

module.exports = {
  getMyInvoices,
  payInvoice,
  getAllInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice
};


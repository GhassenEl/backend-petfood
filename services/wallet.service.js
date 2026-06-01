const { prisma, isDemoMode } = require('../prismaClient');
const { useDemoStore } = require('../utils/demoUser');

const demoWallets = new Map();

const ensureDemoWallet = (userId) => {
  if (!demoWallets.has(userId)) {
    demoWallets.set(userId, {
      balance: 50,
      transactions: [
        {
          id: `wt_demo_${userId}_1`,
          userId,
          amount: 50,
          type: 'credit',
          reason: 'Crédit de bienvenue',
          referenceId: null,
          balanceAfter: 50,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }
  return demoWallets.get(userId);
};

const shouldUseDemo = (user) => isDemoMode() || useDemoStore(user);

const getWallet = async (userId, user = null) => {
  if (shouldUseDemo(user || { id: userId })) {
    const w = ensureDemoWallet(userId);
    return { balance: w.balance, transactions: w.transactions.slice(0, 30) };
  }

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true },
  });
  if (!row) return null;

  const transactions = await prisma.walletTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return { balance: row.walletBalance || 0, transactions };
};

const creditWallet = async (userId, amount, reason, referenceId = null, user = null) => {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!value || value <= 0) {
    const err = new Error('Montant invalide');
    err.status = 400;
    throw err;
  }

  if (shouldUseDemo(user || { id: userId })) {
    const w = ensureDemoWallet(userId);
    w.balance = Math.round((w.balance + value) * 100) / 100;
    const tx = {
      id: `wt_${Date.now()}`,
      userId,
      amount: value,
      type: 'credit',
      reason,
      referenceId,
      balanceAfter: w.balance,
      createdAt: new Date().toISOString(),
    };
    w.transactions.unshift(tx);
    return { balance: w.balance, transaction: tx };
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: value } },
      select: { walletBalance: true },
    });
    const entry = await tx.walletTransaction.create({
      data: {
        userId,
        amount: value,
        type: 'credit',
        reason,
        referenceId,
        balanceAfter: row.walletBalance,
      },
    });
    return { balance: row.walletBalance, transaction: entry };
  });
};

const debitWallet = async (userId, amount, reason, referenceId = null, user = null) => {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!value || value <= 0) {
    const err = new Error('Montant invalide');
    err.status = 400;
    throw err;
  }

  if (shouldUseDemo(user || { id: userId })) {
    const w = ensureDemoWallet(userId);
    if (w.balance < value) {
      const err = new Error('Solde insuffisant');
      err.status = 400;
      throw err;
    }
    w.balance = Math.round((w.balance - value) * 100) / 100;
    const tx = {
      id: `wt_${Date.now()}`,
      userId,
      amount: value,
      type: 'debit',
      reason,
      referenceId,
      balanceAfter: w.balance,
      createdAt: new Date().toISOString(),
    };
    w.transactions.unshift(tx);
    return { balance: w.balance, transaction: tx };
  }

  const row = await prisma.user.findUnique({ where: { id: userId }, select: { walletBalance: true } });
  if (!row || (row.walletBalance || 0) < value) {
    const err = new Error('Solde insuffisant');
    err.status = 400;
    throw err;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { decrement: value } },
      select: { walletBalance: true },
    });
    const entry = await tx.walletTransaction.create({
      data: {
        userId,
        amount: value,
        type: 'debit',
        reason,
        referenceId,
        balanceAfter: updated.walletBalance,
      },
    });
    return { balance: updated.walletBalance, transaction: entry };
  });
};

module.exports = {
  getWallet,
  creditWallet,
  debitWallet,
};

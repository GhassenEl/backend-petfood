const { prisma } = require('../prismaClient');

const submitContact = async (req, res) => {
  try {
    const { name, email, subject, message, userId } = req.body;

    const contact = await prisma.complaint.create({
      data: {
        userId: userId || null,
        email: email || 'anonyme@contact.tn',
        name: name || null,
        subject,
        message,
        status: 'contact'
      }
    });

    res.status(201).json({ message: 'Message enregistré avec succès', contact });
  } catch (error) {
    console.error('Contact error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = {
  submitContact
};


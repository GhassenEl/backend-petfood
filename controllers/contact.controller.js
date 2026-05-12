const Complaint = require('../models/Complaint');

const submitContact = async (req, res) => {
  try {
    const { name, email, subject, message, userId } = req.body;

    const complaint = new Complaint({
      userId: userId || null,
      email: email || 'anonyme@contact.tn',
      subject,
      message,
      status: 'contact'
    });

    await complaint.save();
    res.status(201).json({ message: 'Message enregistré avec succès', complaint });
  } catch (error) {
    console.error('Contact error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = {
  submitContact
};


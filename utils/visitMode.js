const normalizeVisitOptions = (body = {}) => {
  const raw = body.visitMode;
  const visitMode = ['home', 'online'].includes(raw) ? raw : 'cabinet';
  const homeAddress = visitMode === 'home' ? String(body.homeAddress || '').trim() : null;

  if (visitMode === 'home' && !homeAddress) {
    const error = new Error('Adresse de domicile requise pour une consultation à domicile');
    error.status = 400;
    throw error;
  }

  const typeByMode = {
    home: 'veterinary_home_visit',
    online: 'veterinary_teleconsultation',
    cabinet: body.type || 'veterinary_consultation',
  };

  return {
    visitMode,
    homeAddress,
    type: typeByMode[visitMode] || 'veterinary_consultation',
  };
};

const isOnlineVisit = (record) =>
  record?.visitMode === 'online' || record?.type === 'veterinary_teleconsultation';

module.exports = { normalizeVisitOptions, isOnlineVisit };

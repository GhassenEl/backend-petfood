const LEAVE_TYPES = {
  conge: { id: 'conge', label: 'Congé' },
  maladie: { id: 'maladie', label: 'Arrêt maladie' },
};

const LEAVE_STATUSES = {
  pending: { id: 'pending', label: 'En attente' },
  approved: { id: 'approved', label: 'Approuvé' },
  rejected: { id: 'rejected', label: 'Refusé' },
};

const STAFF_ROLES = ['vet', 'livreur'];

const isValidLeaveType = (t) => !!LEAVE_TYPES[t];
const isValidLeaveStatus = (s) => !!LEAVE_STATUSES[s];
const isStaffRole = (r) => STAFF_ROLES.includes(r);

const getLeaveTypeLabel = (t) => LEAVE_TYPES[t]?.label || t;
const getLeaveStatusLabel = (s) => LEAVE_STATUSES[s]?.label || s;

module.exports = {
  LEAVE_TYPES,
  LEAVE_STATUSES,
  STAFF_ROLES,
  isValidLeaveType,
  isValidLeaveStatus,
  isStaffRole,
  getLeaveTypeLabel,
  getLeaveStatusLabel,
};

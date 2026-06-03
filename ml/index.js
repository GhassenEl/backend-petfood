const metrics = require('./metrics');
const architectures = require('./architectures');
const autoSelect = require('./autoSelect');

module.exports = {
  ...metrics,
  ...architectures,
  ...autoSelect,
};

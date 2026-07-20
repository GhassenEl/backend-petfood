const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const getJwtOptions = () => {
  const options = { expiresIn: process.env.JWT_EXPIRES_IN || '7d' };
  if (process.env.JWT_ISSUER) options.issuer = process.env.JWT_ISSUER;
  if (process.env.JWT_AUDIENCE) options.audience = process.env.JWT_AUDIENCE;
  return options;
};

function signAccessToken(payload) {
  const jti = randomUUID();
  const token = jwt.sign(
    { ...payload, jti },
    process.env.JWT_SECRET,
    getJwtOptions(),
  );
  return { token, jti };
}

function decodeTokenUnsafe(token) {
  return jwt.decode(token);
}

module.exports = {
  signAccessToken,
  decodeTokenUnsafe,
  getJwtOptions,
};

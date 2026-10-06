const jwt = require('jsonwebtoken');
const User = require('../models/User');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Authentication is temporarily unavailable.' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.authMethod !== 'email-otp' || !decoded.email) {
      return res.status(401).json({ message: 'Please sign in again using email verification.' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

async function requireAdmin(req, res, next) {
  const user = await User.findById(req.user.id).lean();

  if (!user || user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }

  req.admin = user;
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
};

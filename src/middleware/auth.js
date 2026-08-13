const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const authHeader = req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
          error: 'No token, authorization denied'
      });
  }

  const token = authHeader.slice(7);
  if (!token) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  try {
   const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attaches { userId: '...' } to the request
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is invalid or expired' });
  }
};
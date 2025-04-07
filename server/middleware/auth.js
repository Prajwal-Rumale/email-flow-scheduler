const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function(req, res, next) {
  // Get token from cookies
  const token = req.cookies.token;
  
  // Check if token exists
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }
  
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user from payload
    req.user = await User.findById(decoded.id).select('-password');
    
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};
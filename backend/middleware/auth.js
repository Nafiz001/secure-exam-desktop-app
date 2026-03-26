const jwt = require('jsonwebtoken');

/**
 * Verify JWT token and attach user to request
 * Middleware: protect
 */
const protect = async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Check if token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized. No token provided'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Not authorized. Invalid token'
    });
  }
};

/**
 * Authorize based on roles
 * Middleware: authorize(...roles)
 * Usage: authorize('admin', 'teacher')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized. User not authenticated'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Role '${req.user.role}' is not authorized to access this resource`
      });
    }

    next();
  };
};

module.exports = {
  protect,
  authorize
};

const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'Internal Server Error';

  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    message = err.errors.map((e) => e.message).join(', ');
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    const field = err.errors?.[0]?.path || 'Field';
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    message = 'Referenced record does not exist';
  }

  if (err.name === 'SequelizeDatabaseError') {
    statusCode = 400;
    message = 'Invalid request data';
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Not authorized, token invalid';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Not authorized, token expired';
  }

  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    message = 'Internal Server Error';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;

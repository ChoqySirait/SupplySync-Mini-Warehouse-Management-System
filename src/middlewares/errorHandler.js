/**
 * Centralized Error Handler Middleware
 */

exports.errorHandler = (err, req, res, next) => {
    console.error('💥 Unhandled Application Error:', err);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Terjadi kesalahan internal pada server.';

    res.status(statusCode).json({
        status: 'Error',
        message: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

exports.notFoundHandler = (req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({
            status: 'Error',
            message: `Endpoint API '${req.method} ${req.originalUrl}' tidak ditemukan.`
        });
    }
    next();
};

const normalizeISBN = require('../utils/isbn');

module.exports = function (req, res, next) {
    try {
        if (req.body?.isbn) {
            req.body.isbn = normalizeISBN(req.body.isbn);
        }
    } catch (err) {
        return res.status(400).json({
        error: err.message
        });
    }
    next();
}
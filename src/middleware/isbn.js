const normalizeISBN = require('../utils/normalizeIsbn');

module.exports = function (req, res, next) {
    if (req.params.isbn) {
        req.params.isbn = normalizeISBN(req.params.isbn);
    }

    if (req.body?.isbn) {
        req.body.isbn = normalizeISBN(req.body.isbn);
    }
    next();
}
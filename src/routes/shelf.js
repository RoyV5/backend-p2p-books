const express = require('express');
const db = require('../config/db');
const auth = require('../middleware/auth');
const getBookData = require('../services/fetchingService');
const isbn = require('../middleware/isbn');

const router = express.Router();

router.use(isbn);

// single book addition route
router.post('/books', auth, async (req, res) => {
    const { isbn } = req.body
    const userId = req.user.id;

    if (!isbn) {
        return res.status(400).json({ error: 'ISBN is required'})
    }

    try {
        const cachedBook = await db.query(
            'SELECT * FROM books WHERE isbn = $1',
            [isbn]
        );

        let book;
        if (cachedBook.rows.length > 0) {
            book = cachedBook.rows[0];
        } else {
            book = await getBookData(isbn);
            await db.query(
                `INSERT INTO books
                    (isbn, title, authors, description, page_count, cover_url)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    book.isbn,
                    book.title,
                    book.authors,
                    book.description,
                    book.page_count,
                    book.cover_url
                ]
            );
        }

        await db.query(
            `INSERT INTO user_books (user_id, isbn)
             VALUES ($1, $2)
             ON CONFLICT (user_id, isbn) DO NOTHING`,
            [userId, book.isbn]
        )

        res.status(201).json(book)

    } catch (err) {
        console.error('Add book error:', err.message);
        res.status(500).json({ error: 'Error adding book' });
    }
});

router.get('/books', auth, async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await db.query(
            `SELECT
                b.isbn,
                b.title,
                b.authors,
                b.description,
                b.page_count,
                b.cover_url,
                b.created_at
             FROM books b
             JOIN user_books ub ON ub.isbn = b.isbn
             WHERE ub.user_id = $1
             ORDER BY ub.created_at DESC`,
            [userId]
        );
        res.json(result.rows);

    } catch (err) {
        console.error('Get shelf error:', err.message);
        res.status(500).json({ error: 'Error retrieving shelf' });
    }
});

router.delete('/books/:isbn', auth, async (req, res) => {
    const userId = req.user.id;
    const { isbn } = req.params;

    try {
        const result = await db.query(
            `DELETE FROM user_books
             WHERE user_id = $1 AND isbn = $2
             RETURNING isbn`,
            [userId, isbn]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Book not found on your shelf' });
        }

        res.status(204).send();

    } catch (err) {
        console.error('Delete book error:', err.message);
        res.status(500).json({ error: 'Error removing book' });
    }
});

module.exports = router;
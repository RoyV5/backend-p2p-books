const express = require('express');
const db = require('../config/db');
const auth = require('../middleware/auth');
const getBookData = require('../services/fetchingService');
const isbn = require('../middleware/isbn');
const { mapBook } = require('../mappers/bookMapper');
const { mapUser } = require('../mappers/userMapper');

const router = express.Router();


// Single book addition route
router.post('/', isbn, auth, async (req, res) => {
    const { isbn } = req.body;
    const userId = req.user.id;

    if (!isbn) {
        return res.status(400).json({ error: 'ISBN is required' });
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
                    (
                        isbn,
                        title,
                        authors,
                        description,
                        page_count,
                        cover_url,
                        publisher,
                        published_year,
                        language
                    )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    book.isbn,
                    book.title,
                    book.authors,
                    book.description,
                    book.page_count,
                    book.cover_url,
                    book.publisher,
                    book.published_year,
                    book.language
                ]
            );
        }

        const shelfEntry = await db.query(
            `INSERT INTO user_books (user_id, isbn)
             VALUES ($1, $2)
             ON CONFLICT (user_id, isbn) DO NOTHING
             RETURNING isbn`,
            [userId, book.isbn]
        );

        if (shelfEntry.rows.length === 0) {
            return res.status(409).json({
                error: 'Book is already on your shelf'
            });
        }

        res.status(201).json(mapBook(book));

    } catch (err) {
        if (err.code === 'BOOK_NOT_FOUND') {
            return res.status(404).json({
                error: err.message,
                code: err.code
            });
        }

        console.error('Add book error:', err.message);
        res.status(500).json({ error: 'Error adding book' });
    }
});


router.get('/', auth, async (req, res) => {
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
                b.publisher,
                b.published_year,
                b.language,
                b.created_at
             FROM books b
             JOIN user_books ub ON ub.isbn = b.isbn
             WHERE ub.user_id = $1
             ORDER BY ub.created_at DESC`,
            [userId]
        );

        res.json(result.rows.map(mapBook));

    } catch (err) {
        console.error('Get shelf error:', err.message);
        res.status(500).json({ error: 'Error retrieving shelf' });
    }
});


router.delete('/:isbn', auth, async (req, res) => {
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
            return res.status(404).json({
                error: 'Book not found on your shelf'
            });
        }

        res.status(204).send();

    } catch (err) {
        console.error('Delete book error:', err.message);
        res.status(500).json({ error: 'Error removing book' });
    }
});

router.get('/:userId', auth, async (req, res) => {
    const { userId } = req.params;
    const requesterId = req.user.id;

    try {
        const userResult = await db.query(
            `SELECT
                id,
                handle,
                display_name,
                description,
                profile_picture_path,
                private_profile
             FROM users
             WHERE id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const row = userResult.rows[0];
        const isOwner = row.id === requesterId;
        const isPrivate = row.private_profile;
        const canViewBooks = isOwner || !isPrivate;

        const user = mapUser(row);
        delete user.privateProfile;

        if (!canViewBooks) {
            return res.json({
                user,
                isPrivate,
                books: null
            });
        }

        const booksResult = await db.query(
            `SELECT
                b.isbn,
                b.title,
                b.authors,
                b.description,
                b.page_count,
                b.cover_url,
                b.publisher,
                b.published_year,
                b.language,
                b.created_at
             FROM books b
             JOIN user_books ub ON ub.isbn = b.isbn
             WHERE ub.user_id = $1
             ORDER BY ub.created_at DESC`,
            [row.id]
        );

        res.json({
            user,
            isPrivate,
            books: booksResult.rows.map(mapBook)
        });

    } catch (err) {
        console.error('Get user shelf error:', err.message);
        res.status(500).json({ error: 'Error retrieving shelf' });
    }
});


module.exports = router;
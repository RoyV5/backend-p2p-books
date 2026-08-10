const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const shelfRouter = require('../../src/routes/shelf');
const db = require('../../src/config/db');
const getBookData = require('../../src/services/fetchingService');

jest.mock('../../src/services/fetchingService');

function createApp() {
    const app = express();

    app.use(express.json());
    app.use('/shelf', shelfRouter);

    return app;
}

function createToken(userId) {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );
}

describe('Shelf routes', () => {
    const app = createApp();

    let user;
    let token;

    const book = {
        isbn: '9780140449266',
        title: 'The Odyssey',
        authors: ['Homer'],
        description: 'An epic poem.',
        page_count: 541,
        cover_url: 'https://example.com/cover.jpg',
        publisher: 'Penguin Classics',
        published_year: 2003,
        language: 'eng'
    };

    beforeEach(async () => {
        const result = await db.query(
            `INSERT INTO users (
                email,
                password_hash,
                display_name
            )
            VALUES ($1, $2, $3)
            RETURNING id, email, display_name`,
            [
                'test@example.com',
                'not-a-real-password-hash',
                'Test User'
            ]
        );

        user = result.rows[0];
        token = createToken(user.id);

        getBookData.mockReset();
    });

    describe('POST /shelf', () => {
        test('adds a new book to the user shelf', async () => {
            getBookData.mockResolvedValue(book);

            const response = await request(app)
                .post('/shelf')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    isbn: book.isbn
                });

            expect(response.statusCode).toBe(201);

            expect(response.body).toEqual(book);

            const result = await db.query(
                `SELECT ub.user_id, ub.isbn
                 FROM user_books ub
                 WHERE ub.user_id = $1`,
                [user.id]
            );

            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].isbn).toBe(book.isbn);
        });

        test('fetches book data when the book is not cached', async () => {
            getBookData.mockResolvedValue(book);

            await request(app)
                .post('/shelf')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    isbn: book.isbn
                });

            expect(getBookData).toHaveBeenCalledTimes(1);
            expect(getBookData).toHaveBeenCalledWith(book.isbn);
        });

        test('uses cached book instead of fetching it again', async () => {
            await db.query(
                `INSERT INTO books (
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

            const response = await request(app)
                .post('/shelf')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    isbn: book.isbn
                });

            expect(response.statusCode).toBe(201);
            expect(response.body.isbn).toBe(book.isbn);
            expect(getBookData).not.toHaveBeenCalled();
        });

        test('does not duplicate a book on the same shelf', async () => {
            getBookData.mockResolvedValue(book);

            await request(app)
                .post('/shelf')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    isbn: book.isbn
                });

            await request(app)
                .post('/shelf')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    isbn: book.isbn
                });

            const result = await db.query(
                `SELECT *
                 FROM user_books
                 WHERE user_id = $1
                   AND isbn = $2`,
                [user.id, book.isbn]
            );

            expect(result.rows).toHaveLength(1);
        });

        test('rejects an invalid ISBN', async () => {
            const response = await request(app)
                .post('/shelf')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    isbn: 'not-an-isbn'
                });

            expect(response.statusCode).toBe(400);
            expect(getBookData).not.toHaveBeenCalled();
        });

        test('rejects an unauthenticated request', async () => {
            getBookData.mockResolvedValue(book);

            const response = await request(app)
                .post('/shelf')
                .send({
                    isbn: book.isbn
                });

            expect(response.statusCode).toBe(401);
            expect(getBookData).not.toHaveBeenCalled();
        });
    });

    describe('GET /shelf', () => {
        test('lists the authenticated user shelf', async () => {
            await db.query(
                `INSERT INTO books (
                    isbn,
                    title,
                    authors
                )
                VALUES ($1, $2, $3)`,
                [
                    book.isbn,
                    book.title,
                    book.authors
                ]
            );

            await db.query(
                `INSERT INTO user_books (user_id, isbn)
                 VALUES ($1, $2)`,
                [user.id, book.isbn]
            );

            const response = await request(app)
                .get('/shelf')
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(200);

            expect(response.body).toHaveLength(1);
            expect(response.body[0]).toEqual(
                expect.objectContaining({
                    isbn: book.isbn,
                    title: book.title
                })
            );
        });

        test('does not return another user shelf', async () => {
            const otherUserResult = await db.query(
                `INSERT INTO users (
                    email,
                    password_hash,
                    display_name
                )
                VALUES ($1, $2, $3)
                RETURNING id`,
                [
                    'other@example.com',
                    'not-a-real-password-hash',
                    'Other User'
                ]
            );

            const otherUserId = otherUserResult.rows[0].id;

            await db.query(
                `INSERT INTO books (
                    isbn,
                    title,
                    authors
                )
                VALUES ($1, $2, $3)`,
                [
                    book.isbn,
                    book.title,
                    book.authors
                ]
            );

            await db.query(
                `INSERT INTO user_books (user_id, isbn)
                 VALUES ($1, $2)`,
                [otherUserId, book.isbn]
            );

            const response = await request(app)
                .get('/shelf')
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveLength(0);
        });

        test('rejects an unauthenticated request', async () => {
            const response = await request(app)
                .get('/shelf');

            expect(response.statusCode).toBe(401);
        });
    });

    describe('DELETE /shelf/:isbn', () => {
        beforeEach(async () => {
            await db.query(
                `INSERT INTO books (
                    isbn,
                    title,
                    authors
                )
                VALUES ($1, $2, $3)`,
                [
                    book.isbn,
                    book.title,
                    book.authors
                ]
            );

            await db.query(
                `INSERT INTO user_books (user_id, isbn)
                 VALUES ($1, $2)`,
                [user.id, book.isbn]
            );
        });

        test('deletes a book from the user shelf', async () => {
            const response = await request(app)
                .delete(`/shelf/${book.isbn}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(204);

            const result = await db.query(
                `SELECT *
                 FROM user_books
                 WHERE user_id = $1
                   AND isbn = $2`,
                [user.id, book.isbn]
            );

            expect(result.rows).toHaveLength(0);
        });

        test('returns 404 when the book is not on the user shelf', async () => {
            const response = await request(app)
                .delete('/shelf/9780000000000')
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(404);
            expect(response.body.error)
                .toBe('Book not found on your shelf');
        });

        test('rejects an unauthenticated request', async () => {
            const response = await request(app)
                .delete(`/shelf/${book.isbn}`);

            expect(response.statusCode).toBe(401);
        });
    });
});
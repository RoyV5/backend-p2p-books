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

    // Shape returned by the fetching service / stored in the DB
    // (snake_case, matches the `books` table columns).
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

    // Shape returned by the API (camelCase domain representation).
    const bookResponse = {
        isbn: book.isbn,
        title: book.title,
        authors: book.authors,
        description: book.description,
        pageCount: book.page_count,
        coverUrl: book.cover_url,
        publisher: book.publisher,
        publishedYear: book.published_year,
        language: book.language
    };

    beforeEach(async () => {
        const result = await db.query(
            `INSERT INTO users (
                email,
                password_hash,
                handle,
                display_name
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id, email, handle, display_name`,
            [
                'test@example.com',
                'not-a-real-password-hash',
                'Test_User',
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

            expect(response.body).toEqual(bookResponse);

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

        test('rejects adding a book already on the user shelf', async () => {
            getBookData.mockResolvedValue(book);

            const firstResponse = await request(app)
                .post('/shelf')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    isbn: book.isbn
                });

            expect(firstResponse.statusCode).toBe(201);

            const secondResponse = await request(app)
                .post('/shelf')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    isbn: book.isbn
                });

            expect(secondResponse.statusCode).toBe(409);
            expect(secondResponse.body).toEqual({
                error: 'Book is already on your shelf'
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

        test(
            'returns a 404 with a BOOK_NOT_FOUND code ' +
            'when the book cannot be found by either provider',
            async () => {
                const notFoundError = new Error(
                    `Book not found: ${book.isbn}`
                );
                notFoundError.code = 'BOOK_NOT_FOUND';

                getBookData.mockRejectedValue(notFoundError);

                const response = await request(app)
                    .post('/shelf')
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        isbn: book.isbn
                    });

                expect(response.statusCode).toBe(404);
                expect(response.body).toEqual({
                    error: `Book not found: ${book.isbn}`,
                    code: 'BOOK_NOT_FOUND'
                });
            }
        );

        test(
            'returns a generic 500 for an unexpected fetching error',
            async () => {
                getBookData.mockRejectedValue(
                    new Error('ECONNREFUSED')
                );

                const response = await request(app)
                    .post('/shelf')
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        isbn: book.isbn
                    });

                expect(response.statusCode).toBe(500);
                expect(response.body).toEqual({
                    error: 'Error adding book'
                });
            }
        );

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
                    handle,
                    display_name
                )
                VALUES ($1, $2, $3, $4)
                RETURNING id`,
                [
                    'other@example.com',
                    'not-a-real-password-hash',
                    'Other_User',
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

    describe('GET /shelf/:userId', () => {
        let otherUser;

        beforeEach(async () => {
            const otherUserResult = await db.query(
                `INSERT INTO users (
                    email,
                    password_hash,
                    handle,
                    display_name,
                    private_profile
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, handle, display_name`,
                [
                    'other@example.com',
                    'not-a-real-password-hash',
                    'Other_User',
                    'Other User',
                    false
                ]
            );

            otherUser = otherUserResult.rows[0];

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
                [otherUser.id, book.isbn]
            );
        });

        test('returns a public user shelf', async () => {
            const response = await request(app)
                .get(`/shelf/${otherUser.id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(200);
            expect(response.body.isPrivate).toBe(false);
            expect(response.body.user).toEqual({
                id: otherUser.id,
                handle: otherUser.handle,
                displayName: otherUser.display_name,
                description: null,
                profilePictureUrl: null
            });
            expect(response.body.books).toHaveLength(1);
            expect(response.body.books[0]).toEqual(
                expect.objectContaining({
                    isbn: book.isbn,
                    title: book.title
                })
            );
        });

        test('hides book contents for a private profile', async () => {
            await db.query(
                `UPDATE users
                 SET private_profile = true
                 WHERE id = $1`,
                [otherUser.id]
            );

            const response = await request(app)
                .get(`/shelf/${otherUser.id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(200);
            expect(response.body.isPrivate).toBe(true);
            expect(response.body.books).toBeNull();
            expect(response.body.user.handle).toBe(otherUser.handle);
        });

        test('lets the owner view their own private shelf', async () => {
            await db.query(
                `UPDATE users
                 SET private_profile = true
                 WHERE id = $1`,
                [otherUser.id]
            );

            const ownerToken = createToken(otherUser.id);

            const response = await request(app)
                .get(`/shelf/${otherUser.id}`)
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.statusCode).toBe(200);
            expect(response.body.isPrivate).toBe(true);
            expect(response.body.books).toHaveLength(1);
        });

        test('never leaks the raw privateProfile field', async () => {
            const response = await request(app)
                .get(`/shelf/${otherUser.id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.body.user).not.toHaveProperty('privateProfile');
        });

        test('returns 404 for a nonexistent user', async () => {
            const response = await request(app)
                .get('/shelf/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(404);
        });

        test('rejects an unauthenticated request', async () => {
            const response = await request(app)
                .get(`/shelf/${otherUser.id}`);

            expect(response.statusCode).toBe(401);
        });
    });
});
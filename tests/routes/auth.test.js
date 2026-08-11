const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authRouter = require('../../src/routes/auth');
const db = require('../../src/config/db');

function createApp() {
    const app = express();

    app.use(express.json());
    app.use('/auth', authRouter);

    return app;
}

describe('Auth routes', () => {
    const app = createApp();

    describe('POST /auth/register', () => {
        test('registers a new user with a handle', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'password123',
                    handle: 'Test_User'
                });

            expect(response.statusCode).toBe(201);

            expect(response.body.user).toEqual(
                expect.objectContaining({
                    email: 'test@example.com',
                    handle: 'test_user',
                    displayName: 'test_user'
                })
            );

            expect(response.body.user).not.toHaveProperty('password_hash');
            expect(response.body.user).not.toHaveProperty('passwordHash');
            expect(response.body.token).toEqual(expect.any(String));
        });

        test('normalizes the handle before storing it', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'password123',
                    handle: 'Rodrigo_Books'
                });

            expect(response.statusCode).toBe(201);
            expect(response.body.user.handle).toBe('rodrigo_books');

            const result = await db.query(
                `SELECT handle, display_name
                 FROM users
                 WHERE email = $1`,
                ['test@example.com']
            );

            expect(result.rows[0]).toEqual({
                handle: 'rodrigo_books',
                display_name: 'rodrigo_books'
            });
        });

        test('rejects registration with missing fields', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error)
                .toBe('Email, password, or handle is missing');
        });

        test('rejects an invalid email', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'not-an-email',
                    password: 'password123',
                    handle: 'test_user'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe('Invalid email');
        });

        test('rejects an invalid password', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'short',
                    handle: 'test_user'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error)
                .toBe('Password must be at least 8 characters long');
        });

        test('rejects an invalid handle', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'password123',
                    handle: 'bad handle'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe('Invalid handle');
        });

        test('rejects a duplicate email', async () => {
            await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'password123',
                    handle: 'first_user'
                });

            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'password123',
                    handle: 'second_user'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error)
                .toBe('User with this email already exists');
        });

        test('rejects a duplicate handle', async () => {
            await request(app)
                .post('/auth/register')
                .send({
                    email: 'first@example.com',
                    password: 'password123',
                    handle: 'book_lover'
                });

            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'second@example.com',
                    password: 'password123',
                    handle: 'Book_Lover'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error)
                .toBe('User with this handle already exists');
        });

        test('stores a hashed password', async () => {
            const password = 'password123';

            await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password,
                    handle: 'test_user'
                });

            const result = await db.query(
                'SELECT password_hash FROM users WHERE email = $1',
                ['test@example.com']
            );

            const passwordHash = result.rows[0].password_hash;

            expect(passwordHash).not.toBe(password);

            await expect(
                bcrypt.compare(password, passwordHash)
            ).resolves.toBe(true);
        });
    });

    describe('POST /auth/login', () => {
        let user;

        beforeEach(async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'password123',
                    handle: 'test_user'
                });

            user = response.body.user;
        });

        test('logs in with valid credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            expect(response.statusCode).toBe(200);

            expect(response.body.user).toEqual({
                id: user.id,
                email: 'test@example.com',
                displayName: 'test_user',
                handle: 'test_user'
            });

            expect(response.body.token).toEqual(expect.any(String));
        });

        test('rejects an unknown email', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'does-not-exist@example.com',
                    password: 'password123'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe('Invalid credentials');
        });

        test('rejects an incorrect password', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'wrong-password'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe('Invalid credentials');
        });

        test('returns a valid JWT containing the user id', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            const decoded = jwt.verify(
                response.body.token,
                process.env.JWT_SECRET
            );

            expect(decoded.id).toBe(user.id);
        });

        test('does not return the password hash', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            expect(response.body.user).not.toHaveProperty('password_hash');
            expect(response.body.user).not.toHaveProperty('passwordHash');
        });
    });
});
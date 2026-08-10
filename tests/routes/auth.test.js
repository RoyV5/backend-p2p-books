const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authRouter = require('../../src/routes/auth');

function createApp() {
    const app = express();

    app.use(express.json());
    app.use('/auth', authRouter);

    return app;
}

describe('Auth routes', () => {
    const app = createApp();

    describe('POST /auth/register', () => {
        test('registers a new user', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'password123',
                    displayName: 'Test User'
                });

            expect(response.statusCode).toBe(201);

            expect(response.body.user).toEqual(
                expect.objectContaining({
                    email: 'test@example.com',
                    displayName: 'Test User'
                })
            );

            expect(response.body.user).not.toHaveProperty('passwordHash');
            expect(response.body.user).not.toHaveProperty('password_hash');
            expect(response.body.token).toEqual(expect.any(String));
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
                .toBe('Email, password, or displayName is missing');
        });

        test('rejects an invalid email', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'not-an-email',
                    password: 'password123',
                    displayName: 'Test User'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe('Invalid email');
        });

        test('rejects a password shorter than 8 characters', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'short',
                    displayName: 'Test User'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error)
                .toBe('Password must be at least 8 characters long');
        });

        test('rejects an empty display name', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'password123',
                    displayName: '   '
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe('Display name is required');
        });

        
        test('rejects a duplicate email', async () => {
            const user = {
                email: 'test@example.com',
                password: 'password123',
                displayName: 'Test User'
            };

            await request(app)
                .post('/auth/register')
                .send(user);

            const response = await request(app)
                .post('/auth/register')
                .send({
                    ...user,
                    displayName: 'Different User'
                });

            expect(response.statusCode).toBe(400);
            expect(response.body.error)
                .toBe('User with this email already exists');
        });

        test('stores a hashed password', async () => {
            const password = 'password123';

            await request(app)
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password,
                    displayName: 'Test User'
                });

            const result = await require('../../src/config/db').query(
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
                    displayName: 'Test User'
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
                displayName: 'Test User'
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

            expect(response.body.user).not.toHaveProperty('passwordHash');
            expect(response.body.user).not.toHaveProperty('password_hash');
        });
    });
});
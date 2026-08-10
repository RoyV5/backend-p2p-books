const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const auth = require('../../src/middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET;

function createApp() {
    const app = express();

    app.get('/protected', auth, (req, res) => {
        res.json(req.user);
    });

    return app;
}

describe('Auth middleware', () => {
    const app = createApp();

    describe('authentication', () => {
        test('rejects a request with no token', async () => {
            const response = await request(app)
                .get('/protected');

            expect(response.statusCode).toBe(401);
            expect(response.body.error)
                .toBe('No token, authorization denied');
        });

        test('allows a request with a valid token', async () => {
            const token = jwt.sign(
                { userId: 'test-user-id' },
                JWT_SECRET
            );

            const response = await request(app)
                .get('/protected')
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(200);
            expect(response.body).toMatchObject({
                userId: 'test-user-id'
            });
        });

        test('rejects an invalid token', async () => {
            const response = await request(app)
                .get('/protected')
                .set('Authorization', 'Bearer definitely-not-a-real-token');

            expect(response.statusCode).toBe(401);
            expect(response.body.error)
                .toBe('Token is invalid or expired');
        });

        test('rejects an expired token', async () => {
            const token = jwt.sign(
                { userId: 'test-user-id' },
                JWT_SECRET,
                { expiresIn: -1 }
            );

            const response = await request(app)
                .get('/protected')
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(401);
            expect(response.body.error)
                .toBe('Token is invalid or expired');
        });

        test('rejects an authorization header without a Bearer token', async () => {
            const token = jwt.sign(
                { userId: 'test-user-id' },
                JWT_SECRET
            );

            const response = await request(app)
                .get('/protected')
                .set('Authorization', token);

            expect(response.statusCode).toBe(401);
        });
    });
});
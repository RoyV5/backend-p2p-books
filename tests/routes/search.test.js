const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const searchRouter = require('../../src/routes/search');
const db = require('../../src/config/db');

function createApp() {
    const app = express();

    app.use(express.json());
    app.use('/search', searchRouter);

    return app;
}

function createToken(userId) {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );
}

async function createUser({
    email,
    handle,
    displayName,
    privateProfile = false
}) {
    const result = await db.query(
        `INSERT INTO users (
            email,
            password_hash,
            handle,
            display_name,
            private_profile
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, handle, display_name, private_profile`,
        [
            email,
            'not-a-real-password-hash',
            handle,
            displayName,
            privateProfile
        ]
    );

    return result.rows[0];
}

describe('Search routes', () => {
    const app = createApp();

    let self;
    let token;

    beforeEach(async () => {
        self = await createUser({
            email: 'self@example.com',
            handle: 'self_user',
            displayName: 'Self User'
        });

        token = createToken(self.id);
    });

    describe('GET /search/users', () => {
        test('requires authentication', async () => {
            const response = await request(app)
                .get('/search/users')
                .query({ q: 'anything' });

            expect(response.statusCode).toBe(401);
        });

        test('returns an empty array for a query under 2 characters', async () => {
            await createUser({
                email: 'a@example.com',
                handle: 'a',
                displayName: 'A'
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'a' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('returns an empty array when no query is provided', async () => {
            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('matches by handle, case-insensitively', async () => {
            const bob = await createUser({
                email: 'bob@example.com',
                handle: 'bob_builder',
                displayName: 'Bobby'
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'BOB_bu' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([
                {
                    id: bob.id,
                    handle: 'bob_builder',
                    displayName: 'Bobby',
                    profilePictureUrl: null
                }
            ]);
        });

        test('matches by display name', async () => {
            const carol = await createUser({
                email: 'carol@example.com',
                handle: 'carol99',
                displayName: 'Carol Danvers'
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'danvers' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([
                {
                    id: carol.id,
                    handle: 'carol99',
                    displayName: 'Carol Danvers',
                    profilePictureUrl: null
                }
            ]);
        });

        test('excludes the requesting user from their own results', async () => {
            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'self' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('includes private profiles in results', async () => {
            const paul = await createUser({
                email: 'paul@example.com',
                handle: 'private_paul',
                displayName: 'Private Paul',
                privateProfile: true
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'paul' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([
                {
                    id: paul.id,
                    handle: 'private_paul',
                    displayName: 'Private Paul',
                    profilePictureUrl: null
                }
            ]);
        });

        test('never leaks internal-only fields', async () => {
            await createUser({
                email: 'dana@example.com',
                handle: 'dana_the_dev',
                displayName: 'Dana'
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'dana' });

            expect(response.body[0]).not.toHaveProperty('email');
            expect(response.body[0]).not.toHaveProperty('passwordHash');
            expect(response.body[0]).not.toHaveProperty('privateProfile');
            expect(response.body[0]).not.toHaveProperty('description');
        });

        test(
            'ranks exact handle match, then prefix, then substring',
            async () => {
                const exact = await createUser({
                    email: 'exact@example.com',
                    handle: 'ali',
                    displayName: 'Exact'
                });

                const prefix = await createUser({
                    email: 'prefix@example.com',
                    handle: 'alice',
                    displayName: 'Prefix'
                });

                const substring = await createUser({
                    email: 'substring@example.com',
                    handle: 'malice',
                    displayName: 'Substring'
                });

                const response = await request(app)
                    .get('/search/users')
                    .set('Authorization', `Bearer ${token}`)
                    .query({ q: 'ali' });

                expect(response.statusCode).toBe(200);
                expect(
                    response.body.map((user) => user.id)
                ).toEqual([exact.id, prefix.id, substring.id]);
            }
        );

        test('does not treat "%" or "_" in the query as wildcards', async () => {
            await createUser({
                email: 'unrelated@example.com',
                handle: 'totally_unrelated',
                displayName: 'Totally Unrelated'
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: '%_%' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('caps results at the result limit', async () => {
            for (let i = 0; i < 25; i++) {
                await createUser({
                    email: `many${i}@example.com`,
                    handle: `many_user_${i}`,
                    displayName: `Many User ${i}`
                });
            }

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'many_user' });

            expect(response.statusCode).toBe(200);
            expect(response.body.length).toBe(20);
        });
    });
});
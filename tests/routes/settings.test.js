const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../../src/config/db');

jest.mock('../../src/config/supabase', () => ({
    storage: {
        from: jest.fn()
    }
}));


const supabase = require('../../src/config/supabase');
const settingsRouter = require('../../src/routes/settings');

function createApp() {
    const app = express();

    app.use(express.json());
    app.use('/settings', settingsRouter);

    return app;
}

describe('Settings routes', () => {
    const app = createApp();

    let user;
    let token;

    beforeEach(async () => {
        const result = await db.query(
            `INSERT INTO users (
                email,
                password_hash,
                handle,
                display_name,
                private_profile
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id`,
            [
                'test@example.com',
                'fake-hash',
                'testuser',
                'Test User',
                false
            ]
        );

        user = result.rows[0];

        token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET
        );

        jest.clearAllMocks();
    });

    describe('GET /settings', () => {
        test('returns the authenticated user settings', async () => {
            const response = await request(app)
                .get('/settings')
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(200);

            expect(response.body).toEqual({
                handle: 'testuser',
                displayName: 'Test User',
                description: null,
                privateProfile: false,
                profilePictureUrl: null
            });
        });

        test('returns profile picture URL when one exists', async () => {
            await db.query(
                `UPDATE users
                 SET profile_picture_path = $1
                 WHERE id = $2`,
                ['test-picture.jpg', user.id]
            );

            const getPublicUrl = jest.fn().mockReturnValue({
                data: {
                    publicUrl: 'https://example.com/test-picture.jpg'
                }
            });

            supabase.storage.from.mockReturnValue({
                getPublicUrl
            });

            const response = await request(app)
                .get('/settings')
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(200);

            expect(response.body.profilePictureUrl)
                .toBe('https://example.com/test-picture.jpg');

            expect(getPublicUrl)
                .toHaveBeenCalledWith('test-picture.jpg');
        });

        test('rejects an unauthenticated request', async () => {
            const response = await request(app)
                .get('/settings');

            expect(response.statusCode).toBe(401);
        });
    });

describe('PATCH /settings', () => {
    test('updates only the supplied setting', async () => {
        const response = await request(app)
            .patch('/settings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                displayName: 'New Name'
            });

        expect(response.statusCode).toBe(200);

        expect(response.body).toEqual({
            displayName: 'New Name'
        });

        const result = await db.query(
            `SELECT
                handle,
                display_name,
                private_profile
             FROM users
             WHERE id = $1`,
            [user.id]
        );

        expect(result.rows[0]).toEqual({
            handle: 'testuser',
            display_name: 'New Name',
            private_profile: false
        });
    });

    test('updates multiple supplied settings', async () => {
        const response = await request(app)
            .patch('/settings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                handle: 'newhandle',
                privateProfile: true
            });

        expect(response.statusCode).toBe(200);

        expect(response.body).toEqual({
            handle: 'newhandle',
            privateProfile: true
        });

        const result = await db.query(
            `SELECT
                handle,
                display_name,
                private_profile
             FROM users
             WHERE id = $1`,
            [user.id]
        );

        expect(result.rows[0]).toEqual({
            handle: 'newhandle',
            display_name: 'Test User',
            private_profile: true
        });
    });

    test('rejects an invalid handle', async () => {
        const response = await request(app)
            .patch('/settings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                handle: '!!!invalid!!!'
            });

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe('Invalid handle');
    });

    test('rejects an invalid display name', async () => {
        const response = await request(app)
            .patch('/settings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                displayName: ''
            });

        expect(response.statusCode).toBe(400);
        expect(response.body.error)
            .toBe('Invalid display name');
    });

    test('rejects a non-boolean privateProfile', async () => {
        const response = await request(app)
            .patch('/settings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                privateProfile: 'false'
            });

        expect(response.statusCode).toBe(400);
        expect(response.body.error)
            .toBe('privateProfile must be a boolean');
    });

    test('rejects an empty update', async () => {
        const response = await request(app)
            .patch('/settings')
            .set('Authorization', `Bearer ${token}`)
            .send({});

        expect(response.statusCode).toBe(400);
        expect(response.body.error)
            .toBe('No settings provided');
    });

    test('rejects a duplicate handle', async () => {
        await db.query(
            `INSERT INTO users (
                email,
                password_hash,
                handle,
                display_name,
                private_profile
            )
            VALUES ($1, $2, $3, $4, $5)`,
            [
                'other@example.com',
                'fake-hash',
                'takenhandle',
                'Other User',
                false
            ]
        );

        const response = await request(app)
            .patch('/settings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                handle: 'takenhandle'
            });

        expect(response.statusCode).toBe(400);
        expect(response.body.error)
            .toBe('Handle is already taken');
    });

    test('rejects an unauthenticated request', async () => {
        const response = await request(app)
            .patch('/settings')
            .send({
                displayName: 'New Name'
            });

        expect(response.statusCode).toBe(401);
    });

    test('updates the description', async () => {
        const response = await request(app)
            .patch('/settings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                description: 'I love books.'
            });

        expect(response.statusCode).toBe(200);

        expect(response.body).toEqual({
            description: 'I love books.'
        });

        const result = await db.query(
            `SELECT description
             FROM users
             WHERE id = $1`,
            [user.id]
        );

        expect(result.rows[0].description).toBe('I love books.');
    });

    test('can clear the description', async () => {
        await db.query(
            `UPDATE users
             SET description = $1
             WHERE id = $2`,
            ['Old description', user.id]
        );

        const response = await request(app)
            .patch('/settings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                description: null
            });

        expect(response.statusCode).toBe(200);

        expect(response.body).toEqual({
            description: null
        });

        const result = await db.query(
            `SELECT description
             FROM users
             WHERE id = $1`,
            [user.id]
        );

        expect(result.rows[0].description).toBeNull();
    });
});

    describe('PUT /settings/profile-picture', () => {
        function mockSupabaseStorage() {
    const upload = jest.fn().mockResolvedValue({
        error: null
    });

    const remove = jest.fn().mockResolvedValue({
        error: null
    });

    const getPublicUrl = jest.fn().mockReturnValue({
        data: {
            publicUrl: 'https://example.com/profile.jpg'
        }
    });

        supabase.storage.from.mockReturnValue({
            upload,
            remove,
            getPublicUrl
        });

        return {
            upload,
            remove,
            getPublicUrl
        };
}

        test('uploads a profile picture successfully', async () => {
            const storage = mockSupabaseStorage();

            const image = Buffer.from('fake image');

            const response = await request(app)
                .put('/settings/profile-picture')
                .set('Authorization', `Bearer ${token}`)
                .attach(
                    'profilePicture',
                    image,
                    {
                        filename: 'profile.jpg',
                        contentType: 'image/jpeg'
                    }
                );

            expect(response.statusCode).toBe(200);

            expect(response.body.profilePictureUrl)
                .toBe('https://example.com/profile.jpg');

            expect(storage.upload).toHaveBeenCalledTimes(1);

            expect(storage.upload).toHaveBeenCalledWith(
                expect.stringContaining(user.id),
                expect.any(Buffer),
                {
                    contentType: 'image/jpeg',
                    upsert: true
                }
            );

            const result = await db.query(
                `SELECT profile_picture_path
                 FROM users
                 WHERE id = $1`,
                [user.id]
            );

            expect(result.rows[0].profile_picture_path)
                .toEqual(expect.stringContaining(user.id));
        });

        test('rejects a request without a picture', async () => {
            mockSupabaseStorage();

            const response = await request(app)
                .put('/settings/profile-picture')
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(400);
            expect(response.body.error)
                .toBe('Profile picture is required');
        });

        test('replaces the previous profile picture', async () => {
            const oldPath = `${user.id}-old-picture`;

            await db.query(
                `UPDATE users
                 SET profile_picture_path = $1
                 WHERE id = $2`,
                [oldPath, user.id]
            );

            const storage = mockSupabaseStorage();

            const response = await request(app)
                .put('/settings/profile-picture')
                .set('Authorization', `Bearer ${token}`)
                .attach(
                    'profilePicture',
                    Buffer.from('new image'),
                    {
                        filename: 'new-profile.jpg',
                        contentType: 'image/jpeg'
                    }
                );

            expect(response.statusCode).toBe(200);

            expect(storage.remove)
                .toHaveBeenCalledWith([oldPath]);

            const result = await db.query(
                `SELECT profile_picture_path
                 FROM users
                 WHERE id = $1`,
                [user.id]
            );

            expect(result.rows[0].profile_picture_path)
                .not.toBe(oldPath);
        });

        test('rejects an unauthenticated request', async () => {
            const storage = mockSupabaseStorage();

            const response = await request(app)
                .put('/settings/profile-picture')
                .attach(
                    'profilePicture',
                    Buffer.from('image'),
                    {
                        filename: 'profile.jpg',
                        contentType: 'image/jpeg'
                    }
                );

            expect(response.statusCode).toBe(401);
            expect(storage.upload).not.toHaveBeenCalled();
        });
    });
});
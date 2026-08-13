const express = require('express');
const request = require('supertest');

const upload = require('../../src/middleware/upload');

function createApp() {
    const app = express();

    app.post(
        '/upload',
        upload,
        (req, res) => {
            res.json({
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                bufferExists: Buffer.isBuffer(req.file.buffer)
            });
        }
    );

    return app;
}

describe('Upload middleware', () => {
    const app = createApp();

    test('accepts an image and stores it in memory', async () => {
        const image = Buffer.from('fake image data');

        const response = await request(app)
            .post('/upload')
            .attach(
                'profilePicture',
                image,
                {
                    filename: 'profile.jpg',
                    contentType: 'image/jpeg'
                }
            );

        expect(response.statusCode).toBe(200);

        expect(response.body).toEqual({
            originalname: 'profile.jpg',
            mimetype: 'image/jpeg',
            size: image.length,
            bufferExists: true
        });
    });

    test('rejects non-image files', async () => {
        const file = Buffer.from('not an image');

        const response = await request(app)
            .post('/upload')
            .attach(
                'profilePicture',
                file,
                {
                    filename: 'document.txt',
                    contentType: 'text/plain'
                }
            );

        expect(response.statusCode).toBe(400);
        expect(response.body).toEqual({
            error: 'Only image files are allowed'
        });
    });

    test('rejects files larger than 2 MB', async () => {
        const largeFile = Buffer.alloc(2 * 1024 * 1024 + 1);

        const response = await request(app)
            .post('/upload')
            .attach(
                'profilePicture',
                largeFile,
                {
                    filename: 'huge.jpg',
                    contentType: 'image/jpeg'
                }
            );

        expect(response.statusCode).toBe(400);
        expect(response.body).toEqual({
            error: 'Profile picture must be smaller than 2 MB'
        });
    });
});
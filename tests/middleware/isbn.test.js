const express = require('express');
const request = require('supertest');

const isbn = require('../../src/middleware/isbn');

function createApp() {
    const app = express();

    app.use(express.json());

    app.post('/books', isbn, (req, res) => {
        res.json(req.body);
    });

    return app;
}

describe('ISBN middleware', () => {
    const app = createApp();

    describe('request body', () => {
        test('normalizes ISBN-10 in the request body', async () => {
            const response = await request(app)
                .post('/books')
                .send({ isbn: '0140449264' });

            expect(response.statusCode).toBe(200);
            expect(response.body.isbn).toBe('9780140449266');
        });

        test('accepts an ISBN-13', async () => {
            const response = await request(app)
                .post('/books')
                .send({ isbn: '9780140449266' });

            expect(response.statusCode).toBe(200);
            expect(response.body.isbn).toBe('9780140449266');
        });

        test('rejects an invalid ISBN', async () => {
            const response = await request(app)
                .post('/books')
                .send({ isbn: 'not-valid' });

            expect(response.statusCode).toBe(400);
        });
    });
});
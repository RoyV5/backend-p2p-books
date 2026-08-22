const db = require('../src/config/db');

beforeEach(async () => {
    await db.query('DELETE FROM loans');
    await db.query('DELETE FROM user_books');
    await db.query('DELETE FROM books');
    await db.query('DELETE FROM users');
});

afterAll(async () => {
    await db.end();
});
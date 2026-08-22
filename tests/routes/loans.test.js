const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const loansRouter = require('../../src/routes/loans');
const db = require('../../src/config/db');

function createApp() {
    const app = express();

    app.use(express.json());
    app.use('/loans', loansRouter);

    return app;
}

function createToken(userId) {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );
}

async function createUser(email, handle) {
    const result = await db.query(
        `INSERT INTO users (
            email,
            password_hash,
            handle,
            display_name
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, handle, display_name`,
        [email, 'not-a-real-password-hash', handle, handle]
    );

    return result.rows[0];
}

async function insertLoan(isbn, ownerId, borrowerId, overrides = {}) {
    const status = overrides.status ?? 'pending';

    const result = await db.query(
        `INSERT INTO loans (
            isbn, owner_id, borrower_id, status,
            due_date, borrower_returned_at, owner_returned_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
            isbn,
            ownerId,
            borrowerId,
            status,
            overrides.dueDate ?? null,
            overrides.borrowerReturnedAt ?? null,
            overrides.ownerReturnedAt ?? null
        ]
    );

    return result.rows[0];
}

describe('Loan routes', () => {
    const app = createApp();

    const isbn = '9780140449266';

    let owner;
    let ownerToken;
    let borrower;
    let borrowerToken;

    beforeEach(async () => {
        owner = await createUser('owner@example.com', 'Owner_User');
        borrower = await createUser('borrower@example.com', 'Borrower_User');
        ownerToken = createToken(owner.id);
        borrowerToken = createToken(borrower.id);

        await db.query(
            `INSERT INTO books (isbn, title, authors)
             VALUES ($1, $2, $3)`,
            [isbn, 'The Odyssey', ['Homer']]
        );

        await db.query(
            `INSERT INTO user_books (user_id, isbn)
             VALUES ($1, $2)`,
            [owner.id, isbn]
        );
    });

    describe('POST /loans', () => {
        test('creates a pending loan request', async () => {
            const response = await request(app)
                .post('/loans')
                .set('Authorization', `Bearer ${borrowerToken}`)
                .send({ isbn, ownerId: owner.id });

            expect(response.statusCode).toBe(201);
            expect(response.body).toEqual(expect.objectContaining({
                status: 'pending',
                role: 'borrower',
                book: expect.objectContaining({ isbn }),
                owner: expect.objectContaining({ id: owner.id }),
                borrower: expect.objectContaining({ id: borrower.id })
            }));

            const result = await db.query(
                `SELECT * FROM loans WHERE owner_id = $1 AND isbn = $2`,
                [owner.id, isbn]
            );
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].status).toBe('pending');
        });

        test('rejects requesting your own book', async () => {
            const response = await request(app)
                .post('/loans')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ isbn, ownerId: owner.id });

            expect(response.statusCode).toBe(400);
        });

        test('returns 404 when the shelf entry does not exist', async () => {
            const response = await request(app)
                .post('/loans')
                .set('Authorization', `Bearer ${borrowerToken}`)
                .send({ isbn: '0000000000000', ownerId: owner.id });

            expect(response.statusCode).toBe(404);
        });

        test('returns 409 when the book is not lendable', async () => {
            await db.query(
                `UPDATE user_books SET is_lendable = false
                 WHERE user_id = $1 AND isbn = $2`,
                [owner.id, isbn]
            );

            const response = await request(app)
                .post('/loans')
                .set('Authorization', `Bearer ${borrowerToken}`)
                .send({ isbn, ownerId: owner.id });

            expect(response.statusCode).toBe(409);
            expect(response.body.error).toMatch(/available for loaning/);
        });

        test('returns 409 when the book is currently lent out', async () => {
            const otherBorrower = await createUser(
                'other-borrower@example.com',
                'Other_Borrower'
            );
            await insertLoan(isbn, owner.id, otherBorrower.id, {
                status: 'active'
            });

            const response = await request(app)
                .post('/loans')
                .set('Authorization', `Bearer ${borrowerToken}`)
                .send({ isbn, ownerId: owner.id });

            expect(response.statusCode).toBe(409);
            expect(response.body.error).toMatch(/currently lent out/);
        });

        test(
            'returns 409 when the caller already has a pending request',
            async () => {
                await insertLoan(isbn, owner.id, borrower.id);

                const response = await request(app)
                    .post('/loans')
                    .set('Authorization', `Bearer ${borrowerToken}`)
                    .send({ isbn, ownerId: owner.id });

                expect(response.statusCode).toBe(409);
                expect(response.body.error).toMatch(/already have a pending/);
            }
        );

        test('rejects an unauthenticated request', async () => {
            const response = await request(app)
                .post('/loans')
                .send({ isbn, ownerId: owner.id });

            expect(response.statusCode).toBe(401);
        });
    });

    describe('GET /loans', () => {
        test('lists live loans where the caller is owner or borrower', async () => {
            await insertLoan(isbn, owner.id, borrower.id);

            const asOwner = await request(app)
                .get('/loans')
                .set('Authorization', `Bearer ${ownerToken}`);
            expect(asOwner.body).toHaveLength(1);
            expect(asOwner.body[0].role).toBe('owner');

            const asBorrower = await request(app)
                .get('/loans')
                .set('Authorization', `Bearer ${borrowerToken}`);
            expect(asBorrower.body).toHaveLength(1);
            expect(asBorrower.body[0].role).toBe('borrower');
        });

        test('filters by role', async () => {
            await insertLoan(isbn, owner.id, borrower.id);

            const ownerOnly = await request(app)
                .get('/loans?role=owner')
                .set('Authorization', `Bearer ${borrowerToken}`);
            expect(ownerOnly.body).toHaveLength(0);

            const borrowerOnly = await request(app)
                .get('/loans?role=borrower')
                .set('Authorization', `Bearer ${borrowerToken}`);
            expect(borrowerOnly.body).toHaveLength(1);
        });

        test('excludes non-live loans', async () => {
            await insertLoan(isbn, owner.id, borrower.id, {
                status: 'declined'
            });

            const response = await request(app)
                .get('/loans')
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.body).toHaveLength(0);
        });

        test('rejects an unauthenticated request', async () => {
            const response = await request(app).get('/loans');
            expect(response.statusCode).toBe(401);
        });
    });

    describe('POST /loans/:id/accept', () => {
        test('accepts a pending request with the default due date', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);

            const response = await request(app)
                .post(`/loans/${loan.id}/accept`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({});

            expect(response.statusCode).toBe(200);
            expect(response.body.status).toBe('active');
            expect(response.body.dueDate).not.toBeNull();
        });

        test('accepts a pending request with a valid custom due date', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 14);
            const dueDateStr = dueDate.toISOString().slice(0, 10);

            const response = await request(app)
                .post(`/loans/${loan.id}/accept`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ dueDate: dueDateStr });

            expect(response.statusCode).toBe(200);
            expect(response.body.dueDate).toBe(dueDateStr);
        });

        test('rejects a due date outside the valid range', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);
            const tooSoon = new Date();
            tooSoon.setDate(tooSoon.getDate() + 1);

            const response = await request(app)
                .post(`/loans/${loan.id}/accept`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ dueDate: tooSoon.toISOString().slice(0, 10) });

            expect(response.statusCode).toBe(400);
        });

        test(
            'auto-declines other pending requests on the same shelf entry',
            async () => {
                const otherBorrower = await createUser(
                    'other-borrower@example.com',
                    'Other_Borrower'
                );

                const acceptedLoan = await insertLoan(isbn, owner.id, borrower.id);
                const otherLoan = await insertLoan(
                    isbn, owner.id, otherBorrower.id
                );

                const response = await request(app)
                    .post(`/loans/${acceptedLoan.id}/accept`)
                    .set('Authorization', `Bearer ${ownerToken}`)
                    .send({});

                expect(response.statusCode).toBe(200);

                const other = await db.query(
                    'SELECT status FROM loans WHERE id = $1',
                    [otherLoan.id]
                );
                expect(other.rows[0].status).toBe('declined');
            }
        );

        test('returns 403 when the caller is not the owner', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);

            const response = await request(app)
                .post(`/loans/${loan.id}/accept`)
                .set('Authorization', `Bearer ${borrowerToken}`)
                .send({});

            expect(response.statusCode).toBe(403);
        });

        test('returns 409 when the loan is not pending', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id, {
                status: 'declined'
            });

            const response = await request(app)
                .post(`/loans/${loan.id}/accept`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({});

            expect(response.statusCode).toBe(409);
        });

        test('returns 404 when the loan does not exist', async () => {
            const response = await request(app)
                .post('/loans/00000000-0000-0000-0000-000000000000/accept')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({});

            expect(response.statusCode).toBe(404);
        });

        test('rejects an unauthenticated request', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);

            const response = await request(app)
                .post(`/loans/${loan.id}/accept`)
                .send({});

            expect(response.statusCode).toBe(401);
        });
    });

    describe('POST /loans/:id/decline', () => {
        test('declines a pending request', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);

            const response = await request(app)
                .post(`/loans/${loan.id}/decline`)
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.statusCode).toBe(200);
            expect(response.body.status).toBe('declined');
        });

        test('returns 403 when the caller is not the owner', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);

            const response = await request(app)
                .post(`/loans/${loan.id}/decline`)
                .set('Authorization', `Bearer ${borrowerToken}`);

            expect(response.statusCode).toBe(403);
        });

        test('returns 409 when the loan is not pending', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id, {
                status: 'active'
            });

            const response = await request(app)
                .post(`/loans/${loan.id}/decline`)
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.statusCode).toBe(409);
        });

        test('returns 404 when the loan does not exist', async () => {
            const response = await request(app)
                .post('/loans/00000000-0000-0000-0000-000000000000/decline')
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.statusCode).toBe(404);
        });

        test('rejects an unauthenticated request', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);

            const response = await request(app)
                .post(`/loans/${loan.id}/decline`);

            expect(response.statusCode).toBe(401);
        });
    });

    describe('POST /loans/:id/cancel', () => {
        test('cancels a pending request', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);

            const response = await request(app)
                .post(`/loans/${loan.id}/cancel`)
                .set('Authorization', `Bearer ${borrowerToken}`);

            expect(response.statusCode).toBe(200);
            expect(response.body.status).toBe('cancelled');
        });

        test('returns 403 when the caller is not the borrower', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);

            const response = await request(app)
                .post(`/loans/${loan.id}/cancel`)
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.statusCode).toBe(403);
        });

        test('returns 409 when the loan is not pending', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id, {
                status: 'active'
            });

            const response = await request(app)
                .post(`/loans/${loan.id}/cancel`)
                .set('Authorization', `Bearer ${borrowerToken}`);

            expect(response.statusCode).toBe(409);
        });

        test('returns 404 when the loan does not exist', async () => {
            const response = await request(app)
                .post('/loans/00000000-0000-0000-0000-000000000000/cancel')
                .set('Authorization', `Bearer ${borrowerToken}`);

            expect(response.statusCode).toBe(404);
        });

        test('rejects an unauthenticated request', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);

            const response = await request(app)
                .post(`/loans/${loan.id}/cancel`);

            expect(response.statusCode).toBe(401);
        });
    });

    describe('POST /loans/:id/return', () => {
        test(
            'first confirmation moves the loan to return_pending',
            async () => {
                const loan = await insertLoan(isbn, owner.id, borrower.id, {
                    status: 'active'
                });

                const response = await request(app)
                    .post(`/loans/${loan.id}/return`)
                    .set('Authorization', `Bearer ${borrowerToken}`);

                expect(response.statusCode).toBe(200);
                expect(response.body.status).toBe('return_pending');
                expect(response.body.borrowerReturnedAt).not.toBeNull();
                expect(response.body.ownerReturnedAt).toBeNull();
            }
        );

        test(
            'second confirmation from the other side completes the loan',
            async () => {
                const loan = await insertLoan(isbn, owner.id, borrower.id, {
                    status: 'return_pending',
                    borrowerReturnedAt: new Date()
                });

                const response = await request(app)
                    .post(`/loans/${loan.id}/return`)
                    .set('Authorization', `Bearer ${ownerToken}`);

                expect(response.statusCode).toBe(200);
                expect(response.body.status).toBe('completed');
                expect(response.body.completedAt).not.toBeNull();
            }
        );

        test(
            'confirming twice from the same side is idempotent',
            async () => {
                const loan = await insertLoan(isbn, owner.id, borrower.id, {
                    status: 'active'
                });

                const first = await request(app)
                    .post(`/loans/${loan.id}/return`)
                    .set('Authorization', `Bearer ${borrowerToken}`);
                const firstTimestamp = first.body.borrowerReturnedAt;

                const second = await request(app)
                    .post(`/loans/${loan.id}/return`)
                    .set('Authorization', `Bearer ${borrowerToken}`);

                expect(second.statusCode).toBe(200);
                expect(second.body.status).toBe('return_pending');
                expect(second.body.borrowerReturnedAt).toBe(firstTimestamp);
            }
        );

        test("returns 403 when the caller isn't part of the loan", async () => {
            const outsider = await createUser(
                'outsider@example.com',
                'Outsider'
            );
            const outsiderToken = createToken(outsider.id);
            const loan = await insertLoan(isbn, owner.id, borrower.id, {
                status: 'active'
            });

            const response = await request(app)
                .post(`/loans/${loan.id}/return`)
                .set('Authorization', `Bearer ${outsiderToken}`);

            expect(response.statusCode).toBe(403);
        });

        test('returns 409 when the loan is not active or return_pending', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id);

            const response = await request(app)
                .post(`/loans/${loan.id}/return`)
                .set('Authorization', `Bearer ${borrowerToken}`);

            expect(response.statusCode).toBe(409);
        });

        test('returns 404 when the loan does not exist', async () => {
            const response = await request(app)
                .post('/loans/00000000-0000-0000-0000-000000000000/return')
                .set('Authorization', `Bearer ${borrowerToken}`);

            expect(response.statusCode).toBe(404);
        });

        test('rejects an unauthenticated request', async () => {
            const loan = await insertLoan(isbn, owner.id, borrower.id, {
                status: 'active'
            });

            const response = await request(app)
                .post(`/loans/${loan.id}/return`);

            expect(response.statusCode).toBe(401);
        });
    });
});

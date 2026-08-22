const express = require('express');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { mapLoan } = require('../mappers/loanMapper');
const { defaultDueDate, isDueDateInRange, MIN_LOAN_DAYS, MAX_LOAN_DAYS } =
    require('../utils/date');

const router = express.Router();

const LOAN_JOIN_SELECT = `
    SELECT
        l.id, l.status, l.requested_at, l.decided_at, l.due_date,
        l.cancelled_at, l.borrower_returned_at, l.owner_returned_at,
        l.completed_at, l.owner_id, l.borrower_id,
        b.isbn AS book_isbn, b.title AS book_title,
        b.cover_url AS book_cover_url, b.authors AS book_authors,
        o.handle AS owner_handle, o.display_name AS owner_display_name,
        o.profile_picture_path AS owner_profile_picture_path,
        br.handle AS borrower_handle, br.display_name AS borrower_display_name,
        br.profile_picture_path AS borrower_profile_picture_path
    FROM loans l
    JOIN books b ON b.isbn = l.isbn
    JOIN users o ON o.id = l.owner_id
    JOIN users br ON br.id = l.borrower_id
`;

async function fetchMappedLoan(id, role) {
    const result = await db.query(
        `${LOAN_JOIN_SELECT} WHERE l.id = $1`,
        [id]
    );

    return mapLoan(result.rows[0], role);
}


// Request to borrow a book
router.post('/', auth, async (req, res) => {
    const callerId = req.user.id;
    const { isbn, ownerId } = req.body;

    if (ownerId === callerId) {
        return res.status(400).json({
            error: "Can't request your own book"
        });
    }

    try {
        const shelfEntry = await db.query(
            `SELECT is_lendable FROM user_books
             WHERE user_id = $1 AND isbn = $2`,
            [ownerId, isbn]
        );

        if (shelfEntry.rows.length === 0) {
            return res.status(404).json({
                error: 'Book not found on that shelf'
            });
        }

        if (!shelfEntry.rows[0].is_lendable) {
            return res.status(409).json({
                error: "This book isn't available for loaning"
            });
        }

        const liveLoan = await db.query(
            `SELECT 1 FROM loans
             WHERE owner_id = $1 AND isbn = $2
               AND status IN ('active', 'return_pending')`,
            [ownerId, isbn]
        );

        if (liveLoan.rows.length > 0) {
            return res.status(409).json({
                error: 'This book is currently lent out'
            });
        }

        const existingPending = await db.query(
            `SELECT 1 FROM loans
             WHERE owner_id = $1 AND isbn = $2
               AND borrower_id = $3 AND status = 'pending'`,
            [ownerId, isbn, callerId]
        );

        if (existingPending.rows.length > 0) {
            return res.status(409).json({
                error: 'You already have a pending request for this book'
            });
        }

        let inserted;
        try {
            inserted = await db.query(
                `INSERT INTO loans (isbn, owner_id, borrower_id)
                 VALUES ($1, $2, $3)
                 RETURNING id`,
                [isbn, ownerId, callerId]
            );
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({
                    error: 'You already have a pending request for this book'
                });
            }
            throw err;
        }

        const loan = await fetchMappedLoan(
            inserted.rows[0].id,
            'borrower'
        );

        res.status(201).json(loan);

    } catch (err) {
        console.error('Create loan request error:', err.message);
        res.status(500).json({ error: 'Error creating loan request' });
    }
});


// My live loans (as owner and/or borrower)
router.get('/', auth, async (req, res) => {
    const callerId = req.user.id;
    const { role } = req.query;

    try {
        let sql = `${LOAN_JOIN_SELECT}
            WHERE (l.owner_id = $1 OR l.borrower_id = $1)
              AND l.status IN ('pending', 'active', 'return_pending')`;

        if (role === 'owner') {
            sql += ' AND l.owner_id = $1';
        } else if (role === 'borrower') {
            sql += ' AND l.borrower_id = $1';
        }

        sql += ' ORDER BY l.requested_at DESC';

        const result = await db.query(sql, [callerId]);

        const loans = result.rows.map((row) =>
            mapLoan(row, row.owner_id === callerId ? 'owner' : 'borrower')
        );

        res.json(loans);

    } catch (err) {
        console.error('Get loans error:', err.message);
        res.status(500).json({ error: 'Error retrieving loans' });
    }
});


// Owner accepts a pending request
router.post('/:id/accept', auth, async (req, res) => {
    const callerId = req.user.id;
    const { id } = req.params;
    const { dueDate } = req.body;

    try {
        const existing = await db.query(
            `SELECT owner_id, isbn, status FROM loans WHERE id = $1`,
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Loan not found' });
        }

        const loan = existing.rows[0];

        if (loan.owner_id !== callerId) {
            return res.status(403).json({
                error: 'Only the owner can accept this request'
            });
        }

        if (loan.status !== 'pending') {
            return res.status(409).json({
                error: 'This request is no longer pending'
            });
        }

        let resolvedDueDate;
        if (dueDate) {
            if (!isDueDateInRange(dueDate)) {
                return res.status(400).json({
                    error: `dueDate must be between ${MIN_LOAN_DAYS} and ` +
                        `${MAX_LOAN_DAYS} days from today`
                });
            }
            resolvedDueDate = dueDate;
        } else {
            resolvedDueDate = defaultDueDate();
        }

        const client = await db.connect();
        try {
            await client.query('BEGIN');

            await client.query(
                `UPDATE loans
                 SET status = 'active', decided_at = NOW(), due_date = $1
                 WHERE id = $2`,
                [resolvedDueDate, id]
            );

            await client.query(
                `UPDATE loans
                 SET status = 'declined', decided_at = NOW()
                 WHERE owner_id = $1 AND isbn = $2
                   AND status = 'pending' AND id <> $3`,
                [loan.owner_id, loan.isbn, id]
            );

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        res.json(await fetchMappedLoan(id, 'owner'));

    } catch (err) {
        console.error('Accept loan error:', err.message);
        res.status(500).json({ error: 'Error accepting loan request' });
    }
});


// Owner declines a pending request
router.post('/:id/decline', auth, async (req, res) => {
    const callerId = req.user.id;
    const { id } = req.params;

    try {
        const existing = await db.query(
            `SELECT owner_id, status FROM loans WHERE id = $1`,
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Loan not found' });
        }

        const loan = existing.rows[0];

        if (loan.owner_id !== callerId) {
            return res.status(403).json({
                error: 'Only the owner can decline this request'
            });
        }

        if (loan.status !== 'pending') {
            return res.status(409).json({
                error: 'This request is no longer pending'
            });
        }

        await db.query(
            `UPDATE loans
             SET status = 'declined', decided_at = NOW()
             WHERE id = $1`,
            [id]
        );

        res.json(await fetchMappedLoan(id, 'owner'));

    } catch (err) {
        console.error('Decline loan error:', err.message);
        res.status(500).json({ error: 'Error declining loan request' });
    }
});


// Borrower cancels a pending request
router.post('/:id/cancel', auth, async (req, res) => {
    const callerId = req.user.id;
    const { id } = req.params;

    try {
        const existing = await db.query(
            `SELECT borrower_id, status FROM loans WHERE id = $1`,
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Loan not found' });
        }

        const loan = existing.rows[0];

        if (loan.borrower_id !== callerId) {
            return res.status(403).json({
                error: 'Only the borrower can cancel this request'
            });
        }

        if (loan.status !== 'pending') {
            return res.status(409).json({
                error: 'This request is no longer pending'
            });
        }

        await db.query(
            `UPDATE loans
             SET status = 'cancelled', cancelled_at = NOW()
             WHERE id = $1`,
            [id]
        );

        res.json(await fetchMappedLoan(id, 'borrower'));

    } catch (err) {
        console.error('Cancel loan error:', err.message);
        res.status(500).json({ error: 'Error cancelling loan request' });
    }
});


// Either side confirms the book has been returned
router.post('/:id/return', auth, async (req, res) => {
    const callerId = req.user.id;
    const { id } = req.params;

    try {
        const existing = await db.query(
            `SELECT owner_id, borrower_id, status,
                    borrower_returned_at, owner_returned_at
             FROM loans WHERE id = $1`,
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Loan not found' });
        }

        const loan = existing.rows[0];

        let role;
        if (loan.owner_id === callerId) {
            role = 'owner';
        } else if (loan.borrower_id === callerId) {
            role = 'borrower';
        } else {
            return res.status(403).json({
                error: "You're not part of this loan"
            });
        }

        if (loan.status !== 'active' && loan.status !== 'return_pending') {
            return res.status(409).json({
                error: 'This loan is not awaiting return'
            });
        }

        const alreadyConfirmed = role === 'owner'
            ? loan.owner_returned_at
            : loan.borrower_returned_at;

        if (!alreadyConfirmed) {
            const otherSideConfirmed = role === 'owner'
                ? loan.borrower_returned_at
                : loan.owner_returned_at;

            if (role === 'owner') {
                if (otherSideConfirmed) {
                    await db.query(
                        `UPDATE loans
                         SET owner_returned_at = NOW(),
                             status = 'completed', completed_at = NOW()
                         WHERE id = $1`,
                        [id]
                    );
                } else {
                    await db.query(
                        `UPDATE loans
                         SET owner_returned_at = NOW(),
                             status = 'return_pending'
                         WHERE id = $1`,
                        [id]
                    );
                }
            } else {
                if (otherSideConfirmed) {
                    await db.query(
                        `UPDATE loans
                         SET borrower_returned_at = NOW(),
                             status = 'completed', completed_at = NOW()
                         WHERE id = $1`,
                        [id]
                    );
                } else {
                    await db.query(
                        `UPDATE loans
                         SET borrower_returned_at = NOW(),
                             status = 'return_pending'
                         WHERE id = $1`,
                        [id]
                    );
                }
            }
        }

        res.json(await fetchMappedLoan(id, role));

    } catch (err) {
        console.error('Confirm return error:', err.message);
        res.status(500).json({ error: 'Error confirming return' });
    }
});


module.exports = router;

const express = require('express');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { mapUser } = require('../mappers/userMapper');
const { escapeLikeTerm } = require('../utils/search');

const router = express.Router();

const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 20;

// GET /api/search/users?q=<term>
router.get('/users', auth, async (req, res) => {
    const rawQuery = typeof req.query.q === 'string'
        ? req.query.q.trim()
        : '';

    // A too-short (or missing) query isn't an error from the
    // client's point of view, e.g. mid-typing in a search box —
    // it just has no results yet.
    if (rawQuery.length < MIN_QUERY_LENGTH) {
        return res.json([]);
    }

    const escapedTerm = escapeLikeTerm(rawQuery);
    const containsPattern = `%${escapedTerm}%`;
    const prefixPattern = `${escapedTerm}%`;

    // Handles are normalized to lowercase on write (see
    // normalizeHandle), so a plain lowercase equality check
    // is enough to detect an exact handle match for ranking.
    const exactHandle = rawQuery.toLowerCase();

    try {
        const result = await db.query(
            `SELECT
                id,
                handle,
                display_name,
                profile_picture_path
             FROM users
             WHERE id != $1
               AND (
                    handle ILIKE $2 ESCAPE '\\'
                    OR display_name ILIKE $2 ESCAPE '\\'
               )
             ORDER BY
                (handle = $3) DESC,
                (handle ILIKE $4 ESCAPE '\\') DESC,
                handle ASC
             LIMIT $5`,
            [
                req.user.id,
                containsPattern,
                exactHandle,
                prefixPattern,
                RESULT_LIMIT
            ]
        );

        res.json(result.rows.map(mapUser));

    } catch (err) {
        console.error('Search users error:', err.message);

        res.status(500).json({
            error: 'Error searching users'
        });
    }
});

module.exports = router;
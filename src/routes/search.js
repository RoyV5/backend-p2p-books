const express = require('express');
const db = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/users', auth, async (req, res) => {
    const { q } = req.query;

    if (!q) {
        return res.status(400).json({
            error: 'Search query is required'
        });
    }

    try {
        const result = await db.query(
            `SELECT
                id,
                handle,
                display_name,
                profile_picture_path
             FROM users
             WHERE handle ILIKE $1
             ORDER BY handle
             LIMIT 20`,
            [`%${q}%`]
        );

        res.json(
            result.rows.map(row => ({
                id: row.id,
                handle: row.handle,
                displayName: row.display_name,
                profilePictureUrl: row.profile_picture_path
            }))
        );
    } catch (err) {
        console.error('User search error:', err.message);

        res.status(500).json({
            error: 'Server error during user search'
        });
    }
});

module.exports = router;
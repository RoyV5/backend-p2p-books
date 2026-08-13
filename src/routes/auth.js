const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const supabase = require('../config/supabase');

const {
    isValidEmail,
    isValidPassword,
    isValidHandle,
    normalizeHandle
} = require('../utils/validation');

const router = express.Router();

function getProfilePictureUrl(path) {
    if (!path) {
        return null;
    }

    const { data } = supabase
        .storage
        .from(process.env.SUPABASE_STORAGE_BUCKET)
        .getPublicUrl(path);

    return data.publicUrl;
}

router.post('/register', async (req, res) => {
    const { email, password, handle } = req.body;

    if (!email || !password || !handle) {
        return res.status(400).json({
            error: 'Email, password, or handle is missing'
        });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({
            error: 'Invalid email'
        });
    }

    if (!isValidPassword(password)) {
        return res.status(400).json({
            error: 'Password must be at least 8 characters long'
        });
    }

    if (!isValidHandle(handle)) {
        return res.status(400).json({
            error: 'Invalid handle'
        });
    }

    const normalizedHandle = normalizeHandle(handle);

    try {
        const userExists = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (userExists.rows.length > 0) {
            return res.status(400).json({
                error: 'User with this email already exists'
            });
        }

        const handleExists = await db.query(
            'SELECT id FROM users WHERE handle = $1',
            [normalizedHandle]
        );

        if (handleExists.rows.length > 0) {
            return res.status(400).json({
                error: 'User with this handle already exists'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = await db.query(
            `INSERT INTO users (
                email,
                password_hash,
                display_name,
                handle
            )
            VALUES ($1, $2, $3, $4)
            RETURNING
                id,
                handle,
                display_name,
                profile_picture_path`,
            [
                email,
                passwordHash,
                normalizedHandle,
                normalizedHandle
            ]
        );

        const row = newUser.rows[0];

        const user = {
            id: row.id,
            handle: row.handle,
            displayName: row.display_name,
            profilePictureUrl: getProfilePictureUrl(
                row.profile_picture_path
            )
        };

        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            user,
            token
        });

    } catch (err) {
        console.error('Register error:', err.message);

        res.status(500).json({
            error: 'Server error during registration'
        });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!isValidEmail(email)) {
        return res.status(400).json({
            error: 'Invalid email'
        });
    }

    if (!isValidPassword(password)) {
        return res.status(400).json({
            error: 'Password must be at least 8 characters long'
        });
    }

    try {
        const result = await db.query(
            `SELECT
                id,
                password_hash,
                handle,
                display_name,
                profile_picture_path
             FROM users
             WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                error: 'Invalid credentials'
            });
        }

        const row = result.rows[0];

        const isMatch = await bcrypt.compare(
            password,
            row.password_hash
        );

        if (!isMatch) {
            return res.status(400).json({
                error: 'Invalid credentials'
            });
        }

        const user = {
            id: row.id,
            handle: row.handle,
            displayName: row.display_name,
            profilePictureUrl: getProfilePictureUrl(
                row.profile_picture_path
            )
        };

        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            user,
            token
        });

    } catch (err) {
        console.error('Login error:', err.message);

        res.status(500).json({
            error: 'Server error during login'
        });
    }
});

const auth = require('../middleware/auth');

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                id,
                handle,
                display_name,
                profile_picture_path
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const user = result.rows[0];

        let profilePictureUrl = null;

        if (user.profile_picture_path) {
            const { data } = supabase
                .storage
                .from(process.env.SUPABASE_STORAGE_BUCKET)
                .getPublicUrl(user.profile_picture_path);

            profilePictureUrl = data.publicUrl;
        }

        res.json({
            id: user.id,
            handle: user.handle,
            displayName: user.display_name,
            profilePictureUrl
        });

    } catch (err) {
        console.error('Get current user error:', err.message);

        res.status(500).json({
            error: 'Error retrieving user'
        });
    }
});

module.exports = router;
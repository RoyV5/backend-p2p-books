const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const {
    isValidEmail,
    isValidPassword,
    isValidHandle,
    normalizeHandle
} = require('../utils/validation');

const router = express.Router();

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
            RETURNING id, email, display_name, handle, created_at`,
            [
                email,
                passwordHash,
                normalizedHandle,
                normalizedHandle
            ]
        );

        const user = {
            id: newUser.rows[0].id,
            email: newUser.rows[0].email,
            displayName: newUser.rows[0].display_name,
            handle: newUser.rows[0].handle,
            createdAt: newUser.rows[0].created_at
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

module.exports = router;

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
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                error: 'Invalid credentials'
            });
        }

        const row = result.rows[0];

        const user = {
            id: row.id,
            email: row.email,
            passwordHash: row.password_hash,
            privateProfile: row.private_profile,
            handle: row.handle,
            displayName: row.display_name,
            createdAt: row.created_at
        };

        const isMatch = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!isMatch) {
            return res.status(400).json({
                error: 'Invalid credentials'
            });
        }

        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            user: {
                id: user.id,
                email: user.email,
                handle: user.handle,
                displayName: user.displayName
            },
            token
        });

    } catch (err) {
        console.log('Login error', err.message);
        res.status(500).json({
            error: 'Server error during login'
        });
    }
});

module.exports = router;
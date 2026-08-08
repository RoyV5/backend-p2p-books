const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const router = express.Router();

router.post('/register', async (req, res) => {
    const {email, password, display_name} = req.body;
    if (!email || !password || !display_name) {
        return res.status(400).json({ error: 'Email, password, or display_name is missing'});
    } 
    try {
        const userExists = await db.query('SELECT id FROM users WHERE email = $1', [email])
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists'});
        }
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = await db.query(
            `INSERT INTO users (email, password_hash, display_name) 
            VALUES ($1, $2, $3) 
            RETURNING id, email, display_name, created_at`,
            [email, passwordHash, display_name]
        );

        const token = jwt.sign(
            { id: newUser.rows[0].id },
            process.env.JWT_SECRET,
            { expiresIn: '30d'}
            );

        res.status(201).json({ user: newUser.rows[0], token})
        
        } catch (err) {
            console.error('Register error:', err.message);
            res.status(500).json({ error: 'Server error during registration' });
        }
});

router.post('/login', async (req, res) => {
    const {email, password} = req.body;
    try {
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email])
        if (result.rows.length === 0) {
            return res.status(400).json({error: 'Invalid credentials'})
        }
        
        const row = result.rows[0];

        if (!row) {
        // user doesn't exist
        }

        const user = {
            id: row.id,
            email: row.email,
            passwordHash: row.password_hash,
            privateProfile: row.private_profile,
            displayName: row.display_name,
            createdAt: row.created_at,
        };

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({error: 'Invalid credentials'})
        }

        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '30d'}
        );

        res.json({
            user: { id: user.id, email: user.email, display_name: user.display_name },
            token,
        });

    } catch (err) {
        console.log('Login error', err.message);
        res.status(500).json({ error: 'Server error during login'})
    }
});

module.exports = router;




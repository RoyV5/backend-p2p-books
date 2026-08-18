const express = require('express');
const db = require('../config/db');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const supabase = require('../config/supabase');

const { mapUser } = require('../mappers/userMapper');
const { getProfilePictureUrl } = require('../utils/storage');

const {
    isValidHandle,
    isValidDisplayName,
    normalizeHandle
} = require('../utils/validation');

const router = express.Router();

router.use(auth);


// GET /api/settings
router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                handle,
                display_name,
                private_profile,
                profile_picture_path,
                description
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        res.json(mapUser(result.rows[0]));

    } catch (err) {
        console.error('Get settings error:', err.message);

        res.status(500).json({
            error: 'Error retrieving settings'
        });
    }
});


// PATCH /api/settings
router.patch('/', async (req, res) => {
    const {
        handle,
        displayName,
        privateProfile,
        description
    } = req.body;
    console.log(req.body)

    const updates = [];
    const values = [];

    let normalizedHandle;

    if (handle !== undefined) {
        if (!isValidHandle(handle)) {
            return res.status(400).json({
                error: 'Invalid handle'
            });
        }

        normalizedHandle = normalizeHandle(handle);

        updates.push(`handle = $${values.length + 1}`);
        values.push(normalizedHandle);
    }

    if (displayName !== undefined) {
        if (!isValidDisplayName(displayName)) {
            return res.status(400).json({
                error: 'Invalid display name'
            });
        }

        updates.push(`display_name = $${values.length + 1}`);
        values.push(displayName);
    }

    if (description !== undefined) {
        updates.push(`description = $${values.length + 1}`);
        values.push(description);
    }

    if (privateProfile !== undefined) {
        if (typeof privateProfile !== 'boolean') {
            return res.status(400).json({
                error: 'privateProfile must be a boolean'
            });
        }

        updates.push(`private_profile = $${values.length + 1}`);
        values.push(privateProfile);
    }

    if (updates.length === 0) {
        return res.status(400).json({
            error: 'No settings provided'
        });
    }

    values.push(req.user.id);

    try {
        const result = await db.query(
            `UPDATE users
             SET ${updates.join(', ')}
             WHERE id = $${values.length}`,
            values
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const updatedFields = {};

        if (handle !== undefined) {
            updatedFields.handle = normalizedHandle;
        }

        if (displayName !== undefined) {
            updatedFields.displayName = displayName;
        }

        if (description !== undefined) {
            updatedFields.description = description;
        }

        if (privateProfile !== undefined) {
            updatedFields.privateProfile = privateProfile;
        }

        res.status(200).json(updatedFields);

    } catch (err) {
        if (
            err.code === '23505' &&
            err.constraint === 'users_handle_key'
        ) {
            return res.status(400).json({
                error: 'Handle is already taken'
            });
        }

        console.error(
            'Update settings error:',
            err.message
        );

        res.status(500).json({
            error: 'Error updating settings'
        });
    }
});


// PUT /api/settings/profile-picture
router.put(
    '/profile-picture',
    upload,
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                error: 'Profile picture is required'
            });
        }

        const userId = req.user.id;
        const filePath = `${userId}-${Date.now()}`;

        try {
            const { error: uploadError } = await supabase
                .storage
                .from(process.env.SUPABASE_STORAGE_BUCKET)
                .upload(
                    filePath,
                    req.file.buffer,
                    {
                        contentType: req.file.mimetype,
                        upsert: true
                    }
                );

            if (uploadError) {
                throw uploadError;
            }

            const result = await db.query(
                `UPDATE users AS u
                 SET profile_picture_path = $1
                 FROM (
                    SELECT profile_picture_path AS old_path
                    FROM users
                    WHERE id = $2
                 ) AS old
                 WHERE u.id = $2
                 RETURNING old.old_path`,
                [filePath, userId]
            );

            if (result.rowCount === 0) {
                const { error: removeError } = await supabase
                    .storage
                    .from(process.env.SUPABASE_STORAGE_BUCKET)
                    .remove([filePath]);

                if (removeError) {
                    console.error(
                        `Failed to clean up orphaned profile picture ` +
                        `at path "${filePath}" after user lookup miss ` +
                        `for user ${userId}:`,
                        removeError.message
                    );
                }

                return res.status(404).json({
                    error: 'User not found'
                });
            }

            const oldPath = result.rows[0].old_path;

            if (oldPath && oldPath !== filePath) {
                const { error: removeOldError } = await supabase
                    .storage
                    .from(process.env.SUPABASE_STORAGE_BUCKET)
                    .remove([oldPath]);

                if (removeOldError) {
                    console.error(
                        `Failed to remove previous profile picture ` +
                        `at path "${oldPath}" for user ${userId}:`,
                        removeOldError.message
                    );
                }
            }

            res.status(200).json({
                profilePictureUrl: getProfilePictureUrl(filePath)
            });

        } catch (err) {
            console.error(
                'Profile picture upload error:',
                err.message
            );

            res.status(500).json({
                error: 'Error uploading profile picture'
            });
        }
    }
);

module.exports = router;
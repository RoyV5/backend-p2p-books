const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 2 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(Object.assign(
                new Error('Only image files are allowed'),
                { code: 'INVALID_FILE_TYPE' }
            ));
        }

        cb(null, true);
    }
});

function uploadProfilePicture(req, res, next) {
    upload.single('profilePicture')(req, res, (err) => {
        if (!err) {
            return next();
        }

        if (err.code === 'INVALID_FILE_TYPE') {
            return res.status(400).json({
                error: 'Only image files are allowed'
            });
        }

        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    error: 'Profile picture must be smaller than 2 MB'
                });
            }

            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({
                    error: 'Unexpected file field'
                });
            }
        }

        console.error('Upload error:', err.message);

        return res.status(400).json({
            error: 'Invalid profile picture upload'
        });
    });
}

module.exports = uploadProfilePicture;
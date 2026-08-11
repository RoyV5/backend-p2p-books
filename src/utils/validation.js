function isValidEmail(email) {
    if (typeof email !== 'string') {
        return false;
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
    if (typeof password !== 'string') {
        return false;
    }

    return password.length >= 8;
}

function isValidDisplayName(displayName) {
    if (typeof displayName !== 'string') {
        return false;
    }

    return displayName.trim().length >= 1;
}

function isValidHandle(handle) {
    if (typeof handle !== 'string') {
        return false;
    }

    return /^[a-zA-Z0-9_]{3,30}$/.test(handle);
}

    function normalizeHandle(handle) {
        if (!isValidHandle(handle)) {
            throw new Error('Invalid handle');
        }

        return handle.toLowerCase();
    }

module.exports = {
    isValidEmail,
    isValidPassword,
    isValidDisplayName,
    isValidHandle,
    normalizeHandle
};

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

module.exports = {
    isValidEmail,
    isValidPassword,
    isValidDisplayName
};
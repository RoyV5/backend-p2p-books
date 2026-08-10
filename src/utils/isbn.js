function normalizeISBN(isbn) {
    if (typeof isbn !== 'string') {
        throw new Error('ISBN must be a string');
    }

    const cleanISBN = isbn
        .replace(/[-\s]/g, '')
        .toUpperCase();

    if (cleanISBN.length === 10) {
        if (!isValidISBN10(cleanISBN)) {
            throw new Error('Invalid ISBN-10');
        }

        return isbn10ToISBN13(cleanISBN);
    }

    if (cleanISBN.length === 13) {
        if (!isValidISBN13(cleanISBN)) {
            throw new Error('Invalid ISBN-13');
        }

        return cleanISBN;
    }

    throw new Error('ISBN must be 10 or 13 characters long');
}


function isValidISBN10(isbn) {
    if (!/^\d{9}[\dX]$/.test(isbn)) {
        return false;
    }

    let sum = 0;

    for (let i = 0; i < 10; i++) {
        const value = isbn[i] === 'X' ? 10 : Number(isbn[i]);
        sum += value * (10 - i);
    }

    return sum % 11 === 0;
}


function isValidISBN13(isbn) {
    if (!/^\d{13}$/.test(isbn)) {
        return false;
    }

    let sum = 0;

    for (let i = 0; i < 12; i++) {
        const digit = Number(isbn[i]);

        sum += i % 2 === 0
            ? digit
            : digit * 3;
    }

    const checkDigit = (10 - (sum % 10)) % 10;

    return checkDigit === Number(isbn[12]);
}


function isbn10ToISBN13(isbn10) {
    const isbn12 = `978${isbn10.slice(0, 9)}`;

    let sum = 0;

    for (let i = 0; i < 12; i++) {
        const digit = Number(isbn12[i]);

        sum += i % 2 === 0
            ? digit
            : digit * 3;
    }

    const checkDigit = (10 - (sum % 10)) % 10;

    return `${isbn12}${checkDigit}`;
}
module.exports = normalizeISBN;
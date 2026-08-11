const {
    isValidEmail,
    isValidPassword,
    isValidDisplayName,
    isValidHandle,
    normalizeHandle
} = require('../../src/utils/validation');

describe('Validation utilities', () => {
    describe('isValidEmail', () => {
        test('accepts a valid email', () => {
            expect(isValidEmail('test@example.com')).toBe(true);
        });

        test('rejects an email without @', () => {
            expect(isValidEmail('testexample.com')).toBe(false);
        });

        test('rejects an email without a domain', () => {
            expect(isValidEmail('test@')).toBe(false);
        });

        test('rejects non-string values', () => {
            expect(isValidEmail(null)).toBe(false);
            expect(isValidEmail(123)).toBe(false);
        });
    });

    describe('isValidPassword', () => {
        test('accepts a password with at least 8 characters', () => {
            expect(isValidPassword('password')).toBe(true);
            expect(isValidPassword('password123')).toBe(true);
        });

        test('rejects passwords shorter than 8 characters', () => {
            expect(isValidPassword('short')).toBe(false);
        });

        test('rejects non-string values', () => {
            expect(isValidPassword(null)).toBe(false);
            expect(isValidPassword(12345678)).toBe(false);
        });
    });

    describe('isValidDisplayName', () => {
        test('accepts a non-empty display name', () => {
            expect(isValidDisplayName('Test User')).toBe(true);
        });

        test('rejects an empty display name', () => {
            expect(isValidDisplayName('')).toBe(false);
        });

        test('rejects a whitespace-only display name', () => {
            expect(isValidDisplayName('   ')).toBe(false);
        });

        test('rejects non-string values', () => {
            expect(isValidDisplayName(null)).toBe(false);
            expect(isValidDisplayName(123)).toBe(false);
        });
    });

        describe('isValidHandle', () => {
        test('accepts a valid handle', () => {
            expect(isValidHandle('rodrigo_books')).toBe(true);
        });

        test('accepts a handle containing numbers', () => {
            expect(isValidHandle('booklover123')).toBe(true);
        });

        test('rejects handles shorter than 3 characters', () => {
            expect(isValidHandle('ab')).toBe(false);
        });

        test('rejects handles longer than 30 characters', () => {
            expect(isValidHandle('a'.repeat(31))).toBe(false);
        });

        test('rejects handles containing spaces', () => {
            expect(isValidHandle('rodrigo books')).toBe(false);
        });

        test('rejects handles containing punctuation', () => {
            expect(isValidHandle('rodrigo.books')).toBe(false);
            expect(isValidHandle('rodrigo-books')).toBe(false);
            expect(isValidHandle('@rodrigo')).toBe(false);
        });

        test('rejects non-string values', () => {
            expect(isValidHandle(null)).toBe(false);
            expect(isValidHandle(123)).toBe(false);
        });
    });

    describe('normalizeHandle', () => {
        test('converts a valid handle to lowercase', () => {
            expect(normalizeHandle('Rodrigo_Books')).toBe('rodrigo_books');
        });

        test('preserves an already lowercase handle', () => {
            expect(normalizeHandle('rodrigo_books')).toBe('rodrigo_books');
        });

        test('throws for an invalid handle', () => {
            expect(() => normalizeHandle('bad handle')).toThrow('Invalid handle');
        });
    });
});
const {
    isValidEmail,
    isValidPassword,
    isValidDisplayName
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
});
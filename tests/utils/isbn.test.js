const normalizeISBN = require('../../src/utils/isbn');

describe('normalizeISBN', () => {
    describe('valid ISBNs', () => {
        test('accepts a valid ISBN-13', () => {
            expect(normalizeISBN('9780140449266'))
                .toBe('9780140449266');
        });

        test('converts a valid ISBN-10 to ISBN-13', () => {
            expect(normalizeISBN('0140449264'))
                .toBe('9780140449266');
        });

        test('accepts ISBN-10 with X as the check digit', () => {
            expect(normalizeISBN('080442957X'))
                .toBe('9780804429573');
        });

        test('removes hyphens', () => {
            expect(normalizeISBN('978-0-14-044926-6'))
                .toBe('9780140449266');
        });

        test('removes whitespace', () => {
            expect(normalizeISBN('978 014 044 926 6'))
                .toBe('9780140449266');
        });

        test('handles lowercase x in ISBN-10', () => {
            expect(normalizeISBN('080442957x'))
                .toBe('9780804429573');
        });
    });

    describe('invalid ISBNs', () => {
        test('rejects a non-string value', () => {
            expect(() => normalizeISBN(9780140449266))
                .toThrow('ISBN must be a string');
        });

        test('rejects an invalid ISBN-10 checksum', () => {
            expect(() => normalizeISBN('0140449265'))
                .toThrow('Invalid ISBN-10');
        });

        test('rejects an invalid ISBN-13 checksum', () => {
            expect(() => normalizeISBN('9780140449267'))
                .toThrow('Invalid ISBN-13');
        });

        test('rejects an ISBN with the wrong length', () => {
            expect(() => normalizeISBN('123456789'))
                .toThrow('ISBN must be 10 or 13 characters long');
        });

        test('rejects an ISBN containing invalid characters', () => {
            expect(() => normalizeISBN('01404492AB'))
                .toThrow('Invalid ISBN-10');
        });

        test('rejects an empty string', () => {
            expect(() => normalizeISBN(''))
                .toThrow('ISBN must be 10 or 13 characters long');
        });
    });
});
const extractPublishedYear = require('../../src/utils/date');

describe('extractPublishedYear', () => {
    test('extracts year from a full date', () => {
        expect(extractPublishedYear('2003-03-27')).toBe(2003);
    });

    test('extracts year from year-month format', () => {
        expect(extractPublishedYear('2003-03')).toBe(2003);
    });

    test('accepts a year by itself', () => {
        expect(extractPublishedYear('2003')).toBe(2003);
    });

    test('returns null for missing data', () => {
        expect(extractPublishedYear(null)).toBeNull();
    });

    test('returns null for an invalid date', () => {
        expect(extractPublishedYear('not-a-date')).toBeNull();
    });
});
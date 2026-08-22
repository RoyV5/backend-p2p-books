const {
    extractPublishedYear,
    defaultDueDate,
    isDueDateInRange
} = require('../../src/utils/date');

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

function daysFromToday(days) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + days);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

describe('defaultDueDate', () => {
    test('returns today plus 30 days', () => {
        expect(defaultDueDate()).toBe(daysFromToday(30));
    });
});

describe('isDueDateInRange', () => {
    test('accepts the lower boundary (7 days)', () => {
        expect(isDueDateInRange(daysFromToday(7))).toBe(true);
    });

    test('accepts the upper boundary (90 days)', () => {
        expect(isDueDateInRange(daysFromToday(90))).toBe(true);
    });

    test('rejects 6 days out', () => {
        expect(isDueDateInRange(daysFromToday(6))).toBe(false);
    });

    test('rejects 91 days out', () => {
        expect(isDueDateInRange(daysFromToday(91))).toBe(false);
    });

    test('rejects a malformed date string', () => {
        expect(isDueDateInRange('not-a-date')).toBe(false);
    });

    test('rejects a missing value', () => {
        expect(isDueDateInRange(undefined)).toBe(false);
    });
});
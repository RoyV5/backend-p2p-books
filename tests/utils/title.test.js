const normalizeTitle = require('../../src/utils/title');

describe('normalizeTitle', () => {
    test('converts an all-uppercase title to title case', () => {
        expect(normalizeTitle('THE COUNT OF MONTE CRISTO'))
            .toBe('The Count Of Monte Cristo');
    });

    test('converts an all-lowercase title to title case', () => {
        expect(normalizeTitle('the count of monte cristo'))
            .toBe('The Count Of Monte Cristo');
    });

    test('preserves mixed-case titles', () => {
        expect(normalizeTitle('Harry Potter and the Philosopher’s Stone'))
            .toBe('Harry Potter and the Philosopher’s Stone');
    });

    test('returns null for a missing title', () => {
        expect(normalizeTitle(null)).toBeNull();
    });
});
const { normalizeTitle, titlesMatch } = require('../../src/utils/title');

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

describe('titlesMatch', () => {
    test('matches identical titles', () => {
        expect(
            titlesMatch('The Hobbit', 'The Hobbit')
        ).toBe(true);
    });

    test('matches regardless of case', () => {
        expect(
            titlesMatch('THE HOBBIT', 'the hobbit')
        ).toBe(true);
    });

    test('matches when one title contains the other', () => {
        expect(
            titlesMatch(
                'Tintin: The Secret of the Unicorn',
                'The Secret of the Unicorn'
            )
        ).toBe(true);
    });

    test('matches regardless of which side is the longer one', () => {
        expect(
            titlesMatch(
                'The Secret of the Unicorn',
                'Tintin: The Secret of the Unicorn'
            )
        ).toBe(true);
    });

    test('ignores punctuation and extra whitespace', () => {
        expect(
            titlesMatch(
                "Harry Potter and the Philosopher's Stone",
                'Harry Potter and the Philosopher’s Stone  '
            )
        ).toBe(true);
    });

    test('rejects genuinely different titles', () => {
        expect(
            titlesMatch('The Hobbit', 'The Fellowship of the Ring')
        ).toBe(false);
    });

    test('returns false when either title is missing', () => {
        expect(titlesMatch(null, 'The Hobbit')).toBe(false);
        expect(titlesMatch('The Hobbit', null)).toBe(false);
        expect(titlesMatch(null, null)).toBe(false);
    });

    test('returns false when either title is empty after normalizing', () => {
        expect(titlesMatch('...', 'The Hobbit')).toBe(false);
    });
});
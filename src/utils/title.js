function normalizeTitle(title) {
    if (!title) return null;

    const isAllUppercase =
        title === title.toUpperCase();

    const isAllLowercase =
        title === title.toLowerCase();

    if (!isAllUppercase && !isAllLowercase) {
        return title;
    }

    return title
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase());
}

/*
 * Reduces a title down to a bare-bones comparable form:
 * lowercase, accents stripped, punctuation removed, whitespace
 * collapsed. Two titles that differ only in formatting
 * (curly vs. straight apostrophes, colons, etc.) normalize to
 * the same string.
 */
function normalizeForComparison(title) {
    return title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/*
 * Two titles "match" if they're equal once normalized, or if
 * one contains the other. The containment check exists because
 * providers frequently disagree on series branding rather than
 * on the book itself, e.g. OpenLibrary's "Tintin: The Secret of
 * the Unicorn" vs. Google's "The Secret of the Unicorn" — both
 * records were looked up by the same ISBN, so they're already
 * about the same physical book; the difference is formatting,
 * not identity.
 */
function titlesMatch(titleA, titleB) {
    if (!titleA || !titleB) {
        return false;
    }

    const normalizedA = normalizeForComparison(titleA);
    const normalizedB = normalizeForComparison(titleB);

    if (!normalizedA || !normalizedB) {
        return false;
    }

    return (
        normalizedA === normalizedB ||
        normalizedA.includes(normalizedB) ||
        normalizedB.includes(normalizedA)
    );
}

module.exports = { normalizeTitle, titlesMatch };
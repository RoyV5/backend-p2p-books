function escapeLikeTerm(term) {
    return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/*
 * Prepares a raw search term for a pg_trgm similarity
 * comparison: trims and lowercases. Deliberately not stripping
 * punctuation/accents the way titlesMatch's comparison does for
 * metadata reconciliation — that function is answering "are
 * these two titles the same book," a stricter question, while
 * trigram similarity is already inherently fuzzy about minor
 * character differences, so heavier normalization here would be
 * solving a problem the matching algorithm already handles.
 */
function normalizeSearchQuery(query) {
    return query.trim().toLowerCase();
}

module.exports = { escapeLikeTerm, normalizeSearchQuery };
/*
 * Maps a books DB row (snake_case) to the domain/API
 * representation (camelCase) used everywhere outside
 * the persistence layer.
 *
 * This also covers the object produced by the fetching
 * service (fetchingService.js's compileBook), since that
 * object is shaped to match the `books` table columns for
 * insertion and therefore uses the same snake_case keys.
 */
function mapBook(row) {
    if (!row) {
        return null;
    }

    return {
        isbn: row.isbn,
        title: row.title,
        authors: row.authors,
        description: row.description,
        pageCount: row.page_count,
        coverUrl: row.cover_url,
        publisher: row.publisher,
        publishedYear: row.published_year,
        language: row.language,
        createdAt: row.created_at
    };
}

module.exports = { mapBook };
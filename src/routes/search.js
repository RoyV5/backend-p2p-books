const express = require('express');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { mapUser } = require('../mappers/userMapper');
const { mapBook } = require('../mappers/bookMapper');
const { getProfilePictureUrl } = require('../utils/storage');
const normalizeISBN = require('../utils/isbn');
const {
    escapeLikeTerm,
    normalizeSearchQuery
} = require('../utils/search');

const router = express.Router();

const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 20;

// GET /api/search/users?q=<term>
router.get('/users', auth, async (req, res) => {
    const rawQuery = typeof req.query.q === 'string'
        ? req.query.q.trim()
        : '';

    // A too-short (or missing) query isn't an error from the
    // client's point of view, e.g. mid-typing in a search box —
    // it just has no results yet.
    if (rawQuery.length < MIN_QUERY_LENGTH) {
        return res.json([]);
    }

    const escapedTerm = escapeLikeTerm(rawQuery);
    const containsPattern = `%${escapedTerm}%`;
    const prefixPattern = `${escapedTerm}%`;

    // Handles are normalized to lowercase on write (see
    // normalizeHandle), so a plain lowercase equality check
    // is enough to detect an exact handle match for ranking.
    const exactHandle = rawQuery.toLowerCase();

    try {
        const result = await db.query(
            `SELECT
                id,
                handle,
                display_name,
                profile_picture_path
             FROM users
             WHERE id != $1
               AND (
                    handle ILIKE $2 ESCAPE '\\'
                    OR display_name ILIKE $2 ESCAPE '\\'
               )
             ORDER BY
                (handle = $3) DESC,
                (handle ILIKE $4 ESCAPE '\\') DESC,
                handle ASC
             LIMIT $5`,
            [
                req.user.id,
                containsPattern,
                exactHandle,
                prefixPattern,
                RESULT_LIMIT
            ]
        );

        res.json(result.rows.map(mapUser));

    } catch (err) {
        console.error('Search users error:', err.message);

        res.status(500).json({
            error: 'Error searching users'
        });
    }
});

/*
 * Maps one user_books/books/users join row — a single owned
 * copy of a book — into the search result shape: book fields
 * plus a nested owner. mapBook only picks up whatever the SQL
 * selected on the book side, and the owner is built by hand
 * since its columns are aliased (owner_id, owner_handle, ...)
 * to avoid colliding with the book's own id/handle-shaped
 * columns in the same row.
 */
function mapBookSearchResult(row) {
    return {
        ...mapBook(row),
        owner: {
            id: row.owner_id,
            handle: row.owner_handle,
            displayName: row.owner_display_name,
            profilePictureUrl: getProfilePictureUrl(
                row.owner_profile_picture_path
            )
        }
    };
}

// GET /api/search/books?q=<term>
router.get('/books', auth, async (req, res) => {
    const rawQuery = typeof req.query.q === 'string'
        ? req.query.q.trim()
        : '';

    if (rawQuery.length < MIN_QUERY_LENGTH) {
        return res.json([]);
    }

    const normalizedQuery = normalizeSearchQuery(rawQuery);

    // If the query happens to be a valid ISBN, also match it
    // exactly. A canonicalized ISBN either matches a book's isbn
    // or it doesn't — there's no "fuzzy" version of that
    // comparison, so this is a separate exact-match branch, not
    // part of the trigram similarity. normalizeISBN throwing
    // just means the query wasn't an ISBN (the common case,
    // since most queries are a title) — not an error worth
    // logging.
    let isbnQuery;

    try {
        isbnQuery = normalizeISBN(rawQuery);
    } catch (err) {
        isbnQuery = null;
    }

    try {
        const result = await db.query(
            `SELECT
                b.isbn,
                b.title,
                b.authors,
                b.cover_url,
                b.publisher,
                b.published_year,
                u.id AS owner_id,
                u.handle AS owner_handle,
                u.display_name AS owner_display_name,
                u.profile_picture_path AS owner_profile_picture_path
             FROM user_books ub
             JOIN books b ON b.isbn = ub.isbn
             JOIN users u ON u.id = ub.user_id
             WHERE ub.user_id != $1

               -- Private profiles are excluded from book search
               -- entirely for now, on the same "hide shelf
               -- contents from non-owners" basis as GET
               -- /shelf/:userId. When a friends feature exists,
               -- this should become an OR that also allows
               -- through a private owner the requester is
               -- friends with, e.g.:
               --   (u.private_profile = FALSE
               --     OR are_friends(u.id, $1))
               -- rather than staying a flat exclusion.
               AND u.private_profile = FALSE

               AND (
                    -- word_similarity/<% (not similarity/%) is
                    -- deliberate: % compares the ENTIRE query
                    -- against the ENTIRE title as one blob, so a
                    -- short one-word query like "tintin" against
                    -- a long multi-word title gets diluted by
                    -- all the other words and scores far below
                    -- threshold even for a near-exact match.
                    -- <% instead asks "is the query similar to
                    -- some substring of the title," which is
                    -- the actual question a search box is
                    -- asking.
                    $2 <% lower(b.title)
                    OR b.isbn = $3
               )
             ORDER BY
                (b.isbn = $3) DESC,
                word_similarity($2, lower(b.title)) DESC
             LIMIT $4`,
            [req.user.id, normalizedQuery, isbnQuery, RESULT_LIMIT]
        );

        res.json(result.rows.map(mapBookSearchResult));

    } catch (err) {
        console.error('Search books error:', err.message);

        res.status(500).json({
            error: 'Error searching books'
        });
    }
});

module.exports = router;
const { mapBook } = require('./bookMapper');
const { mapUser } = require('./userMapper');
const { toIsoDate } = require('../utils/date');

/*
 * Maps a joined loans row (loans + books + owner/borrower users,
 * snake_case, see the shared join query in routes/loans.js) to the
 * domain/API representation used everywhere outside the persistence
 * layer.
 *
 * `role` is passed in by the caller rather than derived from the row,
 * since only the caller (the route) knows which side of the loan the
 * requesting user is on.
 */
function mapLoan(row, role) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        status: row.status,
        requestedAt: row.requested_at,
        decidedAt: row.decided_at,
        dueDate: row.due_date ? toIsoDate(row.due_date) : row.due_date,
        cancelledAt: row.cancelled_at,
        borrowerReturnedAt: row.borrower_returned_at,
        ownerReturnedAt: row.owner_returned_at,
        completedAt: row.completed_at,
        role,
        book: mapBook({
            isbn: row.book_isbn,
            title: row.book_title,
            cover_url: row.book_cover_url,
            authors: row.book_authors
        }),
        owner: mapUser({
            id: row.owner_id,
            handle: row.owner_handle,
            display_name: row.owner_display_name,
            profile_picture_path: row.owner_profile_picture_path
        }),
        borrower: mapUser({
            id: row.borrower_id,
            handle: row.borrower_handle,
            display_name: row.borrower_display_name,
            profile_picture_path: row.borrower_profile_picture_path
        })
    };
}

/*
 * Availability of a single shelf entry, derived from the owner's
 * lendable toggle plus whether a live (active/return_pending) loan
 * exists against it.
 */
function computeAvailability(isLendable, hasLiveLoan) {
    if (!isLendable) {
        return 'unavailable';
    }

    return hasLiveLoan ? 'borrowed' : 'available';
}

module.exports = { mapLoan, computeAvailability };

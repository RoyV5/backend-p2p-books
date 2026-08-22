-- Manual per-copy toggle: owner controls whether a book on their
-- shelf can be requested at all, independent of any loan history.
ALTER TABLE user_books
    ADD COLUMN is_lendable BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- No direct FK to books/users here for owner_id/isbn - the
    -- composite FK below already pins this exact (owner_id, isbn)
    -- pair to a real shelf entry, which itself is already tied to
    -- both books(isbn) and users(id). A direct FK on either column
    -- would just be a redundant, weaker version of that constraint.
    isbn VARCHAR(20) NOT NULL,
    owner_id UUID NOT NULL,
    borrower_id UUID NOT NULL REFERENCES users(id),

    -- Ties this loan to a specific person's shelf entry, not just
    -- the ISBN, since the same book can sit on many shelves.
    FOREIGN KEY (owner_id, isbn) REFERENCES user_books(user_id, isbn),

    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'declined', 'cancelled', 'active', 'return_pending', 'completed')
    ),

    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Set together when the owner accepts or declines a pending request.
    decided_at TIMESTAMP WITH TIME ZONE,
    due_date DATE,

    -- Set if the borrower cancels while still pending.
    cancelled_at TIMESTAMP WITH TIME ZONE,

    -- Independent confirmations - status becomes 'return_pending' once
    -- either is set, and 'completed' once both are.
    borrower_returned_at TIMESTAMP WITH TIME ZONE,
    owner_returned_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    CHECK (owner_id <> borrower_id)
);

CREATE INDEX idx_loans_owner ON loans(owner_id);
CREATE INDEX idx_loans_borrower ON loans(borrower_id);
CREATE INDEX idx_loans_isbn ON loans(isbn);

-- At most one live loan (active or awaiting return confirmation)
-- per shelf entry at a time.
CREATE UNIQUE INDEX idx_loans_one_live_per_copy
    ON loans(owner_id, isbn)
    WHERE status IN ('active', 'return_pending');

-- A given borrower can't stack multiple pending requests on the
-- same copy - different borrowers may still each have one pending
-- (a queue), resolved whenever the owner accepts one of them.
CREATE UNIQUE INDEX idx_loans_one_pending_per_borrower
    ON loans(owner_id, isbn, borrower_id)
    WHERE status = 'pending';

-- Not used by anything in this pass, but overdue handling later is a
-- pure read-time computation (status = 'active' AND due_date < today)
-- rather than a stored state, and this is what a future "my overdue
-- loans" query will filter on. Cheap to add now, awkward to retrofit
-- once the table has real volume.
CREATE INDEX idx_loans_due_date_active
    ON loans(due_date)
    WHERE status = 'active';
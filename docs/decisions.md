External Metadata reconciliation V1
    When OpenLibrary and Google Books return consistent records for an ISBN, the application may combine their metadata. When they disagree materially, the application will not merge the records. OpenLibrary will be treated as the preferred source, and missing metadata will be accepted rather than filled using potentially incorrect information from the conflicting record.

    NB: Discrepancies should eventually be recorded so their frequency can be measured before deciding whether automated reconciliation or manual administrative resolution is warranted.

User search V1
    GET /api/search/users matches the query against `handle` and `display_name` using ILIKE '%term%', ranked so an exact handle match comes first, then a handle prefix match, then alphabetically. Private profiles (private_profile = true) are included in results — "private" hides shelf contents, not discoverability. A user is excluded from their own results. Query input shorter than 2 characters returns an empty result rather than an error, since an in-progress search-box query isn't a client error.

    NB: A leading-wildcard ILIKE ('%term%') cannot use a plain B-tree index and forces a sequential scan over `users`. This is fine at current scale but won't remain fine indefinitely. The known next step, if/when this needs to scale, is a pg_trgm GIN index on `handle`/`display_name` rather than reconsidering the matching strategy from scratch.
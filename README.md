# p2p-books | Backend API

A Node.js and Express API service that aggregates book metadata from public APIs, manages database persistence, and handles search queries.

*Mobile Repository: [Mobile App Repository Link](https://github.com/RoyV5/YOUR_MOBILE_REPO_NAME)*

## Overview

External book databases are often inconsistent, rate-limited, or return incomplete records. This service acts as an abstraction layer that fetches from Google Books and OpenLibrary, reconciles discrepancies, normalizes metadata formats, and serves processed data to the client.

## Key Technical Details

* **Resilience Pipeline:** Custom exponential backoff algorithm with jitter and explicit `Retry-After` header parsing to handle 503 and 429 status spikes from third-party APIs.
* **Data Reconciliation:** Combines responses from Google Books and OpenLibrary. Compares titles using fuzzy matching to verify record agreement before populating missing attributes (e.g., page count, covers, publisher).
* **Fuzzy Database Search:** Configured with PostgreSQL `pg_trgm` extension and GiST indexing (`gist_trgm_ops`) on book titles and authors for fast, typo-tolerant search ranked by similarity scores.
* **Asset Normalization:** Sanitizes image asset URLs across providers to enforce HTTPS protocol standards and eliminate mixed-content issues on client platforms.

## Stack

* Node.js / Express
* PostgreSQL (with `pg_trgm`)
* Axios

## API Reference

### Get Book Metadata by ISBN
```http
GET /api/books/:isbn

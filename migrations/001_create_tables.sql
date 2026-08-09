CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    private_profile BOOLEAN NOT NULL DEFAULT FALSE,
    display_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS books (
    isbn VARCHAR(20) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    authors TEXT[] NOT NULL DEFAULT '{}',
    description TEXT,
    page_count INTEGER,
    cover_url TEXT,
    publisher VARCHAR(255),
    published_year INTEGER,
    language VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_books (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    isbn VARCHAR(20) NOT NULL REFERENCES books(isbn),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, isbn)
);
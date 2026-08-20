const axios = require('axios');

const googleURL =
    'https://www.googleapis.com/books/v1/volumes';

const openLibraryURL =
    'http://openlibrary.org/api/volumes/brief/isbn/';

const getWithRetry = require('../utils/retryHelper');
const extractPublishedYear = require('../utils/date');
const { normalizeTitle, titlesMatch } = require('../utils/title');

async function getOpenLibraryMetadata(isbn) {
    const response = await axios.get(
        `${openLibraryURL}${isbn}.json`
    );

    const record = Object.values(
        response.data.records ?? {}
    )[0];

    if (!record) {
        throw new Error(`Book not found: ${isbn}`);
    }

    const info = record.data ?? {};
    const details = record.details?.details ?? {};

    const language =
        details.languages?.[0]?.key
            ?.split('/')
            .pop() ?? null;

    const coverUrl = await getOpenLibraryCover(isbn);

    return {
        isbn,
        title: info.title ?? null,
        authors: info.authors?.map(author => author.name) ?? [],
        description:
            typeof details.description === 'string'
                ? details.description
                : details.description?.value ?? null,
        page_count:
            info.number_of_pages ??
            details.number_of_pages ??
            null,
        cover_url: coverUrl,
        publisher:
            info.publishers?.[0]?.name ??
            details.publishers?.[0] ??
            null,
        published_date:
            info.publish_date ??
            details.publish_date ??
            null,
        language
    };
}


async function getGoogleBook(isbn) {
    const response = await getWithRetry(
        googleURL,
        {
            params: {
                q: `isbn:${isbn}`,
                key: process.env.GOOGLE_API_KEY,
            },
        },
        3
    );

    const volume = response.data.items?.[0];

    if (!volume) {
        throw new Error(`Book not found: ${isbn}`);
    }

    const info = volume.volumeInfo;

    const googleCover =
        info.imageLinks?.extraLarge ??
        info.imageLinks?.large ??
        info.imageLinks?.medium ??
        info.imageLinks?.small ??
        info.imageLinks?.thumbnail ??
        info.imageLinks?.smallThumbnail ??
        null;

    return {
        isbn,
        title: info.title ?? null,
        authors: info.authors ?? [],
        description: info.description ?? null,
        page_count: info.pageCount || null,
        cover_url: googleCover,
        publisher: info.publisher ?? null,
        published_date: info.publishedDate ?? null,
        language: info.language ?? null
    };
}


async function getOpenLibraryCover(isbn) {
    const coverUrl =
        `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;

    try {
        const response = await axios.head(coverUrl);

        return response.status === 200
            ? coverUrl
            : null;
    } catch (err) {
        return null;
    }
}


function reconcileBookData(openLibraryBook, googleBook) {
    if (!titlesMatch(openLibraryBook.title, googleBook.title)) {
        return openLibraryBook;
    }

    return {
        isbn: openLibraryBook.isbn,

        title: googleBook.title,

        authors:
            googleBook.authors.length > 0
                ? googleBook.authors
                : openLibraryBook.authors,

        description:
            googleBook.description ??
            openLibraryBook.description,

        page_count:
            googleBook.page_count ??
            openLibraryBook.page_count,

        cover_url:
            googleBook.cover_url ??
            openLibraryBook.cover_url,

        publisher:
            googleBook.publisher ??
            openLibraryBook.publisher,

        published_date:
            googleBook.published_date ??
            openLibraryBook.published_date,

        language:
            googleBook.language ??
            openLibraryBook.language
    };
}



function compileBook(book) {
    return {
        isbn: book.isbn,
        title: normalizeTitle(book.title),
        authors: book.authors ?? [],
        description: book.description ?? null,
        page_count: book.page_count ?? null,
        cover_url: book.cover_url ?? null,
        publisher: book.publisher ?? null,
        published_year: extractPublishedYear(
            book.published_date
        ),
        language: book.language ?? null
    };
}


async function getBookData(isbn) {
    let openLibraryBook = null;
    let googleBook = null;

    try {
        openLibraryBook = await getOpenLibraryMetadata(isbn);
        console.log(
            `OpenLibrary: found "${openLibraryBook.title}" for ${isbn}`
        );
    } catch (err) {
        console.log(`OpenLibrary: not found for ${isbn}`);
    }

    try {
        googleBook = await getGoogleBook(isbn);
        console.log(
            `Google Books: found "${googleBook.title}" for ${isbn}`
        );
    } catch (err) {
        console.log(`Google Books: not found for ${isbn}`);
    }

    if (!openLibraryBook && !googleBook) {
        const err = new Error(`Book not found: ${isbn}`);
        err.code = 'BOOK_NOT_FOUND';
        throw err;
    }

    let book;

    if (!openLibraryBook) {
        // OpenLibrary failed; Google Books is all we have.
        book = compileBook(googleBook);
    } else if (!googleBook) {
        // Google Books failed; use OpenLibrary alone.
        book = compileBook(openLibraryBook);
    } else {
        const reconciledBook = reconcileBookData(
            openLibraryBook,
            googleBook
        );

        book = compileBook(reconciledBook);
    }

    console.log(
        `Compiled book for ${isbn}:`,
        JSON.stringify(book)
    );

    return book;
}


async function test(isbn) {
    const result = await getBookData(isbn);
    console.log(result);
}


module.exports = getBookData;
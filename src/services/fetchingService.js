const axios = require('axios');

const googleURL =
    'https://www.googleapis.com/books/v1/volumes';

const openLibraryURL =
    'http://openlibrary.org/api/volumes/brief/isbn/';

const getWithRetry = require('../utils/retryHelper');
const extractPublishedYear = require('../utils/date');
const normalizeTitle = require('../utils/title');

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
        description: details.description?.value ?? null,
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
                projection: 'lite',
            },
        },
        2
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


function titlesMatch(openLibraryBook, googleBook) {
    if (!openLibraryBook?.title || !googleBook?.title) {
        return false;
    }

    return (
        openLibraryBook.title.trim().toLowerCase() ===
        googleBook.title.trim().toLowerCase()
    );
}


function reconcileBookData(openLibraryBook, googleBook) {
    // If the providers disagree about the title,
    // trust OpenLibrary completely.
    if (!titlesMatch(openLibraryBook, googleBook)) {
        return openLibraryBook;
    }

    // Providers agree. Prefer OpenLibrary values,
    // using Google Books to fill missing information.
    return {
        isbn: openLibraryBook.isbn,

        title: googleBook.title,

        authors:
            googleBook.authors.length > 0
                ? googleBook.authors
                : openLibraryBook.authors,

        description:
            openLibraryBook.description ??
            googleBook.description,

        page_count:
            openLibraryBook.page_count ??
            googleBook.page_count,

        cover_url:
            googleBook.cover_url ??
            openLibraryBook.cover_url,

        publisher:
            openLibraryBook.publisher ??
            googleBook.publisher,

        published_date:
            googleBook.published_date ??
            openLibraryBook.published_date,

        language:
            openLibraryBook.language ??
            googleBook.language
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
        openLibraryBook =
            await getOpenLibraryMetadata(isbn);
    } catch (err) {
        console.log(
            `OpenLibrary lookup failed for ${isbn}`
        );
    }

    try {
        googleBook =
            await getGoogleBook(isbn);
    } catch (err) {
        console.log(err.message);
        console.log(
            `Google Books lookup failed for ${isbn}`
        );
    }

    if (!openLibraryBook && !googleBook) {
        throw new Error(`Book not found: ${isbn}`);
    }

    // If OpenLibrary failed, Google Books is all we have.
    if (!openLibraryBook) {
        return compileBook(googleBook);
    }

    // If Google Books failed, use OpenLibrary alone.
    if (!googleBook) {
        return compileBook(openLibraryBook);
    }

    const reconciledBook = reconcileBookData(
        openLibraryBook,
        googleBook
    );

    return compileBook(reconciledBook);
}


async function test(isbn) {
    const result = await getBookData(isbn);
    console.log(result);
}


module.exports = getBookData;
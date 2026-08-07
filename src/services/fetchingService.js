const axios = require('axios');

const googleURL = 'https://www.googleapis.com/books/v1/volumes';

async function getGoogleBook(isbn) {
    const googleResponse = await axios.get(googleURL, {
        params: {
            q: `isbn:${isbn}`,
            key: process.env.GOOGLE_API_KEY,
            projection: 'lite',
        }
    });

    const volume = googleResponse.data.items?.[0];

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
        title: info.title,
        authors: info.authors ?? [],
        description: info.description ?? null,
        page_count: info.pageCount ?? null,
        cover_url: googleCover
    };
}

async function getOpenLibraryCover(isbn) {
    const coverUrl =
        `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;

    try {
        const response = await axios.head(coverUrl);

        return response.status === 200 ? coverUrl : null;
    } catch (err) {
        return null;
    }
}

async function getBookData(isbn) {
    const googleBook = await getGoogleBook(isbn);
    const openLibraryCover = await getOpenLibraryCover(isbn);

    return {
        isbn,
        title: googleBook.title,
        authors: googleBook.authors,
        description: googleBook.description,
        page_count: googleBook.page_count,
        cover_url: openLibraryCover ?? googleBook.cover_url
    };
}

module.exports = getBookData;
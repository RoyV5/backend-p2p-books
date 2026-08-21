jest.mock('axios');

const axios = require('axios');
const getBookData = require('../../src/services/fetchingService');

const ISBN = '9780140449266';

const OPEN_LIBRARY_URL =
    `http://openlibrary.org/api/volumes/brief/isbn/${ISBN}.json`;

const GOOGLE_URL = 'https://www.googleapis.com/books/v1/volumes';

function openLibraryResponse({
    title,
    description,
    authors = ['J.R.R. Tolkien'],
    numberOfPages = 310,
    publisher = 'George Allen & Unwin',
    publishDate = '1937',
    languageKey = '/languages/eng'
} = {}) {
    return {
        data: {
            records: {
                OL123M: {
                    data: {
                        title,
                        authors: authors.map(name => ({ name })),
                        number_of_pages: numberOfPages,
                        publishers: [{ name: publisher }],
                        publish_date: publishDate
                    },
                    details: {
                        details: {
                            description,
                            languages: [{ key: languageKey }]
                        }
                    }
                }
            }
        }
    };
}

function googleResponse({
    title,
    description,
    authors = ['J.R.R. Tolkien'],
    pageCount = 320,
    publisher = 'HarperCollins',
    publishedDate = '1937-09-21',
    language = 'en'
} = {}) {
    return {
        data: {
            items: [
                {
                    volumeInfo: {
                        title,
                        authors,
                        description,
                        pageCount,
                        publisher,
                        publishedDate,
                        language,
                        imageLinks: {
                            thumbnail: 'https://example.com/thumb.jpg'
                        }
                    }
                }
            ]
        }
    };
}

function googleNotFoundResponse() {
    return { data: { items: [] } };
}

describe('getBookData', () => {
    let setTimeoutSpy;

    beforeEach(() => {
        jest.resetAllMocks();

        // Bypass setTimeout to prevent test timeouts during getWithRetry's 
        // exponential backoff delays.
        setTimeoutSpy = jest
            .spyOn(global, 'setTimeout')
            .mockImplementation((callback) => {
                callback();
                return 0;
            });

        // Cover-existence check defaults to "exists" unless a
        // test overrides it; it isn't the focus of these tests.
        axios.head.mockResolvedValue({ status: 200 });
    });

    afterEach(() => {
        setTimeoutSpy.mockRestore();
    });

    test(
        'prefers Google Books fields when titles match, ' +
        'filling gaps from OpenLibrary',
        async () => {
            axios.get.mockImplementation((url) => {
                if (url === OPEN_LIBRARY_URL) {
                    return Promise.resolve(openLibraryResponse({
                        title: 'The Hobbit',
                        description: 'OpenLibrary description',
                        publisher: 'OpenLibrary Publisher'
                    }));
                }

                if (url === GOOGLE_URL) {
                    return Promise.resolve(googleResponse({
                        title: 'The Hobbit',
                        description: 'Google description',
                        publisher: null
                    }));
                }

                throw new Error(`Unexpected URL: ${url}`);
            });

            const book = await getBookData(ISBN);

            // Google's description wins outright.
            expect(book.description).toBe('Google description');

            // Google's publisher was null, so OpenLibrary fills it.
            expect(book.publisher).toBe('OpenLibrary Publisher');
        }
    );

    test(
        'treats a series-prefixed title as a match, not a conflict',
        async () => {
            axios.get.mockImplementation((url) => {
                if (url === OPEN_LIBRARY_URL) {
                    return Promise.resolve(openLibraryResponse({
                        title: 'Tintin: The Secret of the Unicorn',
                        description: 'OpenLibrary description'
                    }));
                }

                if (url === GOOGLE_URL) {
                    return Promise.resolve(googleResponse({
                        title: 'The Secret of the Unicorn',
                        description: 'Google description'
                    }));
                }

                throw new Error(`Unexpected URL: ${url}`);
            });

            const book = await getBookData(ISBN);

            expect(book.description).toBe('Google description');
        }
    );

    test(
        'trusts OpenLibrary exclusively when titles genuinely disagree',
        async () => {
            axios.get.mockImplementation((url) => {
                if (url === OPEN_LIBRARY_URL) {
                    return Promise.resolve(openLibraryResponse({
                        title: 'The Hobbit',
                        description: 'OpenLibrary description'
                    }));
                }

                if (url === GOOGLE_URL) {
                    return Promise.resolve(googleResponse({
                        title: 'The Fellowship of the Ring',
                        description: 'Google description for a different book'
                    }));
                }

                throw new Error(`Unexpected URL: ${url}`);
            });

            const book = await getBookData(ISBN);

            expect(book.title).toBe('The Hobbit');
            expect(book.description).toBe('OpenLibrary description');
        }
    );

    test(
        'extracts a plain-string OpenLibrary description',
        async () => {
            axios.get.mockImplementation((url) => {
                if (url === OPEN_LIBRARY_URL) {
                    return Promise.resolve(openLibraryResponse({
                        title: 'The Hobbit',
                        description: 'A plain string description'
                    }));
                }

                if (url === GOOGLE_URL) {
                    return Promise.resolve(googleNotFoundResponse());
                }

                throw new Error(`Unexpected URL: ${url}`);
            });

            const book = await getBookData(ISBN);

            expect(book.description).toBe('A plain string description');
        }
    );

    test(
        'extracts an object-shaped OpenLibrary description',
        async () => {
            axios.get.mockImplementation((url) => {
                if (url === OPEN_LIBRARY_URL) {
                    return Promise.resolve(openLibraryResponse({
                        title: 'The Hobbit',
                        description: {
                            type: '/type/text',
                            value: 'An object-shaped description'
                        }
                    }));
                }

                if (url === GOOGLE_URL) {
                    return Promise.resolve(googleNotFoundResponse());
                }

                throw new Error(`Unexpected URL: ${url}`);
            });

            const book = await getBookData(ISBN);

            expect(book.description).toBe('An object-shaped description');
        }
    );

    test('falls back to Google Books when OpenLibrary fails', async () => {
        axios.get.mockImplementation((url) => {
            if (url === OPEN_LIBRARY_URL) {
                return Promise.reject(new Error('network error'));
            }

            if (url === GOOGLE_URL) {
                return Promise.resolve(googleResponse({
                    title: 'The Hobbit',
                    description: 'Google-only description'
                }));
            }

            throw new Error(`Unexpected URL: ${url}`);
        });

        const book = await getBookData(ISBN);

        expect(book.description).toBe('Google-only description');
    });

    test(
        'falls back to OpenLibrary when Google Books ' +
        'keeps failing with 503s',
        async () => {
            axios.get.mockImplementation((url) => {
                if (url === OPEN_LIBRARY_URL) {
                    return Promise.resolve(openLibraryResponse({
                        title: 'The Hobbit',
                        description: 'OpenLibrary-only description'
                    }));
                }

                if (url === GOOGLE_URL) {
                    return Promise.reject({
                        response: { status: 503 }
                    });
                }

                throw new Error(`Unexpected URL: ${url}`);
            });

            const book = await getBookData(ISBN);

            expect(book.description).toBe('OpenLibrary-only description');
        }
    );

    test('throws when both providers fail', async () => {
        axios.get.mockRejectedValue(new Error('network error'));

        await expect(getBookData(ISBN)).rejects.toThrow(
            `Book not found: ${ISBN}`
        );
    });
});
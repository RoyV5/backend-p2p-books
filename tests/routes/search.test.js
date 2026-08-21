const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const searchRouter = require('../../src/routes/search');
const db = require('../../src/config/db');

function createApp() {
    const app = express();

    app.use(express.json());
    app.use('/search', searchRouter);

    return app;
}

function createToken(userId) {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );
}

async function createUser({
    email,
    handle,
    displayName,
    privateProfile = false
}) {
    const result = await db.query(
        `INSERT INTO users (
            email,
            password_hash,
            handle,
            display_name,
            private_profile
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, handle, display_name, private_profile`,
        [
            email,
            'not-a-real-password-hash',
            handle,
            displayName,
            privateProfile
        ]
    );

    return result.rows[0];
}

async function createBook({
    isbn,
    title,
    authors = ['Author Name'],
    coverUrl = null,
    publisher = null,
    publishedYear = null
}) {
    await db.query(
        `INSERT INTO books (
            isbn,
            title,
            authors,
            cover_url,
            publisher,
            published_year
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [isbn, title, authors, coverUrl, publisher, publishedYear]
    );
}

async function addToShelf(userId, isbn) {
    await db.query(
        `INSERT INTO user_books (user_id, isbn)
         VALUES ($1, $2)`,
        [userId, isbn]
    );
}

describe('Search routes', () => {
    const app = createApp();

    let self;
    let token;

    beforeEach(async () => {
        self = await createUser({
            email: 'self@example.com',
            handle: 'self_user',
            displayName: 'Self User'
        });

        token = createToken(self.id);
    });

    describe('GET /search/users', () => {
        test('requires authentication', async () => {
            const response = await request(app)
                .get('/search/users')
                .query({ q: 'anything' });

            expect(response.statusCode).toBe(401);
        });

        test('returns an empty array for a query under 2 characters', async () => {
            await createUser({
                email: 'a@example.com',
                handle: 'a',
                displayName: 'A'
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'a' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('returns an empty array when no query is provided', async () => {
            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`);

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('matches by handle, case-insensitively', async () => {
            const bob = await createUser({
                email: 'bob@example.com',
                handle: 'bob_builder',
                displayName: 'Bobby'
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'BOB_bu' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([
                {
                    id: bob.id,
                    handle: 'bob_builder',
                    displayName: 'Bobby',
                    profilePictureUrl: null
                }
            ]);
        });

        test('matches by display name', async () => {
            const carol = await createUser({
                email: 'carol@example.com',
                handle: 'carol99',
                displayName: 'Carol Danvers'
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'danvers' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([
                {
                    id: carol.id,
                    handle: 'carol99',
                    displayName: 'Carol Danvers',
                    profilePictureUrl: null
                }
            ]);
        });

        test('excludes the requesting user from their own results', async () => {
            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'self' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('includes private profiles in results', async () => {
            const paul = await createUser({
                email: 'paul@example.com',
                handle: 'private_paul',
                displayName: 'Private Paul',
                privateProfile: true
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'paul' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([
                {
                    id: paul.id,
                    handle: 'private_paul',
                    displayName: 'Private Paul',
                    profilePictureUrl: null
                }
            ]);
        });

        test('never leaks internal-only fields', async () => {
            await createUser({
                email: 'dana@example.com',
                handle: 'dana_the_dev',
                displayName: 'Dana'
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'dana' });

            expect(response.body[0]).not.toHaveProperty('email');
            expect(response.body[0]).not.toHaveProperty('passwordHash');
            expect(response.body[0]).not.toHaveProperty('privateProfile');
            expect(response.body[0]).not.toHaveProperty('description');
        });

        test(
            'ranks exact handle match, then prefix, then substring',
            async () => {
                const exact = await createUser({
                    email: 'exact@example.com',
                    handle: 'ali',
                    displayName: 'Exact'
                });

                const prefix = await createUser({
                    email: 'prefix@example.com',
                    handle: 'alice',
                    displayName: 'Prefix'
                });

                const substring = await createUser({
                    email: 'substring@example.com',
                    handle: 'malice',
                    displayName: 'Substring'
                });

                const response = await request(app)
                    .get('/search/users')
                    .set('Authorization', `Bearer ${token}`)
                    .query({ q: 'ali' });

                expect(response.statusCode).toBe(200);
                expect(
                    response.body.map((user) => user.id)
                ).toEqual([exact.id, prefix.id, substring.id]);
            }
        );

        test('does not treat "%" or "_" in the query as wildcards', async () => {
            await createUser({
                email: 'unrelated@example.com',
                handle: 'totally_unrelated',
                displayName: 'Totally Unrelated'
            });

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: '%_%' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('caps results at the result limit', async () => {
            for (let i = 0; i < 25; i++) {
                await createUser({
                    email: `many${i}@example.com`,
                    handle: `many_user_${i}`,
                    displayName: `Many User ${i}`
                });
            }

            const response = await request(app)
                .get('/search/users')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'many_user' });

            expect(response.statusCode).toBe(200);
            expect(response.body.length).toBe(20);
        });
    });

    describe('GET /search/books', () => {
        test('requires authentication', async () => {
            const response = await request(app)
                .get('/search/books')
                .query({ q: 'hobbit' });

            expect(response.statusCode).toBe(401);
        });

        test('returns an empty array for a query under 2 characters', async () => {
            const response = await request(app)
                .get('/search/books')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'h' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('matches on title and returns owner info', async () => {
            const owner = await createUser({
                email: 'owner@example.com',
                handle: 'book_owner',
                displayName: 'Book Owner'
            });

            await createBook({
                isbn: '9780547928227',
                title: 'The Hobbit',
                authors: ['J.R.R. Tolkien'],
                coverUrl: 'https://example.com/hobbit.jpg',
                publisher: 'Houghton Mifflin',
                publishedYear: 1937
            });

            await addToShelf(owner.id, '9780547928227');

            const response = await request(app)
                .get('/search/books')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'hobbit' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([
                {
                    isbn: '9780547928227',
                    title: 'The Hobbit',
                    authors: ['J.R.R. Tolkien'],
                    coverUrl: 'https://example.com/hobbit.jpg',
                    publisher: 'Houghton Mifflin',
                    publishedYear: 1937,
                    owner: {
                        id: owner.id,
                        handle: owner.handle,
                        displayName: owner.display_name,
                        profilePictureUrl: null
                    }
                }
            ]);
        });

        test(
            'does not match on author (title-only search)',
            async () => {
                const owner = await createUser({
                    email: 'owner2@example.com',
                    handle: 'tolkien_fan',
                    displayName: 'Tolkien Fan'
                });

                await createBook({
                    isbn: '9780618640157',
                    title: 'The Lord of the Rings',
                    authors: ['J.R.R. Tolkien']
                });

                await addToShelf(owner.id, '9780618640157');

                const response = await request(app)
                    .get('/search/books')
                    .set('Authorization', `Bearer ${token}`)
                    .query({ q: 'tolkien' });

                expect(response.statusCode).toBe(200);
                expect(response.body).toEqual([]);
            }
        );

        test('matches an ISBN-13 exactly', async () => {
            const owner = await createUser({
                email: 'owner2@example.com',
                handle: 'isbn_owner',
                displayName: 'ISBN Owner'
            });

            await createBook({
                isbn: '9780618640157',
                title: 'The Lord of the Rings'
            });

            await addToShelf(owner.id, '9780618640157');

            const response = await request(app)
                .get('/search/books')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: '9780618640157' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveLength(1);
            expect(response.body[0].isbn).toBe('9780618640157');
        });

        test('matches an ISBN-10 by canonicalizing to ISBN-13', async () => {
            const owner = await createUser({
                email: 'owner2b@example.com',
                handle: 'isbn10_owner',
                displayName: 'ISBN10 Owner'
            });

            // 054792822X is the ISBN-10 form of 9780547928227
            // (verified via normalizeISBN, not hand-computed).
            await createBook({
                isbn: '9780547928227',
                title: 'The Hobbit'
            });

            await addToShelf(owner.id, '9780547928227');

            const response = await request(app)
                .get('/search/books')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: '054792822X' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveLength(1);
            expect(response.body[0].isbn).toBe('9780547928227');
        });

        test(
            'does not error on a query that merely looks ISBN-ish',
            async () => {
                const response = await request(app)
                    .get('/search/books')
                    .set('Authorization', `Bearer ${token}`)
                    .query({ q: '1234567890' });

                expect(response.statusCode).toBe(200);
                expect(response.body).toEqual([]);
            }
        );

        test('tolerates minor typos via trigram similarity', async () => {
            const owner = await createUser({
                email: 'owner3@example.com',
                handle: 'typo_owner',
                displayName: 'Typo Owner'
            });

            await createBook({
                isbn: '9780547928227',
                title: 'The Hobbit'
            });

            await addToShelf(owner.id, '9780547928227');

            const response = await request(app)
                .get('/search/books')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'hobit' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveLength(1);
        });

        test(
            'matches a single word against a longer, ' +
            'multi-word title (regression: word_similarity, ' +
            'not whole-string similarity)',
            async () => {
                const owner = await createUser({
                    email: 'owner6@example.com',
                    handle: 'tintin_owner',
                    displayName: 'Tintin Owner'
                });

                await createBook({
                    isbn: '9788426114044',
                    title: 'Tintín: The Secret of the Unicorn'
                });

                await addToShelf(owner.id, '9788426114044');

                const response = await request(app)
                    .get('/search/books')
                    .set('Authorization', `Bearer ${token}`)
                    .query({ q: 'tintin' });

                expect(response.statusCode).toBe(200);
                expect(response.body).toHaveLength(1);
            }
        );

        test(
            'matches a near-miss single word against a ' +
            'longer title',
            async () => {
                const owner = await createUser({
                    email: 'owner7@example.com',
                    handle: 'dostoevsky_owner',
                    displayName: 'Dostoevsky Owner'
                });

                await createBook({
                    isbn: '9780374528379',
                    title: 'The Brothers Karamazov'
                });

                await addToShelf(owner.id, '9780374528379');

                const response = await request(app)
                    .get('/search/books')
                    .set('Authorization', `Bearer ${token}`)
                    .query({ q: 'karamalov' });

                expect(response.statusCode).toBe(200);
                expect(response.body).toHaveLength(1);
            }
        );

        test('matches regardless of query casing', async () => {
            const owner = await createUser({
                email: 'owner4@example.com',
                handle: 'case_owner',
                displayName: 'Case Owner'
            });

            await createBook({
                isbn: '9780547928227',
                title: 'The Hobbit'
            });

            await addToShelf(owner.id, '9780547928227');

            const response = await request(app)
                .get('/search/books')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'THE HOBBIT' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveLength(1);
        });

        test("excludes the requester's own copies", async () => {
            await createBook({
                isbn: '9780547928227',
                title: 'The Hobbit'
            });

            await addToShelf(self.id, '9780547928227');

            const response = await request(app)
                .get('/search/books')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'hobbit' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('excludes copies owned by private-profile users', async () => {
            const privateOwner = await createUser({
                email: 'private@example.com',
                handle: 'private_owner',
                displayName: 'Private Owner',
                privateProfile: true
            });

            await createBook({
                isbn: '9780547928227',
                title: 'The Hobbit'
            });

            await addToShelf(privateOwner.id, '9780547928227');

            const response = await request(app)
                .get('/search/books')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'hobbit' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });

        test(
            'returns one result per owner when multiple ' +
            'people own the same book',
            async () => {
                const ownerA = await createUser({
                    email: 'ownerA@example.com',
                    handle: 'owner_a',
                    displayName: 'Owner A'
                });

                const ownerB = await createUser({
                    email: 'ownerB@example.com',
                    handle: 'owner_b',
                    displayName: 'Owner B'
                });

                await createBook({
                    isbn: '9780547928227',
                    title: 'The Hobbit'
                });

                await addToShelf(ownerA.id, '9780547928227');
                await addToShelf(ownerB.id, '9780547928227');

                const response = await request(app)
                    .get('/search/books')
                    .set('Authorization', `Bearer ${token}`)
                    .query({ q: 'hobbit' });

                expect(response.statusCode).toBe(200);
                expect(response.body).toHaveLength(2);

                const ownerIds = response.body.map(
                    (result) => result.owner.id
                );

                expect(ownerIds).toEqual(
                    expect.arrayContaining([ownerA.id, ownerB.id])
                );
            }
        );

        test('does not return unrelated books', async () => {
            const owner = await createUser({
                email: 'owner5@example.com',
                handle: 'unrelated_owner',
                displayName: 'Unrelated Owner'
            });

            await createBook({
                isbn: '9780547928227',
                title: 'The Hobbit'
            });

            await addToShelf(owner.id, '9780547928227');

            const response = await request(app)
                .get('/search/books')
                .set('Authorization', `Bearer ${token}`)
                .query({ q: 'a treatise on quantum electrodynamics' });

            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        });
    });
});
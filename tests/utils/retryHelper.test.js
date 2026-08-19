jest.mock('axios');

const axios = require('axios');
const getWithRetry = require('../../src/utils/retryHelper');

function httpError(status, headers = {}) {
    return {
        response: { status, headers }
    };
}

describe('getWithRetry', () => {
    let setTimeoutSpy;

    beforeEach(() => {
        jest.resetAllMocks();

        // Make sleep() resolve immediately instead of actually
        // waiting, while still letting us inspect what delay it
        // was asked to wait for.
        setTimeoutSpy = jest
            .spyOn(global, 'setTimeout')
            .mockImplementation((callback) => {
                callback();
                return 0;
            });
    });

    afterEach(() => {
        setTimeoutSpy.mockRestore();
    });

    test('returns the response on first success without retrying', async () => {
        const response = { data: 'ok' };
        axios.get.mockResolvedValue(response);

        const result = await getWithRetry('https://example.com', {});

        expect(result).toBe(response);
        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    test('retries and succeeds after a 503', async () => {
        const response = { data: 'ok' };

        axios.get
            .mockRejectedValueOnce(httpError(503))
            .mockResolvedValueOnce(response);

        const result = await getWithRetry('https://example.com', {});

        expect(result).toBe(response);
        expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test('retries and succeeds after a 429', async () => {
        const response = { data: 'ok' };

        axios.get
            .mockRejectedValueOnce(httpError(429))
            .mockResolvedValueOnce(response);

        const result = await getWithRetry('https://example.com', {});

        expect(result).toBe(response);
        expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test('does not retry a non-retryable status', async () => {
        const error = httpError(404);
        axios.get.mockRejectedValue(error);

        await expect(
            getWithRetry('https://example.com', {})
        ).rejects.toBe(error);

        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    test('throws after exhausting all retries on persistent 503s', async () => {
        const error = httpError(503);
        axios.get.mockRejectedValue(error);

        await expect(
            getWithRetry('https://example.com', {}, 2)
        ).rejects.toBe(error);

        // Initial attempt + 2 retries = 3 calls.
        expect(axios.get).toHaveBeenCalledTimes(3);
    });

    test('backs off exponentially when no Retry-After header is present', async () => {
        axios.get
            .mockRejectedValueOnce(httpError(503))
            .mockRejectedValueOnce(httpError(503))
            .mockResolvedValueOnce({ data: 'ok' });

        await getWithRetry('https://example.com', {}, 2);

        const delays = setTimeoutSpy.mock.calls.map(call => call[1]);
        expect(delays).toEqual([250, 500]);
    });

    test('honors a numeric Retry-After header over the default backoff', async () => {
        axios.get
            .mockRejectedValueOnce(httpError(429, { 'retry-after': '2' }))
            .mockResolvedValueOnce({ data: 'ok' });

        await getWithRetry('https://example.com', {});

        expect(setTimeoutSpy).toHaveBeenCalledWith(
            expect.any(Function),
            2000
        );
    });

    test(
        'falls back to default backoff when Retry-After is not a number',
        async () => {
            axios.get
                .mockRejectedValueOnce(
                    httpError(429, { 'retry-after': 'not-a-date' })
                )
                .mockResolvedValueOnce({ data: 'ok' });

            await getWithRetry('https://example.com', {});

            expect(setTimeoutSpy).toHaveBeenCalledWith(
                expect.any(Function),
                250
            );
        }
    );
});
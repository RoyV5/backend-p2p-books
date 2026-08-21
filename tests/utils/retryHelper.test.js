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
    let mathRandomSpy;

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

        // Mock Math.random to always return 0 to remove the jitter 
        // during tests, making the backoff assertions deterministic.
        mathRandomSpy = jest
            .spyOn(Math, 'random')
            .mockReturnValue(0);
    });

    afterEach(() => {
        setTimeoutSpy.mockRestore();
        mathRandomSpy.mockRestore();
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
        
        // Attempt 0 = 1000 * 2^0 + 0 (jitter) = 1000
        // Attempt 1 = 1000 * 2^1 + 0 (jitter) = 2000
        expect(delays).toEqual([1000, 2000]);
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

            // Falls back to baseDelay (1000 * 2^0) + jitter (0) = 1000
            expect(setTimeoutSpy).toHaveBeenCalledWith(
                expect.any(Function),
                1000
            );
        }
    );
});
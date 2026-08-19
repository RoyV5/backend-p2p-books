const axios = require('axios')
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 503 (Service Unavailable) and 429 (Too Many Requests) are
// both transient, retry-appropriate failures — the API is
// telling us to back off and try again, not that the request
// itself is wrong.
const RETRYABLE_STATUSES = new Set([429, 503]);

function getBackoffMs(err, attempt) {
  const retryAfterHeader = err.response?.headers?.['retry-after'];

  if (retryAfterHeader) {
    // Retry-After is usually a number of seconds, but can also
    // be an HTTP-date string. Only trust it when it parses to a
    // finite number; otherwise fall back to our own backoff
    // rather than risk sleeping for NaN/0ms.
    const seconds = Number(retryAfterHeader);

    if (Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }

  return 250 * 2 ** attempt;
}

async function getWithRetry(url, config, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, config);
    } catch (err) {
      const status = err.response?.status;

      if (!RETRYABLE_STATUSES.has(status) || attempt === retries) {
        throw err;
      }

      await sleep(getBackoffMs(err, attempt));
    }
  }
}

module.exports = getWithRetry;
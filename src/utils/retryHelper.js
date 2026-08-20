const axios = require('axios');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function getBackoffMs(err, attempt) {
  const retryAfterHeader = err.response?.headers?.['retry-after'];

  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }

  // Base interval: 1s, 2s, 4s... + jitter
  const baseDelay = 1000 * 2 ** attempt;
  const jitter = Math.random() * 500;
  
  return baseDelay + jitter;
}

async function getWithRetry(url, config = {}, maxRetries = 3) {
  const mergedConfig = {
    ...config,
    headers: {
      'Connection': 'close',
      ...(config.headers || {})
    }
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get(url, mergedConfig);
    } catch (err) {
      const status = err.response?.status;
      const isGoogleBackendFailure = err.response?.data?.error?.errors?.[0]?.reason === 'backendFailed';
      const isNetworkError = !err.response; 
      const isRetryableStatus = RETRYABLE_STATUSES.has(status) || isGoogleBackendFailure;

      const shouldRetry = (isNetworkError || isRetryableStatus) && attempt < maxRetries;

      if (!shouldRetry) {
        throw err;
      }

      // Log fires BEFORE sleep, explicitly showing the retry attempt number
      const nextAttempt = attempt + 1;
      console.warn(`[Retry Helper] 503/Network glitch on ${url}. Executing retry ${nextAttempt}/${maxRetries}...`);

      await sleep(getBackoffMs(err, attempt));
    }
  }
}

module.exports = getWithRetry;
const axios = require('axios')
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getWithRetry(url, config, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, config);
    } catch (err) {
      const status = err.response?.status;

      if (status !== 503 || attempt === retries) {
        throw err;
      }

      await sleep(250 * 2 ** attempt);
    }
  }
}

module.exports = getWithRetry;
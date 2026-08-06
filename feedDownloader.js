const axios = require('axios');

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorSummary(error) {
  if (error.response) {
    return `HTTP ${error.response.status}`;
  }

  return error.code || error.message || 'unknown error';
}

async function downloadArrayBuffer(url, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const attempts = options.attempts || DEFAULT_ATTEMPTS;
  const label = options.label || 'file';
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs
      });

      return response.data;
    } catch (error) {
      lastError = error;
      console.warn(`${label} download attempt ${attempt}/${attempts} failed: ${errorSummary(error)}`);

      if (attempt < attempts) {
        await sleep(5000 * attempt);
      }
    }
  }

  throw lastError;
}

module.exports = {
  downloadArrayBuffer
};

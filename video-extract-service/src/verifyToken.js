const crypto = require('crypto');

// Load environment variables if .env file exists (native in Node 20+)
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {
    // .env is optional; containers inject variables directly into process.env
  }
}

// Requirement 3: Reads DOWNLOAD_TOKEN_SECRET from process.env
// Fail loudly at startup with a clear console error if it's missing
const DOWNLOAD_TOKEN_SECRET = process.env.DOWNLOAD_TOKEN_SECRET;

if (!DOWNLOAD_TOKEN_SECRET) {
  console.error('========================================================================');
  console.error('FATAL CONFIGURATION ERROR: DOWNLOAD_TOKEN_SECRET is missing!');
  console.error('The video-extract-service requires the DOWNLOAD_TOKEN_SECRET environment');
  console.error('variable to be defined to verify download tokens.');
  console.error('========================================================================');
  process.exit(1);
}

/**
 * Verifies a download token signed with HMAC-SHA256.
 *
 * Token format:
 *   base64url(JSON.stringify({ videoId, itag, exp })) + '.' + base64url(hmacSha256Signature)
 *
 * @param {string} token - The raw token string
 * @returns {{ videoId: string, itag: number|string }} - Decoded videoId and itag
 * @throws {Error} if the token is invalid, expired, or failed signature verification
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token is missing or not a string');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2) {
    throw new Error('Malformed token structure: expected payload.signature');
  }

  const [payloadB64, signatureB64] = parts;

  if (!payloadB64 || !signatureB64) {
    throw new Error('Malformed token: payload or signature section is empty');
  }

  // 1. Verify HMAC-SHA256 signature using timing-safe comparison
  // Primary: signature computed over base64url payload string
  const expectedSigFromB64 = crypto
    .createHmac('sha256', DOWNLOAD_TOKEN_SECRET)
    .update(payloadB64)
    .digest('base64url');

  let rawPayload;
  try {
    rawPayload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch (err) {
    throw new Error('Failed to decode base64url payload');
  }

  // Secondary compatibility: signature computed over raw UTF-8 JSON payload string
  const expectedSigFromRaw = crypto
    .createHmac('sha256', DOWNLOAD_TOKEN_SECRET)
    .update(rawPayload)
    .digest('base64url');

  const givenSigBuf = Buffer.from(signatureB64);
  const expectedBuf1 = Buffer.from(expectedSigFromB64);
  const expectedBuf2 = Buffer.from(expectedSigFromRaw);

  const matchB64 =
    givenSigBuf.length === expectedBuf1.length &&
    crypto.timingSafeEqual(givenSigBuf, expectedBuf1);

  const matchRaw =
    givenSigBuf.length === expectedBuf2.length &&
    crypto.timingSafeEqual(givenSigBuf, expectedBuf2);

  if (!matchB64 && !matchRaw) {
    throw new Error('Invalid HMAC-SHA256 signature');
  }

  // 2. Parse decoded JSON payload
  let payload;
  try {
    payload = JSON.parse(rawPayload);
  } catch (err) {
    throw new Error('Invalid JSON inside token payload');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Token payload must be a JSON object');
  }

  // 3. Verify that exp (Unix timestamp in seconds) has not passed
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || isNaN(payload.exp)) {
    throw new Error('Token is missing valid numeric exp field');
  }

  if (payload.exp < now) {
    throw new Error('Token has expired');
  }

  // 4. Validate that videoId and itag exist
  if (!payload.videoId || payload.itag === undefined) {
    throw new Error('Token payload is missing videoId or itag');
  }

  return {
    videoId: String(payload.videoId),
    itag: payload.itag,
  };
}

/**
 * Utility helper to generate signed tokens (useful for testing and integration).
 *
 * @param {{ videoId: string, itag: number|string, exp: number }} data
 * @returns {string} token
 */
function generateToken({ videoId, itag, exp }) {
  const payloadStr = JSON.stringify({ videoId, itag, exp });
  const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', DOWNLOAD_TOKEN_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${signature}`;
}

module.exports = verifyToken;
module.exports.verifyToken = verifyToken;
module.exports.generateToken = generateToken;

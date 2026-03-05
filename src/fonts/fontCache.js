'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');
const config = require('../config');

/**
 * Custom error thrown when a font URL cannot be resolved.
 * Caught by the route handler and mapped to HTTP 422.
 */
class FontResolutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FontResolutionError';
  }
}

/**
 * Supported font file extensions.
 * Note: WOFF/WOFF2 support depends on the Cairo build at runtime.
 */
const SUPPORTED_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

/**
 * In-memory cache: fontUrl -> { localPath: string, fontFamily: string }
 */
const fontMap = new Map();

/**
 * Compute the SHA-256 hex digest of a string.
 *
 * @param {string} input
 * @returns {string}
 */
function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Given a font URL, return the absolute path to a local font file and the
 * registered canvas font family name. Downloads and caches the font on first
 * call; returns the cached entry on subsequent calls for the same URL.
 *
 * @param {string} fontUrl
 * @returns {Promise<{ localPath: string, fontFamily: string }>}
 * @throws {FontResolutionError} If the URL is malformed, uses an unsupported
 *   extension, is unreachable, or returns a non-2xx HTTP status.
 */
async function resolveFont(fontUrl) {
  // 1. Cache hit — return immediately without any I/O.
  if (fontMap.has(fontUrl)) {
    return fontMap.get(fontUrl);
  }

  // 2. Validate URL format.
  let parsedUrl;
  try {
    parsedUrl = new URL(fontUrl);
  } catch {
    throw new FontResolutionError(
      `Invalid font URL: "${fontUrl}" is not a valid URL.`
    );
  }

  // 3. Validate extension.
  const ext = path.extname(parsedUrl.pathname).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new FontResolutionError(
      `Unsupported font format "${ext}" in URL: "${fontUrl}". ` +
        `Supported formats: ${[...SUPPORTED_EXTENSIONS].join(', ')}.`
    );
  }

  // 4. Fetch font from remote URL.
  let response;
  try {
    response = await fetch(fontUrl);
  } catch (err) {
    throw new FontResolutionError(
      `Network error fetching font from "${fontUrl}": ${err.message}`
    );
  }

  // 5. Assert HTTP 2xx.
  if (!response.ok) {
    throw new FontResolutionError(
      `Failed to download font from "${fontUrl}": HTTP ${response.status} ${response.statusText}.`
    );
  }

  // 6. Write font buffer to disk using SHA-256(url) as the filename base.
  const hash = sha256(fontUrl);

  const arrayBuffer = await response.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);

  // 6a. Cairo (used by node-canvas) does not support WOFF2. Convert to TTF first.
  let saveExt = ext;
  if (ext === '.woff2') {
    const wawoff2 = require('wawoff2');
    buffer = Buffer.from(await wawoff2.decompress(buffer));
    saveExt = '.ttf';
  }

  const localPath = path.join(config.fontCacheDir, `${hash}${saveExt}`);

  try {
    await fs.promises.writeFile(localPath, buffer);
  } catch (err) {
    throw new FontResolutionError(
      `Failed to write font to disk at "${localPath}": ${err.message}`
    );
  }

  // 7. Register font with node-canvas. The family name is prefixed with "f" so
  //    it is a valid CSS identifier (SHA-256 hashes can start with a digit, which
  //    would make ctx.font silently ignore the declaration and fall back to the
  //    default 10px sans-serif).
  const fontFamily = `f${hash}`;
  try {
    GlobalFonts.registerFromPath(localPath, fontFamily);
  } catch (err) {
    throw new FontResolutionError(
      `Failed to register font from "${fontUrl}": ${err.message}`
    );
  }

  // 8. Store in in-memory cache.
  const entry = { localPath, fontFamily };
  fontMap.set(fontUrl, entry);

  // 9. Return resolved entry.
  return entry;
}

module.exports = { resolveFont, FontResolutionError };

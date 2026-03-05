'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * Saves an image buffer to the configured output directory using a UUID-based
 * filename to guarantee uniqueness across concurrent and sequential calls.
 *
 * @param {Buffer} buffer - Raw image data.
 * @param {"png"|"jpeg"} format - Image format determining the file extension.
 * @returns {Promise<string>} Absolute path to the written file.
 */
async function saveImage(buffer, format) {
  const uuid = crypto.randomUUID();
  const filename = `${uuid}.${format}`;
  const fullPath = path.join(config.outputDir, filename);

  await fs.promises.writeFile(fullPath, buffer);

  return fullPath;
}

module.exports = { saveImage };

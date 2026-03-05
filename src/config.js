'use strict';

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const outputDir = process.env.OUTPUT_DIR
  ? path.resolve(process.env.OUTPUT_DIR)
  : path.join(PROJECT_ROOT, 'output');

const fontCacheDir = process.env.FONT_CACHE_DIR
  ? path.resolve(process.env.FONT_CACHE_DIR)
  : path.join(PROJECT_ROOT, 'cache', 'fonts');

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Ensure required directories exist at startup.
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(fontCacheDir, { recursive: true });

const config = Object.freeze({
  port,
  outputDir,
  fontCacheDir,
});

module.exports = config;

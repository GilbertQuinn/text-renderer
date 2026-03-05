'use strict';

const { createCanvas } = require('@napi-rs/canvas');
const { resolveFont } = require('../fonts/fontCache');
const { saveImage } = require('../storage/imageStorage');

/**
 * Renders text to an image file.
 *
 * @param {Object} options
 * @param {string} options.text          - The text content to render.
 * @param {string} options.fontUrl       - Publicly accessible URL of the font file.
 * @param {string} options.color         - CSS-compatible color string (e.g. "#ffffff", "red").
 * @param {number} options.fontSize      - Font size in pixels.
 * @param {{ width: number, height: number }} options.dimensions - Output image dimensions in pixels.
 * @param {"png"|"jpeg"} options.format  - Output image format.
 *
 * @returns {Promise<{ filePath: string }>} Absolute path to the saved image file.
 * @throws {FontResolutionError} If the font URL is invalid, unreachable, or unsupported.
 * @throws {Error} If canvas creation or image encoding fails.
 */
async function renderText({ text, fontUrl, color, fontSize, dimensions, format }) {
  // 1. Resolve font — download + cache if necessary.
  const { fontFamily } = await resolveFont(fontUrl);

  // 2. Create canvas with the requested dimensions.
  const canvas = createCanvas(dimensions.width, dimensions.height);
  const ctx = canvas.getContext('2d');

  // 3. Apply text styling.
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px ${fontFamily}`;

  // 4. Draw text. Baseline is anchored at y = fontSize so the ascenders are
  //    not clipped at the top of the canvas.
  ctx.fillText(text, 0, fontSize);

  // 5. Encode to the requested format.
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const buffer = canvas.toBuffer(mimeType);

  // 6. Persist to disk and return the absolute file path.
  const filePath = await saveImage(buffer, format);

  return { filePath };
}

module.exports = { renderText };

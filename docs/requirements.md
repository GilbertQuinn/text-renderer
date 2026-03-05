# Text Renderer Service — Requirements

**Project:** text-renderer
**Date:** 2026-03-02
**Status:** Pending Approval
**Phase:** 1 — Requirements Gathering

---

## Overview

The text-renderer is a Node.js service used by a design editor. It accepts text content, a font URL, and styling parameters, renders the text as an image, saves the image to a local directory, and exposes the result via an HTTP API endpoint. No authentication is required for the initial version.

---

## Features

---

### Feature 1 — Core Render Function (Prototype)

**Description**
Implement the main rendering function that accepts text content, a remote font URL, and styling parameters. The function downloads (or retrieves from cache) the specified font, renders the text onto a canvas with the provided styling, and writes the output image to a local directory.

**Function Prototype**

```js
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
 * @throws {Error} If the font URL is invalid, unreachable, or rendering fails.
 */
async function renderText(options) {}
```

**Inputs**

| Parameter          | Type                             | Required | Notes                                      |
|--------------------|----------------------------------|----------|--------------------------------------------|
| `text`             | string                           | Yes      | The text content to render                 |
| `fontUrl`          | string                           | Yes      | Publicly accessible URL to a font file     |
| `color`            | string                           | Yes      | CSS-compatible color value                 |
| `fontSize`         | number                           | Yes      | Font size in pixels                        |
| `dimensions.width` | number                           | Yes      | Canvas width in pixels                     |
| `dimensions.height`| number                           | Yes      | Canvas height in pixels                    |
| `format`           | `"png"` or `"jpeg"`              | Yes      | Output image format                        |

**Outputs**

- On success: returns an object containing `filePath` — the absolute path to the saved image file on disk.
- On failure: throws an `Error` (or returns a rejected `Promise`) with a descriptive message.

**Success Criteria**

- Given valid inputs, the function produces an image file at the returned `filePath`.
- The rendered image reflects the provided `text`, `color`, `fontSize`, and `dimensions`.
- The file extension matches the requested `format` (`.png` or `.jpeg`).
- The function resolves without error when all inputs are valid.
- The function throws a descriptive error when any required input is missing or invalid.

---

### Feature 2 — Font Downloading and Caching

**Description**
When a font URL is provided, the service downloads the font file from the remote URL. Downloaded fonts are cached locally so that subsequent calls with the same font URL do not trigger redundant network requests.

**Supported Font Formats**

- TTF (.ttf)
- OTF (.otf)
- WOFF (.woff)
- WOFF2 (.woff2)

**Caching Behavior**

- Cache key is the font URL (exact string match).
- A font fetched once is retained in the cache for the lifetime of the running process (in-memory or on-disk cache — to be decided during architecture phase).
- No TTL or eviction policy is required for the initial version.

**Error Behavior**

- If the font URL is unreachable (network error, non-2xx HTTP response, timeout) the service throws an error and does not fall back to any system font.
- If the font format is not supported, the service throws a descriptive error.

**Success Criteria**

- A font URL that has been fetched once is not re-downloaded on subsequent calls within the same process lifecycle.

- A network request is made exactly once per unique font URL across multiple render calls.
- An invalid or unreachable font URL causes the render function to throw an error with a message that identifies the URL or the failure reason.
- No system font fallback is used under any circumstances.

---

### Feature 3 — Image Output (JPEG and PNG)

**Description**
The service writes the rendered image to a local output directory. Both PNG and JPEG formats are supported. The caller selects the format per request.

**Storage**

- Images are saved to a configurable local directory (e.g., `output/` relative to the project root).
- File naming convention is to be decided during architecture phase (e.g., UUID or hash-based names to avoid collisions).

**Format Support**

| Format | Notes                              |
|--------|------------------------------------|
| PNG    | Lossless, supports transparency    |
| JPEG   | Lossy, no transparency support     |

**Success Criteria**

- A PNG file is produced when `format` is `"png"`.
- A JPEG file is produced when `format` is `"jpeg"`.
- The saved file can be opened and rendered correctly by standard image viewers.
- Files are written to the designated output directory and do not overwrite one another across concurrent or sequential calls.

---

### Feature 4 — HTTP API Endpoint

**Description**
The service exposes a single HTTP API endpoint that accepts a render request, invokes the core render function, and returns a response indicating success or failure. No authentication is required.

**Endpoint**

```
POST /render
```

**Request Body (JSON)**

```json
{
  "text": "Hello World",
  "fontUrl": "https://example.com/fonts/MyFont.ttf",
  "color": "#000000",
  "fontSize": 48,
  "dimensions": { "width": 800, "height": 200 },
  "format": "png"
}
```

**Success Response (HTTP 200)**

```json
{
  "filePath": "/absolute/path/to/output/image.png"
}
```

**Error Response (HTTP 4xx / 5xx)**

```json
{
  "error": "Descriptive error message"
}
```

**Error Mapping**

| Condition                          | HTTP Status |
|------------------------------------|-------------|
| Missing or invalid request fields  | 400         |
| Font URL unreachable or invalid    | 422         |
| Internal rendering failure         | 500         |

**Success Criteria**

- A well-formed request returns HTTP 200 with a `filePath` pointing to the saved image.
- A request with missing required fields returns HTTP 400 with a descriptive error message.
- A request with an invalid or unreachable font URL returns HTTP 422 with a descriptive error message.
- An unexpected internal failure returns HTTP 500.
- The endpoint does not require any authentication headers or tokens.

---

## Out of Scope (Initial Version)

- Authentication and authorization
- Multi-line text layout or rich text formatting
- Text alignment, line height, letter spacing, or other typographic controls beyond the defined styling parameters
- Image serving via URL (the API returns a file path, not a hosted URL)
- Font format validation beyond checking the file extension or MIME type
- Cache persistence across process restarts
- Rate limiting or request throttling

---

## Open Questions (Deferred to Architecture Phase)

1. Which Node.js canvas library should be used (e.g., `canvas`, `sharp`, `skia-canvas`)?
2. Should font caching be in-memory (Map) or on-disk (cached font files)?
3. What is the file naming strategy for output images to prevent collisions?
4. Should the output directory path be configurable via an environment variable?
5. What HTTP framework should be used (e.g., Express, Fastify)?

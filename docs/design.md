# Text Renderer Service — Design Document

**Project:** text-renderer
**Date:** 2026-03-02
**Status:** Draft
**Phase:** 2 — Architecture

---

## 1. Overview

This document captures all architecture and design decisions for the `text-renderer` service. It is the authoritative reference for the development phase. Any deviation from these decisions must be discussed and this document updated before code is changed.

---

## 2. Technology Choices

### 2.1 Canvas / Rendering Library — `canvas` (`node-canvas`)

**Chosen library:** [`canvas`](https://www.npmjs.com/package/canvas) (node-canvas, backed by Cairo).

**Rationale:**

- Implements the W3C Canvas 2D API, which maps directly to the function prototype in the requirements (`fillText`, `font` property, image export).
- Native support for registering custom fonts via `registerFont(path, { family })` — exactly what the font-caching module needs.
- Built-in `canvas.toBuffer('image/png')` and `canvas.toBuffer('image/jpeg')` cover both required output formats without an additional conversion library.
- Mature, widely used, and the lowest-friction choice for a Node.js text-on-canvas use case.
- `sharp` and `skia-canvas` were considered but are heavier dependencies with broader APIs that are not needed here.

### 2.2 HTTP Framework — `fastify`

**Chosen framework:** [`fastify`](https://www.npmjs.com/package/fastify) (v4).

**Rationale:**

- JSON schema-based request validation is built-in, which handles the HTTP 400 field-validation requirement without any additional middleware.
- Minimal boilerplate; the entire API surface is a single route (`POST /render`).
- Faster cold-start and lower overhead than Express for a service that may be called frequently by a design editor.
- Well-typed error handling via `setErrorHandler` for clean HTTP 422 / 500 mapping.

### 2.3 Font Caching Strategy — In-Memory Map (process-lifetime)

**Chosen strategy:** A module-level `Map<string, string>` where the key is the font URL and the value is the absolute path of the downloaded font file on disk.

**Rationale:**

- Requirements explicitly state "no TTL or eviction policy is required" and "no cache persistence across process restarts". An in-memory Map satisfies both constraints with zero extra dependencies.
- Fonts are written to a persistent `cache/fonts/` directory. The Map keeps a fast lookup from URL to file path. If the process restarts, fonts are re-downloaded (acceptable per requirements).
- An on-disk-only cache (without the Map) would require a directory scan or a separate index file — unnecessary complexity for v1.
- This hybrid approach (Map + disk file) means the canvas `registerFont` call is only made once per URL per process, and disk I/O is also only performed once per URL.

### 2.4 File Naming Strategy — UUID v4

**Chosen strategy:** Each output image is named `<uuidv4>.<ext>` (e.g., `a3f1c2d4-...png`).

**Rationale:**

- UUIDs are collision-resistant without requiring any global counter or database.
- The `crypto.randomUUID()` function is available in Node.js 14.17+ with no external dependency.
- Hash-based naming (e.g., SHA-256 of inputs) was considered but would silently return a stale file if the same inputs are re-submitted — not desirable for a rendering service where the caller expects a freshly written file.

### 2.5 Output Directory — Configurable via Environment Variable

**Strategy:** The output directory defaults to `<project-root>/output/` but is overridable via the `OUTPUT_DIR` environment variable. The font cache directory defaults to `<project-root>/cache/fonts/` and is overridable via `FONT_CACHE_DIR`.

**Rationale:**

- Addresses Open Question 4 from the requirements.
- Keeps the service portable across environments (development, CI, container) without code changes.

### 2.6 HTTP Port — Configurable via Environment Variable

- Default port: `3000`.
- Overridable via `PORT` environment variable.

---

## 3. Project Folder Structure

```
text-renderer/
├── docs/
│   ├── requirements.md
│   └── design.md
├── src/
│   ├── server.js            # Fastify instance creation and plugin registration
│   ├── index.js             # Entry point — loads config, starts server
│   ├── config.js            # Reads and exports environment-based configuration
│   ├── routes/
│   │   └── render.js        # POST /render route definition and JSON schema
│   ├── core/
│   │   └── renderText.js    # Core render function (Feature 1)
│   ├── fonts/
│   │   └── fontCache.js     # Font download + in-memory cache (Feature 2)
│   └── storage/
│       └── imageStorage.js  # UUID naming, directory setup, file write (Feature 3)
├── output/                  # Default output directory (git-ignored)
├── cache/
│   └── fonts/               # Persisted downloaded font files (git-ignored)
├── test/
│   ├── unit/
│   │   ├── renderText.test.js
│   │   ├── fontCache.test.js
│   │   └── imageStorage.test.js
│   └── integration/
│       └── renderRoute.test.js
├── .env.example             # Documents supported environment variables
├── package.json
└── README.md
```

---

## 4. Module Breakdown

### 4.1 `src/config.js` — Configuration

Reads environment variables once at startup and exports a frozen config object.

```
{
  port:         number   (default 3000,         env: PORT)
  outputDir:    string   (default ./output,      env: OUTPUT_DIR)
  fontCacheDir: string   (default ./cache/fonts, env: FONT_CACHE_DIR)
}
```

Ensures output and font-cache directories exist (creates them with `fs.mkdirSync(..., { recursive: true })`) at startup.

---

### 4.2 `src/fonts/fontCache.js` — Font Download and Caching

**Responsibility:** Given a font URL, return the absolute path to a local font file. Download and cache if not already present.

**Interface:**

```js
/**
 * @param {string} fontUrl
 * @returns {Promise<string>} Absolute local file path to the font file.
 * @throws {Error} If the URL is unreachable, returns non-2xx, or the
 *                 extension is not in the supported set.
 */
async function resolveFont(fontUrl) {}
```

**Internal logic:**

1. Check the in-memory Map. If `map.has(fontUrl)`, return `map.get(fontUrl)`.
2. Validate the URL format (use `new URL(fontUrl)` — throws on malformed input).
3. Extract the file extension from the URL path. Reject if not one of `.ttf`, `.otf`, `.woff`, `.woff2`.
4. Fetch the font using the built-in `fetch` (Node 18+) or the `undici` client (already bundled with Node 18). No external HTTP library needed.
5. Assert HTTP status is 2xx. If not, throw with URL and status code in the message.
6. Write the response buffer to `<fontCacheDir>/<sha256(fontUrl)><ext>`. Using a SHA-256 hash of the URL as the filename avoids special characters in URLs becoming invalid filenames.
7. Call `canvas.registerFont(localPath, { family: sha256(fontUrl) })` so the canvas engine knows the font.
8. Store `map.set(fontUrl, { localPath, fontFamily })`.
9. Return `{ localPath, fontFamily }`.

**Supported format validation:** A Set of allowed extensions `{ '.ttf', '.otf', '.woff', '.woff2' }` is checked against `path.extname(new URL(fontUrl).pathname).toLowerCase()`.

**Note on WOFF/WOFF2:** node-canvas (Cairo) does not natively support WOFF/WOFF2 at runtime on all platforms. The font cache module will accept these extensions per the requirements but the render step may fail if the underlying Cairo build lacks WOFF support. This is documented as a known limitation and can be addressed in a future version with a WOFF-to-TTF conversion step.

---

### 4.3 `src/storage/imageStorage.js` — Image File Storage

**Responsibility:** Accept a raw image buffer and format, generate a unique filename, write to the output directory, and return the absolute file path.

**Interface:**

```js
/**
 * @param {Buffer} buffer
 * @param {"png"|"jpeg"} format
 * @returns {Promise<string>} Absolute path to the written file.
 */
async function saveImage(buffer, format) {}
```

**Internal logic:**

1. Generate `crypto.randomUUID()` for the filename base.
2. Construct filename: `<uuid>.png` or `<uuid>.jpeg`.
3. Construct full path: `path.join(config.outputDir, filename)`.
4. Write with `fs.promises.writeFile(fullPath, buffer)`.
5. Return `fullPath`.

---

### 4.4 `src/core/renderText.js` — Core Render Function

**Responsibility:** Orchestrates font resolution, canvas creation, text drawing, and image saving.

**Interface (matches requirements exactly):**

```js
/**
 * @param {Object} options
 * @param {string} options.text
 * @param {string} options.fontUrl
 * @param {string} options.color
 * @param {number} options.fontSize
 * @param {{ width: number, height: number }} options.dimensions
 * @param {"png"|"jpeg"} options.format
 * @returns {Promise<{ filePath: string }>}
 */
async function renderText(options) {}
```

**Internal logic:**

1. Call `resolveFont(fontUrl)` to obtain `{ localPath, fontFamily }`. Throws if font is unavailable.
2. Create a `canvas` instance: `createCanvas(dimensions.width, dimensions.height)`.
3. Obtain 2D context: `canvas.getContext('2d')`.
4. Set `ctx.fillStyle = color`.
5. Set `ctx.font = `${fontSize}px ${fontFamily}`` — uses the registered font family name (the SHA-256 hash string used during `registerFont`).
6. Draw text: `ctx.fillText(text, 0, fontSize)` — baseline anchored at `y = fontSize` so text is not clipped at the top.
7. Encode: `canvas.toBuffer('image/png')` or `canvas.toBuffer('image/jpeg')`.
8. Call `saveImage(buffer, format)` to persist and obtain `filePath`.
9. Return `{ filePath }`.

---

### 4.5 `src/routes/render.js` — HTTP Route

**Responsibility:** Define `POST /render`, validate the request body via JSON schema, invoke `renderText`, and map errors to the correct HTTP status codes.

**JSON Schema (Fastify built-in validation):**

```json
{
  "type": "object",
  "required": ["text", "fontUrl", "color", "fontSize", "dimensions", "format"],
  "properties": {
    "text":    { "type": "string", "minLength": 1 },
    "fontUrl": { "type": "string", "format": "uri" },
    "color":   { "type": "string", "minLength": 1 },
    "fontSize":{ "type": "number", "exclusiveMinimum": 0 },
    "dimensions": {
      "type": "object",
      "required": ["width", "height"],
      "properties": {
        "width":  { "type": "number", "exclusiveMinimum": 0 },
        "height": { "type": "number", "exclusiveMinimum": 0 }
      }
    },
    "format": { "type": "string", "enum": ["png", "jpeg"] }
  }
}
```

Fastify automatically returns HTTP 400 when the body fails this schema.

**Error classification in the route handler:**

```
Error type / message pattern        →  HTTP status
----------------------------------------------
FontResolutionError (font module)   →  422
Any other Error                     →  500
```

A custom `FontResolutionError` class (extending `Error`) is thrown by `fontCache.js` so the route can distinguish font failures from render failures without string-matching error messages.

---

### 4.6 `src/server.js` — Fastify Instance

**Responsibility:** Create and configure the Fastify instance, register routes, and export the instance (for testing without binding to a port).

**Responsibility does NOT include:** calling `server.listen()`. That is done in `index.js` so integration tests can import `server.js` directly.

---

### 4.7 `src/index.js` — Entry Point

**Responsibility:** Import config, import server, call `server.listen({ port: config.port, host: '0.0.0.0' })`, and handle startup errors.

---

## 5. API Contract

### POST /render

**URL:** `POST http://<host>:<port>/render`

**Headers:** `Content-Type: application/json`

**Request Body:**

| Field                | Type             | Required | Constraints                        |
|----------------------|------------------|----------|------------------------------------|
| `text`               | string           | Yes      | Non-empty                          |
| `fontUrl`            | string           | Yes      | Valid URI                          |
| `color`              | string           | Yes      | Non-empty; CSS color               |
| `fontSize`           | number           | Yes      | > 0                                |
| `dimensions.width`   | number           | Yes      | > 0                                |
| `dimensions.height`  | number           | Yes      | > 0                                |
| `format`             | "png" or "jpeg"  | Yes      | Enumerated                         |

**Example Request:**
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

**Success Response — HTTP 200:**
```json
{ "filePath": "/home/devuser/text-renderer/output/a3f1c2d4-9f8e-4b2a-bcf3-123456789abc.png" }
```

**Error Responses:**

| HTTP Status | Trigger Condition                             | Body                              |
|-------------|-----------------------------------------------|-----------------------------------|
| 400         | Missing required field or failed schema check | `{ "error": "<message>" }`        |
| 422         | Font URL unreachable, non-2xx, unsupported ext| `{ "error": "<message>" }`        |
| 500         | Canvas render failure or unexpected exception | `{ "error": "<message>" }`        |

---

## 6. Data Flow Diagram

```
HTTP Client
    |
    | POST /render (JSON body)
    v
[routes/render.js]
    | 1. Fastify validates body against JSON schema  --> 400 on failure
    | 2. Call renderText(options)
    v
[core/renderText.js]
    | 3. Call resolveFont(fontUrl)
    v
[fonts/fontCache.js]
    | 4a. Cache hit  -> return { localPath, fontFamily }
    | 4b. Cache miss -> fetch URL, write to cache/fonts/, register font, cache entry
    |     Error      -> throw FontResolutionError       --> 422
    v (back to renderText)
    | 5. createCanvas, getContext, set style/font
    | 6. fillText
    | 7. toBuffer (png/jpeg)
    | 8. Call saveImage(buffer, format)
    v
[storage/imageStorage.js]
    | 9. randomUUID filename, writeFile to output/
    | 10. Return absolute filePath
    v (back to renderText -> route)
    | 11. Return { filePath }
    v
HTTP Client  <-- HTTP 200 { filePath }
```

---

## 7. Key Design Decisions and Rationale

| Decision | Choice | Rationale |
|---|---|---|
| Canvas library | `canvas` (node-canvas) | Native Canvas 2D API, `registerFont` support, built-in PNG/JPEG export, no extra conversion step |
| HTTP framework | `fastify` v4 | Built-in JSON schema validation covers HTTP 400 requirements; lower overhead than Express |
| Font caching | In-memory Map + disk file | Satisfies "once per process" requirement with zero extra dependencies; Map provides O(1) lookup |
| Font cache filename | SHA-256 of URL | URL-safe, deterministic, collision-resistant; avoids filesystem-unsafe characters in URLs |
| Output filename | `crypto.randomUUID()` | No external dependency; collision-resistant; avoids stale-file reuse that hash-of-inputs would cause |
| Font family name | SHA-256 of URL | Guaranteed unique per font URL; avoids conflicts if two URLs point to fonts with the same internal family name |
| Custom `FontResolutionError` | Extends `Error` | Allows `instanceof` check in route handler for clean 422 vs 500 discrimination without fragile message parsing |
| `server.js` vs `index.js` split | Separate files | Allows integration tests to import the Fastify instance without starting a live server |
| Output dir / font cache dir | Env-configurable | Portable across environments; no code changes needed for CI or container deployments |
| WOFF/WOFF2 acceptance | Accept, document caveat | Requirements list them as supported formats; actual rendering depends on Cairo build; documented as known limitation |
| No authentication | Omitted | Explicitly out of scope for v1 |
| No rate limiting | Omitted | Explicitly out of scope for v1 |

---

## 8. External Dependencies Summary

| Package | Purpose | Why Not "From Scratch" |
|---|---|---|
| `canvas` | 2D canvas rendering, font registration, PNG/JPEG export | Wraps Cairo native library; re-implementing a rasterizer is out of scope |
| `fastify` | HTTP server, JSON schema validation, routing | HTTP spec compliance and robustness are non-trivial to reimplement safely |

All other logic — font caching, file naming, directory management, HTTP fetch, configuration — is implemented using Node.js built-ins (`crypto`, `fs`, `path`, `fetch`, `process.env`).

---

## 9. Environment Variables Reference

| Variable       | Default                          | Description                        |
|----------------|----------------------------------|------------------------------------|
| `PORT`         | `3000`                           | HTTP listen port                   |
| `OUTPUT_DIR`   | `<project-root>/output`          | Directory where images are saved   |
| `FONT_CACHE_DIR` | `<project-root>/cache/fonts`   | Directory where fonts are cached   |

---

## 10. Known Limitations (v1)

1. WOFF and WOFF2 fonts may not render correctly if the system's Cairo build lacks WOFF support. A conversion utility can be added in v2.
2. Single-line text only. `fillText` does not wrap; long strings will overflow the canvas width.
3. No output image cleanup. The `output/` directory grows unboundedly. Cleanup is out of scope for v1.
4. Font cache (disk files) is never cleaned up. Disk usage grows with the number of unique font URLs encountered.
5. The service is not horizontally scalable with shared state — font cache Map is per-process. A shared Redis-backed cache would be needed for multi-instance deployments (out of scope for v1).

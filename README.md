# Dossier PDF Service

A lightweight HTML-to-PDF microservice using Puppeteer and PagedJS. Designed as a companion to the [Kirby Dossier](https://github.com/adriencater/kirby-dossier-plugin) plugin, but usable standalone for any HTML-to-PDF conversion with CSS paged media support.

## How it works

1. Receives HTML via `POST /render`
2. Loads the HTML into headless Chromium via Puppeteer
3. Injects PagedJS to handle CSS paged media (page breaks, headers, footers, margins)
4. Waits for PagedJS to finish paginating
5. Generates a PDF with `page.pdf()`
6. Optionally appends additional PDF files (attachments) using pdf-lib
7. Returns the PDF binary

## Requirements

- Node.js 18+
- Chromium (bundled with Puppeteer)

## Installation

```bash
git clone https://github.com/adriencater/pdf-service.git
cd pdf-service
npm install
```

## Usage

### Start the service

```bash
npm start
```

The service listens on port 3100 by default. Set the `PORT` environment variable to change it:

```bash
PORT=8080 npm start
```

### API

#### `POST /render`

Renders HTML to PDF.

**Request body** (JSON):

```json
{
  "html": "<!doctype html><html>...</html>",
  "attachments": [
    { "data": "base64-encoded-pdf-bytes" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `html` | string | yes | Complete HTML document to render |
| `attachments` | array | no | PDF files to append after the main content |
| `attachments[].data` | string | no | Base64-encoded PDF file |

**Response**: `application/pdf` binary

**Errors**: JSON `{ "error": "message" }` with appropriate status code

#### `GET /health`

Health check endpoint.

**Response**: `{ "status": "ok" }`

### Example

```bash
curl -X POST http://localhost:3100/render \
  -H 'Content-Type: application/json' \
  -d '{"html": "<!doctype html><html><body><h1>Hello</h1></body></html>"}' \
  -o output.pdf
```

## Docker

### Build

```bash
docker build -t dossier-pdf-service .
```

### Run

```bash
docker run -p 3100:3100 dossier-pdf-service
```

## Deployment

The service is stateless and can run anywhere Node.js is available:

| Platform | Notes |
|----------|-------|
| **Fly.io** | `fly launch`, good free tier |
| **Railway** | Deploy from repo, usage-based pricing |
| **Google Cloud Run** | Serverless containers, scales to zero |
| **Render** | Docker support, free tier available |
| **VPS** | Run directly or via Docker |

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | HTTP port to listen on |

## Technical notes

- **Browser reuse**: A single Chromium instance is reused across requests for performance. Each request gets a fresh page/tab.
- **PagedJS injection**: PagedJS is loaded from `node_modules` and injected via `addScriptTag` after the HTML content is loaded. This avoids inlining 900KB of JS into the HTML and prevents script parsing issues.
- **Completion detection**: Uses `PagedConfig.after` callback to detect when PagedJS finishes paginating, rather than relying on selector polling which can trigger too early.
- **PDF merging**: Uses pdf-lib (pure JS, no native dependencies) to append attachment PDFs. Encrypted or corrupted attachments are skipped gracefully.
- **Body size limit**: Accepts up to 50MB JSON payloads to accommodate base64-encoded PDF attachments.

## License

MIT

# Video Extract Service

This service uses reverse-engineered YouTube stream extraction techniques (powered by `@distube/ytdl-core`) rather than an official YouTube or Google API, and operating it carries inherent YouTube Terms of Service (ToS) risk, including potential IP rate-limiting, temporary blocks, or service disruption whenever YouTube alters its web player stream signatures or CDN delivery logic.

A lightweight, stateless Node.js/Express microservice designed to run in Docker container environments. It provides metadata extraction for combined YouTube video/audio formats and securely handles high-performance streaming downloads via HMAC-SHA256 signed, time-limited tokens with support for HTTP Range requests (resumable downloads).

---

## Environment Variables

| Variable | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `PORT` | The port the HTTP server binds to (bound to `0.0.0.0`). | `3000` | No |
| `DOWNLOAD_TOKEN_SECRET` | Secret key used to sign and verify HMAC-SHA256 download tokens. | None | **Yes** |

> **CRITICAL NOTE:** The `DOWNLOAD_TOKEN_SECRET` environment variable must be set on your hosting platform and **must exactly match** the value configured on the separate Cloudflare Worker that generates download links. If this environment variable is missing, the service fails loudly and immediately halts startup with an explicit console error.

---

## Local Setup & Development

### 1. Prerequisites
- Node.js 20.x or newer
- npm 10.x or newer

### 2. Installation
```bash
cd video-extract-service
npm install
```

### 3. Configure Environment
Copy the example environment file and set your secret:
```bash
cp .env.example .env
```
Edit `.env`:
```env
PORT=3000
DOWNLOAD_TOKEN_SECRET=your_super_secret_download_token_key_123
```

### 4. Run the Service
```bash
npm start
```
The server will start listening on `http://0.0.0.0:3000`.

---

## API Endpoints

### 1. `GET /health`
Liveness/readiness probe for container orchestrators and load balancers.
- **Status:** `200 OK`
- **Response:**
  ```json
  {
    "status": "ok"
  }
  ```

### 2. `GET /extract?videoId={videoId}`
Fetches video metadata, filters available streams to locate combined audio+video formats (`hasAudio && hasVideo`), and selects the lowest-resolution format that is at least 360p (e.g. 360p over 720p).
- **Parameters:**
  - `videoId`: 11-character alphanumeric YouTube video identifier (supports `-` and `_`).
- **Validation:**
  - Returns `400 Bad Request` if `videoId` format is invalid.
  - Returns `404 Not Found` (`{ "error": "لا توجد صيغة متاحة لهذا الفيديو" }`) if no suitable combined format exists.
- **Response (200 OK):**
  ```json
  {
    "videoId": "dQw4w9WgXcQ",
    "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
    "durationSeconds": 213,
    "itag": 18,
    "contentLength": "15438291",
    "container": "mp4"
  }
  ```
  *(Note: The ephemeral raw GoogleVideo CDN URL is never exposed in this response).*

### 3. `GET /download?token={token}`
Verifies the signed download token, re-fetches a fresh stream URL directly from YouTube, and streams the media file directly to the client.
- **Parameters:**
  - `token`: Base64URL-encoded payload and HMAC-SHA256 signature in the format:
    `base64url(JSON.stringify({ videoId, itag, exp })) + '.' + base64url(hmacSha256Signature)`
- **Behavior:**
  - Returns `401 Unauthorized` (`{ "error": "رابط التحميل منتهي الصلاحية أو غير صالح" }`) if token is invalid or `exp` timestamp has elapsed.
  - Supports HTTP `Range` requests (`bytes=start-end`) returning `206 Partial Content` with `Content-Range` and `Content-Length` headers for resumable downloads.
  - Returns `200 OK` with full stream if no `Range` header is present.
  - Sets `Content-Disposition: attachment` with a sanitized filename.
  - Streams directly without buffering into memory.
  - Enables `Access-Control-Allow-Origin: *` for cross-origin downloads.

---

## Docker & Deployment on SnapDeploy

This service is pre-configured for containerized deployment on **SnapDeploy** (or any standard Docker container hosting platform, such as Fly.io, Railway, Render, Google Cloud Run, or AWS ECS).

### SnapDeploy Deployment Steps:
1. Push this repository to GitHub.
2. In your **SnapDeploy** dashboard, create a new service and connect the GitHub repository.
3. SnapDeploy will automatically detect the `Dockerfile` in the repository.
4. **Before your first deploy**, navigate to the service's **Environment Variables** / **Secrets** section in the SnapDeploy dashboard and add:
   - `DOWNLOAD_TOKEN_SECRET`: (paste the identical secret configured in your Cloudflare Worker)
   - `PORT`: (optional; SnapDeploy dynamically injects the port it routes traffic to, and the Docker container reads `process.env.PORT || 3000`).
5. Trigger the deploy. SnapDeploy will build the container using `node:20-alpine`, expose the port, and route traffic to the container.

---

## Token Verification Specification

Tokens follow the format:
```
<PAYLOAD_BASE64URL>.<SIGNATURE_BASE64URL>
```
Where:
- `PAYLOAD_BASE64URL` = `Buffer.from(JSON.stringify({ videoId, itag, exp })).toString('base64url')`
- `exp` = Expiration Unix timestamp in seconds (e.g. `Math.floor(Date.now() / 1000) + 3600`)
- `SIGNATURE_BASE64URL` = `crypto.createHmac('sha256', DOWNLOAD_TOKEN_SECRET).update(PAYLOAD_BASE64URL).digest('base64url')`

// Load environment variables if .env file exists (Node 20+ native support)
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_) {
    // .env is optional; platforms inject environment variables directly into process.env
  }
}

const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const verifyToken = require('./src/verifyToken');

const app = express();

// Requirement 5: Enable CORS globally for all routes
app.use(cors());

// Parse JSON request bodies if needed
app.use(express.json());

// YouTube video ID validation regex: exactly 11 characters (alphanumeric plus - and _)
const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts resolution height (number) from a format object.
 *
 * @param {object} format
 * @returns {number}
 */
function getResolutionHeight(format) {
  if (typeof format.height === 'number' && !isNaN(format.height) && format.height > 0) {
    return format.height;
  }
  if (typeof format.qualityLabel === 'string') {
    const parsed = parseInt(format.qualityLabel, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 0;
}

/**
 * Sanitizes a title string for use in HTTP Content-Disposition headers.
 * Strips forbidden filename characters and control characters.
 *
 * @param {string} rawTitle
 * @param {string} videoId
 * @returns {string}
 */
function sanitizeFilename(rawTitle, videoId) {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return `video_${videoId}`;
  }
  // Remove / \ : * ? " < > | and control characters
  const cleaned = rawTitle.replace(/[\/\\:*?"<>|\x00-\x1F\x7F]/g, '').trim();
  return cleaned || `video_${videoId}`;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /health
 * Status health check endpoint for container orchestrators & load balancers.
 */
app.get('/health', (req, res) => {
  return res.status(200).json({ status: 'ok' });
});

/**
 * GET /extract?videoId={videoId}
 * Extracts video metadata and selects the optimal combined format.
 */
app.get('/extract', async (req, res) => {
  const videoId = req.query.videoId;

  // Requirement: Validates videoId matches 11-char pattern; return 400 if invalid
  if (!videoId || typeof videoId !== 'string' || !YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
    return res.status(400).json({ error: 'معرف الفيديو غير صالح' });
  }

  try {
    // Fetch video metadata and formats via ytdl-core
    const info = await ytdl.getInfo(videoId);

    // Requirement: Filter formats to find combined audio+video formats (hasAudio && hasVideo)
    const combinedFormats = (info.formats || []).filter(
      (f) => Boolean(f.hasAudio && f.hasVideo)
    );

    // Requirement: Preferring the lowest-resolution combined format that is at least 360p
    const atLeast360 = combinedFormats
      .filter((f) => getResolutionHeight(f) >= 360)
      .sort((a, b) => getResolutionHeight(a) - getResolutionHeight(b));

    // If at least 360p exists, choose the lowest among them. Otherwise fallback to available combined format
    const selectedFormat =
      atLeast360.length > 0
        ? atLeast360[0]
        : (combinedFormats.length > 0
            ? [...combinedFormats].sort((a, b) => getResolutionHeight(b) - getResolutionHeight(a))[0]
            : null);

    // Requirement: If none found, return 404 with { error: 'لا توجد صيغة متاحة لهذا الفيديو' }
    if (!selectedFormat) {
      return res.status(404).json({ error: 'لا توجد صيغة متاحة لهذا الفيديو' });
    }

    const title = info.videoDetails?.title || `video_${videoId}`;
    const durationSeconds = info.videoDetails?.lengthSeconds
      ? parseInt(info.videoDetails.lengthSeconds, 10)
      : 0;

    // Requirement: Return JSON: { videoId, title, durationSeconds, itag, contentLength, container }
    // Do NOT return the raw googlevideo.com URL
    return res.status(200).json({
      videoId,
      title,
      durationSeconds: isNaN(durationSeconds) ? 0 : durationSeconds,
      itag: selectedFormat.itag,
      contentLength: selectedFormat.contentLength ? String(selectedFormat.contentLength) : null,
      container: selectedFormat.container || 'mp4',
    });
  } catch (err) {
    console.error(`Error in /extract for videoId ${videoId}:`, err.message);
    return res.status(500).json({
      error: 'حدث خطأ أثناء استخراج بيانات الفيديو',
      message: err.message,
    });
  }
});

/**
 * GET /download?token={token}
 * Streams video format directly to client with token verification and HTTP Range support.
 */
app.get('/download', async (req, res) => {
  const token = req.query.token;

  // Requirement: Verify token via helper; return 401 with { error: 'رابط التحميل منتهي الصلاحية أو غير صالح' } if invalid/expired
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'رابط التحميل منتهي الصلاحية أو غير صالح' });
  }

  const { videoId, itag } = decoded;
  const targetItag = Number(itag);

  try {
    // Requirement: Re-fetch fresh format info via ytdl-core using the token's videoId/itag (never trust a cached URL)
    const info = await ytdl.getInfo(videoId);
    const format = (info.formats || []).find((f) => f.itag === targetItag);

    if (!format) {
      return res.status(404).json({ error: 'الصيغة المطلوبة غير متوفرة لهذا الفيديو' });
    }

    const totalLength = format.contentLength ? parseInt(format.contentLength, 10) : null;
    const rangeHeader = req.headers.range;

    /**
     * RANGE REQUEST IMPLEMENTATION NOTE:
     * Based on @distube/ytdl-core's internal architecture, the download options accept a `range: { start?: number, end?: number }`
     * object. When passed to `ytdl.downloadFromInfo(info, { format, range })`, ytdl-core sends an HTTP Range header upstream
     * directly to YouTube's GoogleVideo CDN servers (`Range: bytes=${start}-${end}`) and streams only the requested byte chunk.
     * This avoids downloading or buffering unneeded bytes in Node.js memory and enables full support for resumable, paused,
     * or parallel partial downloads (HTTP 206 Partial Content).
     */
    const downloadOptions = { format };
    let isRangeRequest = false;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        const rawStart = match[1];
        const rawEnd = match[2];

        const start = rawStart ? parseInt(rawStart, 10) : 0;
        let end = rawEnd ? parseInt(rawEnd, 10) : (totalLength ? totalLength - 1 : undefined);

        // Validate range bounds if totalLength is known
        if (
          totalLength &&
          (start >= totalLength ||
            (end !== undefined && end >= totalLength) ||
            (end !== undefined && start > end))
        ) {
          res.setHeader('Content-Range', `bytes */${totalLength}`);
          return res.status(416).end(); // 416 Range Not Satisfiable
        }

        isRangeRequest = true;
        const rangeObj = { start };
        if (end !== undefined) {
          rangeObj.end = end;
        }
        downloadOptions.range = rangeObj;

        const chunkLength =
          end !== undefined ? end - start + 1 : totalLength ? totalLength - start : undefined;
        const contentRangeHeader = `bytes ${start}-${end !== undefined ? end : (totalLength ? totalLength - 1 : '*')}/${totalLength || '*'}`;

        res.status(206);
        res.setHeader('Content-Range', contentRangeHeader);
        if (chunkLength !== undefined) {
          res.setHeader('Content-Length', chunkLength);
        }
      }
    }

    if (!isRangeRequest) {
      res.status(200);
      if (totalLength) {
        res.setHeader('Content-Length', totalLength);
      }
    }

    // Set standard response headers
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', format.mimeType || 'video/mp4');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Filename sanitization & Content-Disposition
    const title = info.videoDetails?.title || `video_${videoId}`;
    const container = format.container || 'mp4';
    const safeBaseName = sanitizeFilename(title, videoId);
    const asciiSafe = safeBaseName.replace(/[^\x20-\x7E]/g, '_') || `video_${videoId}`;
    const utf8Encoded = encodeURIComponent(safeBaseName);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiSafe}.${container}"; filename*=UTF-8''${utf8Encoded}.${container}`
    );

    // Requirement: Stream directly to the response (pipe), never buffer the whole file in memory
    const stream = ytdl.downloadFromInfo(info, downloadOptions);

    // Gracefully handle stream errors
    stream.on('error', (err) => {
      console.error(`Stream error during download for video ${videoId} (itag ${itag}):`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'حدث خطأ أثناء تحميل الفيديو' });
      } else {
        res.destroy(err);
      }
    });

    // Abort stream if client drops connection prematurely
    req.on('close', () => {
      stream.destroy();
    });

    stream.pipe(res);
  } catch (err) {
    console.error(`Download endpoint error for video ${videoId}:`, err.message);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'حدث خطأ غير متوقع أثناء معالجة الطلب',
        message: err.message,
      });
    }
  }
});

// ============================================================================
// Server Initialization
// ============================================================================
const PORT = process.env.PORT || 3000;

// Only bind server if executed directly (e.g. `node index.js`)
if (require.main === module) {
  // Requirement 2: Must bind to 0.0.0.0, not just localhost, to be reachable inside a container
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Video Extract Service running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;

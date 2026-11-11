/**
 * Stream Transformer
 * Transforms Hanime streams to Stremio format
 */

const { titleize } = require('./formatters');

const DEFAULT_DURATION_MS = 20 * 60 * 1000;
const ESTIMATED_BITRATES_MBPS = {
  360: 0.48,
  480: 0.62,
  720: 1.35,
  1080: 2.7
};

/**
 * Transform Hanime stream to Stremio stream object
 * @param {Object} stream - Hanime stream object
 * @returns {Object} Stremio stream object
 */
function toStremioStream(stream) {
  if (!stream || !stream.url) return null;

  const groupName = stream.video_stream_group_id || '';
  const name = titleize(groupName.replace(/-/g, ' '));
  const suppliedFilesizeMbs = Number(stream.filesize_mbs);
  const suppliedDurationMs = Number(stream.duration_in_ms);
  const durationMissing = !Number.isFinite(suppliedDurationMs) || suppliedDurationMs <= 0;
  const durationMs = durationMissing ? DEFAULT_DURATION_MS : suppliedDurationMs;
  const bitrateMbps = ESTIMATED_BITRATES_MBPS[Number(stream.height)] || 1.35;
  const filesizeMissing = !Number.isFinite(suppliedFilesizeMbs) || suppliedFilesizeMbs <= 0;
  const filesizeMbs = filesizeMissing
    ? Math.round((bitrateMbps * (durationMs / 1000) / 8) * 10) / 10
    : suppliedFilesizeMbs;
  const roundedFilesizeMbs = Math.round(filesizeMbs);
  const details = [];
  details.push(`💾 ${roundedFilesizeMbs} MB`);
  details.push(`⌚ ${(durationMs / 60000).toFixed(0)} min`);
  const description = [name.slice(0, -3), details.join(' ')].filter(Boolean).join('\n');

  return {
    name: `Hanime.TV\n${stream.height || 0}p`,
    title: description,
    description,
    url: stream.url,
    behaviorHints: {
      videoSize: Math.round(filesizeMbs * 1024 * 1024)
    }
  };
}

/**
 * Transform array of Hanime streams to Stremio streams
 * @param {Array} hanimeStreams - Array of Hanime stream objects
 * @param {Object} cacheConfig - Cache configuration
 * @returns {Object} Stremio streams response
 */
function toStremioStreams(hanimeStreams, cacheConfig) {
  if (!Array.isArray(hanimeStreams)) {
    return { streams: [] };
  }

  const streams = hanimeStreams
    .map(stream => toStremioStream(stream))
    .filter(stream => stream?.url?.trim());

  return {
    streams: streams,
    cacheMaxAge: cacheConfig.maxAge,
    staleError: cacheConfig.staleError
  };
}

module.exports = {
  toStremioStream,
  toStremioStreams
};

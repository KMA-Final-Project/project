/**
 * YouTube URL Validation Utilities
 */

/**
 * Extracts the 11-character video ID from a YouTube URL.
 * Supports standard watch URLs, youtu.be short URLs, embed URLs, and shorts.
 */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  // This comprehensive regex handles:
  // - youtube.com/watch?v=VIDEO_ID
  // - youtube.com/embed/VIDEO_ID
  // - youtube.com/v/VIDEO_ID
  // - youtu.be/VIDEO_ID
  // - youtube.com/shorts/VIDEO_ID
  const regExp =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regExp);

  return match && match[1].length === 11 ? match[1] : null;
}

/**
 * Validates if the given string is a valid YouTube URL.
 */
export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}

/**
 * Returns the URL for the High Quality thumbnail of a given video ID.
 * The hqdefault (480x360) is almost universally available on all videos,
 * whereas maxresdefault is not.
 */
export function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

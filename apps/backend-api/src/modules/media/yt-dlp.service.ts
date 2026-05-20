import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// yt-dlp format codes for best mux'd stream (video+audio) up to 1080p
// Falls back progressively until something resolves.
const YT_FORMAT_SELECTOR =
  'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best';

const DEFAULT_YOUTUBE_EXTRACTOR_ARGS = 'youtube:player_client=android';

const RETRYABLE_YT_DLP_PATTERNS = [
  'sign in to confirm you',
  'too many requests',
  'http error 429',
  'captcha',
  'timed out',
  'connection reset',
  'unable to download api page',
  'temporarily unavailable',
];

export class RetryableYtDlpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableYtDlpError';
  }
}

export function isRetryableYtDlpError(
  error: unknown,
): error is RetryableYtDlpError {
  return error instanceof RetryableYtDlpError;
}

/** Resolved direct stream info from yt-dlp */
export interface StreamUrlInfo {
  /** Direct HLS/DASH/MP4 video+audio URL (or video-only if no mux is available) */
  videoUrl: string | null;
  /** Direct audio-only stream URL */
  audioUrl: string;
  /** Video title */
  title: string;
  /** Duration in seconds */
  durationSeconds: number;
  /** Original YouTube URL stored in DB */
  originUrl: string;
  /** Thumbnail URL */
  thumbnailUrl: string | null;
  /** Approximate TTL in seconds for the signed stream URLs (yt-dlp reports this) */
  expiresInSeconds: number;
}

export interface YoutubeMetadataInfo {
  title: string;
  durationSeconds: number;
  originUrl: string;
  thumbnailUrl: string | null;
}

export interface DownloadedYoutubeAudioInfo {
  filePath: string;
}

/** Raw JSON from yt-dlp --dump-single-json */
interface YtDlpJson {
  title: string;
  duration: number;
  thumbnail?: string;
  url?: string; // single merged URL (for non-mux formats)
  requested_formats?: Array<{
    url: string;
    vcodec?: string;
    acodec?: string;
    format_id?: string;
    ext?: string;
  }>;
  formats?: Array<{
    url: string;
    format_id: string;
    ext?: string;
    vcodec?: string;
    acodec?: string;
    height?: number;
  }>;
}

@Injectable()
export class YtDlpService {
  private readonly logger = new Logger(YtDlpService.name);

  constructor(private readonly configService: ConfigService) {}

  async resolveTitle(youtubeUrl: string): Promise<string> {
    const metadata = await this.resolveMetadata(youtubeUrl);
    return metadata.title;
  }

  async resolveMetadata(youtubeUrl: string): Promise<YoutubeMetadataInfo> {
    this.logger.log(`Resolving metadata for: ${youtubeUrl}`);

    const rawJson = await this.loadJson(
      youtubeUrl,
      ['--dump-json', youtubeUrl],
      15_000,
      'resolve YouTube metadata',
    );

    return {
      title: rawJson.title,
      durationSeconds: Math.round(rawJson.duration),
      originUrl: youtubeUrl,
      thumbnailUrl: rawJson.thumbnail ?? null,
    };
  }

  /**
   * Resolve direct stream URLs from a YouTube URL.
   *
   * Uses `yt-dlp --dump-single-json` (no download) to extract:
   * - Best video URL (up to 1080p)
   * - Best audio-only URL (for fallback / audio-only mode)
   *
   * ⚠️  These URLs are time-limited (~6 hours for YouTube).
   * The mobile client should call this endpoint fresh each playback session.
   */
  async resolveStreamUrls(youtubeUrl: string): Promise<StreamUrlInfo> {
    this.logger.log(`Resolving stream URLs for: ${youtubeUrl}`);

    const rawJson = await this.loadJson(
      youtubeUrl,
      ['--dump-single-json', '-f', YT_FORMAT_SELECTOR, youtubeUrl],
      30_000,
      'resolve stream URLs',
    );

    const { videoUrl, audioUrl } = this.extractUrls(rawJson);

    const result: StreamUrlInfo = {
      videoUrl,
      audioUrl,
      title: rawJson.title,
      durationSeconds: Math.round(rawJson.duration),
      originUrl: youtubeUrl,
      thumbnailUrl: rawJson.thumbnail ?? null,
      // YouTube signed URLs are typically valid ~6 hours (21600s)
      expiresInSeconds: 21600,
    };

    this.logger.log(
      `Stream URLs resolved for "${rawJson.title}" (${result.durationSeconds}s). ` +
        `videoUrl: ${videoUrl ? 'present' : 'none'}, audioUrl: present`,
    );

    return result;
  }

  /**
   * Parse yt-dlp JSON to extract video and audio direct URLs.
   *
   * yt-dlp can return:
   * - `requested_formats` array (when muxing formats were selected)
   * - `url` field alone (when a merged format was found)
   * - `formats` array (fallback — pick best available)
   */
  private extractUrls(json: YtDlpJson): {
    videoUrl: string | null;
    audioUrl: string;
  } {
    let videoUrl: string | null = null;
    let audioUrl: string | null = null;

    // Case 1: Separate video + audio tracks (most common for 720p/1080p)
    if (json.requested_formats && json.requested_formats.length >= 2) {
      const videoFmt = json.requested_formats.find(
        (f) => f.vcodec && f.vcodec !== 'none',
      );
      const audioFmt = json.requested_formats.find(
        (f) =>
          f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'),
      );

      if (videoFmt) videoUrl = videoFmt.url;
      if (audioFmt) audioUrl = audioFmt.url;

      // If we have video URL but not audio URL, also use the video URL for audio
      // The player can extract audio from a muxed stream
      if (videoUrl && !audioUrl) {
        audioUrl = videoUrl;
      }
    }

    // Case 2: Single merged URL (e.g., 360p mp4 with audio already embedded)
    if (!audioUrl && json.url) {
      audioUrl = json.url;
      // For merged format, both video and audio share the same URL
      if (!videoUrl) {
        videoUrl = json.url;
      }
    }

    // Case 3: Fall back through formats array — pick best audio + best video
    if (!audioUrl && json.formats) {
      // Best audio-only
      const audioCandidates = json.formats.filter(
        (f) =>
          f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'),
      );
      if (audioCandidates.length > 0) {
        audioUrl = audioCandidates[audioCandidates.length - 1].url;
      }

      // Best video (with audio or without)
      if (!videoUrl) {
        const videoCandidates = json.formats.filter(
          (f) => f.vcodec && f.vcodec !== 'none' && (f.height ?? 0) <= 1080,
        );
        if (videoCandidates.length > 0) {
          videoUrl = videoCandidates[videoCandidates.length - 1].url;
        }
      }

      // Final fallback: use any URL available
      if (!audioUrl && json.formats.length > 0) {
        audioUrl = json.formats[json.formats.length - 1].url;
      }
    }

    if (!audioUrl) {
      throw new Error(
        'yt-dlp did not return any playable stream URL for this video.',
      );
    }

    return { videoUrl, audioUrl };
  }

  async downloadAudio(
    youtubeUrl: string,
    outputTemplate: string,
  ): Promise<DownloadedYoutubeAudioInfo> {
    this.logger.log(`Downloading YouTube audio for: ${youtubeUrl}`);

    const { stdout } = await this.exec(
      youtubeUrl,
      [
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '5',
        '-o',
        outputTemplate,
        '--print',
        'after_move:filepath',
        youtubeUrl,
      ],
      300_000,
      'download YouTube audio',
    );

    const filePath = stdout.trim().split('\n').pop()?.trim();
    if (!filePath) {
      throw new Error('yt-dlp did not report a downloaded filepath');
    }

    return { filePath };
  }

  private async loadJson(
    youtubeUrl: string,
    args: string[],
    timeout: number,
    action: string,
  ): Promise<YtDlpJson> {
    try {
      const { stdout } = await this.exec(youtubeUrl, args, timeout, action);
      return JSON.parse(stdout) as YtDlpJson;
    } catch (error) {
      this.throwYtDlpError(error, action, youtubeUrl);
    }
  }

  private async exec(
    youtubeUrl: string,
    args: string[],
    timeout: number,
    action: string,
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync('yt-dlp', this.buildCommandArgs(args), {
        timeout,
      });
    } catch (error) {
      this.throwYtDlpError(error, action, youtubeUrl);
    }
  }

  private buildCommandArgs(args: string[]): string[] {
    const youtubeUrl = args.at(-1);
    const leadingArgs = youtubeUrl ? args.slice(0, -1) : [...args];
    const commandArgs = [...leadingArgs, '--no-playlist', '--no-warnings'];

    const cookiesFile = this.configService.get<string>('YT_DLP_COOKIES_FILE');
    const cookiesFromBrowser = this.configService.get<string>(
      'YT_DLP_COOKIES_FROM_BROWSER',
    );
    const extractorArgs =
      this.configService.get<string>('YT_DLP_YOUTUBE_EXTRACTOR_ARGS')?.trim() ||
      DEFAULT_YOUTUBE_EXTRACTOR_ARGS;

    if (cookiesFile?.trim()) {
      commandArgs.push('--cookies', cookiesFile.trim());
    } else if (cookiesFromBrowser?.trim()) {
      commandArgs.push('--cookies-from-browser', cookiesFromBrowser.trim());
    }

    if (extractorArgs.trim()) {
      commandArgs.push('--extractor-args', extractorArgs.trim());
    }

    if (youtubeUrl) {
      commandArgs.push(youtubeUrl);
    }

    return commandArgs;
  }

  private throwYtDlpError(
    error: unknown,
    action: string,
    youtubeUrl: string,
  ): never {
    const msg =
      error instanceof Error ? error.message : 'yt-dlp execution failed';

    if (
      msg.includes('This video is not available') ||
      msg.includes('Video unavailable') ||
      msg.includes('Private video') ||
      msg.includes('removed by the user')
    ) {
      throw new BadRequestException(
        'This YouTube video is unavailable or private.',
      );
    }

    if (msg.includes('ENOENT')) {
      throw new Error(
        'yt-dlp is not installed on this server. Contact support.',
      );
    }

    const normalizedMessage = msg.toLowerCase();
    const isRetryable = RETRYABLE_YT_DLP_PATTERNS.some((pattern) =>
      normalizedMessage.includes(pattern),
    );

    if (isRetryable) {
      throw new RetryableYtDlpError(
        `Temporary YouTube extraction failure while trying to ${action}. ` +
          `Configure YT_DLP_COOKIES_FILE for authenticated access if this persists. ` +
          `Original error: ${msg}`,
      );
    }

    throw new Error(`Failed to ${action} for ${youtubeUrl}: ${msg}`);
  }
}

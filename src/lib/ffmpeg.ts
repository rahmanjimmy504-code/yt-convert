// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * ffmpeg-backed stream-copy remux for adaptive MP4 (docs/hd-muxing-proposal.md,
 * Phase 2). YouTube's >360p tracks are separate video-only + audio-only
 * streams; combining them is a near-zero-CPU remux, not a re-encode.
 *
 * This module is server-only. It never spawns a shell: ffmpeg is invoked with
 * an argument array, and every URL is re-validated against the media allowlist
 * by the caller (see /api/convert) immediately before spawn.
 *
 * ── Availability ───────────────────────────────────────────────────────────
 * ffmpeg is discovered once, in order:
 *   1. FFMPEG_PATH (explicit override), else
 *   2. `ffmpeg` on PATH (bundled into the Docker image — Render / VPS).
 * When neither exists (e.g. Vercel's runtime) muxing self-disables and the
 * download falls back to the progressive single-file stream. Set
 * DISABLE_MUXING=1 to switch it off explicitly.
 *
 * Cloudflare Workers (via OpenNext) has no subprocess support at all —
 * node:child_process is a non-functional stub there. isSubprocessUnavailable()
 * detects that runtime up front so ffmpegPath() returns null without ever
 * touching spawn, and muxing self-disables exactly as it does on Vercel.
 */

import { spawn, spawnSync } from 'node:child_process';

/**
 * True on runtimes with no working subprocess support (Cloudflare Workers via
 * OpenNext). The Workers runtime exposes a `navigator` global whose user agent
 * is the literal "Cloudflare-Workers"; Node does not. This is checked instead
 * of probe-spawning, because calling the child_process stub there throws.
 */
export function isSubprocessUnavailable(): boolean {
  const g = globalThis as { navigator?: { userAgent?: string } };
  return typeof g.navigator !== 'undefined' && g.navigator?.userAgent === 'Cloudflare-Workers';
}

/** Module-level probe cache: `undefined` = not yet probed. */
let cachedFfmpeg: string | null | undefined;

/** Resolve the ffmpeg binary path, or null when it is not available. */
export function ffmpegPath(): string | null {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg;

  if (isSubprocessUnavailable()) {
    cachedFfmpeg = null;
    return cachedFfmpeg;
  }

  const explicit = (process.env.FFMPEG_PATH || '').trim();
  if (explicit) {
    cachedFfmpeg = explicit;
    return cachedFfmpeg;
  }

  try {
    const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 5000 });
    cachedFfmpeg = probe.error ? null : 'ffmpeg';
  } catch {
    // Defense in depth: if spawnSync itself is unavailable/throws, treat
    // ffmpeg as absent rather than crashing the request path.
    cachedFfmpeg = null;
  }
  return cachedFfmpeg;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** Pure decision, split out so it can be unit-tested without a real binary. */
export function muxingEnabled(ffmpegAvailable: boolean, disabled: boolean): boolean {
  return ffmpegAvailable && !disabled;
}

/** Whether this process can run the remux right now. */
export function isMuxingEnabled(): boolean {
  return muxingEnabled(ffmpegPath() !== null, process.env.DISABLE_MUXING === '1');
}

/**
 * The exact ffmpeg invocation for a stream-copy remux, as an argument array.
 * No shell interpolation is possible. The fragmented-MP4 movflags are
 * mandatory: the normal MP4 muxer seeks backwards to write the `moov` atom
 * and fails on a pipe ("muxer does not support non-seekable output").
 */
export function muxArgs(videoUrl: string, audioUrl: string): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-user_agent', BROWSER_UA,
    '-i', videoUrl,
    '-user_agent', BROWSER_UA,
    '-i', audioUrl,
    // Deterministic stream selection: first video from input 0, first audio
    // from input 1. Without this, ffmpeg would pick "best" streams itself.
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c', 'copy',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1',
  ];
}

export interface MuxStream {
  body: ReadableStream<Uint8Array>;
  /** Resolves true once the first MP4 bytes are produced, false on early failure. */
  started: Promise<boolean>;
  /** Kill the child (called when the client aborts the download). */
  kill: () => void;
  /** Last ~4 KB of ffmpeg stderr, for error reporting. */
  stderrTail: () => string;
}

/** Max number of chunks buffered before pausing ffmpeg's stdout (backpressure). */
const HIGH_WATER = 64;
const LOW_WATER = 32;

/**
 * Spawn ffmpeg and expose its stdout as a web ReadableStream. Returns null when
 * no ffmpeg binary is available. The child is killed on cancel; the caller must
 * also arrange to call `kill()` when the request is aborted (see /api/convert).
 */
export function muxMediaToStream(videoUrl: string, audioUrl: string): MuxStream | null {
  const bin = ffmpegPath();
  if (!bin) return null;

  const child = spawn(bin, muxArgs(videoUrl, audioUrl), {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  child.stderr.on('data', (d: Buffer) => {
    stderrBuf = (stderrBuf + d.toString()).slice(-4096);
  });

  const queue: Uint8Array[] = [];
  let ended = false;
  let endError: unknown = null;
  let startedValue: boolean | null = null;
  let resolveStarted: (ok: boolean) => void = () => {};
  const started = new Promise<boolean>(resolve => {
    resolveStarted = resolve;
  });
  const markStarted = (ok: boolean) => {
    if (startedValue === null) {
      startedValue = ok;
      resolveStarted(ok);
    }
  };

  // Flowing-mode bridge with backpressure: 'data' feeds a queue, pause()/resume()
  // throttle ffmpeg when the consumer is slow. `waiters` are the ReadableStream
  // `pull` calls parked until data (or end) arrives.
  const waiters: Array<() => void> = [];
  const signal = () => {
    while (waiters.length > 0) waiters.shift()!();
  };

  child.stdout.on('data', (chunk: Buffer) => {
    queue.push(new Uint8Array(chunk));
    markStarted(true);
    if (queue.length >= HIGH_WATER) child.stdout.pause();
    signal();
  });
  const finish = (err: unknown | null) => {
    endError = err;
    ended = true;
    if (startedValue === null) markStarted(false);
    signal();
  };
  child.stdout.on('end', () => finish(null));
  child.stdout.on('error', err => finish(err));
  child.on('error', err => finish(err));

  let killed = false;
  const kill = () => {
    if (killed) return;
    killed = true;
    try {
      child.kill('SIGKILL');
    } catch {
      /* already exited */
    }
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      // Loop until we can hand the consumer something: data, an error, or close.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (queue.length > 0) {
          controller.enqueue(queue.shift()!);
          if (queue.length <= LOW_WATER) child.stdout.resume();
          return;
        }
        if (ended) {
          if (endError) controller.error(endError);
          else controller.close();
          return;
        }
        await new Promise<void>(resolve => waiters.push(resolve));
      }
    },
    cancel() {
      kill();
    },
  });

  return { body, started, kill, stderrTail: () => stderrBuf };
}

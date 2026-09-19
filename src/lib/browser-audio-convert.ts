/* Browser-only final audio conversion. No server binary is required. */

export type BrowserAudioFormat = 'flac' | 'm4a' | 'aac' | 'opus';

type FFmpegLike = {
  load(options: { coreURL: string; wasmURL: string }): Promise<void>;
  writeFile(name: string, data: Uint8Array): Promise<void>;
  exec(args: string[]): Promise<number>;
  readFile(name: string): Promise<Uint8Array>;
  deleteFile(name: string): Promise<void>;
};

type UtilLike = {
  toBlobURL(url: string, mime: string): Promise<string>;
};

let instancePromise: Promise<FFmpegLike> | null = null;

async function getFFmpeg(): Promise<FFmpegLike> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const loadModule = new Function('u', 'return import(u)') as (url: string) => Promise<any>;

      const [ffmpegModule, utilModule] = await Promise.all([
        loadModule('https://esm.sh/@ffmpeg/ffmpeg@0.12.15'),
        loadModule('https://esm.sh/@ffmpeg/util@0.12.2'),
      ]);

      const ffmpeg = new ffmpegModule.FFmpeg() as FFmpegLike;
      const util = utilModule as UtilLike;
      const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';

      await ffmpeg.load({
        coreURL: await util.toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await util.toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      return ffmpeg;
    })().catch(error => {
      instancePromise = null;
      throw error;
    });
  }

  return instancePromise;
}

export async function convertMp3Blob(
  mp3: Blob,
  format: BrowserAudioFormat,
  quality: string,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const input = `input-${Date.now()}.mp3`;
  const output = `output-${Date.now()}`;
  const bitrate = /^\d+$/.test(quality) ? quality : '192';

  const jobs: Record<BrowserAudioFormat, { file: string; mime: string; args: string[] }> = {
    flac: {
      file: `${output}.flac`,
      mime: 'audio/flac',
      args: ['-i', input, '-vn', '-c:a', 'flac', `${output}.flac`],
    },
    m4a: {
      file: `${output}.m4a`,
      mime: 'audio/mp4',
      args: ['-i', input, '-vn', '-c:a', 'aac', '-b:a', `${bitrate}k`, `${output}.m4a`],
    },
    aac: {
      file: `${output}.aac`,
      mime: 'audio/aac',
      args: ['-i', input, '-vn', '-c:a', 'aac', '-b:a', `${bitrate}k`, '-f', 'adts', `${output}.aac`],
    },
    opus: {
      file: `${output}.ogg`,
      mime: 'audio/ogg',
      args: ['-i', input, '-vn', '-c:a', 'libopus', '-b:a', `${bitrate}k`, '-f', 'ogg', `${output}.ogg`],
    },
  };

  const job = jobs[format];

  try {
    await ffmpeg.writeFile(input, new Uint8Array(await mp3.arrayBuffer()));
    const code = await ffmpeg.exec(job.args);
    if (code !== 0) {
      throw new Error(`Browser conversion to ${format.toUpperCase()} failed.`);
    }

    const data = await ffmpeg.readFile(job.file);
    return new Blob([data], { type: job.mime });
  } finally {
    await ffmpeg.deleteFile(input).catch(() => {});
    await ffmpeg.deleteFile(job.file).catch(() => {});
  }
}

export function downloadBrowserBlob(blob: Blob, title: string, extension: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = `${(title || 'download').replace(/[\\/:*?"<>|]+/g, '_')}.${extension}`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

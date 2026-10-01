/* Browser-only final media conversion. No server binary is required. */

export type BrowserAudioFormat = 'flac' | 'm4a' | 'aac' | 'opus';

export interface BrowserConversionProgress {
  stage: 'loading' | 'reading' | 'encoding' | 'writing' | 'validating';
  progress: number;
  message: string;
}

type FFmpegLike = {
  load(options: { coreURL: string; wasmURL: string; classWorkerURL: string }): Promise<void>;
  writeFile(name: string, data: Uint8Array): Promise<void>;
  exec(args: string[]): Promise<number>;
  readFile(name: string): Promise<Uint8Array>;
  deleteFile(name: string): Promise<void>;
};
type UtilLike = { toBlobURL(url: string, mime: string): Promise<string> };

let instancePromise: Promise<FFmpegLike> | null = null;

function report(callback: ((progress: BrowserConversionProgress) => void) | undefined, value: BrowserConversionProgress): void {
  try { callback?.(value); } catch { /* progress must never break conversion */ }
}

async function getFFmpeg(onProgress?: (progress: BrowserConversionProgress) => void): Promise<FFmpegLike> {
  if (!instancePromise) {
    instancePromise = (async () => {
      report(onProgress, { stage: 'loading', progress: 0.02, message: 'Loading the browser converter…' });
      const loadModule = new Function('u', 'return import(u)') as (url: string) => Promise<any>;
      const [ffmpegModule, utilModule] = await Promise.all([
        loadModule('https://esm.sh/@ffmpeg/ffmpeg@0.12.15'),
        loadModule('https://esm.sh/@ffmpeg/util@0.12.2'),
      ]);
      const ffmpeg = new ffmpegModule.FFmpeg() as FFmpegLike;
      const util = utilModule as UtilLike;
      const coreBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
      const ffmpegBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm';
      await ffmpeg.load({
        coreURL: await util.toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await util.toBlobURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm'),
        classWorkerURL: await util.toBlobURL(`${ffmpegBase}/worker.js`, 'text/javascript'),
      });
      return ffmpeg;
    })().catch(error => {
      instancePromise = null;
      throw error;
    });
  }
  return instancePromise;
}

function assertNonEmptyMedia(blob: Blob, expectedMime: string, label: string): void {
  if (!blob.size) throw new Error(`Browser ${label} conversion produced an empty file.`);
  if (blob.type !== expectedMime) throw new Error(`Browser ${label} conversion returned ${blob.type || 'an unknown MIME type'} instead of ${expectedMime}.`);
}

export function browserAudioOutputMime(format: BrowserAudioFormat): string {
  switch (format) {
    case 'flac': return 'audio/flac';
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'opus': return 'audio/ogg';
  }
}

export function browserAudioOutputExtension(format: BrowserAudioFormat): string {
  return format === 'opus' ? 'opus' : format;
}

export async function muxMp4Blobs(video: Blob, audio: Blob, onProgress?: (progress: BrowserConversionProgress) => void): Promise<Blob> {
  if (!video.size || !audio.size) throw new Error('Browser MP4 muxing requires both video and audio streams.');
  const ffmpeg = await getFFmpeg(onProgress);
  const videoName = `input-video-${Date.now()}.mp4`;
  const audioName = `input-audio-${Date.now()}.m4a`;
  const outputName = `output-${Date.now()}.mp4`;
  try {
    report(onProgress, { stage: 'reading', progress: 0.18, message: 'Reading video and audio streams…' });
    await ffmpeg.writeFile(videoName, new Uint8Array(await video.arrayBuffer()));
    report(onProgress, { stage: 'reading', progress: 0.34, message: 'Preparing the audio stream…' });
    await ffmpeg.writeFile(audioName, new Uint8Array(await audio.arrayBuffer()));
    report(onProgress, { stage: 'encoding', progress: 0.45, message: 'Combining the streams…' });
    const code = await ffmpeg.exec(['-i', videoName, '-i', audioName, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-movflags', 'faststart', outputName]);
    if (code !== 0) throw new Error('Browser MP4 muxing failed.');
    report(onProgress, { stage: 'writing', progress: 0.88, message: 'Finalising the MP4 file…' });
    const data = await ffmpeg.readFile(outputName);
    const bytes = new Uint8Array(data.byteLength); bytes.set(data);
    const result = new Blob([bytes.buffer], { type: 'video/mp4' });
    report(onProgress, { stage: 'validating', progress: 0.98, message: 'Validating the MP4 output…' });
    assertNonEmptyMedia(result, 'video/mp4', 'MP4');
    report(onProgress, { stage: 'validating', progress: 1, message: 'MP4 is ready.' });
    return result;
  } finally {
    await ffmpeg.deleteFile(videoName).catch(() => {});
    await ffmpeg.deleteFile(audioName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

export async function convertMp3Blob(mp3: Blob, format: BrowserAudioFormat, quality: string, onProgress?: (progress: BrowserConversionProgress) => void): Promise<Blob> {
  if (!mp3.size) throw new Error('The MP3 source was empty.');
  const ffmpeg = await getFFmpeg(onProgress);
  const input = `input-${Date.now()}.mp3`;
  const output = `output-${Date.now()}`;
  const bitrate = /^\d+$/.test(quality) ? quality : '192';
  const jobs: Record<BrowserAudioFormat, { file: string; mime: string; args: string[] }> = {
    flac: { file: `${output}.flac`, mime: 'audio/flac', args: ['-i', input, '-vn', '-c:a', 'flac', `${output}.flac`] },
    m4a: { file: `${output}.m4a`, mime: 'audio/mp4', args: ['-i', input, '-vn', '-c:a', 'aac', '-b:a', `${bitrate}k`, '-movflags', '+faststart', `${output}.m4a`] },
    aac: { file: `${output}.aac`, mime: 'audio/aac', args: ['-i', input, '-vn', '-c:a', 'aac', '-b:a', `${bitrate}k`, '-f', 'adts', `${output}.aac`] },
    opus: { file: `${output}.ogg`, mime: 'audio/ogg', args: ['-i', input, '-vn', '-c:a', 'libopus', '-b:a', `${bitrate}k`, '-application', 'audio', '-f', 'ogg', `${output}.ogg`] },
  };
  const job = jobs[format];
  try {
    report(onProgress, { stage: 'reading', progress: 0.15, message: `Preparing MP3 for ${format.toUpperCase()} conversion…` });
    await ffmpeg.writeFile(input, new Uint8Array(await mp3.arrayBuffer()));
    report(onProgress, { stage: 'encoding', progress: 0.45, message: `Converting to ${format.toUpperCase()}…` });
    const code = await ffmpeg.exec(job.args);
    if (code !== 0) throw new Error(`Browser conversion to ${format.toUpperCase()} failed.`);
    report(onProgress, { stage: 'writing', progress: 0.88, message: 'Reading the converted file…' });
    const data = await ffmpeg.readFile(job.file);
    const bytes = new Uint8Array(data.byteLength); bytes.set(data);
    const result = new Blob([bytes.buffer], { type: job.mime });
    report(onProgress, { stage: 'validating', progress: 0.98, message: `Validating ${format.toUpperCase()} output…` });
    assertNonEmptyMedia(result, job.mime, format.toUpperCase());
    report(onProgress, { stage: 'validating', progress: 1, message: `${format.toUpperCase()} is ready.` });
    return result;
  } finally {
    await ffmpeg.deleteFile(input).catch(() => {});
    await ffmpeg.deleteFile(job.file).catch(() => {});
  }
}

export function downloadBrowserBlob(blob: Blob, title: string, extension: string): void {
  if (!blob.size) throw new Error('Refusing to download an empty file.');
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${(title || 'download').replace(/[\\/:*?"<>|]+/g, '_')}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

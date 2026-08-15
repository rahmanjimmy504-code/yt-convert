// SPDX-License-Identifier: GPL-3.0-or-later
import { describeRuntime, hasPlugin } from './lib/runtime';

const SOURCE_URL = 'https://github.com/rahmanjimmy504-code/yt-convert';
const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`;

/** Ships in a later PR; the shell must not pretend otherwise. */
const EXTRACTOR_PLUGIN = 'YTExtractor';

const ROADMAP: { title: string; detail: string; done: boolean }[] = [
  {
    title: 'Capacitor shell + debug APK workflow',
    detail: 'This PR: native project, build pipeline, CI artifact.',
    done: true,
  },
  {
    title: 'UI parity with the website',
    detail: 'Paste box, platform detection, quality picker, history, FAQ.',
    done: false,
  },
  {
    title: 'Native progressive MP4 / original audio',
    detail: 'On-device extraction so the phone uses its own connection.',
    done: false,
  },
  {
    title: 'Background downloads + MediaStore',
    detail: 'Foreground-service progress, files saved to Movies/Music.',
    done: false,
  },
  {
    title: 'Adaptive MP4/AAC muxing',
    detail: 'Higher resolutions than progressive streams can offer.',
    done: false,
  },
];

function Logo() {
  return (
    <div className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/20">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z"
          fill="white"
        />
        <path d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" fill="#FF0000" />
      </svg>
    </div>
  );
}

export default function App() {
  const runtime = describeRuntime();
  const extractorReady = hasPlugin(EXTRACTOR_PLUGIN);

  return (
    <div className="min-h-full flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-white">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-base font-bold tracking-tight leading-tight">YT Convert</h1>
            <p className="text-[11px] text-gray-500">Android shell</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6 space-y-4">
        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-2">
          <h2 className="text-sm font-semibold">Scaffold build</h2>
          <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">
            This build exists to prove the pipeline: the web bundle compiles, Capacitor syncs it into the Android
            project, and CI produces an installable debug APK. There is no converter UI and no download capability
            yet — both arrive in the next pull requests.
          </p>
        </section>

        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
          <h2 className="text-sm font-semibold">Diagnostics</h2>
          <dl className="text-[13px] space-y-2">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Runtime</dt>
              <dd className="font-medium">{runtime.label}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Platform</dt>
              <dd className="font-mono text-xs">{runtime.platform}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Extraction plugin</dt>
              <dd className={extractorReady ? 'font-medium text-green-600' : 'font-medium text-gray-400'}>
                {extractorReady ? 'available' : 'not implemented'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
          <h2 className="text-sm font-semibold">Planned in order</h2>
          <ol className="space-y-2.5">
            {ROADMAP.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span
                  className={`mt-0.5 flex items-center justify-center w-5 h-5 shrink-0 rounded-full text-[10px] font-bold ${
                    step.done
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {step.done ? '\u2713' : i + 1}
                </span>
                <span>
                  <span className="block text-[13px] font-medium leading-tight">{step.title}</span>
                  <span className="block text-[12px] text-gray-500 leading-snug">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      {/*
        GPL "Appropriate Legal Notices": the app tells the user it is free
        software, offers no warranty, and points at the corresponding source.
      */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-3">
        <p className="text-center text-[11px] text-gray-400 px-4 leading-relaxed">
          YT Convert Android — free software under{' '}
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            GPL-3.0-or-later
          </a>
          , with ABSOLUTELY NO WARRANTY.{' '}
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            Source
          </a>
        </p>
      </footer>
    </div>
  );
}

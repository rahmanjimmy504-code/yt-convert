'use client'

import { useState, useCallback, useEffect } from 'react'

const sGet = (k: string) => (typeof window === 'undefined' ? '' : localStorage.getItem(k) || '')
const sSet = (k: string, v: string) => { if (typeof window !== 'undefined') localStorage.setItem(k, v) }
const sGetJ = (k: string) => { try { return typeof window === 'undefined' ? null : JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const sSetJ = (k: string, v: unknown) => { if (typeof window !== 'undefined') localStorage.setItem(k, JSON.stringify(v)) }

const detectPlatform = (url: string): string => {
  if (/youtu\.?be/.test(url)) return 'youtube'
  if (/x\.com|twitter\.com/.test(url)) return 'x'
  if (/instagram\.com/.test(url)) return 'instagram'
  if (/spotify\.com|open\.spotify\.com/.test(url)) return 'spotify'
  if (/soundcloud\.com/.test(url)) return 'soundcloud'
  return ''
}

interface Converter {
  name: string
  url: string
  platforms: string[]
  color: string
  best?: boolean
}

const converters: Converter[] = [
  { name: '9Convert', url: 'https://9convert.org/', platforms: ['youtube'], color: 'from-red-500 to-orange-500', best: true },
  { name: 'Y2Mate', url: 'https://www.y2mate.com/', platforms: ['youtube'], color: 'from-green-500 to-emerald-600' },
  { name: 'SSSTik', url: 'https://ssstik.io/', platforms: ['x'], color: 'from-gray-700 to-gray-900', best: true },
  { name: 'SaveInsta', url: 'https://saveinsta.app/', platforms: ['instagram'], color: 'from-pink-500 to-purple-600', best: true },
  { name: 'iGram', url: 'https://igram.io/', platforms: ['instagram'], color: 'from-blue-500 to-indigo-600' },
  { name: 'SpotifyDown', url: 'https://spotifydown.com/', platforms: ['spotify'], color: 'from-green-500 to-green-700', best: true },
  { name: 'KlickAud', url: 'https://www.klickaud.co/', platforms: ['soundcloud'], color: 'from-orange-400 to-orange-600', best: true },
]

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const [dark, setDark] = useState(false)
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState<'mp3' | 'mp4'>('mp3')
  const [phase, setPhase] = useState<'input' | 'loading' | 'ready' | 'error'>('input')
  const [favorites, setFavorites] = useState<string[]>([])
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    setMounted(true)
    const d = sGet('dark') === 'true'
    setDark(d)
    document.documentElement.classList.toggle('dark', d)
    setFavorites(sGetJ('favorites') || [])
    setHistory(sGetJ('history') || [])
  }, [])

  const toggleDark = useCallback(() => {
    const nd = !dark
    setDark(nd)
    document.documentElement.classList.toggle('dark', nd)
    sSet('dark', String(nd))
  }, [dark])

  const toggleFav = useCallback((name: string) => {
    setFavorites(prev => {
      const next = prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
      sSetJ('favorites', next)
      return next
    })
  }, [])

  const addToHistory = useCallback((u: string) => {
    setHistory(prev => {
      const next = [u, ...prev.filter(h => h !== u)].slice(0, 10)
      sSetJ('history', next)
      return next
    })
  }, [])

  const platform = detectPlatform(url)
  const filteredConverters = converters
    .filter(c => !platform || c.platforms.includes(platform))
    .sort((a, b) => {
      const af = favorites.includes(a.name) ? 0 : 1
      const bf = favorites.includes(b.name) ? 0 : 1
      return af - bf
    })

  useEffect(() => {
    if (url && platform && phase === 'ready') {
      navigator.clipboard.writeText(url).catch(() => {})
    }
  }, [url, platform, phase])

  const handleConvert = () => {
    if (!url.trim() || !platform) {
      setPhase('error')
      return
    }
    setPhase('loading')
    addToHistory(url)
    setTimeout(() => setPhase('ready'), 1500)
  }

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      {/* Header */}
      <header className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-500 text-white">
        <div className="relative max-w-4xl mx-auto px-4 py-16 text-center">
          <button
            onClick={toggleDark}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition text-xl"
          >
            {dark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
          </button>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-3">YT Convert</h1>
          <p className="text-lg text-white/80">Convert &amp; download from YouTube, X, Instagram, Spotify &amp; more</p>
        </div>
      </header>

      {/* Input Card */}
      <section className="max-w-2xl mx-auto -mt-8 px-4 relative z-10">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 border-2 border-dashed border-purple-300 dark:border-purple-700">
          <div className="flex gap-3">
            <input
              type="text"
              value={url}
              onChange={e => { setUrl(e.target.value); setPhase('input') }}
              placeholder="Paste your video or music URL here..."
              className="flex-1 px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={handleConvert}
              disabled={phase === 'loading'}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {phase === 'loading' ? '...' : 'Convert'}
            </button>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setFormat('mp3')}
              className={`flex-1 py-2 rounded-lg font-medium transition ${format === 'mp3' ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
            >
              MP3
            </button>
            <button
              onClick={() => setFormat('mp4')}
              className={`flex-1 py-2 rounded-lg font-medium transition ${format === 'mp4' ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
            >
              MP4
            </button>
          </div>
          {phase === 'error' && (
            <p className="text-red-500 text-sm mt-3">Please enter a valid URL from a supported platform.</p>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: '\u26A1', title: 'Fast Conversion', desc: 'Convert and download in seconds with our powerful engines.' },
            { icon: '\uD83C\uDF89', title: '100% Free', desc: 'No hidden fees, no sign-up required. Completely free to use.' },
            { icon: '\uD83C\uDF10', title: 'All Platforms', desc: 'Supports YouTube, X, Instagram, Spotify, SoundCloud & more.' },
          ].map(f => (
            <div key={f.title} className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-md text-center">
              <div className="text-4xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">{f.title}</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Supported Platforms */}
      <section className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-8">Supported Platforms</h2>
        <div className="flex justify-center gap-8 flex-wrap">
          {/* YouTube */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" /><polygon fill="#fff" points="9.545,15.568 15.818,12 9.545,8.432" /></svg>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">YouTube</span>
          </div>
          {/* X */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">X</span>
          </div>
          {/* Instagram */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" /></svg>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">Instagram</span>
          </div>
          {/* Spotify */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" /></svg>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">Spotify</span>
          </div>
          {/* SoundCloud */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg">
              <img
                src="https://www.google.com/s2/favicons?domain=soundcloud.com&sz=128"
                alt="SoundCloud"
                style={{ filter: 'brightness(0) invert(1)' }}
                className="w-8 h-8"
              />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">SoundCloud</span>
          </div>
        </div>
      </section>

      {/* Converters */}
      {phase === 'ready' && filteredConverters.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-8">
          <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-6">Choose a Converter</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredConverters.map(c => (
              <a
                key={c.name}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-md hover:shadow-lg transition group"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center shrink-0`}>
                  <span className="text-white font-bold text-sm">{c.name.slice(0, 2)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">{c.name}</h3>
                    {c.best && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-yellow-400 text-yellow-900 rounded-full shrink-0">BEST</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.url}</p>
                </div>
                <button
                  onClick={e => { e.preventDefault(); toggleFav(c.name) }}
                  className="text-2xl shrink-0"
                >
                  {favorites.includes(c.name) ? '\u2B50' : '\u2606'}
                </button>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Loading */}
      {phase === 'loading' && (
        <section className="max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Finding the best converters for you...</p>
        </section>
      )}

      {/* How to Download */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-8">How to Download</h2>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md p-8 max-w-lg mx-auto">
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold shrink-0">1</div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Paste URL</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Copy the link from YouTube, X, Instagram, Spotify or SoundCloud and paste it above.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold shrink-0">2</div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Choose Format</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Select MP3 for audio or MP4 for video format.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold shrink-0">3</div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Convert &amp; Download</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Pick a converter and download your file instantly.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent History */}
      {history.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-8 pb-16">
          <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-6">Recent</h2>
          <div className="space-y-2 max-w-lg mx-auto">
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => { setUrl(h); setPhase('input') }}
                className="w-full text-left px-4 py-3 bg-white dark:bg-gray-900 rounded-xl shadow-sm hover:shadow-md transition text-sm text-gray-600 dark:text-gray-300 truncate"
              >
                {h}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="text-center py-8 text-sm text-gray-400 dark:text-gray-600">
        <p>YT Convert &copy; {new Date().getFullYear()} &mdash; All conversions are handled by third-party services.</p>
      </footer>
    </main>
  )
}

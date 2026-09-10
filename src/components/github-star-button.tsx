import { Star } from 'lucide-react';

const REPO_URL = 'https://github.com/rahmanjimmy504-code/yt-convert';

export default function GitHubStarButton() {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Star YT Convert on GitHub"
      title="Star me on GitHub"
      className="fixed right-4 top-[4.5rem] z-40 inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white/90 px-3 text-xs font-semibold text-gray-800 shadow-lg shadow-gray-900/5 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-yellow-300 hover:bg-yellow-50 dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-100 dark:hover:border-yellow-700 dark:hover:bg-yellow-950/40"
    >
      <Star className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Star me on GitHub</span>
    </a>
  );
}

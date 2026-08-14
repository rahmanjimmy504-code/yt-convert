/*
 * YT Convert for Android — GPLv3 companion app.
 * Copyright (C) 2026 rahmanjimmy504-code
 *
 * Appropriate Legal Notices screen (GPL v3 §5(d)): shows the copyright
 * notice, the absence of warranty, the licence terms, and where to get the
 * corresponding source.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. See <https://www.gnu.org/licenses/>.
 */

import { ExternalLink } from 'lucide-react';
import LegalPage, { Section } from '@/components/legal-page';
import { openExternal } from '@/lib/external';

const SOURCE_URL = 'https://github.com/rahmanjimmy504-code/yt-convert-android';
const GPL_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => openExternal(href)}
      className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 underline-offset-2 hover:underline font-medium"
    >
      {children}
      <ExternalLink className="w-3 h-3" />
    </button>
  );
}

const THIRD_PARTY = [
  { name: 'Capacitor', licence: 'MIT', by: 'Ionic' },
  { name: 'React and React DOM', licence: 'MIT', by: 'Meta and contributors' },
  { name: 'React Router', licence: 'MIT', by: 'Remix Software' },
  { name: 'Tailwind CSS', licence: 'MIT', by: 'Tailwind Labs' },
  { name: 'Lucide icons', licence: 'ISC', by: 'Lucide contributors' },
  { name: 'Vite', licence: 'MIT', by: 'Evan You and contributors' },
  {
    name: 'NewPipeExtractor (planned, build plan step 5)',
    licence: 'GPL-3.0-or-later',
    by: 'Team NewPipe',
  },
  { name: 'OkHttp (planned, build plan step 5)', licence: 'Apache-2.0', by: 'Square' },
];

export default function LicenceScreen() {
  return (
    <LegalPage title="Licence and source" updated="August 14, 2026">
      <Section heading="Copyright">
        <p>
          YT Convert for Android — Copyright (C) 2026 rahmanjimmy504-code. The user interface is adapted from the YT
          Convert website by the same copyright holder, who has dual-licensed that copy under the GNU General Public
          License for this app.
        </p>
      </Section>

      <Section heading="Licence">
        <p>
          This program is free software: you can redistribute it and/or modify it under the terms of the GNU General
          Public License as published by the Free Software Foundation, either version 3 of the License, or (at your
          option) any later version.
        </p>
        <p>
          This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
          implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License
          for more details.
        </p>
        <p>
          You should have received a copy of the GNU General Public License along with this program. If not, see{' '}
          <Out href={GPL_URL}>gnu.org/licenses/gpl-3.0</Out>.
        </p>
      </Section>

      <Section heading="Corresponding source">
        <p>
          The complete source code for this version, including the build scripts used to produce the APK, is
          published at <Out href={SOURCE_URL}>github.com/rahmanjimmy504-code/yt-convert-android</Out>. You may study,
          modify and redistribute it under the same licence.
        </p>
      </Section>

      <Section heading="The YT Convert website">
        <p>
          The website at yt-convert remains under its own separate terms. Only this Android app and the interface
          copy inside it are released under the GPL; that does not change the licence of the original website.
        </p>
      </Section>

      <Section heading="Third-party components">
        <ul className="space-y-1.5">
          {THIRD_PARTY.map(item => (
            <li key={item.name} className="flex items-start justify-between gap-3">
              <span>
                <span className="font-medium text-gray-800 dark:text-gray-200">{item.name}</span>
                <span className="text-gray-400"> — {item.by}</span>
              </span>
              <span className="text-[11px] font-mono text-gray-400 flex-shrink-0 mt-0.5">{item.licence}</span>
            </li>
          ))}
        </ul>
      </Section>
    </LegalPage>
  );
}

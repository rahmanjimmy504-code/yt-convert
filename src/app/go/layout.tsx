import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Opening converter',
  robots: { index: false, follow: false },
};

export default function GoLayout({ children }: { children: ReactNode }) {
  return children;
}

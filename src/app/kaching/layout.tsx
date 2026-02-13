import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'KaChing',
  description: 'KaChing experience on SessionMint.fun at /kaching.',
  openGraph: {
    title: 'KaChing | SessionMint.fun',
    description: 'Path route: /kaching',
    url: 'https://sessionmint.fun/kaching',
  },
};

export default function KachingLayout({ children }: { children: ReactNode }) {
  return children;
}

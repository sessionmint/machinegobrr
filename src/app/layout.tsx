import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SessionMint.fun',
    template: '%s | SessionMint.fun',
  },
  description:
    'SessionMint.fun hosts MachineGoBrr on Solana with deterministic queueing, device sync, and realtime stream overlays.',
  keywords: ['SessionMint.fun', 'MachineGoBrr', 'Solana', 'livestream', 'session state'],
  metadataBase: new URL('https://sessionmint.fun'),
  openGraph: {
    title: 'SessionMint.fun',
    description:
      'MachineGoBrr on SessionMint.fun. Promote tokens, watch live sessions, and interact in realtime.',
    url: 'https://sessionmint.fun',
    siteName: 'SessionMint.fun',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SessionMint.fun',
    description:
      'MachineGoBrr on SessionMint.fun.',
  },
  icons: {
    icon: [
      { url: '/logo-fav.jpg', sizes: '634x634', type: 'image/jpeg' },
    ],
    apple: [{ url: '/logo-fav.jpg', sizes: '634x634', type: 'image/jpeg' }],
    shortcut: ['/logo-fav.jpg'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}

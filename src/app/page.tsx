import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import type { Metadata } from 'next';

const MINSTR_CONTRACT_ADDRESS = '2gWujYmBCd77Sf9gg6yMSexdPrudKpvss1yV8E71pump';

const SOCIAL_LINKS = [
  { href: 'https://x.com/sessionmintlabs', label: 'SessionMint X' },
  { href: 'https://t.me/SessionMint', label: 'Telegram' },
  { href: 'https://github.com/sessionmint', label: 'GitHub' },
  {
    href: 'https://pump.fun/coin/2gWujYmBCd77Sf9gg6yMSexdPrudKpvss1yV8E71pump',
    label: 'Pump.fun',
  },
] as const;

const FAQ_ITEMS = [
  {
    q: 'Is SessionMint a streaming platform?',
    a: 'No. SessionMint is a deterministic control kernel and overlay layer that plugs into existing streaming setups.',
  },
  {
    q: 'What does deterministic mean in this product?',
    a: 'Validated requests are resolved through stable ordering rules, cooldowns, and replay protection. Under the same inputs, outcomes stay consistent.',
  },
  {
    q: 'What happens when a focus window ends?',
    a: 'The active Session State expires automatically, then the system advances to the next eligible state or falls back to the default state.',
  },
  {
    q: 'Why use the word Mint?',
    a: 'Because each focus window is fresh, time-limited inventory. Its value exists during the active interval, then expires.',
  },
  {
    q: 'What does MachineGoBrr show?',
    a: 'MachineGoBrr demonstrates fixed-duration focus leasing, deterministic queueing under contention, cooldown enforcement, and automatic state reversion.',
  },
] as const;

const WHITEPAPER_SOURCE_PATH = path.join(process.cwd(), 'src', 'content', 'whitepaper-v0.1.txt');
const WHITEPAPER_RAW = fs.readFileSync(WHITEPAPER_SOURCE_PATH, 'utf8').trim();

const ABSTRACT_MARKER = '**Abstract**';
const INTRO_MARKER = '**1. Introduction**';
const abstractStart = WHITEPAPER_RAW.indexOf(ABSTRACT_MARKER);
const introStart = WHITEPAPER_RAW.indexOf(INTRO_MARKER);

const WHITEPAPER_ABSTRACT_TEXT =
  abstractStart >= 0 && introStart > abstractStart
    ? WHITEPAPER_RAW.slice(abstractStart, introStart).trim()
    : WHITEPAPER_RAW;

const WHITEPAPER_REST_TEXT =
  introStart >= 0
    ? WHITEPAPER_RAW.slice(introStart).trim()
    : '';

export const metadata: Metadata = {
  title: 'SessionMint.fun',
  description:
    'SessionMint lets users mint temporary session ownership that controls live stream focus for fixed, deterministic time windows.',
  openGraph: {
    title: 'SessionMint.fun',
    description:
      'A deterministic control layer for time-bounded focus in live streaming. Powered by MachineGoBrr.',
    url: 'https://sessionmint.fun',
  },
};

function WhitepaperContent({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: Array<
    | { type: 'heading'; text: string; index: number }
    | { type: 'paragraph'; text: string; index: number }
    | { type: 'list'; items: string[]; index: number }
  > = [];

  let listItems: string[] = [];
  let listStartIndex = 0;
  let inColonList = false;

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: 'list', items: listItems, index: listStartIndex });
      listItems = [];
    }
  };

  lines.forEach((line, index) => {
    const heading = line.match(/^\*\*(.+)\*\*$/);
    if (heading) {
      flushList();
      inColonList = false;
      blocks.push({ type: 'heading', text: heading[1].trim(), index });
      return;
    }

    if (inColonList) {
      const isListItem =
        !line.includes(':') &&
        !/[.!?]$/.test(line) &&
        line.length < 170;

      if (isListItem) {
        listItems.push(line);
        return;
      }

      flushList();
      inColonList = false;
    }

    blocks.push({ type: 'paragraph', text: line, index });

    if (line.endsWith(':')) {
      inColonList = true;
      listStartIndex = index;
    }
  });

  flushList();

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {blocks.map((block) => {
        if (block.type === 'heading') {
          const isSubheading = /^\d+\.\d+/.test(block.text);
          const fontSize = block.text === 'Abstract' ? '1.05rem' : isSubheading ? '0.94rem' : '1.02rem';
          const marginTop = block.index === 0 ? 0 : isSubheading ? 8 : 12;

          return (
            <h3
              key={`heading-${block.index}`}
              style={{
                margin: `${marginTop}px 0 0`,
                fontSize,
                lineHeight: 1.35,
                color: '#f3f4f6',
                fontWeight: 700,
              }}
            >
              {block.text}
            </h3>
          );
        }

        if (block.type === 'list') {
          return (
            <ul
              key={`list-${block.index}`}
              style={{
                margin: '0 0 0 18px',
                color: '#cfd6e4',
                display: 'grid',
                gap: 6,
                fontSize: '0.94rem',
                lineHeight: 1.65,
              }}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`list-item-${block.index}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={`paragraph-${block.index}`}
            style={{
              margin: 0,
              color: '#cfd6e4',
              lineHeight: 1.68,
              fontSize: '0.94rem',
            }}
          >
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const panelStyle = {
    border: '1px solid rgba(255,255,255,0.11)',
    borderRadius: 18,
    background:
      'linear-gradient(165deg, rgba(18,18,25,0.93), rgba(14,16,23,0.88))',
    boxShadow:
      '0 12px 34px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.03)',
    backdropFilter: 'blur(10px)',
  } as const;

  const sectionTitleStyle = {
    fontSize: '1.14rem',
    marginBottom: 12,
    color: '#f3f4f6',
    letterSpacing: '0.01em',
  } as const;

  const uniformIntroTextStyle = {
    margin: 0,
    color: '#d5dbe7',
    fontSize: '0.99rem',
    lineHeight: 1.72,
  } as const;

  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 9% 12%, rgba(57,255,20,0.10), transparent 34%), radial-gradient(circle at 92% 5%, rgba(0,191,255,0.09), transparent 30%), radial-gradient(circle at 55% 100%, rgba(124,58,237,0.09), transparent 44%), #07080c',
        padding: '28px 16px 72px',
      }}
    >
      <div style={{ width: 'min(1020px, 100%)', margin: '0 auto' }}>
        <header
          style={{
            ...panelStyle,
            padding: '34px 24px',
            marginBottom: 22,
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 3.3rem)',
              lineHeight: 1.06,
              marginBottom: 12,
              background: 'linear-gradient(100deg, #f3f4f6 30%, #8ab4ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            SessionMint.fun
          </h1>
          <p style={{ color: '#a1a1aa', margin: '0 auto 20px', maxWidth: 860 }}>
            A deterministic control layer for live stream focus and time-bounded Session State allocation.
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 9,
              marginBottom: 16,
            }}
          >
            {SOCIAL_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 108,
                  padding: '0.64rem 0.9rem',
                  borderRadius: 11,
                  border: '1px solid rgba(255,255,255,0.16)',
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                  color: '#d9e8ff',
                  textDecoration: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                }}
              >
                {item.label}
              </a>
            ))}
          </div>

          <Link
            href="/machinegobrrr"
            style={{
              display: 'inline-block',
              padding: '0.8rem 1.18rem',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #39ff14 0%, #4fff29 100%)',
              color: '#000',
              fontWeight: 800,
              textDecoration: 'none',
              boxShadow: '0 10px 26px rgba(57,255,20,0.24)',
            }}
          >
            MachineGoBrr
          </Link>
        </header>

        <section
          style={{
            ...panelStyle,
            padding: '22px 20px',
            marginBottom: 22,
          }}
        >
          <h2 style={sectionTitleStyle}>What Is Session State?</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={uniformIntroTextStyle}>A New Primitive. A Deterministic Asset Class.</p>
            <p style={uniformIntroTextStyle}>
              Users mint temporary session ownership that controls what a live broadcast focuses on.
            </p>
            <p style={uniformIntroTextStyle}>
              SessionMint turns stream focus into deterministic, time-bounded Session States that activate, enforce,
              and expire automatically.
            </p>
            <p style={uniformIntroTextStyle}>
              SessionMint is a control kernel and overlay layer that streamers attach to their current broadcast
              destinations. It is not a livestreaming platform.
            </p>
            <p style={uniformIntroTextStyle}>
              The product is the Session State: a leased, verifiable focus window that runs for a fixed duration.
            </p>
          </div>
        </section>

        <section
          style={{
            ...panelStyle,
            padding: '22px 20px',
            marginBottom: 22,
          }}
        >
          <h2 style={sectionTitleStyle}>FAQ</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {FAQ_ITEMS.map((item) => (
              <details
                key={item.q}
                style={{
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 12,
                  background:
                    'linear-gradient(180deg, rgba(18,20,30,0.88), rgba(13,15,21,0.9))',
                  padding: '10px 12px',
                }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{item.q}</summary>
                <p style={{ color: '#a1a1aa', marginTop: 8 }}>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          style={{
            ...panelStyle,
            padding: '22px 20px',
            marginBottom: 22,
            textAlign: 'center',
          }}
        >
          <h2 style={{ ...sectionTitleStyle, marginBottom: 8 }}>$MINSTR Contract Address</h2>
          <div
            style={{
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 12,
              background:
                'linear-gradient(180deg, rgba(20,22,30,0.9), rgba(13,15,21,0.95))',
              padding: '12px 14px',
              overflowX: 'auto',
              maxWidth: 760,
              margin: '0 auto',
            }}
          >
            <code
              style={{
                color: '#e9eef5',
                fontSize: '0.95rem',
                lineHeight: 1.45,
                whiteSpace: 'nowrap',
                userSelect: 'all',
              }}
            >
              {MINSTR_CONTRACT_ADDRESS}
            </code>
          </div>
        </section>

        <section
          style={{
            ...panelStyle,
            padding: '22px 20px',
            marginBottom: 18,
          }}
        >
          <h2 style={{ ...sectionTitleStyle, textAlign: 'center' }}>SessionMint v0.1 Whitepaper</h2>

          <div
            style={{
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 12,
              background:
                'linear-gradient(180deg, rgba(20,22,30,0.9), rgba(13,15,21,0.95))',
              padding: '14px 14px',
              marginBottom: 12,
            }}
          >
            <WhitepaperContent text={WHITEPAPER_ABSTRACT_TEXT} />
          </div>

          {WHITEPAPER_REST_TEXT ? (
            <details
              style={{
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 12,
                background:
                  'linear-gradient(180deg, rgba(20,22,30,0.9), rgba(13,15,21,0.95))',
                padding: '12px 14px',
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#fafafa' }}>
                SessionMint v0.1 Whitepaper
              </summary>
              <div
                style={{
                  marginTop: 10,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: 12,
                }}
              >
                <WhitepaperContent text={WHITEPAPER_REST_TEXT} />
              </div>
            </details>
          ) : null}
        </section>

        <footer
          style={{
            textAlign: 'center',
            color: '#a1a1aa',
            fontSize: '0.86rem',
            paddingTop: 10,
          }}
        >
          © SessionMint
        </footer>
      </div>
    </main>
  );
}

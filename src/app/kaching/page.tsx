export default function KachingPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background:
          'radial-gradient(circle at 80% 20%, rgba(0,191,255,0.1), transparent 40%), radial-gradient(circle at 10% 90%, rgba(57,255,20,0.08), transparent 45%), #0a0a0c',
      }}
    >
      <section
        style={{
          width: 'min(760px, 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          background: 'rgba(17,17,21,0.85)',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.5rem)', marginBottom: '0.75rem' }}>KaChing</h1>
        <p style={{ color: '#a1a1aa' }}>
          KaChing is now mounted at <code>/kaching</code> under SessionMint.fun.
        </p>
      </section>
    </main>
  );
}


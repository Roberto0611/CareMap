import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 'clamp(60px, 12vh, 120px)',
        paddingLeft: '20px',
        paddingRight: '20px',
        textAlign: 'center',
        fontFamily: 'var(--font-sans)',
        boxSizing: 'border-box',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* ── Main Highlighted Title ── */}
      <h1
        style={{
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span
          style={{
            backgroundColor: '#ff3c00',
            color: '#ffffff',
            padding: '4px 14px',
            fontSize: 'clamp(2rem, 5vw, 3.8rem)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
            display: 'inline-block',
          }}
        >
          Give your agents access to
        </span>
        <span
          style={{
            backgroundColor: '#ff3c00',
            color: '#ffffff',
            padding: '4px 14px',
            fontSize: 'clamp(2rem, 5vw, 3.8rem)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
            display: 'inline-block',
          }}
        >
          the whole web.
        </span>
      </h1>

      {/* ── Subtitle ── */}
      <p
        style={{
          color: '#ffffff',
          fontSize: 'clamp(1rem, 2vw, 1.25rem)',
          fontWeight: 600,
          maxWidth: '560px',
          marginTop: '28px',
          marginBottom: '32px',
          lineHeight: 1.4,
          letterSpacing: '-0.01em',
          opacity: 0.95,
        }}
      >
        Browserbase makes the web as reliable and programmable as APIs
      </p>

      {/* ── CTA Buttons ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          flexWrap: 'wrap',
        }}
      >
        <Link
          to="/map"
          style={{
            backgroundColor: '#ffffff',
            color: '#000000',
            borderRadius: '9999px',
            padding: '12px 24px',
            fontSize: '0.95rem',
            fontWeight: 700,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'transform 0.15s ease, opacity 0.15s ease',
            boxShadow: '0 4px 14px rgba(255, 255, 255, 0.15)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.opacity = '0.9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.opacity = '1';
          }}
        >
          Get API key ›
        </Link>

        <Link
          to="/map"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '9999px',
            padding: '12px 24px',
            fontSize: '0.95rem',
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Setup for agents
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

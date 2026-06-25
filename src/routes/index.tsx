import { createFileRoute, Link } from '@tanstack/react-router'
import YaplyLogo from '@/components/YaplyLogo'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

const features = [
  {
    title: 'End-to-end encrypted',
    description: 'Every message is encrypted with AES-256-GCM before it leaves your device. Nobody — including us — can read your conversations.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    title: 'Real-time messaging',
    description: "Messages arrive the instant they're sent via live WebSocket subscriptions. No polling, no refresh — conversations feel alive.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    title: 'Groups & slash commands',
    description: 'Create group chats and use /commands to set reminders, schedule events, manage shared tasks, track budgets, and more.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: 'Web, iOS & Android',
    description: 'One shared encrypted backend across all your devices. Your messages follow you — with the same keys, the same security.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
  },
]

function LandingPage() {
  return (
    <>
      <style>{`
        @keyframes landFadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .land-in {
          opacity: 0;
          animation: landFadeUp 0.65s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .land-cta-primary {
          display: inline-flex;
          align-items: center;
          padding: 13px 28px;
          border-radius: 10px;
          background: #5b8def;
          color: #fff;
          font-weight: 600;
          font-size: 15px;
          text-decoration: none;
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
          letter-spacing: -0.01em;
        }
        .land-cta-primary:hover {
          background: #4a7de4;
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(91,141,239,0.38);
        }
        .land-cta-secondary {
          display: inline-flex;
          align-items: center;
          padding: 13px 28px;
          border-radius: 10px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.14);
          color: rgba(255,255,255,0.75);
          font-weight: 500;
          font-size: 15px;
          text-decoration: none;
          transition: background 0.18s, border-color 0.18s, color 0.18s;
          letter-spacing: -0.01em;
        }
        .land-cta-secondary:hover {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.28);
          color: rgba(255,255,255,0.95);
        }
        .land-feat-card {
          background: #fff;
          border: 1px solid #dce7f8;
          border-radius: 16px;
          padding: 28px 24px;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .land-feat-card:hover {
          box-shadow: 0 6px 28px rgba(91,141,239,0.1);
          transform: translateY(-2px);
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#edf1fa', color: '#1a2744', fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

        {/* Hero */}
        <section style={{
          position: 'relative',
          overflow: 'hidden',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 24px 120px',
          background: 'linear-gradient(160deg, #0c1629 0%, #1a2744 52%, #1c2f5c 100%)',
        }}>
          {/* dot grid */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, rgba(91,141,239,0.16) 1.5px, transparent 1.5px)',
            backgroundSize: '28px 28px',
          }} />
          {/* ambient glow */}
          <div style={{
            position: 'absolute', pointerEvents: 'none',
            top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '700px', height: '400px',
            background: 'radial-gradient(ellipse at center, rgba(91,141,239,0.1) 0%, transparent 68%)',
          }} />

          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: '660px', width: '100%' }}>
            <div className="land-in" style={{ animationDelay: '0ms', marginBottom: '28px', display: 'flex', justifyContent: 'center' }}>
              <YaplyLogo variant="app-icon" size={72} />
            </div>

            <h1 className="land-in" style={{
              animationDelay: '80ms',
              margin: '0 0 16px',
              fontSize: 'clamp(58px, 11vw, 96px)',
              fontWeight: 800,
              letterSpacing: '-0.045em',
              lineHeight: 0.95,
              background: 'linear-gradient(135deg, #ffffff 20%, #8fb8ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              yaply
            </h1>

            <p className="land-in" style={{
              animationDelay: '160ms',
              margin: '0 0 44px',
              fontSize: 'clamp(15px, 2.2vw, 18px)',
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: '0.02em',
              lineHeight: 1.5,
            }}>
              Private by design.&ensp;Fast by default.
            </p>

            <div className="land-in" style={{
              animationDelay: '240ms',
              display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap',
            }}>
              <Link to="/auth" className="land-cta-primary">Get started free</Link>
              <Link to="/auth" className="land-cta-secondary">Sign in</Link>
            </div>
          </div>

          {/* fade to light section */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '100px',
            background: 'linear-gradient(to bottom, transparent, #edf1fa)',
            pointerEvents: 'none',
          }} />
        </section>

        {/* Features */}
        <section style={{ padding: 'clamp(56px, 8vw, 96px) 24px', background: '#edf1fa' }}>
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '52px' }}>
              <h2 style={{
                margin: '0 0 12px',
                fontSize: 'clamp(26px, 4vw, 38px)',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: '#1a2744',
              }}>
                Built for real privacy
              </h2>
              <p style={{ margin: 0, color: '#6b84ab', fontSize: '16px', maxWidth: '440px', marginInline: 'auto', lineHeight: 1.65 }}>
                yaply keeps your conversations truly private — not just private-policy private.
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '14px',
            }}>
              {features.map((f, i) => (
                <div key={f.title} className="land-feat-card land-in" style={{ animationDelay: `${340 + i * 70}ms` }}>
                  <div style={{
                    width: '42px', height: '42px',
                    borderRadius: '11px',
                    background: '#edf3ff',
                    color: '#5b8def',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '16px',
                  }}>
                    {f.icon}
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '14.5px', letterSpacing: '-0.01em', color: '#1a2744' }}>
                    {f.title}
                  </h3>
                  <p style={{ margin: 0, color: '#6b84ab', fontSize: '13.5px', lineHeight: 1.65 }}>
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{
          borderTop: '1px solid #dce7f8',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          background: '#edf1fa',
          color: '#9ab0cc',
          fontSize: '13px',
        }}>
          <YaplyLogo variant="app-icon" size={20} />
          <span>© {new Date().getFullYear()} yaply</span>
        </footer>

      </div>
    </>
  )
}

import { useState } from 'react';
import { useLicenseStore } from '../license/licenseStore';

// ── Upgrade modal ─────────────────────────────────────────────────────────────

export function UpgradeModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.title}>Pro Feature 🔒</div>
        <div style={S.body}>
          <p style={S.text}>This feature requires LED Pixel Mapper Pro.</p>
          <p style={S.subtext}>Get the full version at <strong style={{ color: 'var(--accent-bright)' }}>gumroad.com/l/xxoea</strong></p>
        </div>
        <div style={S.footer}>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12 }}>Maybe Later</button>
          <button
            className="btn-primary"
            style={{ fontSize: 12 }}
            onClick={() => {
              window.open('https://gumroad.com/l/xxoea', '_blank');
              onClose();
            }}
          >
            Get Pro →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ProGate wrapper ───────────────────────────────────────────────────────────
// Wraps a block of UI. When free-tier, dims the content, blocks interaction,
// and shows the upgrade modal on click.

interface ProGateProps {
  children: React.ReactNode;
  /** Outer wrapper display value — default 'block' */
  display?: React.CSSProperties['display'];
}

export default function ProGate({ children, display = 'block' }: ProGateProps) {
  const isPro = useLicenseStore((s) => s.isPro);
  const [showModal, setShowModal] = useState(false);

  if (isPro) return <>{children}</>;

  return (
    <>
      <div
        style={{ display, position: 'relative', cursor: 'pointer' }}
        onClick={() => setShowModal(true)}
        title="Pro feature — click to upgrade"
      >
        <div style={{ pointerEvents: 'none', opacity: 0.4 }}>
          {children}
        </div>
        <span style={{
          position: 'absolute', top: 2, right: 4,
          fontSize: 10, lineHeight: 1, pointerEvents: 'none',
        }}>🔒</span>
      </div>
      {showModal && <UpgradeModal onClose={() => setShowModal(false)} />}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
    zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: 'var(--bg-panel)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', width: 360,
    maxWidth: 'calc(100vw - 32px)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
    overflow: 'hidden',
  },
  title: {
    fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
    padding: '18px 20px 0', letterSpacing: '-0.02em',
  },
  body: { padding: '12px 20px 16px' },
  text: { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.5 },
  subtext: { fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8,
    padding: '12px 20px', borderTop: '1px solid var(--border)',
  },
};

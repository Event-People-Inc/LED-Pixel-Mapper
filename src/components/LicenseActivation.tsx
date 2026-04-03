import { useState } from 'react';
import { useLicenseStore } from '../license/licenseStore';

interface LicenseActivationProps {
  onClose: () => void;
}

export default function LicenseActivation({ onClose }: LicenseActivationProps) {
  const status   = useLicenseStore((s) => s.status);
  const activate = useLicenseStore((s) => s.activate);
  const check    = useLicenseStore((s) => s.check);

  const [key,        setKey]        = useState('');
  const [message,    setMessage]    = useState('');
  const [isSuccess,  setIsSuccess]  = useState(false);
  const [loading,    setLoading]    = useState(false);

  const isPro = status === 'pro' || status === 'overdue';

  const handleActivate = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setMessage('');
    const result = await activate(key.trim());
    setLoading(false);
    setMessage(result.message);
    setIsSuccess(result.success);
    if (result.success) {
      setTimeout(onClose, 1500);
    }
  };

  const handleRecheck = async () => {
    setLoading(true);
    setMessage('');
    await check();
    setLoading(false);
    const newStatus = useLicenseStore.getState().status;
    if (newStatus === 'pro') {
      setMessage('✓ License verified successfully.');
      setIsSuccess(true);
      setTimeout(onClose, 1500);
    } else if (newStatus === 'overdue') {
      setMessage('Could not reach server. App remains in grace mode.');
      setIsSuccess(false);
    } else {
      setMessage('✗ License is no longer valid.');
      setIsSuccess(false);
    }
  };

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>

        <div style={S.header}>
          <span style={S.title}>Activate License</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>

          {isPro ? (
            <div style={S.statusBadge}>
              <span style={{ fontSize: 18 }}>{status === 'overdue' ? '⚠️' : '✓'}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: status === 'overdue' ? 'var(--warning)' : '#4ade80' }}>
                  {status === 'overdue' ? 'License Overdue' : 'License Active — Pro'}
                </div>
                {status === 'overdue' && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Could not verify in the last 30 days. App still works, but please reconnect.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <p style={S.hint}>
                Enter your Gumroad license key to unlock all Pro features.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  License Key
                </label>
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleActivate(); }}
                  placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                  style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.04em' }}
                  disabled={loading}
                />
              </div>
            </>
          )}

          {message && (
            <div style={{ ...S.messageBadge, ...(isSuccess ? S.msgSuccess : S.msgError) }}>
              {message}
            </div>
          )}

        </div>

        <div style={S.footer}>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12 }}>
            Cancel
          </button>
          {isPro ? (
            <button
              className="btn-secondary"
              onClick={handleRecheck}
              disabled={loading}
              style={{ fontSize: 12 }}
            >
              {loading ? 'Checking…' : 'Re-verify Now'}
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleActivate}
              disabled={loading || !key.trim()}
              style={{ fontSize: 12, minWidth: 100 }}
            >
              {loading ? 'Activating…' : 'Activate'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
    zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: 'var(--bg-panel)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', width: 400,
    maxWidth: 'calc(100vw - 32px)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px 13px', borderBottom: '1px solid var(--border)',
  },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  closeBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-muted)',
    fontSize: 14, cursor: 'pointer', padding: '2px 5px', borderRadius: 'var(--radius-sm)',
  },
  body: { padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8,
    padding: '13px 20px', borderTop: '1px solid var(--border)',
  },
  hint: { fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 },
  statusBadge: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '12px 14px',
  },
  messageBadge: {
    padding: '8px 12px', borderRadius: 'var(--radius)',
    fontSize: 12, fontWeight: 600, lineHeight: 1.4,
  },
  msgSuccess: { background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' },
  msgError:   { background: 'rgba(248,81,73,0.12)',  border: '1px solid var(--danger)', color: 'var(--danger)' },
};

import { useEffect, useState } from 'react';
import { useProjectStore } from './store/useProjectStore';
import { useLicenseStore } from './license/licenseStore';
import ProjectSetup from './screens/ProjectSetup';
import WallBuilder from './screens/WallBuilder';
import CloseDialog from './components/CloseDialog';

const OVERDUE_JOKES = [
  "Even vampires check in once a month. Please connect to the internet. 🧛",
  "Your license called. It's lonely. Connect to verify. 📞",
  "The last dinosaur forgot to check their license. Don't be a dinosaur. 🦕",
  "NASA checks in with their satellites more often than this. Just saying. 🛰️",
];

declare global {
  interface Window {
    electronAPI?: {
      onWillClose: (cb: () => void) => void;
      confirmClose: () => void;
      license?: {
        getStatus: () => Promise<string>;
        activate:  (key: string) => Promise<{ success: boolean; message: string }>;
        check:     () => Promise<string>;
      };
    };
  }
}

export default function App() {
  const currentScreen   = useProjectStore((s) => s.currentScreen);
  const undo            = useProjectStore((s) => s.undo);
  const redo            = useProjectStore((s) => s.redo);
  const isPro           = useLicenseStore((s) => s.isPro);
  const isOverdue       = useLicenseStore((s) => s.isOverdue);
  const initLicense     = useLicenseStore((s) => s.initialize);

  const [showClose,      setShowClose]      = useState(false);
  const [showOverdueJoke, setShowOverdueJoke] = useState(false);
  const [jokeIndex,      setJokeIndex]      = useState(0);

  // Initialize license status from main process
  useEffect(() => {
    initLicense();
  }, [initLicense]);

  // Show overdue joke popup once per session when status is overdue
  useEffect(() => {
    if (isOverdue) {
      setJokeIndex(Math.floor(Math.random() * OVERDUE_JOKES.length));
      setShowOverdueJoke(true);
    }
  }, [isOverdue]);

  // Intercept window close — show save dialog if unsaved
  useEffect(() => {
    window.electronAPI?.onWillClose(() => {
      if (useProjectStore.getState().isSaved) {
        window.electronAPI?.confirmClose();
      } else {
        setShowClose(true);
      }
    });
  }, []);

  // Global keyboard shortcuts: Ctrl+Z = undo, Ctrl+X = redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA';

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (isTyping) return;
        e.preventDefault();
        if (!useLicenseStore.getState().isPro) return; // free tier: undo disabled
        undo();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        if (isTyping) return;
        e.preventDefault();
        if (!useLicenseStore.getState().isPro) return; // free tier: redo disabled
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex',
      // Red border overlay when license is overdue
      boxShadow: isOverdue ? 'inset 0 0 0 3px #ef4444' : undefined,
    }}>
      {currentScreen === 'setup' ? <ProjectSetup /> : <WallBuilder />}
      {showClose && <CloseDialog onCancel={() => setShowClose(false)} />}

      {/* Overdue joke popup */}
      {showOverdueJoke && (
        <div style={S.jokeBackdrop}>
          <div style={S.jokeBox}>
            <div style={S.jokeTitle}>⚠️ License Check Overdue</div>
            <p style={S.jokeText}>{OVERDUE_JOKES[jokeIndex]}</p>
            <p style={S.jokeHint}>Your app still works. Just connect to the internet and re-open, or use <strong>File → Activate License</strong> to verify now.</p>
            <button
              className="btn-primary"
              style={{ width: '100%', marginTop: 4 }}
              onClick={() => setShowOverdueJoke(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Invisible but we reference isPro to ensure subscription */}
      {isPro && null}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  jokeBackdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  jokeBox: {
    background: 'var(--bg-panel)', border: '2px solid #ef4444',
    borderRadius: 'var(--radius-lg)', width: 380,
    maxWidth: 'calc(100vw - 32px)', padding: '24px',
    boxShadow: '0 0 40px rgba(239,68,68,0.3)',
  },
  jokeTitle: { fontSize: 15, fontWeight: 700, color: '#ef4444', marginBottom: 12 },
  jokeText:  { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 10px' },
  jokeHint:  { fontSize: 11, color: 'var(--text-muted)',     lineHeight: 1.6, margin: '0 0 16px' },
};

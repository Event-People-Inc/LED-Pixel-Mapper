import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/useProjectStore';
import { useLicenseStore } from '../license/licenseStore';
import { saveProjectElectron, saveProjectElectronAs, parseProjectJSON, pickAndReadFile } from '../utils/projectFile';
import LicenseActivation from './LicenseActivation';
import i18n from '../i18n';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
];

export default function FileMenu() {
  const { t } = useTranslation();
  const project     = useProjectStore((s) => s.project);
  const newProject  = useProjectStore((s) => s.newProject);
  const loadProject = useProjectStore((s) => s.loadProject);
  const markSaved   = useProjectStore((s) => s.markSaved);

  const isPro        = useLicenseStore((s) => s.isPro);
  const licenseStatus = useLicenseStore((s) => s.status);

  const [open, setOpen]               = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [langOpen, setLangOpen]       = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [savedPath, setSavedPath]     = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-dismiss error
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const close = () => { setOpen(false); setLangOpen(false); };

  const handleNew = () => { close(); newProject(); setSavedPath(null); };

  const handleOpen = async () => {
    close();
    const text = await pickAndReadFile();
    if (!text) return;
    const proj = parseProjectJSON(text);
    if (!proj) { setError(t('fileMenu.errorRead')); return; }
    loadProject(proj);
    setSavedPath(null);
  };

  const handleSave = async () => {
    if (!project) return;
    close();
    try {
      const path = await saveProjectElectron(project, savedPath);
      if (path !== null) setSavedPath(path);
      markSaved();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleSaveAs = async () => {
    if (!project) return;
    close();
    try {
      const path = await saveProjectElectronAs(project);
      if (path !== null) setSavedPath(path);
      markSaved();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleLanguage = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('lmp-language', code);
    close();
  };

  return (
    <>
    <div ref={menuRef} style={{ position: 'relative' }}>

      {/* Trigger button */}
      <button
        style={S.trigger}
        onClick={() => setOpen((v) => !v)}
        title={t('fileMenu.label')}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginRight: 4, flexShrink: 0 }}>
          <path d="M1 2.5H9M1 5H9M1 7.5H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        {t('fileMenu.label')}
        <svg width="7" height="5" viewBox="0 0 7 5" fill="none" style={{ marginLeft: 4, flexShrink: 0, opacity: 0.6 }}>
          <path d="M1 1L3.5 4L6 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Error toast */}
      {error && <div style={S.errorToast}>{error}</div>}

      {/* Dropdown */}
      {open && (
        <div style={S.menu}>

          <MenuItem icon="＋" label={t('fileMenu.newProject')} onClick={handleNew} />

          <Divider />

          <MenuItem icon="⌂" label={t('fileMenu.openProject')} onClick={handleOpen} />

          <Divider />

          <MenuItem
            icon="↓"
            label={t('fileMenu.save')}
            onClick={handleSave}
            disabled={!project}
            hint={project ? project.name + '.lpmap.json' : undefined}
          />
          <MenuItem
            icon="↓"
            label={t('fileMenu.saveAs')}
            onClick={handleSaveAs}
            disabled={!project}
          />

          <Divider />

          <MenuItem
            icon={isPro ? '✓' : '🔑'}
            label={isPro ? (licenseStatus === 'overdue' ? 'License Overdue ⚠️' : 'License: Pro ✓') : 'Activate License…'}
            onClick={() => { close(); setShowLicense(true); }}
          />

          <Divider />

          {/* Language submenu */}
          <div style={{ position: 'relative' }}>
            <button
              style={{
                ...S.item,
                ...(langOpen ? S.itemHover : {}),
                justifyContent: 'space-between',
              }}
              onClick={() => setLangOpen((v) => !v)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={S.itemIcon}>🌐</span>
                {t('fileMenu.language')}
              </span>
              <svg width="5" height="8" viewBox="0 0 5 8" fill="none" style={{ opacity: 0.5 }}>
                <path d="M1 1L4 4L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {langOpen && (
              <div style={S.submenu}>
                {LANGUAGES.map(({ code, label }) => (
                  <button
                    key={code}
                    style={{
                      ...S.item,
                      ...(i18n.language === code ? S.itemActive : {}),
                    }}
                    onClick={() => handleLanguage(code)}
                  >
                    <span style={S.itemIcon}>{i18n.language === code ? '✓' : ''}</span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
    {showLicense && <LicenseActivation onClose={() => setShowLicense(false)} />}
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MenuItem({
  icon, label, onClick, disabled, hint,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{
        ...S.item,
        ...(hovered && !disabled ? S.itemHover : {}),
        ...(disabled ? S.itemDisabled : {}),
      }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
    >
      <span style={S.itemIcon}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {hint && <span style={S.itemHint}>{hint}</span>}
    </button>
  );
}

function Divider() {
  return <div style={S.divider} />;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  trigger: {
    display: 'flex',
    alignItems: 'center',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 500,
    padding: '4px 9px',
    cursor: 'pointer',
    transition: 'background 0.1s, color 0.1s',
    height: 26,
  },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 500,
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)',
    minWidth: 210,
    padding: '4px 0',
    display: 'flex',
    flexDirection: 'column',
  },
  submenu: {
    position: 'absolute',
    top: 0,
    left: '100%',
    zIndex: 501,
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
    minWidth: 140,
    padding: '4px 0',
    display: 'flex',
    flexDirection: 'column',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    background: 'none',
    border: 'none',
    padding: '6px 14px',
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.08s',
    borderRadius: 0,
  },
  itemHover: {
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
  },
  itemActive: {
    background: 'var(--accent-dim)',
    color: 'var(--accent-bright)',
  },
  itemDisabled: {
    opacity: 0.35,
    cursor: 'default',
  },
  itemIcon: {
    fontSize: 11,
    width: 14,
    textAlign: 'center',
    flexShrink: 0,
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
  },
  itemHint: {
    fontSize: 10,
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 120,
  },
  divider: {
    height: 1,
    background: 'var(--border)',
    margin: '3px 0',
  },
  errorToast: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 600,
    background: 'rgba(248,81,73,0.12)',
    border: '1px solid var(--danger)',
    borderRadius: 'var(--radius)',
    color: 'var(--danger)',
    fontSize: 11,
    padding: '6px 10px',
    whiteSpace: 'nowrap',
    maxWidth: 320,
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  },
};

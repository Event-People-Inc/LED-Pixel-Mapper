import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/useProjectStore';
import { useLicenseStore } from '../license/licenseStore';
import { UpgradeModal } from './ProGate';
import ExportDialog from './ExportDialog';
import FileMenu from './FileMenu';

export default function TopToolbar() {
  const { t } = useTranslation();
  const project        = useProjectStore((s) => s.project);
  const goToSetup      = useProjectStore((s) => s.goToSetup);
  const appMode        = useProjectStore((s) => s.appMode);
  const setAppMode     = useProjectStore((s) => s.setAppMode);
  const snapToGrid    = useProjectStore((s) => s.snapToGrid);
  const snapToTile    = useProjectStore((s) => s.snapToTile);
  const setSnapToGrid = useProjectStore((s) => s.setSnapToGrid);
  const setSnapToTile = useProjectStore((s) => s.setSnapToTile);
  const undo           = useProjectStore((s) => s.undo);
  const redo           = useProjectStore((s) => s.redo);
  const canUndo        = useProjectStore((s) => s._history.length > 0);
  const canRedo        = useProjectStore((s) => s._future.length > 0);

  const isPro = useLicenseStore((s) => s.isPro);
  const [exportOpen,   setExportOpen]   = useState(false);
  const [showUpgrade,  setShowUpgrade]  = useState(false);

  return (
    <div style={S.bar}>

      {/* ── Left: logo + file menu + project info ── */}
      <div style={S.left}>
        <button style={S.logoBtn} onClick={goToSetup} title={t('toolbar.backToSetup')}>
          <img src="./logo.png" alt="LMP" style={{ height: 40, objectFit: 'contain' }} />
        </button>

        <FileMenu />

        <div style={S.sep} />

        <div style={S.brand}>
          <span style={S.appName}>LED Pixel Mapper</span>
          {project && (
            <span style={S.projName} title={project.name}>{project.name}</span>
          )}
        </div>

        {project && (
          <span style={S.dimBadge}>
            {project.canvasWidth} × {project.canvasHeight}
          </span>
        )}
      </div>

      {/* ── Center: mode toggle + snap + save ── */}
      <div style={S.center}>
        {/* Mode toggle */}
        <div style={S.modeGroup}>
          <button
            style={{ ...S.modeBtn, ...(appMode === 'select' ? S.modeBtnActive : {}), borderRight: '1px solid var(--border)' }}
            onClick={() => setAppMode('select')}
            title={t('toolbar.selectTitle')}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ marginRight: 4 }}>
              <path d="M2 2L6 10L7.5 7L10.5 6L2 2Z" fill="currentColor"/>
            </svg>
            {t('toolbar.select')}
          </button>
          <button
            style={{
              ...S.modeBtn,
              ...(appMode === 'port-routing'
                ? { background: 'rgba(239,68,68,0.12)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' }
                : {}),
              borderRight: '1px solid var(--border)',
            }}
            onClick={() => setAppMode(appMode === 'port-routing' ? 'select' : 'port-routing')}
            title={t('toolbar.routeTitle')}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ marginRight: 4 }}>
              <circle cx="2" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="6" cy="2" r="1.5" fill="currentColor"/>
              <line x1="2" y1="10" x2="6" y2="2" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="6" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            {t('toolbar.route')}
            {appMode === 'port-routing' && (
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', marginLeft: 5, flexShrink: 0, boxShadow: '0 0 5px #ef4444' }} />
            )}
          </button>
          <button
            style={{
              ...S.modeBtn,
              ...(appMode === 'circuit-routing'
                ? { background: 'rgba(249,115,22,0.12)', color: '#f97316', borderColor: 'rgba(249,115,22,0.4)' }
                : {}),
            }}
            onClick={() => setAppMode(appMode === 'circuit-routing' ? 'select' : 'circuit-routing')}
            title={t('toolbar.circuitTitle')}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ marginRight: 4 }}>
              <path d="M2 6 L5 2 L7 5 L9 1 L10 6" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1 8 L11 8" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
            </svg>
            {t('toolbar.circuit')}
            {appMode === 'circuit-routing' && (
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f97316', marginLeft: 5, flexShrink: 0, boxShadow: '0 0 5px #f97316' }} />
            )}
          </button>
        </div>

        <div style={S.sep} />

        {/* Snap toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>{t('toolbar.snap')}</span>
          <label style={S.snapLabel} title={t('toolbar.snapGridTitle')}>
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 12, height: 12, cursor: 'pointer' }}
            />
            <span style={{ color: snapToGrid ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{t('toolbar.snapGrid')}</span>
          </label>
          <label style={S.snapLabel} title={t('toolbar.snapTileTitle')}>
            <input
              type="checkbox"
              checked={snapToTile}
              onChange={(e) => setSnapToTile(e.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 12, height: 12, cursor: 'pointer' }}
            />
            <span style={{ color: snapToTile ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{t('toolbar.snapTile')}</span>
          </label>
        </div>

      </div>

      {/* ── Right: undo + export ── */}
      <div style={S.right}>
        <button
          onClick={isPro ? undo : () => setShowUpgrade(true)}
          disabled={isPro && !canUndo}
          title={isPro ? t('toolbar.undoTitle') : 'Pro feature'}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: (isPro && canUndo) ? 'var(--text-secondary)' : 'var(--text-muted)',
            padding: '5px 10px',
            cursor: (isPro && !canUndo) ? 'default' : 'pointer',
            fontSize: 13,
            opacity: (isPro && !canUndo) ? 0.4 : 1,
          }}
        >
          {t('toolbar.undo')}{!isPro && ' 🔒'}
        </button>
        <button
          onClick={isPro ? redo : () => setShowUpgrade(true)}
          disabled={isPro && !canRedo}
          title={isPro ? t('toolbar.redoTitle') : 'Pro feature'}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: (isPro && canRedo) ? 'var(--text-secondary)' : 'var(--text-muted)',
            padding: '5px 10px',
            cursor: (isPro && !canRedo) ? 'default' : 'pointer',
            fontSize: 13,
            opacity: (isPro && !canRedo) ? 0.4 : 1,
          }}
        >
          {t('toolbar.redo')}{!isPro && ' 🔒'}
        </button>
        {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
        <button
          className="btn-export"
          style={{ borderRadius: 'var(--radius)', padding: '5px 14px', gap: 6 }}
          onClick={() => setExportOpen(true)}
          title={t('toolbar.exportTitle')}
        >
          <span>↓</span> {t('toolbar.export')}
        </button>
      </div>

      <ExportDialog isOpen={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  bar: {
    height: 'var(--toolbar-h)',
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 14px',
    gap: 12,
    flexShrink: 0,
    zIndex: 10,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    flex: '0 0 auto',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: '0 0 auto',
  },
  logoBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--accent)',
    padding: '4px 5px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  brand: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    minWidth: 0,
  },
  appName: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--accent)',
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
  },
  projName: {
    fontSize: 10,
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 180,
    lineHeight: 1.2,
  },
  dimBadge: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-muted)',
    borderRadius: 4,
    padding: '2px 7px',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
    flexShrink: 0,
  },
  modeGroup: {
    display: 'flex',
    alignItems: 'stretch',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
  },
  modeBtn: {
    display: 'flex',
    alignItems: 'center',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 11,
    fontWeight: 500,
    padding: '4px 11px',
    cursor: 'pointer',
    transition: 'background 0.12s, color 0.12s',
  },
  modeBtnActive: {
    background: 'var(--accent-dim)',
    color: 'var(--accent-bright)',
  },
  sep: {
    width: 1,
    height: 18,
    background: 'var(--border)',
    flexShrink: 0,
  },
  snapLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    cursor: 'pointer',
    fontSize: 11,
    color: 'var(--text-secondary)',
    fontWeight: 'normal',
    textTransform: 'none',
    letterSpacing: 0,
    marginBottom: 0,
    userSelect: 'none',
  },
};

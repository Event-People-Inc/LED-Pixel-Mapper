import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/useProjectStore';
import { useLicenseStore } from '../license/licenseStore';
import { UpgradeModal } from './ProGate';
import { WALL_EXPORT_COLORS } from '../utils/exportRenderers';

export default function WallTabBar() {
  const { t } = useTranslation();
  const project       = useProjectStore((s) => s.project);
  const addWall       = useProjectStore((s) => s.addWall);
  const renameWall    = useProjectStore((s) => s.renameWall);
  const removeWall    = useProjectStore((s) => s.removeWall);
  const setActiveWall = useProjectStore((s) => s.setActiveWall);

  const isPro = useLicenseStore((s) => s.isPro);

  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editValue,    setEditValue]    = useState('');
  const [showUpgrade,  setShowUpgrade]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!project) return null;

  const wallLimitReached = !isPro && project.walls.length >= 2;

  const startRename = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditValue(name);
    setTimeout(() => inputRef.current?.select(), 10);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) renameWall(editingId, editValue.trim());
    setEditingId(null);
  };

  return (
    <div style={S.bar}>

      {/* ── Canvas label ─────────────────────────────────────── */}
      <div style={S.canvasLabel}>
        <span style={S.canvasWord}>{t('wallTabBar.canvas')}</span>
        <span style={S.canvasDims}>{project.canvasWidth} × {project.canvasHeight}</span>
      </div>

      <div style={S.sep} />

      {/* ── Wall tabs ────────────────────────────────────────── */}
      <div style={S.tabScroll}>
        {project.walls.map((wall, i) => {
          const { bright } = WALL_EXPORT_COLORS[i % WALL_EXPORT_COLORS.length];
          const isActive  = wall.id === project.activeWallId;
          const isEditing = editingId === wall.id;

          return (
            <div
              key={wall.id}
              style={{
                ...S.tab,
                borderBottom: `2px solid ${isActive ? bright : 'transparent'}`,
                background:   isActive ? `${bright}1a` : 'transparent',
                color:        isActive ? bright : 'var(--text-muted)',
              }}
              onClick={() => !isEditing && setActiveWall(wall.id)}
              onDoubleClick={(e) => startRename(wall.id, wall.name, e)}
              title={`${wall.name}${t('wallTabBar.tilesHint', { count: wall.tiles.length })}`}
            >
              {/* Color dot */}
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: bright, flexShrink: 0,
                opacity: isActive ? 1 : 0.4,
              }} />

              {/* Name / rename input */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')  commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={S.renameInput}
                />
              ) : (
                <span style={S.tabName}>{wall.name}</span>
              )}

              {/* Tile count */}
              {!isEditing && (
                <span style={{ fontSize: 9, fontFamily: 'monospace', flexShrink: 0, opacity: isActive ? 0.6 : 0.3 }}>
                  {wall.tiles.length}
                </span>
              )}

              {/* Remove button — hidden when only 1 wall */}
              {project.walls.length > 1 && !isEditing && (
                <button
                  style={S.closeBtn}
                  onClick={(e) => { e.stopPropagation(); removeWall(wall.id); }}
                  title={t('wallTabBar.removeWall')}
                >×</button>
              )}
            </div>
          );
        })}

        {/* Add wall */}
        <button
          style={{ ...S.addBtn, ...(wallLimitReached ? { opacity: 0.45, cursor: 'pointer' } : {}) }}
          onClick={() => {
            if (wallLimitReached) { setShowUpgrade(true); return; }
            addWall(`Wall ${project.walls.length + 1}`);
          }}
          title={wallLimitReached ? 'Pro feature — max 2 walls on free tier' : t('wallTabBar.addWall')}
        >{wallLimitReached ? '🔒' : '+'}</button>
        {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  bar: {
    height: 34,
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'stretch',
    flexShrink: 0,
    overflow: 'hidden',
  },
  canvasLabel: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '0 12px',
    gap: 2,
    flexShrink: 0,
  },
  canvasWord: {
    fontSize: 8,
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.12em',
    lineHeight: 1,
  },
  canvasDims: {
    fontSize: 9,
    fontFamily: "'JetBrains Mono','Fira Mono','Consolas',monospace",
    color: 'var(--text-muted)',
    opacity: 0.6,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  sep: {
    width: 1,
    background: 'var(--border)',
    margin: '7px 0',
    flexShrink: 0,
  },
  tabScroll: {
    display: 'flex',
    alignItems: 'stretch',
    flex: 1,
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 10px',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    userSelect: 'none',
    whiteSpace: 'nowrap',
    transition: 'background 0.1s, color 0.1s',
    minWidth: 72,
    maxWidth: 150,
    borderBottom: '2px solid transparent',
  },
  tabName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  renameInput: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--accent)',
    borderRadius: 3,
    color: 'var(--text-primary)',
    fontSize: 11,
    padding: '1px 5px',
    width: 90,
    outline: 'none',
    fontFamily: 'inherit',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '0 1px',
    lineHeight: 1,
    flexShrink: 0,
    opacity: 0.5,
  },
  addBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 18,
    fontWeight: 300,
    cursor: 'pointer',
    padding: '0 12px',
    alignSelf: 'center',
    lineHeight: 1,
    flexShrink: 0,
  },
};

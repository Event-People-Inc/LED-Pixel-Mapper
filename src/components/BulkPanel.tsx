import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore, BulkUpdate } from '../store/useProjectStore';
import { useLicenseStore } from '../license/licenseStore';
import { UpgradeModal } from './ProGate';
import { TileInstance } from '../types';
import MathInput from './MathInput';

type SortDir = 'l-to-r' | 'r-to-l' | 't-to-b' | 'b-to-t';

function sortTiles(tiles: TileInstance[], dir: SortDir): TileInstance[] {
  return [...tiles].sort((a, b) => {
    switch (dir) {
      case 'l-to-r': return a.x !== b.x ? a.x - b.x : a.y - b.y;
      case 'r-to-l': return a.x !== b.x ? b.x - a.x : a.y - b.y;
      case 't-to-b': return a.y !== b.y ? a.y - b.y : a.x - b.x;
      case 'b-to-t': return a.y !== b.y ? b.y - a.y : a.x - b.x;
    }
  });
}


interface BulkPanelProps {
  selectedTileIds: string[];
}

export default function BulkPanel({ selectedTileIds }: BulkPanelProps) {
  const { t } = useTranslation();
  const project             = useProjectStore((s) => s.project);
  const bulkUpdateTiles     = useProjectStore((s) => s.bulkUpdateTiles);
  const rotateSelectedTiles = useProjectStore((s) => s.rotateSelectedTiles);
  const clearSelection      = useProjectStore((s) => s.clearSelection);

  const isPro = useLicenseStore((s) => s.isPro);
  const [showUpgrade,   setShowUpgrade]   = useState(false);
  const [sortDir,       setSortDir]       = useState<SortDir>('l-to-r');
  const [tileNumStart,  setTileNumStart]  = useState(1);

  if (!project) return null;

  const activeWall = project.walls.find((w) => w.id === project.activeWallId);
  if (!activeWall) return null;

  const rawSelected  = activeWall.tiles.filter((t) => selectedTileIds.includes(t.id));
  const sortedTiles  = sortTiles(rawSelected, sortDir);
  const count        = sortedTiles.length;

  const SORT_OPTIONS: { dir: SortDir; label: string; icon: string; titleKey: string }[] = [
    { dir: 'l-to-r', icon: '→', label: 'L→R', titleKey: 'bulkPanel.leftToRight' },
    { dir: 'r-to-l', icon: '←', label: 'R→L', titleKey: 'bulkPanel.rightToLeft' },
    { dir: 't-to-b', icon: '↓', label: 'T→B', titleKey: 'bulkPanel.topToBottom' },
    { dir: 'b-to-t', icon: '↑', label: 'B→T', titleKey: 'bulkPanel.bottomToTop' },
  ];

  const applyTileNumbers = () => {
    const updates: BulkUpdate[] = sortedTiles.map((t, i) => ({
      id: t.id,
      changes: { tileNumber: tileNumStart + i },
    }));
    bulkUpdateTiles(updates);
  };

  const previewTileNums  = count > 0 ? `${tileNumStart} → ${tileNumStart + count - 1}` : '—';

  return (
    <div>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.countBadge}>{count}</span>
          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
            {t('bulkPanel.tilesSelected')}
          </span>
        </div>
        <button
          className="btn-ghost"
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={clearSelection}
        >
          {t('bulkPanel.deselectAll')}
        </button>
      </div>

      {/* ── Rotation ── */}
      <div className="sb">
        <div style={S.groupLabel}>{t('bulkPanel.rotation')}{!isPro && ' 🔒'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button
            className="btn-secondary btn-action"
            onClick={isPro ? () => rotateSelectedTiles(-90) : () => setShowUpgrade(true)}
            disabled={isPro && count === 0}
            style={!isPro ? { opacity: 0.45 } : {}}
          >
            {t('bulkPanel.rotateCCW')}
          </button>
          <button
            className="btn-secondary btn-action"
            onClick={isPro ? () => rotateSelectedTiles(90) : () => setShowUpgrade(true)}
            disabled={isPro && count === 0}
            style={!isPro ? { opacity: 0.45 } : {}}
          >
            {t('bulkPanel.rotateCW')}
          </button>
        </div>
      </div>
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

      {/* ── Sort Order ── */}
      <div className="sb">
        <div style={S.groupLabel}>{t('bulkPanel.sortOrder')}</div>
        <div style={S.sortGroup}>
          {SORT_OPTIONS.map(({ dir, icon, label, titleKey }) => (
            <button
              key={dir}
              title={t(titleKey)}
              style={{
                ...S.sortBtn,
                ...(sortDir === dir ? S.sortBtnActive : {}),
              }}
              onClick={() => setSortDir(dir)}
            >
              <span style={{ fontSize: 14 }}>{icon}</span>
              <span style={{ fontSize: 10 }}>{label}</span>
            </button>
          ))}
        </div>
        <p style={S.hint}>{t('bulkPanel.sortHint')}</p>
      </div>

      {/* ── Tile Numbering ── */}
      <div className="sb">
        <div style={S.groupLabel}>{t('bulkPanel.tileNumbering')}</div>
        <div className="row" style={{ marginBottom: 6 }}>
          <div className="fg" style={{ flex: 1 }}>
            <label>{t('bulkPanel.startAt')}</label>
            <MathInput min={0} value={tileNumStart} onChange={(v) => setTileNumStart(parseInt(v) || 0)} />
          </div>
          <div style={S.previewBox}>
            <span style={S.previewLabel}>{t('bulkPanel.preview')}</span>
            <span style={S.previewVal}>{previewTileNums}</span>
          </div>
        </div>
        <button className="btn-primary btn-action" onClick={applyTileNumbers} disabled={count === 0}>
          {t('bulkPanel.numberTiles', { count })}
        </button>
      </div>

    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'var(--bg-base)',
    borderBottom: '1px solid var(--border-muted)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 26,
    height: 26,
    background: 'rgba(245,158,11,0.18)',
    border: '1px solid rgba(245,158,11,0.5)',
    borderRadius: 13,
    fontSize: 12,
    fontWeight: 700,
    color: '#f59e0b',
    padding: '0 6px',
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    color: 'var(--text-muted)',
    marginBottom: 8,
  },
  sortGroup: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 4,
    marginBottom: 6,
  },
  sortBtn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: '6px 4px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.1s',
    lineHeight: 1.2,
  },
  sortBtnActive: {
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent)',
    color: 'var(--accent-bright)',
  },
  previewBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: 2,
    paddingTop: 16,
    flexShrink: 0,
  },
  previewLabel: {
    fontSize: 9,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--text-muted)',
  },
  previewVal: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap' as const,
  },
  hint: {
    fontSize: 10,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    fontStyle: 'italic',
  },
};

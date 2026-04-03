import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/useProjectStore';
import { useLicenseStore } from '../license/licenseStore';
import { UpgradeModal } from './ProGate';
import { LabelVisibility, TILE_COLORS } from '../types';
import BulkPanel from './BulkPanel';
import PortPanel from './PortPanel';
import CircuitPanel from './CircuitPanel';
import MathInput from './MathInput';

export default function RightSidebar() {
  const { t } = useTranslation();
  const project              = useProjectStore((s) => s.project);
  const selectedTileIds      = useProjectStore((s) => s.selectedTileIds);
  const updateTile           = useProjectStore((s) => s.updateTile);
  const removeTile           = useProjectStore((s) => s.removeTile);
  const rotateTile           = useProjectStore((s) => s.rotateTile);
  const updateLabelVisibility = useProjectStore((s) => s.updateLabelVisibility);
  const appMode              = useProjectStore((s) => s.appMode);

  const isPro = useLicenseStore((s) => s.isPro);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!project) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const activeWall = useMemo(
    () => project.walls.find((w) => w.id === project.activeWallId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.walls, project.activeWallId]
  );

  const vis        = activeWall?.labelVisibility;
  const selCount   = selectedTileIds.length;
  const isSingle   = selCount === 1;
  const isMulti    = selCount > 1;
  const isPortMode    = appMode === 'port-routing';
  const isCircuitMode = appMode === 'circuit-routing';

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { selectedTile, profile, profileColor, totalPower, selectionRatio, selectionResolution, selectionPlacement } = useMemo(() => {
    const tile   = isSingle ? activeWall?.tiles.find((t) => t.id === selectedTileIds[0]) ?? null : null;
    const prof   = tile ? project.tileProfiles.find((p) => p.id === tile.profileId) ?? null : null;
    const idx    = prof ? project.tileProfiles.indexOf(prof) : 0;
    const power  = activeWall?.tiles.reduce((acc, t) => acc + (t.powerUse ?? 0), 0) ?? 0;

    // Compute bounding box of selected tiles in pixel space
    let ratio = '', resolution = '', placement = '';
    if (selCount > 0 && activeWall) {
      const selectedTiles = activeWall.tiles.filter((t) => selectedTileIds.includes(t.id));
      if (selectedTiles.length > 0) {
        const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const t of selectedTiles) {
          const p = profileMap.get(t.profileId);
          if (!p) continue;
          const rotated = (t.rotation === 90 || t.rotation === 270);
          const w = rotated ? p.pixelHeight : p.pixelWidth;
          const h = rotated ? p.pixelWidth  : p.pixelHeight;
          minX = Math.min(minX, t.x);
          minY = Math.min(minY, t.y);
          maxX = Math.max(maxX, t.x + w);
          maxY = Math.max(maxY, t.y + h);
        }
        const bw = maxX - minX, bh = maxY - minY;
        if (bw > 0 && bh > 0) {
          resolution = `${bw} × ${bh} px`;
          placement  = `${minX}, ${minY}`;
          const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
          const g = gcd(bw, bh);
          ratio = `${bw / g}:${bh / g}`;
          // Simplify common ratios
          const knownRatios: Record<string, string> = {
            '16:9': '16:9', '9:16': '9:16', '4:3': '4:3', '3:4': '3:4',
            '1:1': '1:1', '2:1': '2:1', '1:2': '1:2', '3:2': '3:2', '2:3': '2:3',
            '16:10': '16:10', '21:9': '21:9',
          };
          ratio = knownRatios[ratio] ?? ratio;
        }
      }
    }
    return { selectedTile: tile, profile: prof, profileColor: TILE_COLORS[idx % TILE_COLORS.length], totalPower: power, selectionRatio: ratio, selectionResolution: resolution, selectionPlacement: placement };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWall?.tiles, isSingle, selectedTileIds, project.tileProfiles, selCount]);

  const num = (raw: string): number | undefined => {
    if (raw === '') return undefined;
    const n = parseFloat(raw);
    return isNaN(n) ? undefined : n;
  };

  const setProp = (key: string, rawValue: string) => {
    if (!selectedTile) return;
    const numberFields = ['x', 'y', 'tileNumber', 'portNumber', 'chainOrder', 'powerUse'];
    const value = numberFields.includes(key) ? num(rawValue) : rawValue;
    updateTile(selectedTile.id, { [key]: value } as never);
  };

  const headerDotStyle = isPortMode
    ? { background: '#ef4444' }
    : isCircuitMode
      ? { background: '#f97316' }
      : isMulti
        ? { background: '#f59e0b' }
        : isSingle && profile
          ? { background: profileColor }
          : {};

  const headerTitle = isPortMode
    ? t('rightSidebar.portRouting')
    : isCircuitMode
      ? t('rightSidebar.circuitRouting')
      : isMulti
        ? t('rightSidebar.bulkTools')
        : isSingle
          ? t('rightSidebar.tileProperties')
          : t('rightSidebar.noSelection');

  const labelItems: { key: keyof LabelVisibility; labelKey: string; highlight?: boolean }[] = [
    { key: 'showTileName',       labelKey: 'rightSidebar.labelTileName' },
    { key: 'showPortLabel',      labelKey: 'rightSidebar.labelPortLabel', highlight: true },
    { key: 'showCircuitLabel',   labelKey: 'rightSidebar.labelCircuit',   highlight: true },
    { key: 'showTileNumber',     labelKey: 'rightSidebar.labelTileNumber' },
    { key: 'showPowerUse',       labelKey: 'rightSidebar.labelPowerUse' },
    { key: 'showTileResolution', labelKey: 'rightSidebar.tileResolution' },
  ];

  return (
    <div style={S.sidebar}>

      {/* ── Section heading ── */}
      <div className="sh">
        <span className="sh-dot" style={headerDotStyle} />
        {headerTitle}
      </div>

      {/* ── PORT ROUTING MODE ── */}
      {isPortMode && <PortPanel />}

      {/* ── CIRCUIT ROUTING MODE ── */}
      {isCircuitMode && <CircuitPanel />}

      {/* ── SELECT MODE contents ── */}
      {!isPortMode && !isCircuitMode && (
        <>
          {/* MULTI: Bulk panel */}
          {isMulti && <BulkPanel selectedTileIds={selectedTileIds} />}

          {/* SINGLE: Tile properties */}
          {isSingle && selectedTile && profile && (
            <div>
              {/* Profile badge */}
              <div style={S.profileBadge}>
                <div style={{ ...S.profilePip, background: profileColor }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {profile.name}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
                  {profile.pixelWidth}×{profile.pixelHeight}px
                </span>
              </div>

              {/* Name */}
              <div className="sb">
                <div className="fg">
                  <label>{t('rightSidebar.tileName')}</label>
                  <input
                    value={selectedTile.name}
                    onChange={(e) => setProp('name', e.target.value)}
                    placeholder={t('rightSidebar.tileNamePlaceholder')}
                  />
                </div>
              </div>

              {/* Position */}
              <div className="sb">
                <div style={S.groupLabel}>{t('rightSidebar.position')}</div>
                <div className="row">
                  <div className="fg" style={{ flex: 1 }}>
                    <label>{t('rightSidebar.xPx')}</label>
                    <MathInput value={selectedTile.x} onChange={(v) => setProp('x', v)} />
                  </div>
                  <div className="fg" style={{ flex: 1 }}>
                    <label>{t('rightSidebar.yPx')}</label>
                    <MathInput value={selectedTile.y} onChange={(v) => setProp('y', v)} />
                  </div>
                </div>
              </div>

              {/* Signal routing */}
              <div className="sb">
                <div style={S.groupLabel}>{t('rightSidebar.signalRouting')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>

                  {selectedTile.portName && selectedTile.chainOrder !== undefined ? (
                    <div className="fg">
                      <label>{t('rightSidebar.portLabel')}</label>
                      <div style={S.portLabelDisplay}>
                        <span style={{ fontWeight: 800, fontFamily: 'monospace', letterSpacing: '-0.01em' }}>
                          {selectedTile.portName}{selectedTile.chainOrder}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                          &ensp;Port {selectedTile.portName}, position {selectedTile.chainOrder}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="row">
                      <div className="fg" style={{ flex: 1 }}>
                        <label>{t('rightSidebar.portHash')}</label>
                        <MathInput placeholder="—" value={selectedTile.portNumber ?? ''} onChange={(v) => setProp('portNumber', v)} />
                      </div>
                      <div className="fg" style={{ flex: 1 }}>
                        <label>{t('rightSidebar.chainOrder')}</label>
                        <MathInput placeholder="—" value={selectedTile.chainOrder ?? ''} onChange={(v) => setProp('chainOrder', v)} />
                      </div>
                    </div>
                  )}

                  <div className="fg">
                    <label>{t('rightSidebar.tileNumber')}</label>
                    <MathInput placeholder="—" value={selectedTile.tileNumber ?? ''} onChange={(v) => setProp('tileNumber', v)} />
                  </div>
                </div>
              </div>

              {/* Power */}
              <div className="sb">
                <div style={S.groupLabel}>{t('rightSidebar.power')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div className="fg">
                    <label>{t('rightSidebar.powerPosition')}</label>
                    <input
                      placeholder={t('rightSidebar.powerPositionPlaceholder')}
                      value={selectedTile.powerPosition ?? ''}
                      onChange={(e) => setProp('powerPosition', e.target.value)}
                    />
                  </div>
                  <div className="fg">
                    <label>{t('rightSidebar.powerUseW')}</label>
                    <MathInput placeholder="—" allowDecimal value={selectedTile.powerUse ?? ''} onChange={(v) => setProp('powerUse', v)} />
                  </div>
                </div>
              </div>

              {/* Rotation */}
              <div className="sb">
                <div style={S.groupLabel}>{t('rightSidebar.rotation')}{!isPro && ' 🔒'}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn-secondary"
                    style={{ flex: 1, ...(isPro ? {} : { opacity: 0.45 }) }}
                    onClick={isPro ? () => rotateTile(selectedTile.id, -90) : () => setShowUpgrade(true)}
                    title={isPro ? 'Shift+R' : 'Pro feature'}
                  >
                    {t('rightSidebar.rotateCCW')}
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ flex: 1, ...(isPro ? {} : { opacity: 0.45 }) }}
                    onClick={isPro ? () => rotateTile(selectedTile.id, 90) : () => setShowUpgrade(true)}
                    title={isPro ? 'R' : 'Pro feature'}
                  >
                    {t('rightSidebar.rotateCW')}
                  </button>
                </div>
                {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
                {(selectedTile.rotation ?? 0) !== 0 && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    {selectedTile.rotation}° rotation
                  </p>
                )}
              </div>

              {/* Delete */}
              <div className="sb">
                <button
                  className="btn-danger btn-action"
                  onClick={() => removeTile(selectedTile.id)}
                >
                  {t('rightSidebar.deleteTile')}
                </button>
              </div>
            </div>
          )}

          {/* NONE: prompt */}
          {!isSingle && !isMulti && (
            <div className="sb">
              <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0', lineHeight: 1.7 }}>
                {t('rightSidebar.clickToSelect')}
              </p>
            </div>
          )}

          {/* Label Visibility */}
          {vis && (
            <>
              <div className="sh">
                <span className="sh-dot" style={{ background: 'var(--warning)' }} />
                {t('rightSidebar.labelVisibility')}
              </div>
              <div className="sb">
                {labelItems.map(({ key, labelKey, highlight }) => (
                  <label key={key} className="toggle-row" style={highlight ? { color: 'var(--text-primary)' } : {}}>
                    <input
                      type="checkbox"
                      checked={vis[key]}
                      onChange={(e) => updateLabelVisibility({ [key]: e.target.checked })}
                    />
                    {t(labelKey)}
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Wall Summary */}
          {activeWall && (
            <>
              <div className="sh">
                <span className="sh-dot" style={{ background: 'var(--text-muted)' }} />
                {t('rightSidebar.wallSummary')}
              </div>
              <div className="sb" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="stat-row">
                  <span className="stat-label">{t('rightSidebar.wall')}</span>
                  <span className="stat-value" style={{ color: 'var(--text-primary)' }}>
                    {activeWall.name}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('rightSidebar.tilesCount')}</span>
                  <span className="stat-value">{activeWall.tiles.length}</span>
                </div>
                {selCount > 0 && (
                  <div className="stat-row">
                    <span className="stat-label">{t('rightSidebar.selected')}</span>
                    <span className="stat-value" style={{ color: '#f59e0b' }}>{selCount}</span>
                  </div>
                )}
                {selCount > 0 && selectionResolution && (
                  <div className="stat-row">
                    <span className="stat-label">Sel. Resolution</span>
                    <span className="stat-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>{selectionResolution}</span>
                  </div>
                )}
                {selCount > 0 && selectionRatio && (
                  <div className="stat-row">
                    <span className="stat-label">Sel. Ratio</span>
                    <span className="stat-value" style={{ color: '#22c55e', fontWeight: 700 }}>{selectionRatio}</span>
                  </div>
                )}
                {selCount > 0 && selectionPlacement && (
                  <div className="stat-row">
                    <span className="stat-label">Placement</span>
                    <span className="stat-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>{selectionPlacement}</span>
                  </div>
                )}
                {(() => {
                  const wallPorts = (project.processors ?? [])
                    .flatMap((p) => p.ports)
                    .filter((p) => p.wallId === activeWall.id);
                  return wallPorts.length > 0 ? (
                    <div className="stat-row">
                      <span className="stat-label">{t('rightSidebar.dataPorts')}</span>
                      <span className="stat-value">{wallPorts.length}</span>
                    </div>
                  ) : null;
                })()}
                {(() => {
                  const wallCircuits = (project.circuits ?? []).filter((c) => c.wallId === activeWall.id);
                  return wallCircuits.length > 0 ? (
                    <div className="stat-row">
                      <span className="stat-label">{t('rightSidebar.circuits')}</span>
                      <span className="stat-value">{wallCircuits.length}</span>
                    </div>
                  ) : null;
                })()}
                <div className="stat-row">
                  <span className="stat-label">{t('rightSidebar.totalPower')}</span>
                  <span className="stat-value">
                    {totalPower > 0 ? `${totalPower.toFixed(0)} W` : '—'}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('rightSidebar.canvas')}</span>
                  <span className="stat-value">{project.canvasWidth}×{project.canvasHeight}</span>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 'var(--sidebar-w-right)',
    flexShrink: 0,
    height: '100%',
    background: 'var(--bg-panel)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  profileBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    background: 'var(--bg-base)',
    borderBottom: '1px solid var(--border-muted)',
    padding: '7px 14px',
  },
  profilePip: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    color: 'var(--text-muted)',
    marginBottom: 8,
  },
  portLabelDisplay: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
    background: 'var(--bg-base)',
    border: '1px solid var(--border-muted)',
    borderRadius: 'var(--radius)',
    padding: '6px 9px',
    fontSize: 13,
    color: 'var(--text-primary)',
  },
};

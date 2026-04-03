import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/useProjectStore';
import { PORT_COLORS, Circuit, TileInstance, TileProfile, SocaSplay } from '../types';

/**
 * Build a label for a tile at position `idx` in a circuit chain.
 * Format: (ProfileName).N  where N counts from 1 per profile type in the chain.
 * e.g. (Panel A).1 - (Panel A).2 - (Panel B).1
 */
function chainLabel(
  tileIds: string[],
  idx: number,
  allTiles: TileInstance[],
  profileMap: Map<string, TileProfile>,
): string {
  const tid  = tileIds[idx];
  const tile = allTiles.find((t) => t.id === tid);
  if (!tile) return `Tile ${idx + 1}`;
  const profile = profileMap.get(tile.profileId);
  const name    = profile?.name ?? 'Tile';
  // Count occurrences of this profile type up to and including idx
  let count = 0;
  for (let i = 0; i <= idx; i++) {
    const t = allTiles.find((t2) => t2.id === tileIds[i]);
    if (t?.profileId === tile.profileId) count++;
  }
  return `(${name}).${count}`;
}

const fmtW   = (w: number) => w === 0 ? '—' : `${Math.round(w)} W`;
const fmtA   = (w: number, v: number) => w === 0 ? '—' : `${(w / v).toFixed(1)} A`;

function PowerStats({ watts, style }: { watts: number; style?: React.CSSProperties }) {
  if (watts === 0) return null;
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end',
  };
  const iconStyle: React.CSSProperties = {
    fontSize: 9, flexShrink: 0,
  };
  const valStyle: React.CSSProperties = {
    fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontFamily: 'monospace', fontWeight: 600, opacity: 0.55,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', ...style }}>
      <div style={rowStyle}>
        <span style={{ ...iconStyle, color: 'var(--warning)' }}>⚡</span>
        <span style={{ ...valStyle, color: 'var(--warning)' }}>{fmtW(watts)}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ ...iconStyle, color: '#60a5fa' }}>⚡</span>
        <span style={{ ...valStyle, color: '#60a5fa' }}>{fmtA(watts, 110)}</span>
        <span style={{ ...labelStyle, color: '#60a5fa' }}>110V</span>
      </div>
      <div style={rowStyle}>
        <span style={{ ...iconStyle, color: '#818cf8' }}>⚡</span>
        <span style={{ ...valStyle, color: '#818cf8' }}>{fmtA(watts, 220)}</span>
        <span style={{ ...labelStyle, color: '#818cf8' }}>220V</span>
      </div>
    </div>
  );
}

export default function CircuitPanel() {
  const { t } = useTranslation();
  const project           = useProjectStore((s) => s.project);
  const activeCircuitId   = useProjectStore((s) => s.activeCircuitId);
  const appMode           = useProjectStore((s) => s.appMode);
  const selectedTileIds   = useProjectStore((s) => s.selectedTileIds);

  const addCircuit            = useProjectStore((s) => s.addCircuit);
  const addSocaSplay          = useProjectStore((s) => s.addSocaSplay);
  const renameSoca            = useProjectStore((s) => s.renameSoca);
  const deleteSoca            = useProjectStore((s) => s.deleteSoca);
  const setSocaPowerType      = useProjectStore((s) => s.setSocaPowerType);
  const renameCircuit         = useProjectStore((s) => s.renameCircuit);
  const deleteCircuit         = useProjectStore((s) => s.deleteCircuit);
  const setCircuitColor       = useProjectStore((s) => s.setCircuitColor);
  const assignCircuitToWall   = useProjectStore((s) => s.assignCircuitToWall);
  const clearCircuit          = useProjectStore((s) => s.clearCircuit);
  const reverseCircuitChain   = useProjectStore((s) => s.reverseCircuitChain);
  const setActiveCircuitId    = useProjectStore((s) => s.setActiveCircuitId);
  const setAppMode            = useProjectStore((s) => s.setAppMode);
  const setActiveWall         = useProjectStore((s) => s.setActiveWall);
  const removeTileFromCircuit      = useProjectStore((s) => s.removeTileFromCircuit);
  const assignTileToCircuit        = useProjectStore((s) => s.assignTileToCircuit);
  const batchAssignCircuitsToWall  = useProjectStore((s) => s.batchAssignCircuitsToWall);

  const [renamingId, setRenamingId]               = useState<string | null>(null);
  const [renameVal,  setRenameVal]                = useState('');
  const [adding,     setAdding]                   = useState(false);
  const [newName,    setNewName]                  = useState('');
  const [collapsedCircuits, setCollapsedCircuits] = useState<Set<string>>(new Set());
  const [selectedCircuitIds, setSelectedCircuitIds] = useState<Set<string>>(new Set());
  const [collapsedSocas, setCollapsedSocas]       = useState<Set<string>>(new Set());
  const [renamingSocaId, setRenamingSocaId]       = useState<string | null>(null);
  const [renameSocaVal, setRenameSocaVal]         = useState('');

  const toggleCollapse = (id: string) =>
    setCollapsedCircuits((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleSocaCollapse = (id: string) =>
    setCollapsedSocas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const commitSocaRename = () => {
    if (renamingSocaId && renameSocaVal.trim()) renameSoca(renamingSocaId, renameSocaVal.trim());
    setRenamingSocaId(null);
  };

  const SOCA_POWER_TYPES: Array<SocaSplay['powerType']> = ['Powercon', 'True1', 'Powercon True1'];
  const cycleSocaPowerType = (soca: SocaSplay) => {
    const idx = SOCA_POWER_TYPES.indexOf(soca.powerType ?? 'Powercon');
    setSocaPowerType(soca.id, SOCA_POWER_TYPES[(idx + 1) % SOCA_POWER_TYPES.length]);
  };

  const toggleCircuitSel = (id: string) =>
    setSelectedCircuitIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const profileMap = useMemo(
    () => new Map(project?.tileProfiles.map((p) => [p.id, p]) ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project?.tileProfiles]
  );

  if (!project) return null;

  const circuits      = project.circuits ?? [];
  const socas         = project.socas ?? [];
  const walls         = project.walls;
  const allTiles      = walls.flatMap((w) => w.tiles);
  const activeCircuit = circuits.find((c) => c.id === activeCircuitId) ?? null;
  // Standalone circuits have no socaId
  const standaloneCircuits = circuits.filter((c) => !c.socaId);

  const activeWall = project.walls.find((w) => w.id === project.activeWallId);
  const selectedTile  = selectedTileIds.length === 1
    ? (activeWall?.tiles.find((t) => t.id === selectedTileIds[0]) ?? null)
    : null;

  const isCircuitMode = appMode === 'circuit-routing';

  const circuitPower = (circuit: Circuit): number =>
    circuit.tileIds.reduce((sum, tid) => {
      const tile    = allTiles.find((t) => t.id === tid);
      const profile = tile ? profileMap.get(tile.profileId) : null;
      return sum + (tile?.powerUse ?? profile?.defaultPowerUse ?? 0);
    }, 0);

  const startRouting = (circuit: Circuit) => {
    if (!circuit.wallId) return;
    setActiveWall(circuit.wallId);
    setActiveCircuitId(circuit.id);
    setAppMode('circuit-routing');
  };

  const stopRouting = () => {
    setAppMode('select');
    setActiveCircuitId(null);
  };

  const commitRename = () => {
    if (renamingId && renameVal.trim()) renameCircuit(renamingId, renameVal.trim());
    setRenamingId(null);
  };

  const handleAddCircuit = () => {
    const name = newName.trim() || `Circuit ${circuits.length + 1}`;
    addCircuit(name);
    setAdding(false);
    setNewName('');
  };

  const renderCircuitRow = (circuit: Circuit) => {
    const isActive     = circuit.id === activeCircuitId;
    const isRouting    = isActive && isCircuitMode;
    const isCollapsed  = collapsedCircuits.has(circuit.id);
    const chainLen     = circuit.tileIds.length;
    const isCircuitSel = selectedCircuitIds.has(circuit.id);

    return (
      <div
        key={circuit.id}
        style={{
          borderTop: '1px solid var(--border-muted)',
          background: isActive ? 'var(--accent-dim)' : 'transparent',
          padding: '7px 14px',
          ...(isCircuitSel ? { outline: '1px solid rgba(59,130,246,0.35)', outlineOffset: '-1px' } : {}),
        }}
        onClickCapture={(e) => {
          if (e.ctrlKey || e.metaKey) { e.stopPropagation(); toggleCircuitSel(circuit.id); }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="btn-icon"
            onClick={() => toggleCollapse(circuit.id)}
            style={{ fontSize: 8, color: 'var(--text-muted)', padding: 0, flexShrink: 0, width: 10 }}
            title={isCollapsed ? t('circuitPanel.expand') : t('circuitPanel.collapse')}
          >
            {isCollapsed ? '▶' : '▼'}
          </button>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <span
              style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: circuit.color, cursor: 'pointer', flexShrink: 0, boxShadow: `0 0 0 2px ${circuit.color}44` }}
              title={t('circuitPanel.clickColor')}
              onClick={() => { const idx = PORT_COLORS.indexOf(circuit.color); setCircuitColor(circuit.id, PORT_COLORS[(idx + 1) % PORT_COLORS.length]); }}
            />
          </div>
          {renamingId === circuit.id ? (
            <input autoFocus className="input-sm" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} style={{ flex: 1, fontSize: 11 }} />
          ) : (
            <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: isActive ? 'var(--accent-bright)' : 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }} onDoubleClick={() => { setRenamingId(circuit.id); setRenameVal(circuit.name); }} onClick={() => setActiveCircuitId(isActive ? null : circuit.id)} title={t('circuitPanel.clickSelect')}>
              {circuit.name}
            </span>
          )}
          <select
            value={circuit.wallId ?? ''}
            onChange={(e) => { const wallId = e.target.value || null; if (isCircuitSel && selectedCircuitIds.size > 1) { batchAssignCircuitsToWall([...selectedCircuitIds], wallId); } else { assignCircuitToWall(circuit.id, wallId); } }}
            style={{ ...S.wallSelect, ...(isCircuitSel && selectedCircuitIds.size > 1 ? { borderColor: '#3b82f6', color: '#60a5fa' } : {}) }}
            title={isCircuitSel && selectedCircuitIds.size > 1 ? t('circuitPanel.applyToAllCircuits', { count: selectedCircuitIds.size }) : t('circuitPanel.assignWall')}
          >
            <option value="">{t('circuitPanel.wallPlaceholder')}</option>
            {walls.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {chainLen > 0 && (
            <span style={{ ...S.badge, background: circuit.color + '33', color: circuit.color, border: `1px solid ${circuit.color}55` }}>{chainLen}</span>
          )}
          <button className="btn-icon" title={isRouting ? t('circuitPanel.stopRouting') : circuit.wallId ? t('circuitPanel.startRouting') : t('circuitPanel.assignWallFirst')} style={{ color: isRouting ? '#ef4444' : circuit.wallId ? circuit.color : 'var(--text-muted)', fontSize: 13 }} onClick={() => isRouting ? stopRouting() : startRouting(circuit)} disabled={!isRouting && !circuit.wallId}>
            {isRouting ? '◼' : '▶'}
          </button>
          <button className="btn-icon" title={t('circuitPanel.deleteCircuit')} style={{ color: 'var(--danger)', fontSize: 11 }} onClick={() => deleteCircuit(circuit.id)}>✕</button>
        </div>

        {isActive && !isCollapsed && (
          <div style={{ marginTop: 8 }}>
            {isCircuitMode && (
              <div style={S.routingBanner}>
                <span style={{ color: circuit.color, fontWeight: 700 }}>{t('circuitPanel.routing')}</span>
                &ensp;{t('circuitPanel.routingHint')}
                <button className="btn-ghost" style={{ marginLeft: 'auto', fontSize: 10 }} onClick={stopRouting}>{t('circuitPanel.done')}</button>
              </div>
            )}
            {selectedTile && isCircuitMode && (
              <div style={S.quickAssign}>
                <span style={{ color: 'var(--text-muted)' }}>{t('circuitPanel.selected')}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedTile.name || `Tile ${selectedTile.tileNumber ?? '?'}`}</span>
                <button className="btn-primary" style={{ fontSize: 10, padding: '2px 8px', marginLeft: 'auto' }} onClick={() => assignTileToCircuit(selectedTile.id, circuit.id)}>
                  {circuit.tileIds.includes(selectedTile.id) ? t('circuitPanel.remove') : t('circuitPanel.add')}
                </button>
              </div>
            )}
            {chainLen > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span>{t('circuitPanel.chainTiles', { count: chainLen })}</span>
                  <PowerStats watts={circuitPower(activeCircuit!)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto' }}>
                  {circuit.tileIds.map((tid, idx) => {
                    const removed = !allTiles.find((t) => t.id === tid);
                    const label   = removed ? '(removed)' : chainLabel(circuit.tileIds, idx, allTiles, profileMap);
                    return (
                      <div key={tid} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 6px', background: 'var(--bg-elevated)', borderRadius: 4 }}>
                        <span style={{ fontSize: 10, color: circuit.color, fontFamily: 'monospace', fontWeight: 700, minWidth: 18 }}>{idx + 1}</span>
                        <span style={{ fontSize: 10, color: removed ? 'var(--text-muted)' : 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{label}</span>
                        <button className="btn-icon" style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 2px' }} onClick={() => removeTileFromCircuit(tid)} title={t('circuitPanel.removeFromCircuit')}>✕</button>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                  <button className="btn-secondary" style={{ fontSize: 10, padding: '3px 8px', flex: 1 }} onClick={() => reverseCircuitChain(circuit.id)}>{t('circuitPanel.reverse')}</button>
                  <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px', flex: 1, color: 'var(--danger)' }} onClick={() => clearCircuit(circuit.id)}>{t('circuitPanel.clear')}</button>
                </div>
              </div>
            )}
            {chainLen === 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 4 }}>
                {circuit.wallId ? t('circuitPanel.noTiles') : t('circuitPanel.noTilesAssignWall')}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, fontSize: 12 }}>

      {/* ── Header toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 6px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
          {t('circuitPanel.powerCircuits')}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn-icon"
            title="Add Soca Splay (6 circuits)"
            style={{ fontSize: 10, color: '#f97316', lineHeight: 1, padding: '2px 6px', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 4 }}
            onClick={() => addSocaSplay()}
          >⚡ Soca</button>
          <button
            className="btn-icon"
            title={t('circuitPanel.addCircuit')}
            style={{ fontSize: 12, color: 'var(--accent-bright)', lineHeight: 1, padding: '2px 6px', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 4, fontWeight: 700 }}
            onClick={() => { setAdding(true); setNewName(''); }}
          >+ 1</button>
        </div>
      </div>

      {/* ── Add circuit inline form ── */}
      {adding && (
        <div style={{ padding: '4px 14px 8px', display: 'flex', gap: 6 }}>
          <input
            autoFocus
            className="input-sm"
            placeholder={t('circuitPanel.circuitNamePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddCircuit();
              if (e.key === 'Escape') { setAdding(false); setNewName(''); }
            }}
            style={{ flex: 1, fontSize: 11 }}
          />
          <button className="btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={handleAddCircuit}>{t('circuitPanel.add')}</button>
          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setAdding(false)}>✕</button>
        </div>
      )}

      {circuits.length === 0 && !adding && (
        <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {t('circuitPanel.noCircuits')}
        </div>
      )}

      {/* ── Soca Splay groups ── */}
      {socas.map((soca: SocaSplay) => {
        const socaCircuits = circuits.filter((c) => c.socaId === soca.id);
        const isSocaCollapsed = collapsedSocas.has(soca.id);
        return (
          <div key={soca.id} style={{ borderTop: '1px solid var(--border-muted)' }}>
            {/* Soca header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(249,115,22,0.08)' }}>
              <button
                className="btn-icon"
                onClick={() => toggleSocaCollapse(soca.id)}
                style={{ fontSize: 8, color: 'var(--text-muted)', padding: 0, flexShrink: 0, width: 10 }}
              >
                {isSocaCollapsed ? '▶' : '▼'}
              </button>
              <span style={{ fontSize: 10, color: '#f97316', flexShrink: 0 }}>⚡</span>
              {renamingSocaId === soca.id ? (
                <input
                  autoFocus
                  className="input-sm"
                  value={renameSocaVal}
                  onChange={(e) => setRenameSocaVal(e.target.value)}
                  onBlur={commitSocaRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitSocaRename();
                    if (e.key === 'Escape') setRenamingSocaId(null);
                  }}
                  style={{ flex: 1, fontSize: 11 }}
                />
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span
                    style={{ fontSize: 11, fontWeight: 700, color: '#f97316', cursor: 'pointer', userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onDoubleClick={() => { setRenamingSocaId(soca.id); setRenameSocaVal(soca.name); }}
                    title="Double-click to rename"
                  >
                    {soca.name}
                  </span>
                  <span
                    style={{ fontSize: 9, fontWeight: 600, color: 'rgba(249,115,22,0.65)', cursor: 'pointer', userSelect: 'none', letterSpacing: '0.03em' }}
                    onClick={() => cycleSocaPowerType(soca)}
                    title="Click to change connector type"
                  >
                    {soca.powerType ?? 'Powercon'}
                  </span>
                </div>
              )}
              {/* Wall assignment — assigns all soca circuits at once */}
              <select
                value={socaCircuits[0]?.wallId ?? ''}
                onChange={(e) => {
                  const wallId = e.target.value || null;
                  batchAssignCircuitsToWall(socaCircuits.map((c) => c.id), wallId);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: 9, padding: '1px 3px', borderRadius: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', maxWidth: 80, flexShrink: 0 }}
                title="Assign all circuits in this Soca to a wall"
              >
                <option value="">— Wall —</option>
                {walls.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{socaCircuits.length}/6</span>
              <button
                className="btn-icon"
                title="Delete Soca Splay (deletes all circuits)"
                style={{ color: 'var(--danger)', fontSize: 11 }}
                onClick={() => deleteSoca(soca.id)}
              >✕</button>
            </div>
            {/* Soca circuits */}
            {!isSocaCollapsed && socaCircuits.map((circuit) => renderCircuitRow(circuit))}
          </div>
        );
      })}

      {/* ── Multi-select banner ── */}
      {selectedCircuitIds.size > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(59,130,246,0.12)', borderBottom: '1px solid rgba(59,130,246,0.25)', fontSize: 10 }}>
          <span style={{ color: '#60a5fa', fontWeight: 700 }}>{t('circuitPanel.circuitsSelected', { count: selectedCircuitIds.size })}</span>
          <span style={{ color: 'var(--text-muted)' }}>{t('circuitPanel.bulkChangeHint')}</span>
          <button
            onClick={() => setSelectedCircuitIds(new Set())}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: 0 }}
            title={t('portPanel.clearSelection')}
          >✕</button>
        </div>
      )}

      {/* ── Standalone circuit rows ── */}
      {standaloneCircuits.map((circuit) => renderCircuitRow(circuit))}

      {/* ── Summary ── */}
      {circuits.length > 0 && (() => {
        const totalPower = circuits.reduce((sum, c) => sum + circuitPower(c), 0);
        return (
          <div style={{ borderTop: '1px solid var(--border-muted)', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 2 }}>{t('circuitPanel.summary')}</div>
            {circuits.map((c) => {
              const power = circuitPower(c);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, display: 'inline-block', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>{c.name}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {t('circuitPanel.summaryTiles', { count: c.tileIds.length })}
                      {c.wallId ? '' : ` ${t('circuitPanel.summaryUnassigned')}`}
                    </span>
                  </div>
                  <PowerStats watts={power} />
                </div>
              );
            })}
            {totalPower > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderTop: '1px solid var(--border-muted)', paddingTop: 6, marginTop: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>{t('circuitPanel.total')}</span>
                <PowerStats watts={totalPower} />
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wallSelect: {
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text-secondary)',
    fontSize: 10,
    padding: '2px 4px',
    maxWidth: 80,
  },
  badge: {
    display: 'inline-block',
    borderRadius: 4,
    padding: '1px 5px',
    fontSize: 10,
    fontWeight: 700,
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  routingBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 5,
    padding: '5px 8px',
    fontSize: 10,
    marginBottom: 6,
  },
  quickAssign: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--bg-elevated)',
    borderRadius: 5,
    padding: '4px 8px',
    fontSize: 10,
    marginBottom: 4,
  },
};

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore, PortDisplay } from '../store/useProjectStore';
import { useLicenseStore } from '../license/licenseStore';
import { UpgradeModal } from './ProGate';
import { PORT_COLORS, ProcessorPort, Processor, TileProfile } from '../types';
import { PROCESSOR_LIBRARY, groupedLibrary, ProcessorLibraryEntry } from '../processorLibrary';

const portLabel = (portName: string, chainPos: number) => `${portName}${chainPos}`;

function fmtPx(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString()}K`;
  return n.toLocaleString();
}

/** O(1) per tile — requires precomputed tilePixelMap passed from component */
function portPixelUsage(
  port: ProcessorPort,
  tilePixelMap: Map<string, number>,
): number {
  return port.tileIds.reduce((sum, tid) => sum + (tilePixelMap.get(tid) ?? 0), 0);
}

function CapacityBar({
  used, capacity, color, showNumbers = true,
}: { used: number; capacity: number; color: string; showNumbers?: boolean }) {
  const { t } = useTranslation();
  const pct      = Math.min(100, (used / capacity) * 100);
  const isOver   = used >= capacity;
  const isWarn   = pct >= 80;
  const barColor = isOver ? 'var(--danger)' : isWarn ? 'var(--warning)' : color;
  return (
    <div style={SB.wrap}>
      <div style={SB.track}>
        <div style={{ ...SB.fill, width: `${pct}%`, background: barColor, boxShadow: isOver ? `0 0 4px ${barColor}` : undefined }} />
      </div>
      {showNumbers && (
        <span style={{ ...SB.label, color: isOver ? 'var(--danger)' : isWarn ? 'var(--warning)' : 'var(--text-muted)' }}>
          {fmtPx(used)}&thinsp;/&thinsp;{fmtPx(capacity)} px
          {isOver && <span style={{ marginLeft: 4, fontWeight: 800 }}>{t('portPanel.full')}</span>}
        </span>
      )}
    </div>
  );
}

const SB: Record<string, React.CSSProperties> = {
  wrap:  { display: 'flex', flexDirection: 'column', gap: 2, width: '100%' },
  track: { height: 5, borderRadius: 3, background: 'var(--bg-hover)', overflow: 'hidden', width: '100%' },
  fill:  { height: '100%', borderRadius: 3, transition: 'width 0.2s, background 0.2s' },
  label: { fontSize: 9, fontWeight: 600, fontFamily: 'monospace', letterSpacing: '-0.01em' },
};

export default function PortPanel() {
  const { t } = useTranslation();
  const project         = useProjectStore((s) => s.project);
  const setBitDepth     = useProjectStore((s) => s.setBitDepth);
  const activePortId    = useProjectStore((s) => s.activePortId);
  const appMode         = useProjectStore((s) => s.appMode);
  const portDisplay     = useProjectStore((s) => s.portDisplay);
  const selectedTileIds = useProjectStore((s) => s.selectedTileIds);

  const addProcessor            = useProjectStore((s) => s.addProcessor);
  const addProcessorFromLibrary = useProjectStore((s) => s.addProcessorFromLibrary);
  const addXDBoxToProcessor      = useProjectStore((s) => s.addXDBoxToProcessor);
  const removeXDBoxFromProcessor = useProjectStore((s) => s.removeXDBoxFromProcessor);
  const renameProcessor         = useProjectStore((s) => s.renameProcessor);
  const renameProcessorBox      = useProjectStore((s) => s.renameProcessorBox);
  const deleteProcessor         = useProjectStore((s) => s.deleteProcessor);
  const addPortToProcessor      = useProjectStore((s) => s.addPortToProcessor);
  const removePortFromProcessor = useProjectStore((s) => s.removePortFromProcessor);
  const assignPortToWall        = useProjectStore((s) => s.assignPortToWall);
  const renamePort              = useProjectStore((s) => s.renamePort);
  const setPortColor            = useProjectStore((s) => s.setPortColor);
  const clearPort               = useProjectStore((s) => s.clearPort);
  const reversePortChain        = useProjectStore((s) => s.reversePortChain);
  const setActivePortId         = useProjectStore((s) => s.setActivePortId);
  const setAppMode              = useProjectStore((s) => s.setAppMode);
  const setActiveWall           = useProjectStore((s) => s.setActiveWall);
  const setPortDisplay          = useProjectStore((s) => s.setPortDisplay);
  const removeTileFromPort          = useProjectStore((s) => s.removeTileFromPort);
  const assignTileToPort            = useProjectStore((s) => s.assignTileToPort);
  const batchAssignPortsToWall      = useProjectStore((s) => s.batchAssignPortsToWall);

  const isPro = useLicenseStore((s) => s.isPro);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [renamingProcessorId, setRenamingProcessorId] = useState<string | null>(null);
  const [renamingPortId, setRenamingPortId]           = useState<string | null>(null);
  const [renamingBoxKey, setRenamingBoxKey]           = useState<string | null>(null);
  const [renameVal, setRenameVal]                     = useState('');
  const [selectedPortIds, setSelectedPortIds]         = useState<Set<string>>(new Set());

  const togglePortSel = (portId: string) =>
    setSelectedPortIds((prev) => { const s = new Set(prev); s.has(portId) ? s.delete(portId) : s.add(portId); return s; });
  const [addingProcessor, setAddingProcessor]         = useState(false);
  const [newProcName, setNewProcName]                 = useState('');
  const [selectedModel, setSelectedModel]             = useState<ProcessorLibraryEntry | null>(null);
  const [xdBoxCount, setXdBoxCount]                   = useState(1);
  // collapse state: Set of collapsed processor ids, and "procId:boxIdx" for XD box groups
  const [expandedProcs, setExpandedProcs]             = useState<Set<string>>(new Set());
  const [expandedXD, setExpandedXD]                   = useState<Set<string>>(new Set());
  const [summaryCollapsed, setSummaryCollapsed]       = useState(false);

  const toggleProc = (id: string) =>
    setExpandedProcs((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleXD = (key: string) =>
    setExpandedXD((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  if (!project) return null;

  const processors = project.processors ?? [];
  const walls      = project.walls;

  // ── Memoized lookups ──────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const profileMap = useMemo(
    () => new Map(project.tileProfiles.map((p) => [p.id, p])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.tileProfiles]
  );

  // Precomputed tile pixel counts — O(1) lookup replaces O(n) wall+tile find
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const tilePixelMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const wall of project.walls) {
      for (const tile of wall.tiles) {
        const prof = profileMap.get(tile.profileId);
        if (prof) m.set(tile.id, prof.pixelWidth * prof.pixelHeight);
      }
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.walls, profileMap]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { activePort, activeProcessor } = useMemo(() => {
    for (const proc of processors) {
      const found = proc.ports.find((p) => p.id === activePortId);
      if (found) return { activePort: found, activeProcessor: proc };
    }
    return { activePort: null as ProcessorPort | null, activeProcessor: null as Processor | null };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processors, activePortId]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const activeWall = useMemo(
    () => project.walls.find((w) => w.id === project.activeWallId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.walls, project.activeWallId]
  );

  const selectedTile = selectedTileIds.length === 1
    ? (activeWall?.tiles.find((t) => t.id === selectedTileIds[0]) ?? null) : null;

  /** 10-bit mode halves effective pixel capacity per port */
  const capMult = (project.bitDepth ?? '8bit') === '10bit' ? 0.5 : 1;
  /** Returns the effective pixel capacity of a port, accounting for bit depth */
  const effCap = (cap: number | undefined) => cap !== undefined ? Math.floor(cap * capMult) : undefined;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { totalPorts, totalAssigned, totalTilesAllWalls } = useMemo(() => ({
    totalPorts:       processors.reduce((s, p) => s + p.ports.length, 0),
    totalAssigned:    processors.reduce((s, proc) => s + proc.ports.reduce((ps, p) => ps + p.tileIds.length, 0), 0),
    totalTilesAllWalls: project.walls.reduce((s, w) => s + w.tiles.length, 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [processors, project.walls]);

  const selectedTileProfile = selectedTile ? profileMap.get(selectedTile.profileId) : null;
  const selectedTilePixels  = selectedTileProfile
    ? selectedTileProfile.pixelWidth * selectedTileProfile.pixelHeight : 0;
  const activePortUsed = activePort ? portPixelUsage(activePort, tilePixelMap) : 0;
  const activePortEffCap = effCap(activePort?.pixelCapacity);
  const activePortFull = !!(
    activePortEffCap !== undefined && selectedTile &&
    !activePort!.tileIds.includes(selectedTile.id) &&
    activePortUsed + selectedTilePixels > activePortEffCap
  );

  const startRouting = (port: ProcessorPort) => {
    const wallId = port.wallId ?? project!.activeWallId;
    if (!wallId) return;
    if (!port.wallId) assignPortToWall(port.id, wallId);
    setActiveWall(wallId);
    setActivePortId(port.id);
    setAppMode('port-routing');
  };
  const stopRouting = () => { setAppMode('select'); setActivePortId(null); };

  const commitProcessorRename = () => {
    if (renamingProcessorId && renameVal.trim()) renameProcessor(renamingProcessorId, renameVal.trim());
    setRenamingProcessorId(null);
  };
  const commitPortRename = () => {
    if (renamingPortId && renameVal.trim()) renamePort(renamingPortId, renameVal.trim());
    setRenamingPortId(null);
  };
  const commitBoxRename = () => {
    if (renamingBoxKey && renameVal.trim()) {
      const [procId, boxIdxStr] = renamingBoxKey.split(':');
      renameProcessorBox(procId, parseInt(boxIdxStr, 10), renameVal.trim());
    }
    setRenamingBoxKey(null);
  };

  const handleModelSelect = (modelName: string) => {
    if (!modelName) { setSelectedModel(null); setNewProcName(''); setXdBoxCount(1); return; }
    const model = PROCESSOR_LIBRARY.find((m) => m.name === modelName) ?? null;
    setSelectedModel(model);
    setNewProcName(model?.name ?? '');
    setXdBoxCount(1);
  };

  const handleAddProcessor = () => {
    if (selectedModel) {
      const name = newProcName.trim() || selectedModel.name;
      addProcessorFromLibrary(
        name !== selectedModel.name ? { ...selectedModel, name } : selectedModel,
        selectedModel.xdExpander ? xdBoxCount : undefined,
      );
    } else {
      addProcessor(newProcName.trim() || `Controller ${processors.length + 1}`);
    }
    setAddingProcessor(false); setNewProcName(''); setSelectedModel(null); setXdBoxCount(1);
  };
  const cancelAddProcessor = () => {
    setAddingProcessor(false); setNewProcName(''); setSelectedModel(null); setXdBoxCount(1);
  };

  const grouped = groupedLibrary();

  // ── Render a single port row (shared between flat + XD-grouped layouts) ──
  const renderPortRow = (port: ProcessorPort, proc: Processor) => {
    const isActive     = port.id === activePortId;
    const isRouting    = isActive && appMode === 'port-routing';
    const assignedWall = walls.find((w) => w.id === port.wallId);
    const tileCount    = port.tileIds.length;
    const portEffCap   = effCap(port.pixelCapacity);
    const usedPx       = portEffCap !== undefined ? portPixelUsage(port, tilePixelMap) : 0;
    const pctFull      = portEffCap !== undefined ? usedPx / portEffCap : 0;
    const isPortFull   = portEffCap !== undefined ? usedPx >= portEffCap : false;
    const isPortSel    = selectedPortIds.has(port.id);

    return (
      <div
        key={port.id}
        style={{
          ...S.portRow,
          ...(isActive  ? S.portRowActive : {}),
          ...(isPortSel ? { background: 'rgba(59,130,246,0.1)', outline: '1px solid rgba(59,130,246,0.35)', outlineOffset: '-1px' } : {}),
          borderLeft: `3px solid ${port.color}`,
        }}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey) { e.stopPropagation(); togglePortSel(port.id); return; }
          if (!isActive && !port.wallId && project!.activeWallId) {
            assignPortToWall(port.id, project!.activeWallId);
          }
          setActivePortId(isActive ? null : port.id);
        }}
      >
        <div style={S.portRowControls}>
          <button
            style={{ ...S.colorDot, background: port.color }}
            title={t('portPanel.clickColor')}
            onClick={(e) => {
              e.stopPropagation();
              const next = PORT_COLORS[(PORT_COLORS.indexOf(port.color) + 1) % PORT_COLORS.length];
              setPortColor(port.id, next);
            }}
          />

          {renamingPortId === port.id ? (
            <input
              autoFocus
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value.toUpperCase())}
              onBlur={commitPortRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitPortRename(); if (e.key === 'Escape') setRenamingPortId(null); e.stopPropagation(); }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: 42, fontSize: 12, fontWeight: 700, padding: '1px 3px', textTransform: 'uppercase' }}
              maxLength={5}
            />
          ) : (
            <span
              style={S.portName}
              onDoubleClick={(e) => { e.stopPropagation(); setRenamingPortId(port.id); setRenameVal(port.name); }}
              title={t('portPanel.doubleClickRename')}
            >
              {port.name}
            </span>
          )}

          <select
            value={port.wallId ?? ''}
            onChange={(e) => {
              e.stopPropagation();
              const wallId = e.target.value || null;
              if (isPortSel && selectedPortIds.size > 1) {
                batchAssignPortsToWall([...selectedPortIds], wallId);
              } else {
                assignPortToWall(port.id, wallId);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ ...S.wallSelect, ...(isPortSel && selectedPortIds.size > 1 ? { borderColor: '#3b82f6', color: '#60a5fa' } : {}) }}
            title={isPortSel && selectedPortIds.size > 1 ? t('portPanel.applyToAllPorts', { count: selectedPortIds.size }) : t('portPanel.assignPortToWall')}
          >
            <option value="">{t('portPanel.unassigned')}</option>
            {walls.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>

          <span style={{ ...S.countBadge, ...(isActive ? { background: `${port.color}30`, color: port.color } : {}) }}>
            {tileCount > 0 ? `${portLabel(port.name, 1)}–${portLabel(port.name, tileCount)}` : '—'}
          </span>

          {isPortFull && <span style={S.fullBadge} title={t('portPanel.atCapacity')}>{t('portPanel.full')}</span>}

          <button
            style={{ ...S.routeBtn, ...(isRouting ? { background: `${port.color}30`, color: port.color, borderColor: port.color } : {}) }}
            title={isRouting ? t('portPanel.stopRouting') : port.wallId ? t('portPanel.routeTilesOn', { wall: assignedWall?.name ?? 'wall' }) : t('portPanel.routeTilesOn', { wall: activeWall?.name ?? 'wall' })}
            onClick={(e) => { e.stopPropagation(); if (isRouting) stopRouting(); else startRouting(port); }}
          >
            {isRouting ? '◼' : '▶'}
          </button>

          {!proc.fromLibrary && (
            <button
              className="btn-icon"
              style={{ color: 'var(--danger)', fontSize: 10, flexShrink: 0 }}
              title={t('portPanel.removePort')}
              onClick={(e) => { e.stopPropagation(); removePortFromProcessor(proc.id, port.id); }}
            >
              ✕
            </button>
          )}
        </div>

        {portEffCap !== undefined && (
          <div style={{ paddingTop: 3, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <CapacityBar used={usedPx} capacity={portEffCap} color={port.color} showNumbers={pctFull > 0 || isActive} />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* ── Processors header ── */}
      <div className="sh">
        <span className="sh-dot" style={{ background: '#ef4444' }} />
        {t('portPanel.processors')}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          {/* Bit depth toggle */}
          <div style={{ display: 'flex', borderRadius: 4, border: '1px solid var(--border)', overflow: 'hidden' }} title={t('portPanel.bitDepthHint')}>
            {(['8bit', '10bit'] as const).map((d) => {
              const is10bit = d === '10bit';
              const locked  = is10bit && !isPro;
              return (
                <button
                  key={d}
                  onClick={locked ? () => setShowUpgrade(true) : () => setBitDepth(d)}
                  title={locked ? 'Pro feature' : undefined}
                  style={{
                    padding: '2px 7px',
                    fontSize: 10,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: (!locked && (project.bitDepth ?? '8bit') === d) ? 'var(--accent)' : 'transparent',
                    color: locked ? 'var(--text-muted)' : ((project.bitDepth ?? '8bit') === d ? '#fff' : 'var(--text-muted)'),
                    letterSpacing: '0.01em',
                    opacity: locked ? 0.5 : 1,
                  }}
                >
                  {d}{locked && ' 🔒'}
                </button>
              );
            })}
          </div>
          {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
          <button onClick={() => setAddingProcessor(true)} style={S.addBtn} title={t('portPanel.addNew')}>
            {t('portPanel.addPort')}
          </button>
        </div>
      </div>

      {/* Add processor inline form */}
      {addingProcessor && (
        <div style={S.inlineForm}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
            <select
              value={selectedModel?.name ?? ''}
              onChange={(e) => handleModelSelect(e.target.value)}
              style={{ ...S.inlineInput, color: selectedModel ? 'var(--text-primary)' : 'var(--text-muted)' }}
            >
              <option value="">{t('portPanel.customManual')}</option>
              {Object.entries(grouped).map(([category, entries]) => (
                <optgroup key={category} label={category}>
                  {entries.map((e) => {
                    const procLocked = !isPro && e.name !== 'MCTRL4K';
                    return (
                      <option key={e.name} value={e.name} disabled={procLocked}>
                        {procLocked
                          ? `🔒 ${e.name} — Pro only`
                          : e.xdExpander
                            ? `${e.name} (${e.xdExpander.maxBoxes} ${e.xdExpander.expanderLabel ?? 'XD Box'}es · ${e.xdExpander.portsPerBox} ports/unit)`
                            : `${e.name} (${e.rj45Ports} ports · ${fmtPx(e.perPortCapacity)} px/port)`}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>

            {/* Standard model info */}
            {selectedModel && !selectedModel.xdExpander && (
              <div style={S.modelInfo}>
                <span style={{ color: 'var(--accent-bright)', fontWeight: 700 }}>{selectedModel.rj45Ports} ports</span>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span>{fmtPx(selectedModel.perPortCapacity)} px/port</span>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span>{fmtPx(selectedModel.totalCapacity)} px total</span>
              </div>
            )}

            {/* SX40 XD box count picker */}
            {selectedModel?.xdExpander && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={S.modelInfo}>
                  <span style={{ color: 'var(--accent-bright)', fontWeight: 700 }}>{selectedModel.xdExpander.expanderLabel ?? 'XD Box'} Expander</span>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                  <span>{selectedModel.xdExpander.portsPerBox} ports/unit</span>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                  <span>{fmtPx(selectedModel.xdExpander.portCapacity)} px/port</span>
                </div>
                <div style={{ ...S.modelInfo, alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{selectedModel.xdExpander.expanderLabel ?? 'XD Box'}es:</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: selectedModel.xdExpander.maxBoxes }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        onClick={() => setXdBoxCount(n)}
                        style={{
                          width: 26, height: 22, fontSize: 11, fontWeight: 700,
                          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                          border: xdBoxCount === n ? '2px solid var(--accent-bright)' : '1px solid var(--border)',
                          background: xdBoxCount === n ? 'var(--accent-dim)' : 'var(--bg-base)',
                          color: xdBoxCount === n ? 'var(--accent-bright)' : 'var(--text-muted)',
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                    = {xdBoxCount * selectedModel.xdExpander.portsPerBox} ports
                    &ensp;·&ensp;
                    {fmtPx(xdBoxCount * selectedModel.xdExpander.portsPerBox * selectedModel.xdExpander.portCapacity)} px total
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <input
                autoFocus={!selectedModel}
                placeholder={selectedModel ? selectedModel.name : `Controller ${processors.length + 1}`}
                value={newProcName}
                onChange={(e) => setNewProcName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddProcessor(); if (e.key === 'Escape') cancelAddProcessor(); }}
                style={{ ...S.inlineInput, flex: 1 }}
              />
              <button
                className="btn-primary"
                style={{ fontSize: 10, padding: '3px 8px', flexShrink: 0 }}
                onClick={(!isPro && selectedModel && selectedModel.name !== 'MCTRL4K') ? () => setShowUpgrade(true) : handleAddProcessor}
              >
                {(!isPro && selectedModel && selectedModel.name !== 'MCTRL4K') ? '🔒 Pro' : t('portPanel.createBtn')}
              </button>
              <button className="btn-icon" style={{ fontSize: 10, flexShrink: 0 }} onClick={cancelAddProcessor}>
                {t('portPanel.cancelBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {processors.length === 0 && !addingProcessor && (
        <div className="sb">
          <p style={S.emptyHint}>
            {t('portPanel.noProcessors')}<br />
            <span style={{ fontSize: 10 }}>{t('portPanel.noProcessorsHint')}</span>
          </p>
        </div>
      )}

      {/* ── Multi-select banner (shown when ports are Ctrl+clicked) ── */}
      {selectedPortIds.size > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(59,130,246,0.12)', borderBottom: '1px solid rgba(59,130,246,0.25)', fontSize: 10 }}>
          <span style={{ color: '#60a5fa', fontWeight: 700 }}>{t('portPanel.portsSelected', { count: selectedPortIds.size })}</span>
          <span style={{ color: 'var(--text-muted)' }}>{t('portPanel.changeWallHint')}</span>
          <button
            onClick={() => setSelectedPortIds(new Set())}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: 0 }}
            title={t('portPanel.clearSelection')}
          >✕</button>
        </div>
      )}

      {/* ── Processor list ── */}
      {processors.map((proc) => {
        const isXD       = !!(proc.xdBoxCount && proc.xdBoxSize);
        const isCollapsed = !expandedProcs.has(proc.id);
        return (
          <div key={proc.id} style={S.processorBlock}>

            {/* Processor header */}
            <div style={{ ...S.procHeader, cursor: 'pointer' }} onClick={() => toggleProc(proc.id)}>
              <span style={S.collapseArrow}>{isCollapsed ? '▶' : '▼'}</span>
              <span style={S.procIcon}>{isXD ? '◈' : '⬡'}</span>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                {renamingProcessorId === proc.id ? (
                  <input
                    autoFocus
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={commitProcessorRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitProcessorRename(); if (e.key === 'Escape') setRenamingProcessorId(null); e.stopPropagation(); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ ...S.inlineInput, fontSize: 12 }}
                  />
                ) : (
                  <span
                    style={S.procName}
                    onDoubleClick={(e) => { e.stopPropagation(); setRenamingProcessorId(proc.id); setRenameVal(proc.name); }}
                    title={t('portPanel.doubleClickRename')}
                  >
                    {proc.name}
                  </span>
                )}
                {isXD
                  ? <span style={S.procPortCount}>{proc.xdBoxCount} {proc.expanderLabel ?? 'XD Box'}{proc.xdBoxCount !== 1 ? 'es' : ''} · {proc.ports.length} ports</span>
                  : <span style={S.procPortCount}>{proc.ports.length} port{proc.ports.length !== 1 ? 's' : ''}</span>
                }
              </div>

              <button
                className="btn-icon"
                style={{ color: 'var(--danger)', fontSize: 11, flexShrink: 0 }}
                title={t('portPanel.deleteProcessor')}
                onClick={(e) => { e.stopPropagation(); deleteProcessor(proc.id); }}
              >
                ✕
              </button>
            </div>

            {/* Port rows — hidden when processor is collapsed */}
            {!isCollapsed && proc.ports.length > 0 && (
              <div style={S.portList}>

                {/* ── Batch-assign wall dropdown (non-XD processors) ── */}
                {!isXD && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px', borderBottom: '1px solid var(--border-muted)' }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>{t('portPanel.allPortsLabel')}</span>
                    <select
                      value=""
                      onChange={(e) => { e.stopPropagation(); batchAssignPortsToWall(proc.ports.map((p) => p.id), e.target.value || null); }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ ...S.wallSelect, flex: 1 }}
                      title={t('portPanel.assignAllPorts')}
                    >
                      <option value="" disabled>{t('portPanel.assignAllToWall')}</option>
                      {walls.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                )}

                {isXD
                  ? Array.from({ length: proc.xdBoxCount! }, (_, boxIdx) => {
                      const xdKey    = `${proc.id}:${boxIdx}`;
                      const xdCollapsed = !expandedXD.has(xdKey);
                      const boxPorts = proc.ports.slice(boxIdx * proc.xdBoxSize!, (boxIdx + 1) * proc.xdBoxSize!);
                      const boxUsed  = boxPorts.reduce((sum, p) => sum + portPixelUsage(p, tilePixelMap), 0);
                      const boxCap   = boxPorts.reduce((sum, p) => sum + (effCap(p.pixelCapacity) ?? 0), 0);
                      return (
                        <div key={boxIdx} style={S.xdBoxGroup}>
                          <div style={{ ...S.xdBoxHeader, flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }} onClick={() => renamingBoxKey !== xdKey && toggleXD(xdKey)}>
                            {/* Row 1: collapse arrow + title + delete */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={S.collapseArrow}>{xdCollapsed ? '▶' : '▼'}</span>
                              {renamingBoxKey === xdKey ? (
                                <input
                                  autoFocus
                                  value={renameVal}
                                  onChange={(e) => setRenameVal(e.target.value)}
                                  onBlur={commitBoxRename}
                                  onKeyDown={(e) => { if (e.key === 'Enter') commitBoxRename(); if (e.key === 'Escape') setRenamingBoxKey(null); e.stopPropagation(); }}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ ...S.inlineInput, flex: 1, fontSize: 11 }}
                                />
                              ) : (
                                <span
                                  style={{ ...S.xdBoxLabel, flex: 1 }}
                                  onDoubleClick={(e) => { e.stopPropagation(); setRenamingBoxKey(xdKey); setRenameVal(proc.boxNames?.[boxIdx] ?? `${proc.expanderLabel ?? 'XD Box'} ${boxIdx + 1}`); }}
                                  title={t('portPanel.doubleClickRename')}
                                >
                                  {proc.boxNames?.[boxIdx] ?? `${proc.expanderLabel ?? 'XD Box'} ${boxIdx + 1}`}
                                </span>
                              )}
                              <button
                                className="btn-icon"
                                style={{ color: 'var(--danger)', fontSize: 10, flexShrink: 0 }}
                                title={`Remove ${proc.boxNames?.[boxIdx] ?? `${proc.expanderLabel ?? 'XD Box'} ${boxIdx + 1}`}`}
                                onClick={(e) => { e.stopPropagation(); removeXDBoxFromProcessor(proc.id, boxIdx); }}
                              >✕</button>
                            </div>
                            {/* Row 2: wall dropdown + px usage */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }} onClick={(e) => e.stopPropagation()}>
                              <select
                                value=""
                                onChange={(e) => { e.stopPropagation(); batchAssignPortsToWall(boxPorts.map((p) => p.id), e.target.value || null); }}
                                onClick={(e) => e.stopPropagation()}
                                style={{ ...S.wallSelect, fontSize: 9, flex: 1 }}
                                title={`Assign all ports in this ${proc.expanderLabel ?? 'XD Box'} to a wall`}
                              >
                                <option value="" disabled>all → wall…</option>
                                {walls.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                              </select>
                              {boxCap > 0 && (
                                <span style={{ fontSize: 9, fontFamily: 'monospace', flexShrink: 0, color: boxUsed >= boxCap ? 'var(--danger)' : 'var(--text-muted)' }}>
                                  {fmtPx(boxUsed)}&thinsp;/&thinsp;{fmtPx(boxCap)} px
                                </span>
                              )}
                            </div>
                          </div>
                          {!xdCollapsed && boxPorts.map((port) => renderPortRow(port, proc))}
                        </div>
                      );
                    })
                  : proc.ports.map((port) => renderPortRow(port, proc))
                }
              </div>
            )}

            {/* Footer: XD processors show "Add XD Box", others show "Add Port" */}
            {!isCollapsed && isXD ? (
              <button
                style={{ ...S.addPortBtn, color: proc.xdBoxCount! >= (proc.xdMaxBoxes ?? 4) ? 'var(--text-muted)' : 'var(--accent-bright)' }}
                onClick={() => addXDBoxToProcessor(proc.id)}
                disabled={proc.xdBoxCount! >= (proc.xdMaxBoxes ?? 4)}
                title={proc.xdBoxCount! >= (proc.xdMaxBoxes ?? 4)
                  ? `Maximum ${proc.xdMaxBoxes ?? 4} ${proc.expanderLabel ?? 'XD Box'}es`
                  : `Add ${proc.expanderLabel ?? 'XD Box'} ${proc.xdBoxCount! + 1}`}
              >
                {proc.xdBoxCount! >= (proc.xdMaxBoxes ?? 4)
                  ? `⊘ Max ${proc.expanderLabel ?? 'XD Box'}es (${proc.xdMaxBoxes ?? 4}/${proc.xdMaxBoxes ?? 4})`
                  : `+ Add ${proc.expanderLabel ?? 'XD Box'} (${proc.xdBoxCount}/${proc.xdMaxBoxes ?? 4})`}
              </button>
            ) : !isCollapsed && !proc.fromLibrary ? (
              <button
                style={S.addPortBtn}
                onClick={(e) => { e.stopPropagation(); addPortToProcessor(proc.id); }}
                title={t('portPanel.addPortToProcessor')}
              >
                {t('portPanel.addPortBtn')}
              </button>
            ) : null}
          </div>
        );
      })}

      {/* ── Active port detail ── */}
      {activePort && (
        <>
          <div className="sh" style={{ marginTop: 4 }}>
            <span className="sh-dot" style={{ background: activePort.color, boxShadow: `0 0 6px ${activePort.color}` }} />
            {t('portPanel.portHeading', { name: activePort.name })}
            {activePort.wallId && (
              <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                — {walls.find((w) => w.id === activePort!.wallId)?.name ?? 'wall'}
              </span>
            )}
            {appMode === 'port-routing' && (
              <span style={{ marginLeft: 4, fontSize: 10, color: activePort.color, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                {t('portPanel.routing')}
              </span>
            )}
          </div>

          <div className="sb" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activePortEffCap !== undefined && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>
                  {t('portPanel.pixelCapacity')}
                </div>
                <CapacityBar used={activePortUsed} capacity={activePortEffCap} color={activePort.color} showNumbers />
              </div>
            )}

            {!activePort.wallId ? (
              <p style={S.emptyHint}>
                {t('portPanel.assignWallFirst')}<br />
                <span style={{ fontSize: 10 }}>{t('portPanel.assignWallFirstHint')}</span>
              </p>
            ) : activePort.tileIds.length === 0 ? (
              <p style={S.emptyHint}>
                {t('portPanel.noTilesAssigned')}<br />
                <span style={{ fontSize: 10 }}>{t('portPanel.noTilesHint')}</span>
              </p>
            ) : (
              <div style={S.chainList}>
                {activePort.tileIds.map((tid, idx) => {
                  const wallForPort = project.walls.find((w) => w.id === activePort!.wallId);
                  const tile        = wallForPort?.tiles.find((t) => t.id === tid);
                  const tileProfile = tile ? profileMap.get(tile.profileId) : null;
                  const tilePx      = tileProfile ? tileProfile.pixelWidth * tileProfile.pixelHeight : 0;
                  const label       = portLabel(activePort!.name, idx + 1);
                  return (
                    <div key={tid} style={S.chainItem}>
                      <span style={{ ...S.chainBadge, background: activePort!.color }}>{label}</span>
                      <span style={S.chainName}>
                        {tile?.name ?? <em style={{ color: 'var(--danger)', fontSize: 10 }}>{t('portPanel.removedTile')}</em>}
                      </span>
                      {tilePx > 0 && <span style={S.chainPx}>{tilePx.toLocaleString()}</span>}
                      <button
                        className="btn-icon"
                        style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}
                        title={`Remove ${label} from chain`}
                        onClick={() => removeTileFromPort(tid)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedTile && activePort.wallId === project.activeWallId && selectedTile.portId !== activePort.id && (
              activePortFull ? (
                <div style={S.capacityWarning}>
                  {t('portPanel.atCapacityDetail', { name: activePort.name, max: fmtPx(activePortEffCap!) })}<br />
                  <span style={{ fontSize: 10 }}>
                    {t('portPanel.overLimitHint', { tilePx: selectedTilePixels.toLocaleString(), over: (activePortUsed + selectedTilePixels - activePortEffCap!).toLocaleString() })}
                  </span>
                </div>
              ) : (
                <button
                  className="btn-secondary"
                  style={S.actionBtn}
                  onClick={() => assignTileToPort(selectedTile.id, activePort!.id)}
                >
                  {t('portPanel.assignSelectedTile', { name: activePort.name })}
                  {selectedTilePixels > 0 && activePortEffCap !== undefined && (
                    <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>
                      (+{selectedTilePixels.toLocaleString()} px)
                    </span>
                  )}
                </button>
              )
            )}

            {activePort.wallId && (
              <div style={{ display: 'flex', gap: 5 }}>
                <button className="btn-secondary" style={S.actionBtn} onClick={() => reversePortChain(activePort!.id)} disabled={activePort.tileIds.length < 2}>
                  {t('portPanel.reverse')}
                </button>
                <button className="btn-secondary" style={S.actionBtn} onClick={() => clearPort(activePort!.id)} disabled={activePort.tileIds.length === 0}>
                  {t('portPanel.clearAll')}
                </button>
              </div>
            )}

            <div className="stat-row">
              <span className="stat-label">{t('portPanel.tilesInChain')}</span>
              <span className="stat-value" style={{ color: activePort.color }}>{activePort.tileIds.length}</span>
            </div>
            {activePortEffCap !== undefined && (
              <div className="stat-row">
                <span className="stat-label">{t('portPanel.pixelsUsed')}</span>
                <span className="stat-value" style={{ color: activePortUsed >= activePortEffCap ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {activePortUsed.toLocaleString()}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / {activePortEffCap.toLocaleString()}</span>
                </span>
              </div>
            )}
            {activePort.tileIds.length > 0 && (
              <div className="stat-row">
                <span className="stat-label">{t('portPanel.range')}</span>
                <span className="stat-value" style={{ fontFamily: 'monospace' }}>
                  {portLabel(activePort.name, 1)} – {portLabel(activePort.name, activePort.tileIds.length)}
                </span>
              </div>
            )}
            <div className="stat-row">
              <span className="stat-label">{t('portPanel.processor')}</span>
              <span className="stat-value">{activeProcessor?.name ?? '—'}</span>
            </div>
          </div>
        </>
      )}

      {/* ── Routing display toggles ── */}
      <div className="sh">
        <span className="sh-dot" style={{ background: 'var(--text-muted)' }} />
        {t('portPanel.routingDisplay')}
      </div>
      <div className="sb" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {(
          [
            { key: 'showPaths',        labelKey: 'portPanel.routingConnectionPaths' },
            { key: 'showArrows',       labelKey: 'portPanel.routingDirectionArrows' },
            { key: 'showMarkers',      labelKey: 'portPanel.routingStartEndMarkers' },
            { key: 'showChainNumbers', labelKey: 'portPanel.routingChainLabels'     },
          ] as { key: keyof PortDisplay; labelKey: string }[]
        ).map(({ key, labelKey }) => (
          <label key={key} className="toggle-row">
            <input type="checkbox" checked={portDisplay[key]} onChange={(e) => setPortDisplay({ [key]: e.target.checked })} />
            {t(labelKey)}
          </label>
        ))}
      </div>

      {/* ── Summary ── */}
      {totalPorts > 0 && (
        <>
          <div className="sh" style={{ cursor: 'pointer' }} onClick={() => setSummaryCollapsed((v) => !v)}>
            <span style={S.collapseArrow}>{summaryCollapsed ? '▶' : '▼'}</span>
            <span className="sh-dot" style={{ background: 'var(--text-muted)' }} />
            {t('portPanel.summary')}
          </div>
          {!summaryCollapsed && <div className="sb" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {processors.map((proc) => (
              <div key={proc.id} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  {proc.name}
                </div>
                {proc.ports.map((port) => {
                  const wallName    = walls.find((w) => w.id === port.wallId)?.name;
                  const summEffCap  = effCap(port.pixelCapacity);
                  const usedPx      = summEffCap !== undefined ? portPixelUsage(port, tilePixelMap) : 0;
                  return (
                    <div key={port.id} style={{ marginBottom: 6 }}>
                      <div className="stat-row" style={{ marginBottom: summEffCap !== undefined ? 3 : 0 }}>
                        <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 18, height: 18, borderRadius: 4,
                            background: port.color, color: '#fff',
                            fontSize: 9, fontWeight: 800, fontFamily: 'monospace', flexShrink: 0,
                          }}>
                            {port.name}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                            {wallName ?? <em>{t('portPanel.wallUnassigned')}</em>}
                          </span>
                        </span>
                        <span className="stat-value">{t('portPanel.tilesCount', { count: port.tileIds.length })}</span>
                      </div>
                      {summEffCap !== undefined && (
                        <CapacityBar used={usedPx} capacity={summEffCap} color={port.color} showNumbers />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="stat-row" style={{ borderTop: '1px solid var(--border-muted)', paddingTop: 6, marginTop: 2 }}>
              <span className="stat-label">{t('portPanel.totalAssigned')}</span>
              <span className="stat-value">
                {totalAssigned}<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / {totalTilesAllWalls}</span>
              </span>
            </div>
          </div>}
        </>
      )}
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  addBtn: {
    marginLeft: 'auto',
    background: 'var(--accent-dim)',
    border: '1px solid rgba(59,130,246,0.3)',
    color: 'var(--accent-bright)',
    fontSize: 10, fontWeight: 700, padding: '2px 8px',
    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  },
  inlineForm: {
    display: 'flex', alignItems: 'flex-start', gap: 5,
    padding: '8px 10px',
    borderBottom: '1px solid var(--border-muted)',
    background: 'var(--bg-elevated)',
  },
  inlineInput: {
    fontSize: 11, padding: '3px 6px',
    background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    outline: 'none', minWidth: 0, width: '100%', boxSizing: 'border-box' as const,
  },
  modelInfo: {
    display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' as const,
    fontSize: 10, color: 'var(--text-secondary)',
    padding: '3px 6px',
    background: 'var(--bg-base)', border: '1px solid var(--border-muted)',
    borderRadius: 'var(--radius-sm)',
  },
  processorBlock: { borderBottom: '1px solid var(--border-muted)' },
  procHeader: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '7px 10px 5px', background: 'var(--bg-elevated)',
  },
  collapseArrow: { fontSize: 8, color: 'var(--text-muted)', flexShrink: 0, width: 8 },
  procIcon:      { fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 },
  procName: {
    fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
    cursor: 'default', overflow: 'hidden', textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  procPortCount: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 },
  portList:      { display: 'flex', flexDirection: 'column' as const, gap: 1, padding: '4px 8px' },
  portRow: {
    display: 'flex', flexDirection: 'column' as const, padding: '5px 7px',
    borderRadius: 'var(--radius)', cursor: 'pointer',
    borderTop: '1px solid transparent', borderRight: '1px solid transparent', borderBottom: '1px solid transparent',
    transition: 'background 0.1s', gap: 0,
  },
  portRowControls: { display: 'flex', alignItems: 'center', gap: 5, width: '100%' },
  portRowActive: {
    background: 'var(--bg-elevated)',
    borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
  },
  colorDot: {
    width: 11, height: 11, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.18)', cursor: 'pointer', flexShrink: 0, padding: 0,
  },
  portName: {
    fontSize: 12, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-primary)',
    letterSpacing: '-0.01em', minWidth: 20, flexShrink: 0,
  },
  wallSelect: {
    flex: 1, fontSize: 10, padding: '2px 4px',
    background: 'var(--bg-base)', border: '1px solid var(--border-muted)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
    cursor: 'pointer', minWidth: 0,
  },
  countBadge: {
    fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
    background: 'var(--bg-hover)', color: 'var(--text-muted)',
    borderRadius: 5, padding: '1px 5px', flexShrink: 0, whiteSpace: 'nowrap',
  },
  fullBadge: {
    fontSize: 8, fontWeight: 800, fontFamily: 'monospace',
    background: 'rgba(239,68,68,0.15)', color: 'var(--danger)',
    border: '1px solid rgba(239,68,68,0.4)', borderRadius: 4,
    padding: '1px 4px', flexShrink: 0, letterSpacing: '0.04em',
  },
  routeBtn: {
    fontSize: 9, fontWeight: 700, padding: '2px 6px',
    background: 'var(--bg-hover)', border: '1px solid var(--border-muted)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
    cursor: 'pointer', flexShrink: 0, lineHeight: 1.4,
  },
  addPortBtn: {
    display: 'block', width: '100%', textAlign: 'left' as const,
    padding: '5px 14px', background: 'transparent', border: 'none',
    borderTop: '1px solid var(--border-muted)',
    color: 'var(--accent-bright)', fontSize: 10, fontWeight: 600,
    cursor: 'pointer', letterSpacing: '0.02em',
  },
  // XD box grouping
  xdBoxGroup: {
    marginBottom: 4,
    border: '1px solid var(--border-muted)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  },
  xdBoxHeader: {
    display: 'flex', flexDirection: 'column' as const,
    padding: '4px 8px',
    background: 'var(--bg-hover)',
    borderBottom: '1px solid var(--border-muted)',
  },
  xdBoxLabel: {
    fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', color: 'var(--text-muted)',
  },
  emptyHint: {
    fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7,
    textAlign: 'center' as const, padding: '6px 0',
  },
  chainList: { display: 'flex', flexDirection: 'column' as const, gap: 3, maxHeight: 180, overflowY: 'auto' as const },
  chainItem: {
    display: 'flex', alignItems: 'center', gap: 7, padding: '3px 5px',
    borderRadius: 'var(--radius-sm)', background: 'var(--bg-base)', border: '1px solid var(--border-muted)',
  },
  chainBadge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 22, height: 17, borderRadius: 4,
    fontSize: 9, fontWeight: 800, fontFamily: 'monospace', color: '#fff', padding: '0 3px', flexShrink: 0,
  },
  chainName: {
    flex: 1, fontSize: 11, color: 'var(--text-secondary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, minWidth: 0,
  },
  chainPx: { fontSize: 9, fontFamily: 'monospace', color: 'var(--text-muted)', flexShrink: 0 },
  actionBtn: { fontSize: 11, padding: '4px 8px', flex: '1 1 auto' },
  capacityWarning: {
    fontSize: 11, color: 'var(--danger)',
    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 'var(--radius)', padding: '7px 9px', lineHeight: 1.6,
  },
};

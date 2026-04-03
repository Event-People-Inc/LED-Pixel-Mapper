import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/useProjectStore';
import { useLicenseStore } from '../license/licenseStore';
import { UpgradeModal } from './ProGate';
import { TILE_COLORS } from '../types';
import { searchTileLibrary, groupedTileLibrary, TileLibraryEntry, TILE_BRANDS } from '../tileLibrary';
import MathInput from './MathInput';

const FREE_TILE_BRANDS = ['ROE Visual', 'Absen'];

export default function LeftSidebar() {
  const { t } = useTranslation();
  const project           = useProjectStore((s) => s.project);
  const isPro             = useLicenseStore((s) => s.isPro);
  const addTile           = useProjectStore((s) => s.addTile);
  const addTileBlock      = useProjectStore((s) => s.addTileBlock);
  const addTileProfile    = useProjectStore((s) => s.addTileProfile);
  const removeTileProfile = useProjectStore((s) => s.removeTileProfile);

  // Profile selection
  const [selectedProfileId, setSelectedProfileId] = useState('');

  // Single-tile placement
  const [tileX, setTileX] = useState(0);
  const [tileY, setTileY] = useState(0);

  // Block placement
  const [blockProfileId, setBlockProfileId] = useState('');
  const [blockRows,    setBlockRows]    = useState(2);
  const [blockCols,    setBlockCols]    = useState(4);
  const [blockStartX,  setBlockStartX]  = useState(0);
  const [blockStartY,  setBlockStartY]  = useState(0);
  const [blockHSpacing, setBlockHSpacing] = useState(0);
  const [blockVSpacing, setBlockVSpacing] = useState(0);

  // ── Add tile profile form ──
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [addProfileMode, setAddProfileMode] = useState<'custom' | 'library'>('custom');
  // Custom form fields
  const [newProfName,  setNewProfName]  = useState('');
  const [newProfW,     setNewProfW]     = useState('192');
  const [newProfH,     setNewProfH]     = useState('108');
  const [newProfPower, setNewProfPower] = useState('');
  const [profError,    setProfError]    = useState('');
  // Library picker
  const [libSearch,       setLibSearch]       = useState('');
  const [collapsedBrands, setCollapsedBrands] = useState<Set<string>>(() => new Set(TILE_BRANDS));
  const [showUpgrade,     setShowUpgrade]     = useState(false);
  const libSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddProfile && addProfileMode === 'library') {
      setTimeout(() => libSearchRef.current?.focus(), 50);
    }
  }, [showAddProfile, addProfileMode]);

  if (!project) return null;

  const firstProfileId   = project.tileProfiles[0]?.id ?? '';
  const effectiveProfile = selectedProfileId  || firstProfileId;
  const effectiveBlock   = blockProfileId     || firstProfileId;

  const filteredLib  = searchTileLibrary(libSearch);
  const groupedLib   = groupedTileLibrary(filteredLib);
  const brandKeys    = Object.keys(groupedLib).sort();

  const toggleBrand = (brand: string) =>
    setCollapsedBrands((s) => { const n = new Set(s); n.has(brand) ? n.delete(brand) : n.add(brand); return n; });

  /* ── Handlers ── */
  const handleAddTile = () => {
    if (!effectiveProfile) return;
    addTile(effectiveProfile, tileX, tileY);
  };

  const handleAddBlock = () => {
    if (!effectiveBlock) return;
    addTileBlock(effectiveBlock, blockRows, blockCols, blockStartX, blockStartY, blockHSpacing, blockVSpacing);
  };

  const resetProfileForm = () => {
    setNewProfName(''); setNewProfW('192'); setNewProfH('108');
    setNewProfPower(''); setProfError(''); setLibSearch('');
  };

  const handleAddCustomProfile = () => {
    setProfError('');
    if (!newProfName.trim()) { setProfError('Name required.'); return; }
    const pw = parseInt(newProfW), ph = parseInt(newProfH);
    if (!pw || !ph || pw < 1 || ph < 1) { setProfError('Dimensions must be positive.'); return; }
    addTileProfile({
      name: newProfName.trim(),
      pixelWidth: pw,
      pixelHeight: ph,
      defaultPowerUse: newProfPower ? parseFloat(newProfPower) : undefined,
    });
    resetProfileForm();
    setShowAddProfile(false);
  };

  const handleAddFromLibrary = (entry: TileLibraryEntry) => {
    addTileProfile({
      name: entry.name,
      pixelWidth: entry.pixelWidth,
      pixelHeight: entry.pixelHeight,
      defaultPowerUse: entry.powerWatts ?? undefined,
    });
  };

  /* ── Derived ── */
  const totalBlockTiles = blockRows * blockCols;
  const blockProfile    = project.tileProfiles.find((p) => p.id === effectiveBlock);
  const blockWidthPx    = blockProfile ? blockCols * blockProfile.pixelWidth  + (blockCols  - 1) * blockHSpacing : 0;
  const blockHeightPx   = blockProfile ? blockRows * blockProfile.pixelHeight + (blockRows - 1) * blockVSpacing  : 0;

  /* ── Render ── */
  return (
    <div style={S.sidebar}>
      <div style={S.scroll}>

        {/* ── Tile Profiles ── */}
        <div className="sh" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="sh-dot" />{t('leftSidebar.tileProfiles')}
          </span>
          <button
            className="btn-icon"
            title={t('leftSidebar.addTileProfile')}
            style={{ fontSize: 15, color: 'var(--accent-bright)', lineHeight: 1, marginRight: 2 }}
            onClick={() => { setShowAddProfile((v) => !v); resetProfileForm(); }}
          >
            {showAddProfile ? '✕' : '+'}
          </button>
        </div>

        {/* Add profile form */}
        {showAddProfile && (
          <div style={S.addProfileWrap}>
            {/* Mode tabs */}
            <div style={S.modeTabs}>
              <button
                className={addProfileMode === 'custom' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, fontSize: 10, padding: '3px 0' }}
                onClick={() => setAddProfileMode('custom')}
              >
                {t('leftSidebar.custom')}
              </button>
              <button
                className={addProfileMode === 'library' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1, fontSize: 10, padding: '3px 0' }}
                onClick={() => setAddProfileMode('library')}
              >
                {t('leftSidebar.library')}
              </button>
            </div>

            {addProfileMode === 'custom' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="fg">
                  <label>{t('leftSidebar.name')}</label>
                  <input
                    autoFocus
                    value={newProfName}
                    onChange={(e) => setNewProfName(e.target.value)}
                    placeholder={t('leftSidebar.namePlaceholder')}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomProfile()}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                  <div className="fg">
                    <label>{t('leftSidebar.pxW')}</label>
                    <MathInput value={newProfW} onChange={(v) => setNewProfW(v)} min={1} />
                  </div>
                  <div className="fg">
                    <label>{t('leftSidebar.pxH')}</label>
                    <MathInput value={newProfH} onChange={(v) => setNewProfH(v)} min={1} />
                  </div>
                  <div className="fg">
                    <label>{t('leftSidebar.powerW')}</label>
                    <MathInput allowDecimal value={newProfPower} onChange={(v) => setNewProfPower(v)} placeholder="—" />
                  </div>
                </div>
                {profError && <div style={{ fontSize: 10, color: 'var(--danger)' }}>{profError}</div>}
                <button className="btn-primary" style={{ fontSize: 11, padding: '4px 0' }} onClick={handleAddCustomProfile}>
                  {t('leftSidebar.addProfile')}
                </button>
              </div>
            )}

            {addProfileMode === 'library' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* Search bar */}
                <div style={S.libSearch}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>⌕</span>
                  <input
                    ref={libSearchRef}
                    value={libSearch}
                    onChange={(e) => setLibSearch(e.target.value)}
                    placeholder={t('leftSidebar.searchLibrary')}
                    style={{ flex: 1, fontSize: 11, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', padding: '2px 0' }}
                  />
                  {libSearch && (
                    <button onClick={() => setLibSearch('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}>✕</button>
                  )}
                </div>

                {/* Results */}
                <div style={S.libList}>
                  {brandKeys.length === 0 && (
                    <div style={{ padding: 12, textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
                      {t('leftSidebar.noMatch', { query: libSearch })}
                    </div>
                  )}
                  {brandKeys.map((brand) => {
                    const isCollapsed  = collapsedBrands.has(brand);
                    const brandLocked  = !isPro && !FREE_TILE_BRANDS.includes(brand);
                    return (
                      <div key={brand}>
                        <div
                          style={{ ...S.libBrandHeader, opacity: brandLocked ? 0.5 : 1 }}
                          onClick={() => toggleBrand(brand)}
                        >
                          <span style={{ marginRight: 5, fontSize: 7 }}>{isCollapsed ? '▶' : '▼'}</span>
                          {brandLocked && '🔒 '}{brand}
                          <span style={{ marginLeft: 4, opacity: 0.6, fontWeight: 400 }}>({groupedLib[brand].length})</span>
                        </div>
                        {!isCollapsed && groupedLib[brand].map((entry) => {
                          const tileLocked = !isPro && !FREE_TILE_BRANDS.includes(entry.brand);
                          return (
                            <div key={`${entry.brand}-${entry.name}`} style={{ ...S.libRow, opacity: tileLocked ? 0.45 : 1 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                  {tileLocked ? '— Pro only' : (
                                    <>
                                      {entry.pixelWidth}×{entry.pixelHeight}
                                      {entry.powerWatts != null && <span style={{ marginLeft: 5, color: 'var(--warning)' }}>{entry.powerWatts}W</span>}
                                    </>
                                  )}
                                </div>
                              </div>
                              <button
                                className="btn-secondary"
                                style={{ fontSize: 10, padding: '2px 7px', flexShrink: 0 }}
                                onClick={tileLocked ? () => setShowUpgrade(true) : () => handleAddFromLibrary(entry)}
                              >
                                {tileLocked ? '🔒' : '+ Add'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
                </div>

                <div style={{ padding: '3px 8px', fontSize: 9, color: 'var(--text-muted)', textAlign: 'right', borderTop: '1px solid var(--border-muted)', background: 'var(--bg-elevated)' }}>
                  {libSearch ? t('leftSidebar.searchLibrary') : ''}{filteredLib.length} {t('leftSidebar.tiles')}{libSearch ? ` — "${libSearch}"` : ''}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Profile list */}
        <div className="sb">
          {project.tileProfiles.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center' }}>
              {t('leftSidebar.noProfiles')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {project.tileProfiles.map((prof, idx) => (
                <div
                  key={prof.id}
                  className={`profile-card${effectiveProfile === prof.id ? ' active' : ''}`}
                  onClick={() => { setSelectedProfileId(prof.id); setBlockProfileId(prof.id); }}
                >
                  <div className="profile-swatch" style={{ background: TILE_COLORS[idx % TILE_COLORS.length] }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.profName}>{prof.name}</div>
                    <div style={S.profDim}>
                      {prof.pixelWidth} × {prof.pixelHeight}px
                      {prof.defaultPowerUse !== undefined && (
                        <span style={{ marginLeft: 5, color: 'var(--text-muted)' }}>{prof.defaultPowerUse}W</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn-icon"
                    title="Remove profile"
                    style={{ color: 'var(--danger)', fontSize: 10, opacity: 0.6, padding: '0 2px', flexShrink: 0 }}
                    onClick={(e) => { e.stopPropagation(); removeTileProfile(prof.id); }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Add Single Tile ── */}
        <div className="sh"><span className="sh-dot" style={{ background: 'var(--success)' }} />{t('leftSidebar.addTileBtn')}</div>
        <div className="sb" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="fg">
            <label>{t('leftSidebar.profile')}</label>
            <select value={effectiveProfile} onChange={(e) => setSelectedProfileId(e.target.value)}>
              {project.tileProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="row">
            <div className="fg" style={{ flex: 1 }}>
              <label>{t('leftSidebar.xPx')}</label>
              <MathInput value={tileX} onChange={(v) => setTileX(parseInt(v) || 0)} min={0} />
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <label>{t('leftSidebar.yPx')}</label>
              <MathInput value={tileY} onChange={(v) => setTileY(parseInt(v) || 0)} min={0} />
            </div>
          </div>
          <button className="btn-primary btn-action" onClick={handleAddTile} disabled={!effectiveProfile}>
            {t('leftSidebar.addTile')}
          </button>
        </div>

        {/* ── Add Tile Block ── */}
        <div className="sh"><span className="sh-dot" style={{ background: 'var(--warning)' }} />{t('leftSidebar.addBlockBtn')}</div>
        <div className="sb" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="fg">
            <label>{t('leftSidebar.profile')}</label>
            <select value={effectiveBlock} onChange={(e) => setBlockProfileId(e.target.value)}>
              {project.tileProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="row">
            <div className="fg" style={{ flex: 1 }}>
              <label>{t('leftSidebar.rows')}</label>
              <MathInput min={1} max={200} value={blockRows} onChange={(v) => setBlockRows(Math.max(1, parseInt(v) || 1))} />
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <label>{t('leftSidebar.cols')}</label>
              <MathInput min={1} max={200} value={blockCols} onChange={(v) => setBlockCols(Math.max(1, parseInt(v) || 1))} />
            </div>
          </div>
          <div className="row">
            <div className="fg" style={{ flex: 1 }}>
              <label>{t('leftSidebar.startX')}</label>
              <MathInput min={0} value={blockStartX} onChange={(v) => setBlockStartX(parseInt(v) || 0)} />
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <label>{t('leftSidebar.startY')}</label>
              <MathInput min={0} value={blockStartY} onChange={(v) => setBlockStartY(parseInt(v) || 0)} />
            </div>
          </div>
          <div className="row">
            <div className="fg" style={{ flex: 1 }}>
              <label>{t('leftSidebar.hGap')}</label>
              <MathInput min={0} value={blockHSpacing} onChange={(v) => setBlockHSpacing(parseInt(v) || 0)} />
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <label>{t('leftSidebar.vGap')}</label>
              <MathInput min={0} value={blockVSpacing} onChange={(v) => setBlockVSpacing(parseInt(v) || 0)} />
            </div>
          </div>
          <div style={S.blockMetrics}>
            <span><strong style={{ color: 'var(--text-primary)' }}>{totalBlockTiles}</strong> {t('leftSidebar.tiles')}</span>
            {blockProfile && <span>{blockWidthPx} × {blockHeightPx}px</span>}
          </div>
          <button
            className="btn-secondary btn-action"
            onClick={handleAddBlock}
            disabled={!effectiveBlock}
            style={{ borderColor: 'rgba(245,158,11,0.4)', color: 'var(--warning)' }}
          >
            + Add {blockRows}×{blockCols} Block
          </button>
        </div>

      </div>{/* /scroll */}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 'var(--sidebar-w-left)', flexShrink: 0, height: '100%',
    background: 'var(--bg-panel)', borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  scroll: { flex: 1, overflowY: 'auto', overflowX: 'hidden' },
  profName: {
    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3,
  },
  profDim:  { fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 },
  blockMetrics: {
    display: 'flex', justifyContent: 'space-between', fontSize: 11,
    color: 'var(--text-muted)', background: 'var(--bg-base)',
    borderRadius: 'var(--radius)', padding: '5px 9px', border: '1px solid var(--border-muted)',
  },
  renameInput: { flex: 1, fontSize: 11, padding: '2px 5px', height: 22, minWidth: 0 },
  addCanvasForm: {
    padding: '8px 8px 6px', borderBottom: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--bg-elevated)',
  },
  // ── Add profile form ──
  addProfileWrap: {
    margin: '0 8px 8px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-base)',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column', gap: 0,
  },
  modeTabs: {
    display: 'flex', gap: 4, padding: '8px 8px 6px',
    background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-muted)',
  },
  libSearch: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 8px', borderBottom: '1px solid var(--border-muted)',
    background: 'var(--bg-elevated)',
  },
  libList: { maxHeight: 240, overflowY: 'auto' as const },
  libBrandHeader: {
    fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', color: 'var(--text-muted)',
    padding: '5px 8px 2px', background: 'var(--bg-hover)',
    borderBottom: '1px solid var(--border-muted)',
    cursor: 'pointer', userSelect: 'none' as const,
  },
  libRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 8px', borderBottom: '1px solid var(--border-muted)',
  },
};

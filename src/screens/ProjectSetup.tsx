import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/useProjectStore';
import { useLicenseStore } from '../license/licenseStore';
import { UpgradeModal } from '../components/ProGate';
import FileMenu from '../components/FileMenu';
import { TileProfile, Processor, ProcessorPort, CANVAS_PRESETS, TILE_COLORS, PORT_COLORS } from '../types';
import { searchTileLibrary, groupedTileLibrary, TileLibraryEntry, TILE_BRANDS } from '../tileLibrary';
import { PROCESSOR_LIBRARY, groupedLibrary, ProcessorLibraryEntry } from '../processorLibrary';
import MathInput from '../components/MathInput';

const FREE_TILE_BRANDS  = ['ROE Visual', 'Absen'];
const FREE_PROCESSOR    = 'MCTRL4K';

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const PORT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const fmtM = (px: number) => px >= 1_000_000 ? `${(px / 1_000_000).toFixed(1)}M` : `${(px / 1000).toFixed(0)}K`;

// ── Tile profile draft ──────────────────────────────────────────────────────

interface DraftProfile {
  id: string;
  name: string;
  pixelWidth: string;
  pixelHeight: string;
  defaultPowerUse: string;
}

const blankDraft = (): DraftProfile => ({
  id: genId(), name: '', pixelWidth: '192', pixelHeight: '108', defaultPowerUse: '',
});

const draftFromLibrary = (entry: TileLibraryEntry): DraftProfile => ({
  id: genId(),
  name: entry.name,
  pixelWidth: String(entry.pixelWidth),
  pixelHeight: String(entry.pixelHeight),
  defaultPowerUse: entry.powerWatts != null ? String(entry.powerWatts) : '',
});

// ── Processor draft ─────────────────────────────────────────────────────────

interface DraftProcessor {
  id: string;
  name: string;
  model: ProcessorLibraryEntry;
  xdBoxCount: number;
}

function buildProcessorPorts(model: ProcessorLibraryEntry, xdBoxCount: number): ProcessorPort[] {
  const ports: ProcessorPort[] = [];
  let li = 0;
  const nextLetter = () => li < PORT_LETTERS.length ? PORT_LETTERS[li++] : `P${li++}`;

  if (model.xdExpander) {
    for (let box = 0; box < xdBoxCount; box++) {
      for (let p = 0; p < model.xdExpander.portsPerBox; p++) {
        ports.push({ id: genId(), name: nextLetter(), color: PORT_COLORS[box % PORT_COLORS.length], wallId: null, tileIds: [], pixelCapacity: model.xdExpander.portCapacity });
      }
    }
  } else {
    for (let p = 0; p < model.rj45Ports; p++) {
      ports.push({ id: genId(), name: nextLetter(), color: PORT_COLORS[p % PORT_COLORS.length], wallId: null, tileIds: [], pixelCapacity: model.perPortCapacity });
    }
  }
  return ports;
}

function procPortSummary(model: ProcessorLibraryEntry, xdBoxCount: number, bitDepth: '8bit' | '10bit' = '8bit'): string {
  const cap = bitDepth === '10bit' ? 0.5 : 1;
  if (model.xdExpander) {
    const count = xdBoxCount * model.xdExpander.portsPerBox;
    const total = count * model.xdExpander.portCapacity * cap;
    return `${count} ports · ${fmtM(total)} px total`;
  }
  return `${model.rj45Ports} ports · ${fmtM(model.totalCapacity * cap)} px total`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProjectSetup() {
  const { t } = useTranslation();
  const createProject   = useProjectStore((s) => s.createProject);
  const updateProject   = useProjectStore((s) => s.updateProject);
  const existingProject = useProjectStore((s) => s.project);
  const isPro           = useLicenseStore((s) => s.isPro);

  const isEditing = !!existingProject;

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [projectName, setProjectName] = useState(existingProject?.name ?? 'New LED Project');
  const [presetIdx, setPresetIdx]     = useState(() => {
    if (!existingProject) return 1;
    const idx = CANVAS_PRESETS.findIndex(
      (p) => p.width === existingProject.canvasWidth && p.height === existingProject.canvasHeight
    );
    return idx >= 0 ? idx : CANVAS_PRESETS.findIndex((p) => p.width === 0); // custom
  });
  const [customW, setCustomW]   = useState(String(existingProject?.canvasWidth ?? 1920));
  const [customH, setCustomH]   = useState(String(existingProject?.canvasHeight ?? 1080));
  const [bitDepth, setBitDepth] = useState<'8bit' | '10bit'>(existingProject?.bitDepth ?? '8bit');
  // In edit mode, profiles list starts empty — user only adds NEW profiles
  const [profiles, setProfiles] = useState<DraftProfile[]>([]);
  const [error, setError]       = useState('');

  // ── Tile library picker ──
  const [showTilePicker, setShowTilePicker] = useState(false);
  const [tileSearch, setTileSearch]         = useState('');
  const [collapsedBrands, setCollapsedBrands] = useState<Set<string>>(() => new Set(TILE_BRANDS));
  const tileSearchRef = useRef<HTMLInputElement>(null);

  // ── Processor section — in edit mode starts empty, user only adds NEW processors ──
  const [draftProcessors, setDraftProcessors] = useState<DraftProcessor[]>([]);
  const [showProcPicker, setShowProcPicker]   = useState(false);
  const [selectedModelName, setSelectedModelName] = useState(PROCESSOR_LIBRARY[0].name);
  const [xdBoxCount, setXdBoxCount]           = useState(1);

  const isCustom = CANVAS_PRESETS[presetIdx].width === 0;
  const canvasW  = isCustom ? (parseInt(customW)  || 1920) : CANVAS_PRESETS[presetIdx].width;
  const canvasH  = isCustom ? (parseInt(customH) || 1080) : CANVAS_PRESETS[presetIdx].height;

  const filteredTiles  = searchTileLibrary(tileSearch);
  const groupedTiles   = groupedTileLibrary(filteredTiles);
  const tileBrandKeys  = Object.keys(groupedTiles).sort();
  const procGroups     = groupedLibrary();
  const procGroupKeys  = Object.keys(procGroups).sort();

  const selectedModel = PROCESSOR_LIBRARY.find((m) => m.name === selectedModelName) ?? PROCESSOR_LIBRARY[0];
  const isXDModel     = !!selectedModel.xdExpander;

  useEffect(() => {
    if (showTilePicker) setTimeout(() => tileSearchRef.current?.focus(), 50);
  }, [showTilePicker]);

  // Reset XD box count when model changes
  useEffect(() => { setXdBoxCount(1); }, [selectedModelName]);

  // ── Tile profile actions ──
  const addProfile    = () => setProfiles((p) => [...p, blankDraft()]);
  const updateProfile = (id: string, field: keyof DraftProfile, val: string) =>
    setProfiles((ps) => ps.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  const removeProfile = (id: string) => setProfiles((ps) => ps.filter((p) => p.id !== id));
  const addTileFromLibrary = (entry: TileLibraryEntry) => setProfiles((ps) => [...ps, draftFromLibrary(entry)]);

  const toggleBrand = (brand: string) =>
    setCollapsedBrands((s) => { const n = new Set(s); n.has(brand) ? n.delete(brand) : n.add(brand); return n; });

  // ── Processor actions ──
  const addProcessor = () => {
    const dp: DraftProcessor = {
      id: genId(),
      name: selectedModel.name,
      model: selectedModel,
      xdBoxCount: isXDModel ? xdBoxCount : 1,
    };
    setDraftProcessors((ps) => [...ps, dp]);
  };
  const removeProcessor = (id: string) => setDraftProcessors((ps) => ps.filter((p) => p.id !== id));
  const updateProcName  = (id: string, name: string) =>
    setDraftProcessors((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));

  // ── Submit ──
  const handleCreate = () => {
    setError('');
    if (!projectName.trim()) { setError('Project name is required.'); return; }
    if (!canvasW || !canvasH || canvasW < 1 || canvasH < 1) {
      setError('Canvas dimensions must be positive numbers.'); return;
    }
    // In edit mode, profiles must each be valid if the user added any
    const validProfiles: TileProfile[] = [];
    for (const dp of profiles) {
      if (!dp.name.trim()) { setError(t('setup.errorNames')); return; }
      const pw = parseInt(dp.pixelWidth);
      const ph = parseInt(dp.pixelHeight);
      if (!pw || !ph || pw < 1 || ph < 1) {
        setError(t('setup.errorProfile', { name: dp.name })); return;
      }
      validProfiles.push({
        id: dp.id,
        name: dp.name.trim(),
        pixelWidth: pw,
        pixelHeight: ph,
        defaultPowerUse: dp.defaultPowerUse ? parseFloat(dp.defaultPowerUse) : undefined,
      });
    }
    if (!isEditing && validProfiles.length === 0) {
      setError(t('setup.errorNames')); return;
    }
    const builtProcessors: Processor[] = draftProcessors.map((dp) => ({
      id: dp.id,
      name: dp.name,
      ports: buildProcessorPorts(dp.model, dp.xdBoxCount),
      xdBoxCount:    dp.model.xdExpander ? dp.xdBoxCount : undefined,
      xdBoxSize:     dp.model.xdExpander ? dp.model.xdExpander.portsPerBox : undefined,
      xdMaxBoxes:    dp.model.xdExpander ? dp.model.xdExpander.maxBoxes : undefined,
      expanderLabel: dp.model.xdExpander ? (dp.model.xdExpander.expanderLabel ?? 'XD Box') : undefined,
    }));
    if (isEditing) {
      updateProject(projectName.trim(), canvasW, canvasH, validProfiles, builtProcessors, bitDepth);
    } else {
      createProject(projectName.trim(), canvasW, canvasH, validProfiles, builtProcessors, bitDepth);
    }
  };

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <FileMenu />
      </div>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logoClip}>
          <img src="./logo.png" alt="LED Pixel Mapper" style={styles.logoImg} />
        </div>
        <p style={styles.logoSub}>{t('setup.projectSetup')}</p>
      </div>

      <div style={styles.formWrap}>

        {/* Edit mode banner */}
        {isEditing && (
          <div style={styles.editBanner}>
            <span style={{ fontSize: 16 }}>✏️</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Editing project settings</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                All your walls and tiles are safe. Canvas resize keeps everything at the same coordinates.
                Adding profiles or processors appends them — nothing is removed.
              </div>
            </div>
          </div>
        )}

        {/* Project Name */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>{t('setup.projectDetails')}</div>
          <div className="fg">
            <label>{t('setup.projectName')}</label>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={t('setup.projectNamePlaceholder')} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              {t('setup.bitDepth')}
            </label>
            <div style={{ display: 'flex', borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden', width: 'fit-content' }}>
              {(['8bit', '10bit'] as const).map((d) => {
                const locked = d === '10bit' && !isPro;
                return (
                  <button
                    key={d}
                    onClick={locked ? () => setShowUpgrade(true) : () => setBitDepth(d)}
                    title={locked ? 'Pro feature' : undefined}
                    style={{
                      padding: '5px 16px',
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: (!locked && bitDepth === d) ? 'var(--accent)' : 'transparent',
                      color: locked ? 'var(--text-muted)' : (bitDepth === d ? '#fff' : 'var(--text-muted)'),
                      transition: 'background 0.12s, color 0.12s',
                      opacity: locked ? 0.5 : 1,
                    }}
                  >
                    {d}{locked && ' 🔒'}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
              {bitDepth === '10bit' ? t('setup.bitDepth10hint') : t('setup.bitDepth8hint')}
            </p>
          </div>
        </div>

        {/* Canvas Resolution */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>{t('setup.canvasResolution')}</div>
          <div className="fg" style={{ marginBottom: 12 }}>
            <label>{t('setup.preset')}</label>
            <select value={presetIdx} onChange={(e) => setPresetIdx(Number(e.target.value))}>
              {CANVAS_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
            </select>
          </div>
          <div className="row">
            <div className="fg" style={{ flex: 1 }}>
              <label>{t('setup.widthPx')}</label>
              <MathInput
                value={isCustom ? customW : String(canvasW)}
                disabled={!isCustom}
                onChange={(v) => setCustomW(v)}
                placeholder={t('setup.widthPlaceholder')}
              />
            </div>
            <div style={{ color: 'var(--text-muted)', paddingTop: 18, fontSize: 16 }}>×</div>
            <div className="fg" style={{ flex: 1 }}>
              <label>{t('setup.heightPx')}</label>
              <MathInput
                value={isCustom ? customH : String(canvasH)}
                disabled={!isCustom}
                onChange={(v) => setCustomH(v)}
                placeholder={t('setup.heightPlaceholder')}
              />
            </div>
          </div>
        </div>

        {/* ── Tile Profiles ── */}
        <div style={styles.card}>
          <div style={{ ...styles.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>{t('setup.tileProfiles')}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" onClick={() => { setShowTilePicker((v) => !v); setTileSearch(''); }} style={{ fontSize: 12 }}>
                {showTilePicker ? '✕ Close Library' : t('setup.fromLibrary')}
              </button>
              <button className="btn-secondary" onClick={addProfile} style={{ fontSize: 12 }}>{t('setup.addCustom')}</button>
            </div>
          </div>

          {/* Edit mode: show existing profiles as read-only chips */}
          {isEditing && existingProject && existingProject.tileProfiles.length > 0 && (
            <div style={styles.existingChips}>
              <span style={styles.existingLabel}>Existing:</span>
              {existingProject.tileProfiles.map((p) => (
                <span key={p.id} style={styles.chip}>{p.name}</span>
              ))}
            </div>
          )}

          {/* Tile Library Picker */}
          {showTilePicker && (
            <div style={styles.pickerWrap}>
              <div style={styles.pickerSearch}>
                <span style={styles.searchIcon}>⌕</span>
                <input
                  ref={tileSearchRef}
                  value={tileSearch}
                  onChange={(e) => setTileSearch(e.target.value)}
                  placeholder={t('setup.searchLibrary')}
                  style={styles.searchInput}
                />
                {tileSearch && <button onClick={() => setTileSearch('')} style={styles.clearBtn}>✕</button>}
              </div>
              <div style={styles.pickerList}>
                {tileBrandKeys.length === 0 && (
                  <div style={styles.pickerEmpty}>{t('setup.noTilesMatch', { query: tileSearch })}</div>
                )}
                {tileBrandKeys.map((brand) => {
                  const isCollapsed   = collapsedBrands.has(brand);
                  const brandLocked   = !isPro && !FREE_TILE_BRANDS.includes(brand);
                  return (
                    <div key={brand}>
                      <div
                        style={{ ...styles.pickerBrandHeader, cursor: 'pointer', userSelect: 'none', opacity: brandLocked ? 0.5 : 1 }}
                        onClick={() => toggleBrand(brand)}
                      >
                        <span style={{ marginRight: 6, fontSize: 8 }}>{isCollapsed ? '▶' : '▼'}</span>
                        {brandLocked && '🔒 '}{brand}
                        <span style={{ marginLeft: 6, fontWeight: 400, opacity: 0.7 }}>({groupedTiles[brand].length})</span>
                      </div>
                      {!isCollapsed && groupedTiles[brand].map((entry) => {
                        const tileLocked = !isPro && !FREE_TILE_BRANDS.includes(entry.brand);
                        return (
                          <div key={`${entry.brand}-${entry.name}`} style={{ ...styles.pickerRow, opacity: tileLocked ? 0.45 : 1 }}>
                            <div style={styles.pickerInfo}>
                              <span style={styles.pickerName}>{entry.name}</span>
                              <span style={styles.pickerMeta}>
                                {tileLocked ? '— Pro only' : (
                                  <>
                                    {entry.pixelWidth}×{entry.pixelHeight} px
                                    {entry.powerWatts != null && (
                                      <span style={{ marginLeft: 8, color: 'var(--warning)' }}>{entry.powerWatts} W</span>
                                    )}
                                  </>
                                )}
                              </span>
                            </div>
                            <button
                              className="btn-secondary"
                              style={styles.pickerAddBtn}
                              onClick={tileLocked ? () => setShowUpgrade(true) : () => addTileFromLibrary(entry)}
                            >
                              {tileLocked ? '🔒' : '+ Add'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div style={styles.pickerFooter}>
                {tileSearch
                  ? t('setup.tilesMatching', { count: filteredTiles.length, query: tileSearch })
                  : t('setup.tilesInLibrary', { count: filteredTiles.length })}
                {collapsedBrands.size > 0 && ` ${t('setup.brandCollapsed', { count: collapsedBrands.size })}`}
              </div>
            </div>
          )}

          {profiles.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              {t('setup.noProfiles')}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {profiles.map((dp, idx) => (
              <div key={dp.id} style={styles.profileRow}>
                <div style={{ ...styles.profileSwatch, background: TILE_COLORS[idx % TILE_COLORS.length] }} />
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, alignItems: 'end' }}>
                  <div className="fg">
                    <label>{t('setup.profileName')}</label>
                    <input value={dp.name} onChange={(e) => updateProfile(dp.id, 'name', e.target.value)} placeholder="Panel A" />
                  </div>
                  <div className="fg">
                    <label>{t('setup.pxWidth')}</label>
                    <MathInput value={dp.pixelWidth} onChange={(v) => updateProfile(dp.id, 'pixelWidth', v)} min={1} />
                  </div>
                  <div className="fg">
                    <label>{t('setup.pxHeight')}</label>
                    <MathInput value={dp.pixelHeight} onChange={(v) => updateProfile(dp.id, 'pixelHeight', v)} min={1} />
                  </div>
                  <div className="fg">
                    <label>{t('setup.powerW')}</label>
                    <MathInput allowDecimal value={dp.defaultPowerUse} onChange={(v) => updateProfile(dp.id, 'defaultPowerUse', v)} placeholder="—" />
                  </div>
                </div>
                <button className="btn-icon" onClick={() => removeProfile(dp.id)} style={{ color: 'var(--danger)', alignSelf: 'flex-end', paddingBottom: 6 }} title="Remove profile">✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Processors ── */}
        <div style={styles.card}>
          <div style={{ ...styles.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>{t('setup.processors')}</span>
            <button className="btn-secondary" onClick={() => setShowProcPicker((v) => !v)} style={{ fontSize: 12 }}>
              {showProcPicker ? '✕ Close' : t('setup.addProcessor')}
            </button>
          </div>

          {/* Edit mode: show existing processors as read-only chips */}
          {isEditing && existingProject && (existingProject.processors ?? []).length > 0 && (
            <div style={styles.existingChips}>
              <span style={styles.existingLabel}>Existing:</span>
              {(existingProject.processors ?? []).map((p) => (
                <span key={p.id} style={styles.chip}>{p.name}</span>
              ))}
            </div>
          )}

          {/* Processor picker */}
          {showProcPicker && (
            <div style={styles.procPickerWrap}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="fg" style={{ flex: 1, minWidth: 180 }}>
                  <label>{t('setup.model')}</label>
                  <select value={selectedModelName} onChange={(e) => setSelectedModelName(e.target.value)}>
                    {procGroupKeys.map((cat) => (
                      <optgroup key={cat} label={cat}>
                        {procGroups[cat].map((m) => {
                          const procLocked = !isPro && m.name !== FREE_PROCESSOR;
                          return (
                            <option key={m.name} value={m.name} disabled={procLocked}>
                              {procLocked ? `🔒 ${m.name} — Pro only` : m.name}
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {isXDModel && selectedModel.xdExpander && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedModel.xdExpander.expanderLabel ?? 'XD Box'}es</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {Array.from({ length: selectedModel.xdExpander.maxBoxes }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          className={xdBoxCount === n ? 'btn-primary' : 'btn-secondary'}
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => setXdBoxCount(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  className="btn-primary"
                  onClick={(!isPro && selectedModelName !== FREE_PROCESSOR) ? () => setShowUpgrade(true) : addProcessor}
                  style={{ fontSize: 12, padding: '6px 16px', alignSelf: 'flex-end' }}
                >
                  {(!isPro && selectedModelName !== FREE_PROCESSOR) ? '🔒 Pro Only' : '+ Add'}
                </button>
                {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
              </div>

              <div style={styles.procPreview}>
                {procPortSummary(selectedModel, isXDModel ? xdBoxCount : 1, bitDepth)}
                {isXDModel && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>· {xdBoxCount} {selectedModel.xdExpander!.expanderLabel ?? 'XD Box'}{xdBoxCount !== 1 ? 'es' : ''}</span>}
              </div>
            </div>
          )}

          {draftProcessors.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              {t('setup.noProcessors')}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {draftProcessors.map((dp) => {
              const summary = procPortSummary(dp.model, dp.xdBoxCount, bitDepth);
              return (
                <div key={dp.id} style={styles.procRow}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input
                      value={dp.name}
                      onChange={(e) => updateProcName(dp.id, e.target.value)}
                      style={{ fontSize: 13, fontWeight: 600, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-muted)', color: 'var(--text-primary)', outline: 'none', padding: '2px 0', width: '100%' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {dp.model.category} · {summary}
                      {dp.model.xdExpander && <span style={{ marginLeft: 6 }}>· {dp.xdBoxCount} {dp.model.xdExpander.expanderLabel ?? 'XD Box'}{dp.xdBoxCount !== 1 ? 'es' : ''}</span>}
                    </span>
                  </div>
                  <button className="btn-icon" onClick={() => removeProcessor(dp.id)} style={{ color: 'var(--danger)', alignSelf: 'center' }} title="Remove">✕</button>
                </div>
              );
            })}
          </div>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {isEditing && (
            <button
              className="btn-secondary"
              onClick={() => useProjectStore.getState().goToSetup()}
              style={{ padding: '8px 18px', fontSize: 14 }}
            >
              {t('setup.cancel') || 'Cancel'}
            </button>
          )}
          <button className="btn-primary" onClick={handleCreate} style={{ padding: '8px 24px', fontSize: 14 }}>
            {isEditing ? (t('setup.updateProject') || 'Update Project') : t('setup.createProject')}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: '100%', height: '100%',
    background: 'var(--bg-base)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    overflowY: 'auto', paddingBottom: 40,
  },
  topBar: {
    width: '100%', background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
    padding: '6px 14px', display: 'flex', alignItems: 'center', flexShrink: 0,
  },
  header: {
    width: '100%', background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
    padding: '4px 0 8px', textAlign: 'center', marginBottom: 16,
  },
  logoClip: { height: 140, overflow: 'hidden', display: 'flex', justifyContent: 'center' } as React.CSSProperties,
  logoImg:  { height: 320, marginTop: -60, objectFit: 'contain' } as React.CSSProperties,
  logoSub:  { fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 },
  formWrap: { width: '100%', maxWidth: 780, padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 20 },
  card: {
    background: 'var(--bg-panel)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  cardTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 },
  profileRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
    padding: '10px 12px', border: '1px solid var(--border-muted)',
  },
  profileSwatch: { width: 4, height: 64, borderRadius: 2, flexShrink: 0, alignSelf: 'center' },
  errorBox: {
    background: 'rgba(248,81,73,0.1)', border: '1px solid var(--danger)',
    borderRadius: 'var(--radius)', color: 'var(--danger)',
    padding: '8px 12px', fontSize: 12,
  },
  editBanner: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    background: 'rgba(99,179,237,0.08)', border: '1px solid rgba(99,179,237,0.3)',
    borderRadius: 'var(--radius)', padding: '12px 14px',
  },
  existingChips: {
    display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center',
    gap: 6, padding: '6px 0 10px',
    borderBottom: '1px solid var(--border-muted)', marginBottom: 10,
  },
  existingLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.06em', color: 'var(--text-muted)', marginRight: 2,
  },
  chip: {
    fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border-muted)',
    borderRadius: 4, padding: '2px 8px',
  },
  // ── Tile library picker ──
  pickerWrap: {
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    overflow: 'hidden', background: 'var(--bg-base)',
  },
  pickerSearch: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
  },
  searchIcon:  { fontSize: 16, color: 'var(--text-muted)', flexShrink: 0 },
  searchInput: {
    flex: 1, fontSize: 13, padding: '4px 0',
    background: 'transparent', border: 'none',
    color: 'var(--text-primary)', outline: 'none',
  },
  clearBtn: {
    background: 'none', border: 'none',
    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
    padding: '2px 4px', flexShrink: 0,
  },
  pickerList: { maxHeight: 320, overflowY: 'auto' as const },
  pickerBrandHeader: {
    fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', color: 'var(--text-muted)',
    padding: '6px 12px 3px',
    background: 'var(--bg-hover)',
    borderBottom: '1px solid var(--border-muted)',
  },
  pickerRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 12px', borderBottom: '1px solid var(--border-muted)',
  },
  pickerInfo:   { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 1, minWidth: 0 },
  pickerName:   { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  pickerMeta:   { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' },
  pickerAddBtn: { fontSize: 11, padding: '3px 10px', flexShrink: 0 },
  pickerEmpty:  { padding: '20px', textAlign: 'center' as const, color: 'var(--text-muted)', fontSize: 12 },
  pickerFooter: {
    padding: '5px 12px', fontSize: 10, color: 'var(--text-muted)',
    borderTop: '1px solid var(--border-muted)', textAlign: 'right' as const,
    background: 'var(--bg-elevated)',
  },
  // ── Processor picker ──
  procPickerWrap: {
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    padding: '12px 14px', background: 'var(--bg-base)',
    display: 'flex', flexDirection: 'column' as const, gap: 8,
  },
  procPreview: {
    fontSize: 11, color: 'var(--accent)', fontFamily: 'monospace',
    paddingTop: 2,
  },
  procRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
    padding: '10px 12px', border: '1px solid var(--border-muted)',
  },
};

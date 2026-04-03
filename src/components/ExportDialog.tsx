import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/useProjectStore';
import { useLicenseStore } from '../license/licenseStore';
import { UpgradeModal } from './ProGate';
import { TILE_COLORS, Wall } from '../types';
import { exportProjectCSV, buildProjectCSV, downloadDataURL, downloadSVG } from '../utils/exportUtils';
import { exportProjectPDF, buildProjectReportHTML } from '../utils/pdfExport';
import { zipSync, strToU8 } from 'fflate';
import {
  ExportOptions,
  DEFAULT_EXPORT_OPTIONS,
  WALL_EXPORT_COLORS,
  getWallExportColor,
  renderCanvasExport,
  renderWallPixelMapExport,
  renderDataFlowExport,
  renderCanvasDataFlowExport,
  renderPowerFlowExport,
  renderCanvasPowerFlowExport,
  generateTestCardSVG,
  renderTestCardPNG,
} from '../utils/exportRenderers';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExportScope   = 'canvas' | 'active' | 'multi' | 'all';
type ExportContent = 'canvas' | 'pixelmap' | 'both' | 'csv' | 'pdf' | 'dataflow' | 'powerflow' | 'testcard' | 'exportall';
type TestCardFormat = 'svg' | 'png';

export default function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const isPro   = useLicenseStore((s) => s.isPro);

  const [scope,           setScope]          = useState<ExportScope>('active');
  const [multiIds,        setMultiIds]       = useState<string[]>([]);
  const [content,         setContent]        = useState<ExportContent>('pixelmap');
  const [opts,            setOpts]           = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [logoName,        setLogoName]       = useState('');
  const [testCardFormat,  setTestCardFormat] = useState<TestCardFormat>('svg');
  const [exporting,       setExporting]      = useState(false);
  const [showUpgrade,     setShowUpgrade]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !project) return null;

  const activeWall = project.walls.find((w) => w.id === project.activeWallId);

  // Profile colors used for individual tile rendering inside Wall Pixel Map
  const profileColorMap = new Map(
    project.tileProfiles.map((p, i) => [p.id, TILE_COLORS[i % TILE_COLORS.length]])
  );
  // Wall index map for consistent color assignment
  const wallIndexMap = new Map(project.walls.map((w, i) => [w.id, i]));

  const setOpt = <K extends keyof ExportOptions>(key: K, val: ExportOptions[K]) =>
    setOpts((prev) => ({ ...prev, [key]: val }));

  const toggleMultiId = (id: string) =>
    setMultiIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const wallsForPixelMap = (): Wall[] => {
    if (scope === 'active')  return activeWall ? [activeWall] : [];
    if (scope === 'all')     return project.walls;
    if (scope === 'multi')   return project.walls.filter((w) => multiIds.includes(w.id));
    return project.walls; // 'canvas' scope → all walls (ignored for pixel map scope selector)
  };

  const safeSlug = (s: string) => s.replace(/[^a-z0-9_-]/gi, '_');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setOpt('logoDataUrl', ev.target?.result as string ?? null);
    reader.readAsDataURL(file);
  };

  // Helper: dataURL → Uint8Array
  const dataUrlToBytes = (url: string): Uint8Array => {
    const base64 = url.split(',')[1];
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };

  const handleExport = async () => {
    setExporting(true);
    const projectSlug = safeSlug(project.name);

    try {
      if (content === 'exportall') {
        // Export all types as a zip
        const files: Record<string, Uint8Array> = {};
        // Canvas export
        const canvasUrl = await renderCanvasExport(project, project.walls, opts);
        files[`${projectSlug}_CanvasExport.${opts.format}`] = dataUrlToBytes(canvasUrl);
        // Pixel maps + data flow + power flow + test cards per wall
        for (const wall of project.walls) {
          const idx = wallIndexMap.get(wall.id) ?? 0;
          const pmUrl = await renderWallPixelMapExport(wall, idx, project, profileColorMap, opts);
          files[`${projectSlug}_${safeSlug(wall.name)}_PixelMap.${opts.format}`] = dataUrlToBytes(pmUrl);
          const dfUrl = await renderDataFlowExport(wall, idx, project, opts);
          files[`${projectSlug}_${safeSlug(wall.name)}_DataFlow.${opts.format}`] = dataUrlToBytes(dfUrl);
          const pfUrl = await renderPowerFlowExport(wall, idx, project, opts);
          files[`${projectSlug}_${safeSlug(wall.name)}_PowerFlow.${opts.format}`] = dataUrlToBytes(pfUrl);
          const tcPng = await renderTestCardPNG(wall, idx, project, opts.pixelRatio);
          files[`${projectSlug}_${safeSlug(wall.name)}_TestCard.png`] = dataUrlToBytes(tcPng);
        }
        // CSV — full production report
        files[`${projectSlug}_ProductionReport.csv`] = strToU8(buildProjectCSV(project));
        // PDF report as HTML
        const pdfHtml = buildProjectReportHTML(project, opts.logoDataUrl);
        files[`${projectSlug}_ProductionReport.html`] = strToU8(pdfHtml);
        // Zip and download
        const zipped = zipSync(files);
        const zipBlob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(zipBlob);
        a.download = `${projectSlug}_ExportAll.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      } else if (content === 'pdf') {
        exportProjectPDF(project, opts.logoDataUrl);
      } else if (content === 'csv') {
        exportProjectCSV(project, `${projectSlug}_ProductionReport.csv`);
      } else if (content === 'canvas') {
        const url = await renderCanvasExport(project, project.walls, opts);
        downloadDataURL(url, `${projectSlug}_CanvasExport.${opts.format}`);
      } else if (content === 'pixelmap') {
        for (const wall of wallsForPixelMap()) {
          const idx = wallIndexMap.get(wall.id) ?? 0;
          const url = await renderWallPixelMapExport(wall, idx, project, profileColorMap, opts);
          downloadDataURL(url, `${projectSlug}_${safeSlug(wall.name)}_PixelMap.${opts.format}`);
        }
      } else if (content === 'both') {
        const layoutUrl = await renderCanvasExport(project, project.walls, opts);
        downloadDataURL(layoutUrl, `${projectSlug}_CanvasExport.${opts.format}`);
        for (const wall of wallsForPixelMap()) {
          const idx = wallIndexMap.get(wall.id) ?? 0;
          const url = await renderWallPixelMapExport(wall, idx, project, profileColorMap, opts);
          downloadDataURL(url, `${projectSlug}_${safeSlug(wall.name)}_PixelMap.${opts.format}`);
        }
      } else if (content === 'dataflow') {
        if (dataflowIsFullCanvas) {
          const url = await renderCanvasDataFlowExport(project, project.walls, opts);
          downloadDataURL(url, `${projectSlug}_DataFlow_FullCanvas.${opts.format}`);
        } else {
          for (const wall of wallsForPixelMap()) {
            const idx = wallIndexMap.get(wall.id) ?? 0;
            const url = await renderDataFlowExport(wall, idx, project, opts);
            downloadDataURL(url, `${projectSlug}_${safeSlug(wall.name)}_DataFlow.${opts.format}`);
          }
        }
      } else if (content === 'powerflow') {
        if (scope === 'canvas') {
          const url = await renderCanvasPowerFlowExport(project, project.walls, opts);
          downloadDataURL(url, `${projectSlug}_PowerFlow_FullCanvas.${opts.format}`);
        } else {
          for (const wall of wallsForPixelMap()) {
            const idx = wallIndexMap.get(wall.id) ?? 0;
            const url = await renderPowerFlowExport(wall, idx, project, opts);
            downloadDataURL(url, `${projectSlug}_${safeSlug(wall.name)}_PowerFlow.${opts.format}`);
          }
        }
      } else if (content === 'testcard') {
        for (const wall of wallsForPixelMap()) {
          const idx = wallIndexMap.get(wall.id) ?? 0;
          if (testCardFormat === 'png') {
            const url = await renderTestCardPNG(wall, idx, project, opts.pixelRatio);
            downloadDataURL(url, `${projectSlug}_${safeSlug(wall.name)}_TestCard.png`);
          } else {
            const svg = generateTestCardSVG(wall, idx, project);
            downloadSVG(svg, `${projectSlug}_${safeSlug(wall.name)}_TestCard.svg`);
          }
        }
      }
    } finally {
      setExporting(false);
      onClose();
    }
  };

  const showWallScope = content === 'pixelmap' || content === 'both' || content === 'dataflow' || content === 'powerflow' || content === 'testcard';
  const isTestCard    = content === 'testcard';
  const isPDF         = content === 'pdf';
  const isExportAll   = content === 'exportall';
  const showViewDir   = content === 'dataflow' || content === 'powerflow';
  // For dataflow/powerflow, 'canvas' scope means a single full-canvas image (not per-wall)
  const dataflowIsFullCanvas = content === 'dataflow' && scope === 'canvas';
  const powerflowIsFullCanvas = content === 'powerflow' && scope === 'canvas';

  const exportCount =
    content === 'canvas'              ? 1
    : content === 'csv'               ? 1
    : content === 'pdf'               ? 1
    : content === 'exportall'         ? 1
    : content === 'testcard'          ? wallsForPixelMap().length
    : content === 'pixelmap'          ? wallsForPixelMap().length
    : content === 'both'              ? wallsForPixelMap().length + 1
    : content === 'dataflow'          ? (dataflowIsFullCanvas ? 1 : wallsForPixelMap().length)
    : content === 'powerflow'         ? (powerflowIsFullCanvas ? 1 : wallsForPixelMap().length)
    : wallsForPixelMap().length;

  const canExport = !exporting && exportCount > 0;

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={S.header}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={S.title}>{t('exportDialog.title')}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {project.name}
            </span>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>

          {/* ── Export Type ── */}
          <div>
            <div style={S.sectionLabel}>{t('exportDialog.exportType')}</div>
            <div style={S.contentGrid}>
              {([
                { val: 'canvas',    icon: '▦',  labelKey: 'exportDialog.canvasExport',     proOnly: false },
                { val: 'pixelmap',  icon: '▤',  labelKey: 'exportDialog.wallPixelMap',     proOnly: false },
                { val: 'both',      icon: '◧',  labelKey: 'exportDialog.both',             proOnly: false },
                { val: 'csv',       icon: '≡',  labelKey: 'exportDialog.productionReport', proOnly: true  },
                { val: 'pdf',       icon: '⬡',  labelKey: 'exportDialog.pdfReport',        proOnly: true  },
                { val: 'dataflow',  icon: '→',  labelKey: 'exportDialog.dataFlowMap',      proOnly: false },
                { val: 'powerflow', icon: '⚡', labelKey: 'exportDialog.powerFlowMap',     proOnly: false },
                { val: 'testcard',  icon: '◎',  labelKey: 'exportDialog.testCard',         proOnly: false },
                { val: 'exportall', icon: '⬇',  labelKey: 'exportDialog.exportAll',        proOnly: true  },
              ] as { val: ExportContent; icon: string; labelKey: string; proOnly: boolean }[]).map(({ val, icon, labelKey, proOnly }) => {
                const full = t(labelKey);
                const dashIdx = full.indexOf(' — ');
                const title = dashIdx >= 0 ? full.slice(0, dashIdx) : full;
                const sub   = dashIdx >= 0 ? full.slice(dashIdx + 3) : '';
                const locked = proOnly && !isPro;
                return (
                <button
                  key={val}
                  style={{
                    ...S.typeBtn,
                    ...(content === val && !locked ? S.typeBtnActive : {}),
                    ...(locked ? { opacity: 0.45, cursor: 'pointer' } : {}),
                  }}
                  onClick={locked ? () => setShowUpgrade(true) : () => setContent(val)}
                  title={locked ? 'Pro feature' : undefined}
                >
                  <span style={{ fontSize: 18, lineHeight: 1, fontFamily: 'monospace' }}>{locked ? '🔒' : icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: (content === val && !locked) ? 'var(--accent-bright)' : 'var(--text-primary)' }}>{title}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, textAlign: 'center' }}>{sub}</span>
                </button>
              );})}
              {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
            </div>
          </div>

          {/* ── Wall Scope (for pixel map / both / csv) ── */}
          {showWallScope && (
            <div>
              <div style={S.sectionLabel}>{t('exportDialog.wallScope')}</div>
              <div style={S.scopeGroup}>
                {(content === 'dataflow' || content === 'powerflow') && (
                  <label style={S.radioRow}>
                    <input type="radio" name="scope" value="canvas" checked={scope === 'canvas'} onChange={() => setScope('canvas')} style={{ accentColor: 'var(--accent)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('exportDialog.fullCanvas').split(' — ')[0]}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>— {t('exportDialog.fullCanvas').split(' — ')[1]}</span>
                  </label>
                )}
                {([
                  { val: 'active', label: t('exportDialog.activeWall'), sub: activeWall?.name ?? '—' },
                  { val: 'all',    label: t('exportDialog.allWalls'),  sub: `${project.walls.length} walls` },
                ] as { val: ExportScope; label: string; sub: string }[]).map(({ val, label, sub }) => (
                  <label key={val} style={S.radioRow}>
                    <input type="radio" name="scope" value={val} checked={scope === val} onChange={() => setScope(val)} style={{ accentColor: 'var(--accent)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>— {sub}</span>
                  </label>
                ))}
                {project.walls.length > 1 && (
                  <label style={S.radioRow}>
                    <input type="radio" name="scope" value="multi" checked={scope === 'multi'} onChange={() => { setScope('multi'); if (multiIds.length === 0 && activeWall) setMultiIds([activeWall.id]); }} style={{ accentColor: 'var(--accent)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('exportDialog.selectWalls')}</span>
                  </label>
                )}
                {scope === 'multi' && (
                  <div style={S.multiList}>
                    {project.walls.map((w, i) => {
                      const { accent } = getWallExportColor(i);
                      return (
                        <label key={w.id} style={{ ...S.radioRow, marginLeft: 18 }}>
                          <input type="checkbox" checked={multiIds.includes(w.id)} onChange={() => toggleMultiId(w.id)} style={{ accentColor: 'var(--accent)' }} />
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{w.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>({w.tiles.length} tiles)</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Wall color legend (for canvas export) ── */}
          {(content === 'canvas' || content === 'both') && project.walls.length > 0 && (
            <div>
              <div style={S.sectionLabel}>{t('exportDialog.wallColors')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {project.walls.map((w, i) => {
                  const { bright, accent } = getWallExportColor(i);
                  return (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-elevated)', border: `1px solid ${bright}55`, borderRadius: 6, padding: '3px 8px' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: bright, border: `1px solid ${accent}` }} />
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{w.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Test Card format ── */}
          {isTestCard && (
            <div>
              <div style={S.sectionLabel}>Format</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['svg', 'png'] as TestCardFormat[]).map((f) => (
                  <button key={f} style={{ ...S.fmtBtn, ...(testCardFormat === f ? S.fmtBtnActive : {}) }} onClick={() => setTestCardFormat(f)}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{f.toUpperCase()}</span>
                    <span style={{ fontSize: 10, color: testCardFormat === f ? 'var(--accent-bright)' : 'var(--text-muted)' }}>{f === 'svg' ? 'Vector' : 'Raster'}</span>
                  </button>
                ))}
                {testCardFormat === 'png' && (
                  <button style={{ ...S.fmtBtn, ...(opts.pixelRatio === 2 ? S.fmtBtnActive : {}) }} onClick={() => setOpt('pixelRatio', opts.pixelRatio === 2 ? 1 : 2)}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>2×</span>
                    <span style={{ fontSize: 10, color: opts.pixelRatio === 2 ? 'var(--accent-bright)' : 'var(--text-muted)' }}>Retina</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── View Direction (Data/Power maps) ── */}
          {showViewDir && (
            <div>
              <div style={S.sectionLabel}>View Direction</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['front', 'back'] as const).map((dir) => (
                  <button key={dir} style={{ ...S.fmtBtn, ...(opts.viewDirection === dir ? S.fmtBtnActive : {}) }} onClick={() => setOpt('viewDirection', dir)}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{dir === 'front' ? 'Front View' : 'Back View'}</span>
                    <span style={{ fontSize: 10, color: opts.viewDirection === dir ? 'var(--accent-bright)' : 'var(--text-muted)' }}>{dir === 'front' ? 'Audience perspective' : 'Installer perspective'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Export All info ── */}
          {isExportAll && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Exports all walls as: Canvas, Pixel Maps, Data Flow Maps, Power Flow Maps, Test Cards (PNG), and a CSV production report — bundled into a single ZIP file named after your project.
              </div>
            </div>
          )}

          {/* ── PDF info ── */}
          {isPDF && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {t('exportDialog.pdfHint')}
              </div>
            </div>
          )}

          {/* ── Format ── */}
          {content !== 'csv' && content !== 'pdf' && !isTestCard && !isExportAll && (
            <div>
              <div style={S.sectionLabel}>{t('exportDialog.format')}</div>
              <div style={S.formatRow}>
                {([
                  { val: 'png' as const, label: 'PNG', sub: t('exportDialog.png').split(' — ')[1] ?? 'Lossless' },
                  { val: 'jpg' as const, label: 'JPG', sub: t('exportDialog.jpg').split(' — ')[1] ?? 'Compact'  },
                ]).map(({ val, label, sub }) => (
                  <button key={val} style={{ ...S.fmtBtn, ...(opts.format === val ? S.fmtBtnActive : {}) }} onClick={() => setOpt('format', val)}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
                    <span style={{ fontSize: 10, color: opts.format === val ? 'var(--accent-bright)' : 'var(--text-muted)' }}>{sub}</span>
                  </button>
                ))}
                <button style={{ ...S.fmtBtn, ...(opts.pixelRatio === 2 ? S.fmtBtnActive : {}) }} onClick={() => setOpt('pixelRatio', opts.pixelRatio === 2 ? 1 : 2)}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>2×</span>
                  <span style={{ fontSize: 10, color: opts.pixelRatio === 2 ? 'var(--accent-bright)' : 'var(--text-muted)' }}>{t('exportDialog.retina').split(' — ')[1] ?? 'Retina'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Annotations ── */}
          {content !== 'csv' && content !== 'pdf' && !isTestCard && !isExportAll && (
            <div>
              <div style={S.sectionLabel}>{t('exportDialog.annotations')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {([
                  { key: 'includeWallName',        labelKey: 'exportDialog.wallName'         },
                  { key: 'includeWallResolution',   labelKey: 'exportDialog.wallResolution'   },
                  { key: 'includeCanvasPosition',   labelKey: 'exportDialog.canvasPosition',  noCanvas: true  },
                  { key: 'includeRasterResolution', labelKey: 'exportDialog.canvasDimensions' },
                  { key: 'includeTileResolution',   labelKey: 'exportDialog.tileResolution',  noCanvas: true  },
                ] as { key: keyof ExportOptions; labelKey: string; noCanvas?: boolean }[])
                  .filter(({ noCanvas }) => !noCanvas || content !== 'canvas')
                  .map(({ key, labelKey }) => (
                    <label key={key} className="toggle-row">
                      <input
                        type="checkbox"
                        checked={opts[key] as boolean}
                        onChange={(e) => setOpt(key, e.target.checked as ExportOptions[typeof key])}
                      />
                      {t(labelKey)}
                    </label>
                  ))
                }
              </div>
            </div>
          )}

          {/* ── Logo ── */}
          {content !== 'csv' && content !== 'exportall' && isPro && (
            <div>
              <div style={S.sectionLabel}>{t('exportDialog.logo')}</div>
              <div style={S.logoRow}>
                <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }} onClick={() => fileInputRef.current?.click()}>
                  {opts.logoDataUrl ? t('exportDialog.changeLogo') : t('exportDialog.uploadLogo')}
                </button>
                {opts.logoDataUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <img src={opts.logoDataUrl} alt="logo" style={{ height: 26, objectFit: 'contain', borderRadius: 3, background: 'rgba(255,255,255,0.06)', padding: '2px 4px' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{logoName}</span>
                    <button className="btn-icon" style={{ color: 'var(--danger)', flexShrink: 0 }} onClick={() => { setOpt('logoDataUrl', null); setLogoName(''); }}>✕</button>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('exportDialog.logoHint')}</span>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
              </div>
            </div>
          )}

          {/* ── Summary ── */}
          <div style={S.summaryBox}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={S.chip}>{exportCount} file{exportCount !== 1 ? 's' : ''}</span>
              {content !== 'csv' && content !== 'pdf' && !isExportAll && <span style={S.chip}>{opts.format.toUpperCase()} · {opts.pixelRatio}×</span>}
              {content === 'csv' && <span style={S.chip}>CSV</span>}
              {content === 'pdf' && <span style={S.chip}>PDF</span>}
              {isExportAll && <span style={S.chip}>ZIP · All formats</span>}
            </div>
            <div style={{ marginTop: 7, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {content === 'canvas'                      && <code style={{ fontFamily: 'monospace' }}>{safeSlug(project.name)}_CanvasExport.{opts.format}</code>}
              {content === 'pixelmap'                    && <code style={{ fontFamily: 'monospace' }}>{safeSlug(project.name)}_{'{wallName}'}_PixelMap.{opts.format}</code>}
              {content === 'both'                        && <span>CanvasExport + per-wall PixelMap</span>}
              {content === 'csv'                         && <code style={{ fontFamily: 'monospace' }}>{safeSlug(project.name)}_ProductionReport.csv</code>}
              {content === 'pdf'                         && <span>Opens in new window &rarr; Save as PDF</span>}
              {content === 'dataflow' && dataflowIsFullCanvas    && <code style={{ fontFamily: 'monospace' }}>{safeSlug(project.name)}_DataFlow_FullCanvas.{opts.format}</code>}
              {content === 'dataflow' && !dataflowIsFullCanvas   && <code style={{ fontFamily: 'monospace' }}>{safeSlug(project.name)}_{'{wallName}'}_DataFlow.{opts.format}</code>}
              {content === 'powerflow' && powerflowIsFullCanvas  && <code style={{ fontFamily: 'monospace' }}>{safeSlug(project.name)}_PowerFlow_FullCanvas.{opts.format}</code>}
              {content === 'powerflow' && !powerflowIsFullCanvas && <code style={{ fontFamily: 'monospace' }}>{safeSlug(project.name)}_{'{wallName}'}_PowerFlow.{opts.format}</code>}
              {content === 'exportall'                   && <code style={{ fontFamily: 'monospace' }}>{safeSlug(project.name)}_ExportAll.zip</code>}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={S.footer}>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12 }}>{t('exportDialog.cancel')}</button>
          <button
            className="btn-primary"
            onClick={handleExport}
            disabled={!canExport}
            style={{ fontSize: 12, padding: '6px 22px', minWidth: 110 }}
          >
            {exporting ? t('exportDialog.opening') : isPDF ? t('exportDialog.openReport') : isExportAll ? 'Export ZIP' : t('exportDialog.exportBtn')}
          </button>
        </div>

      </div>
    </div>
  );
}

// Suppress unused import warning — WALL_EXPORT_COLORS is used by wall color legend
void WALL_EXPORT_COLORS;

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.76)', backdropFilter: 'blur(6px)',
    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: 'var(--bg-panel)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', width: 490,
    maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 48px)',
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
    boxShadow: '0 40px 100px rgba(0,0,0,0.65)',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: '16px 20px 13px', borderBottom: '1px solid var(--border)',
  },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  closeBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-muted)',
    fontSize: 14, cursor: 'pointer', padding: '2px 5px',
    borderRadius: 'var(--radius-sm)', lineHeight: 1, marginTop: 2,
  },
  body: {
    padding: '20px', overflowY: 'auto', display: 'flex',
    flexDirection: 'column', gap: 20, flex: 1,
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8,
    padding: '13px 20px', borderTop: '1px solid var(--border)',
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase' as const, letterSpacing: '0.07em',
    color: 'var(--text-muted)', marginBottom: 8,
  },
  contentGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7,
  },
  typeBtn: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    gap: 5, padding: '12px 10px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
    cursor: 'pointer', transition: 'all 0.12s',
  },
  typeBtnActive: {
    background: 'var(--accent-dim)', border: '1px solid var(--accent)',
  },
  scopeGroup: { display: 'flex', flexDirection: 'column' as const, gap: 7 },
  radioRow: {
    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
    fontSize: 12, color: 'var(--text-secondary)',
    fontWeight: 'normal' as const, textTransform: 'none' as const,
    letterSpacing: 0, marginBottom: 0, userSelect: 'none' as const,
  },
  multiList: {
    marginTop: 6, display: 'flex', flexDirection: 'column' as const,
    gap: 5, paddingLeft: 4,
  },
  formatRow: { display: 'flex', gap: 6 },
  fmtBtn: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    gap: 3, padding: '9px 16px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
    cursor: 'pointer', transition: 'all 0.12s', flex: '1 1 auto',
  },
  fmtBtnActive: {
    background: 'var(--accent-dim)', border: '1px solid var(--accent)',
    color: 'var(--accent-bright)',
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const },
  summaryBox: {
    background: 'var(--bg-base)', border: '1px solid var(--border-muted)',
    borderRadius: 'var(--radius)', padding: '10px 14px',
  },
  chip: {
    display: 'inline-block',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '2px 8px',
    fontSize: 11, fontWeight: 600,
    color: 'var(--text-secondary)', fontFamily: 'monospace',
  } as React.CSSProperties,
};

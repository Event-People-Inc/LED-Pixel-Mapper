import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/useProjectStore';
import { useLicenseStore } from '../license/licenseStore';
import { UpgradeModal } from './ProGate';
import { CANVAS_PRESETS } from '../types';
import MathInput from './MathInput';

const CANVAS_RESOLUTION_PRESETS = [
  ...CANVAS_PRESETS.filter((p) => p.width > 0),
  { label: 'Custom', width: 0, height: 0 },
];

// Fixed accent colors for canvas tabs (separate from wall colors)
const CANVAS_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#ef4444', // red
  '#3b82f6', // blue
];

export default function CanvasBottomBar() {
  const { t }          = useTranslation();
  const project        = useProjectStore((s) => s.project);
  const savedCanvases  = useProjectStore((s) => s.savedCanvases);
  const addCanvas      = useProjectStore((s) => s.addCanvas);
  const switchCanvas   = useProjectStore((s) => s.switchCanvas);
  const removeCanvas   = useProjectStore((s) => s.removeCanvas);
  const renameCanvas   = useProjectStore((s) => s.renameCanvas);
  const isPro          = useLicenseStore((s) => s.isPro);

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editValue,   setEditValue]   = useState('');
  const [showPopup,   setShowPopup]   = useState(false);
  const [newName,     setNewName]     = useState('');
  const [presetLabel, setPresetLabel] = useState(CANVAS_RESOLUTION_PRESETS[0].label);
  const [customW,     setCustomW]     = useState(1920);
  const [customH,     setCustomH]     = useState(1080);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!project) return null;

  // All canvases: active first, then saved — preserved insertion order
  const allCanvases = [project, ...savedCanvases];
  const totalCanvases = allCanvases.length;
  const canvasLimitReached = !isPro && totalCanvases >= 2;

  const startRename = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditValue(name);
    setTimeout(() => inputRef.current?.select(), 10);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) renameCanvas(editingId, editValue.trim());
    setEditingId(null);
  };

  const openPopup = () => {
    setNewName(`Canvas ${totalCanvases + 1}`);
    setPresetLabel(CANVAS_RESOLUTION_PRESETS[0].label);
    setCustomW(1920);
    setCustomH(1080);
    setShowPopup(true);
  };

  const confirmAdd = () => {
    const name   = newName.trim() || `Canvas ${totalCanvases + 1}`;
    const preset = CANVAS_RESOLUTION_PRESETS.find((p) => p.label === presetLabel);
    const isCustom = !preset || preset.width === 0;
    const w = isCustom ? (customW || 1920) : preset!.width;
    const h = isCustom ? (customH || 1080) : preset!.height;
    addCanvas(name, w, h);
    setShowPopup(false);
  };

  const isCustomPreset = (CANVAS_RESOLUTION_PRESETS.find((p) => p.label === presetLabel)?.width ?? 0) === 0;

  return (
    <>
      <div style={S.bar}>
        <div style={S.scroll}>
          {allCanvases.map((canvas, i) => {
            const isActive  = canvas.id === project.id;
            const color     = CANVAS_COLORS[i % CANVAS_COLORS.length];
            const isEditing = editingId === canvas.id;

            return (
              <div
                key={canvas.id}
                style={{
                  ...S.tab,
                  background: isActive ? `${color}22` : 'transparent',
                  border:     `1px solid ${isActive ? color : 'var(--border)'}`,
                  color:      isActive ? color : 'var(--text-muted)',
                  boxShadow:  isActive ? `0 0 8px ${color}33` : 'none',
                }}
                onClick={() => !isEditing && !isActive && switchCanvas(canvas.id)}
                onDoubleClick={(e) => startRename(canvas.id, canvas.name, e)}
                title={`${canvas.name} · ${canvas.canvasWidth}×${canvas.canvasHeight} — double-click to rename`}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, opacity: isActive ? 1 : 0.45 }} />

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
                  <span style={S.tabName}>{canvas.name}</span>
                )}

                {!isEditing && (
                  <span style={S.resBadge}>{canvas.canvasWidth}×{canvas.canvasHeight}</span>
                )}

                {totalCanvases > 1 && !isEditing && (
                  <button
                    style={S.closeBtn}
                    onClick={(e) => { e.stopPropagation(); removeCanvas(canvas.id); }}
                    title="Remove canvas"
                  >×</button>
                )}
              </div>
            );
          })}

          <button
            style={{ ...S.addBtn, ...(canvasLimitReached ? { opacity: 0.45 } : {}) }}
            onClick={() => canvasLimitReached ? setShowUpgrade(true) : openPopup()}
            title={canvasLimitReached ? 'Pro feature — max 2 canvases on free tier' : 'Add new canvas'}
          >
            {canvasLimitReached ? '🔒' : '+'}
          </button>
        </div>

        {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
      </div>

      {/* ── New canvas popup ───────────────────────────────── */}
      {showPopup && (
        <div style={S.overlay} onClick={() => setShowPopup(false)}>
          <div style={S.popup} onClick={(e) => e.stopPropagation()}>
            <div style={S.popupTitle}>New Canvas</div>

            <div className="fg" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11 }}>Canvas Name</label>
              <input
                autoFocus
                className="input-sm"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') setShowPopup(false); }}
                style={{ width: '100%', fontSize: 12 }}
              />
            </div>

            <div className="fg" style={{ marginBottom: isCustomPreset ? 8 : 16 }}>
              <label style={{ fontSize: 11 }}>Canvas Resolution</label>
              <select
                className="input-sm"
                value={presetLabel}
                onChange={(e) => setPresetLabel(e.target.value)}
                style={{ width: '100%', fontSize: 11 }}
              >
                {CANVAS_RESOLUTION_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>{p.label}</option>
                ))}
              </select>
            </div>

            {isCustomPreset && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div className="fg">
                  <label style={{ fontSize: 11 }}>Width (px)</label>
                  <MathInput min={1} value={customW} onChange={(v) => setCustomW(parseInt(v) || 1920)} />
                </div>
                <div className="fg">
                  <label style={{ fontSize: 11 }}>Height (px)</label>
                  <MathInput min={1} value={customH} onChange={(v) => setCustomH(parseInt(v) || 1080)} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowPopup(false)}>
                {t('exportDialog.cancel')}
              </button>
              <button className="btn-primary" style={{ fontSize: 12 }} onClick={confirmAdd}>
                Create Canvas →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  bar: {
    height: 40,
    background: 'var(--bg-panel)',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    padding: '0 8px',
    gap: 0,
  },
  scroll: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    overflowX: 'auto',
    scrollbarWidth: 'none' as const,
    padding: '3px 0',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    transition: 'all 0.12s',
    flexShrink: 0,
    userSelect: 'none' as const,
  },
  tabName: {
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  resBadge: {
    fontSize: 9,
    fontFamily: 'monospace',
    opacity: 0.6,
    flexShrink: 0,
  },
  renameInput: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--accent)',
    borderRadius: 3,
    color: 'var(--text-primary)',
    fontSize: 11,
    padding: '1px 5px',
    width: 100,
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
    opacity: 0.55,
  },
  addBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--accent-bright)',
    fontSize: 20,
    fontWeight: 300,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
    flexShrink: 0,
  },
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9000,
  },
  popup: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 20,
    width: 320,
    boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
  },
  popupTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 14,
  },
};

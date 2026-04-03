import { Project, Wall, DEFAULT_LABEL_VISIBILITY } from '../types';

const FILE_EXT = '.lpmap.json';

function safeSlug(s: string) {
  return s.replace(/[^a-z0-9_-]/gi, '_');
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export function saveProjectJSON(project: Project, overrideName?: string): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${safeSlug(overrideName ?? project.name)}${FILE_EXT}`;
  a.click();
  URL.revokeObjectURL(url);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fileApi = () => (window as any).electronAPI?.file as {
  showSaveDialog: (name: string) => Promise<string | null>;
  saveToPath: (path: string, json: string) => Promise<{ success: boolean; message?: string }>;
} | undefined;

/**
 * Save using Electron's native dialog when available.
 * Pass `currentPath` to skip the dialog (Save); omit or pass null for Save As.
 * Returns the path that was written to, or null if the user cancelled.
 */
export async function saveProjectElectron(
  project: Project,
  currentPath: string | null,
): Promise<string | null> {
  const api = fileApi();
  if (!api) {
    saveProjectJSON(project);
    return null;
  }

  let filePath = currentPath;
  if (!filePath) {
    filePath = await api.showSaveDialog(`${safeSlug(project.name)}${FILE_EXT}`);
    if (!filePath) return null;
  }

  const json = JSON.stringify(project, null, 2);
  const result = await api.saveToPath(filePath, json);
  if (!result.success) throw new Error(result.message ?? 'Write failed');
  return filePath;
}

/**
 * Always shows the save dialog so the user can rename the file.
 * Returns the path written to, or null if cancelled.
 */
export async function saveProjectElectronAs(project: Project): Promise<string | null> {
  const api = fileApi();
  if (!api) {
    const name = window.prompt('Save As', project.name);
    if (name === null) return null;
    saveProjectJSON(project, name.trim() || project.name);
    return null;
  }

  const filePath = await api.showSaveDialog(`${safeSlug(project.name)}${FILE_EXT}`);
  if (!filePath) return null;

  const json = JSON.stringify(project, null, 2);
  const result = await api.saveToPath(filePath, json);
  if (!result.success) throw new Error(result.message ?? 'Write failed');
  return filePath;
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Parse a JSON string into a Project, applying any forward-compatibility
 * migrations (e.g. adding missing fields with sensible defaults).
 * Returns null if the JSON is invalid or missing required fields.
 */
export function parseProjectJSON(json: string): Project | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }

  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  // Required top-level fields
  if (
    typeof d.id !== 'string' ||
    typeof d.name !== 'string' ||
    !Array.isArray(d.walls) ||
    !Array.isArray(d.tileProfiles)
  ) {
    return null;
  }

  // Migrate walls
  const walls: Wall[] = (d.walls as unknown[]).map((w: unknown) => {
    const wall = w as Record<string, unknown>;
    return {
      id:   String(wall.id ?? ''),
      name: String(wall.name ?? 'Wall'),
      tiles: Array.isArray(wall.tiles) ? wall.tiles : [],
      ports: Array.isArray(wall.ports) ? wall.ports : [],
      labelVisibility: {
        ...DEFAULT_LABEL_VISIBILITY,
        ...(wall.labelVisibility && typeof wall.labelVisibility === 'object'
          ? wall.labelVisibility
          : {}),
      },
    };
  });

  const project: Project = {
    id:           String(d.id),
    name:         String(d.name),
    canvasWidth:  Number(d.canvasWidth)  || 1920,
    canvasHeight: Number(d.canvasHeight) || 1080,
    bitDepth:     d.bitDepth === '10bit' ? '10bit' : '8bit',
    tileProfiles: d.tileProfiles as Project['tileProfiles'],
    walls,
    activeWallId: String(d.activeWallId ?? walls[0]?.id ?? ''),
    processors:   Array.isArray(d.processors) ? d.processors as Project['processors'] : [],
    circuits:     Array.isArray(d.circuits)   ? d.circuits   as Project['circuits']   : [],
  };

  return project;
}

// ─── File picker helper ───────────────────────────────────────────────────────

/**
 * Open a browser file picker, read the selected file, and resolve with its text.
 * Resolves with null if the user cancels.
 */
export function pickAndReadFile(accept = '.json,.lpmap.json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input  = document.createElement('input');
    input.type   = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target?.result as string ?? null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    // If user dismisses the dialog without selecting, the change event never fires.
    // Use a focus-return heuristic to resolve null after a short delay.
    window.addEventListener(
      'focus',
      () => setTimeout(() => resolve(null), 500),
      { once: true },
    );
    input.click();
  });
}

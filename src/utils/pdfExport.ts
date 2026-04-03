import { Project } from '../types';

/** Open a beautifully styled HTML production report in a new window for PDF printing. */
export function exportProjectPDF(project: Project, logoDataUrl?: string | null): void {
  const html = buildReportHTML(project, logoDataUrl);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const newWin = window.open(url, '_blank');
  if (!newWin) {
    // Popup blocked — fall back to downloading as HTML
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name} – Production Report.html`;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const h = (s: string | number): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Returns the full HTML report string — use for zipping or opening in a new window. */
export function buildProjectReportHTML(project: Project, logoDataUrl?: string | null): string {
  return buildReportHTML(project, logoDataUrl);
}

function buildReportHTML(project: Project, logoDataUrl?: string | null): string {
  // ── Data ────────────────────────────────────────────────────
  const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
  const capMult = (project.bitDepth ?? '8bit') === '10bit' ? 0.5 : 1;

  const tilePixels = new Map<string, number>();
  for (const wall of project.walls) {
    for (const t of wall.tiles) {
      const prof = profileMap.get(t.profileId);
      if (prof) tilePixels.set(t.id, prof.pixelWidth * prof.pixelHeight);
    }
  }

  const totalTiles = project.walls.reduce((s, w) => s + w.tiles.length, 0);
  const totalPower = project.walls.reduce(
    (s, w) => s + w.tiles.reduce((ws, t) => ws + (t.powerUse ?? 0), 0), 0,
  );
  const totalLedPx = [...tilePixels.values()].reduce((s, n) => s + n, 0);
  const totalPorts = project.processors.reduce((s, p) => s + p.ports.length, 0);

  const procTypes  = new Map<string, number>();
  const boxTypes   = new Map<string, number>();
  const tileTypes  = new Map<string, number>();
  const socaTypes  = new Map<string, number>();

  for (const proc of project.processors) {
    procTypes.set(proc.name, (procTypes.get(proc.name) ?? 0) + 1);
    if (proc.xdBoxCount && proc.expanderLabel) {
      boxTypes.set(proc.expanderLabel, (boxTypes.get(proc.expanderLabel) ?? 0) + proc.xdBoxCount);
    }
  }
  for (const wall of project.walls) {
    for (const t of wall.tiles) {
      const name = profileMap.get(t.profileId)?.name ?? 'Unknown';
      tileTypes.set(name, (tileTypes.get(name) ?? 0) + 1);
    }
  }
  for (const soca of project.socas ?? []) {
    const type = soca.powerType ?? 'Powercon';
    socaTypes.set(type, (socaTypes.get(type) ?? 0) + 1);
  }

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  // ── CSS ─────────────────────────────────────────────────────
  const css = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy:   #0f172a;
      --slate:  #1e293b;
      --mid:    #475569;
      --muted:  #94a3b8;
      --border: #e2e8f0;
      --bg:     #f8fafc;
      --card:   #ffffff;
      --indigo: #4f46e5;
      --indigo2:#818cf8;
      --green:  #10b981;
      --amber:  #f59e0b;
      --red:    #ef4444;
    }
    html { background: #e2e8f0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      color: var(--slate);
      background: #e2e8f0;
      line-height: 1.5;
    }

    /* Print button */
    .print-btn {
      position: fixed; top: 20px; right: 20px;
      background: var(--indigo); color: white;
      border: none; padding: 11px 22px;
      border-radius: 8px; font-size: 13px; font-weight: 600;
      cursor: pointer; display: flex; align-items: center; gap: 8px;
      box-shadow: 0 4px 16px rgba(79,70,229,0.45); z-index: 9999;
      transition: background 0.15s;
    }
    .print-btn:hover { background: #4338ca; }

    /* Page container */
    .page {
      width: 210mm; background: var(--card);
      margin: 24px auto; border-radius: 4px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.14);
      overflow: hidden;
    }

    /* ── Cover ─────────────────────────────── */
    .cover {
      min-height: 297mm;
      background: var(--navy);
      color: white;
      display: flex; flex-direction: column;
      padding: 64px 60px;
    }
    .cover-brand {
      display: flex; align-items: center; gap: 12px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--indigo2); opacity: 0.9;
    }
    .cover-main { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 48px 0; }
    .cover-eyebrow {
      font-size: 12px; font-weight: 700; letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--indigo2); margin-bottom: 20px;
    }
    .cover-title {
      font-size: 44px; font-weight: 800; line-height: 1.1;
      letter-spacing: -0.02em; color: white; margin-bottom: 10px;
    }
    .cover-canvas {
      font-size: 18px; color: rgba(255,255,255,0.5); margin-bottom: 56px; font-weight: 400;
    }
    .cover-stats {
      display: grid; grid-template-columns: repeat(4, 1fr);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; overflow: hidden;
    }
    .cover-stat {
      padding: 22px 24px;
      border-right: 1px solid rgba(255,255,255,0.08);
    }
    .cover-stat:last-child { border-right: none; }
    .cover-stat-label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: rgba(255,255,255,0.4); margin-bottom: 8px;
    }
    .cover-stat-value { font-size: 20px; font-weight: 800; color: white; }
    .cover-footer {
      display: flex; justify-content: space-between; align-items: center;
      padding-top: 28px; border-top: 1px solid rgba(255,255,255,0.1);
      font-size: 11px; color: rgba(255,255,255,0.35);
    }

    /* ── Content page ──────────────────────── */
    .content-page { padding: 48px 52px; min-height: 297mm; }
    .page-header {
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: 16px; border-bottom: 2px solid var(--border); margin-bottom: 32px;
    }
    .page-header-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); }
    .page-header-project { font-size: 11px; color: var(--muted); }

    /* ── Section ───────────────────────────── */
    .section { margin-bottom: 36px; }
    .section-title {
      font-size: 15px; font-weight: 800; color: var(--slate);
      padding-bottom: 10px; margin-bottom: 20px;
      border-bottom: 2px solid var(--indigo);
      display: flex; align-items: center; gap: 10px;
    }
    .section-title::before {
      content: ''; display: block;
      width: 4px; height: 18px;
      background: var(--indigo); border-radius: 2px;
    }

    /* ── Stat cards ────────────────────────── */
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat-card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 10px; padding: 16px 18px;
      position: relative; overflow: hidden;
    }
    .stat-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0;
      height: 3px; background: var(--indigo);
    }
    .stat-label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.09em; color: var(--muted); margin-bottom: 8px;
    }
    .stat-value { font-size: 22px; font-weight: 800; color: var(--slate); line-height: 1; }
    .stat-sub { font-size: 11px; color: var(--muted); margin-top: 4px; }

    /* ── Type breakdown blocks ─────────────── */
    .type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 24px; }
    .type-block { background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .type-block-header {
      background: var(--slate); color: white;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
      padding: 9px 14px;
    }
    .type-block table { width: 100%; border-collapse: collapse; }
    .type-block td { padding: 8px 14px; font-size: 12px; border-bottom: 1px solid var(--border); }
    .type-block tr:last-child td { border-bottom: none; }
    .type-block tr:nth-child(even) td { background: var(--bg); }
    .type-block td:last-child { text-align: right; font-weight: 700; color: var(--indigo); }

    /* ── Data tables ───────────────────────── */
    .data-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
    .data-table thead th {
      background: var(--slate); color: white;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
      padding: 9px 11px; text-align: left; white-space: nowrap;
    }
    .data-table thead tr th:first-child { border-radius: 6px 0 0 0; }
    .data-table thead tr th:last-child  { border-radius: 0 6px 0 0; }
    .data-table tbody tr:nth-child(even) td { background: var(--bg); }
    .data-table tbody td { padding: 9px 11px; border-bottom: 1px solid var(--border); color: var(--slate); }
    .data-table tbody tr:last-child td { border-bottom: none; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .tag {
      display: inline-block; background: #ede9fe; color: var(--indigo);
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
    }
    .tag-green { background: #d1fae5; color: #065f46; }
    .tag-amber { background: #fef3c7; color: #92400e; }

    /* ── Wall section ──────────────────────── */
    .wall-section { padding-top: 32px; }
    .wall-title {
      font-size: 20px; font-weight: 800; color: var(--slate);
      margin-bottom: 20px; display: flex; align-items: center; gap: 10px;
    }
    .wall-badge {
      background: var(--indigo); color: white;
      font-size: 10px; font-weight: 700; padding: 3px 10px;
      border-radius: 20px; text-transform: uppercase; letter-spacing: 0.08em;
    }

    /* ── Sub-section ───────────────────────── */
    .sub-section { margin-bottom: 26px; }
    .sub-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.12em; color: var(--indigo);
      padding: 0 0 8px; margin-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }

    /* ── Color dot ─────────────────────────── */
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 8px; vertical-align: middle; }

    /* ── Force color preservation ──────────── */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    /* ── Print ─────────────────────────────── */
    @page { size: A4; margin: 12mm 14mm; }
    @media print {
      html, body { background: white; }
      .print-btn { display: none !important; }
      .page { box-shadow: none; margin: 0; width: 100%; border-radius: 0; }
      .cover { min-height: unset; height: 100vh; page-break-after: always; }
      .content-page { page-break-before: always; }
      .data-table thead { display: table-header-group; }
    }
  `;

  // ── Helpers ──────────────────────────────────────────────────
  const typeGrid = (
    pm: Map<string, number>,
    bm: Map<string, number>,
    tm: Map<string, number>,
    sm?: Map<string, number>,
  ) => `
    <div class="type-grid">
      ${pm.size > 0 ? `
        <div class="type-block">
          <div class="type-block-header">Processor Types</div>
          <table>${[...pm].map(([n, c]) => `<tr><td>${h(n)}</td><td>${c}×</td></tr>`).join('')}</table>
        </div>` : ''}
      ${bm.size > 0 ? `
        <div class="type-block">
          <div class="type-block-header">Extension Box Types</div>
          <table>${[...bm].map(([n, c]) => `<tr><td>${h(n)}</td><td>${c}×</td></tr>`).join('')}</table>
        </div>` : ''}
      ${tm.size > 0 ? `
        <div class="type-block">
          <div class="type-block-header">Tile Types</div>
          <table>${[...tm].map(([n, c]) => `<tr><td>${h(n)}</td><td>${c}×</td></tr>`).join('')}</table>
        </div>` : ''}
      ${sm && sm.size > 0 ? `
        <div class="type-block">
          <div class="type-block-header">Soca Splay Types</div>
          <table>${[...sm].map(([n, c]) => `<tr><td>${h(n)}</td><td>${c}×</td></tr>`).join('')}</table>
        </div>` : ''}
    </div>`;

  // ── Cover page ───────────────────────────────────────────────
  const cover = `
    <div class="page">
      <div class="cover">
        <div class="cover-brand">
          ${logoDataUrl
            ? `<img src="${logoDataUrl}" alt="Logo" style="height:40px;max-width:180px;object-fit:contain;border-radius:4px;" />`
            : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect width="9" height="9" rx="2" fill="#6366f1"/>
            <rect x="11" width="9" height="9" rx="2" fill="#818cf8"/>
            <rect y="11" width="9" height="9" rx="2" fill="#4f46e5"/>
            <rect x="11" y="11" width="9" height="9" rx="2" fill="#6366f1"/>
          </svg>
          LED Pixel Mapper`
          }
        </div>

        <div class="cover-main">
          <div class="cover-eyebrow">Production Report</div>
          <div class="cover-title">${h(project.name)}</div>
          <div class="cover-canvas">
            ${h(project.canvasWidth.toLocaleString())} &times; ${h(project.canvasHeight.toLocaleString())} px
            &nbsp;&middot;&nbsp; ${h(project.bitDepth ?? '8bit')}
          </div>
          <div class="cover-stats">
            <div class="cover-stat">
              <div class="cover-stat-label">Walls</div>
              <div class="cover-stat-value">${project.walls.length}</div>
            </div>
            <div class="cover-stat">
              <div class="cover-stat-label">Total Tiles</div>
              <div class="cover-stat-value">${totalTiles.toLocaleString()}</div>
            </div>
            <div class="cover-stat">
              <div class="cover-stat-label">Processors</div>
              <div class="cover-stat-value">${project.processors.length}</div>
            </div>
            <div class="cover-stat">
              <div class="cover-stat-label">LED Pixels</div>
              <div class="cover-stat-value">${totalLedPx.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div class="cover-footer">
          <span>Generated ${h(dateStr)}</span>
          <span>Confidential &mdash; Production Use Only</span>
        </div>
      </div>
    </div>`;

  // ── Overview page ────────────────────────────────────────────
  const overviewPage = `
    <div class="page">
      <div class="content-page">
        <div class="page-header">
          <span class="page-header-title">Project Overview</span>
          <span class="page-header-project">${h(project.name)}</span>
        </div>

        <div class="section">
          <div class="section-title">Project Totals</div>
          <div class="stat-grid">
            <div class="stat-card">
              <div class="stat-label">Total Tiles</div>
              <div class="stat-value">${totalTiles.toLocaleString()}</div>
              <div class="stat-sub">across ${project.walls.length} wall${project.walls.length !== 1 ? 's' : ''}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">LED Pixels</div>
              <div class="stat-value">${totalLedPx.toLocaleString()}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Processors</div>
              <div class="stat-value">${project.processors.length}</div>
              <div class="stat-sub">${totalPorts} total ports</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Power</div>
              <div class="stat-value">${totalPower.toLocaleString()}</div>
              <div class="stat-sub">watts</div>
            </div>
          </div>
          ${typeGrid(procTypes, boxTypes, tileTypes, socaTypes)}
        </div>

        <div class="section">
          <div class="section-title">Canvas Overview</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Wall</th>
                <th>Canvas Position</th>
                <th class="num">Tiles</th>
                <th class="num">LED Pixels</th>
                <th class="num">Power (W)</th>
                <th class="num">Circuits</th>
                <th>Processors</th>
              </tr>
            </thead>
            <tbody>
              ${project.walls.map((wall) => {
                let minX = Infinity, minY = Infinity;
                let wallPwr = 0, wallPx = 0;
                for (const t of wall.tiles) {
                  minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
                  wallPwr += t.powerUse ?? 0;
                  wallPx  += tilePixels.get(t.id) ?? 0;
                }
                const pos   = wall.tiles.length === 0 ? '&ndash;' : `X: ${minX} &middot; Y: ${minY}`;
                const procs = project.processors
                  .filter((p) => p.ports.some((pt) => pt.wallId === wall.id))
                  .map((p) => p.name).join(', ') || '&ndash;';
                const circs = project.circuits.filter((c) => c.wallId === wall.id).length;
                return `<tr>
                  <td><strong>${h(wall.name)}</strong></td>
                  <td style="color:var(--mid);font-size:11px">${pos}</td>
                  <td class="num">${wall.tiles.length}</td>
                  <td class="num">${wallPx.toLocaleString()}</td>
                  <td class="num">${wallPwr.toLocaleString()}</td>
                  <td class="num">${circs}</td>
                  <td style="font-size:11px">${procs}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  // ── Processor requirements page ──────────────────────────────
  const processorPage = project.processors.length > 0 ? `
    <div class="page">
      <div class="content-page">
        <div class="page-header">
          <span class="page-header-title">Processor Requirements</span>
          <span class="page-header-project">${h(project.name)}</span>
        </div>

        <div class="section">
          <div class="section-title">Processor Requirements</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Processor</th>
                <th>Type</th>
                <th class="num">Ports</th>
                <th>Extension Boxes</th>
                <th>Walls Served</th>
                <th class="num">Tiles</th>
                <th class="num">LED Pixels</th>
                <th class="num">Capacity</th>
              </tr>
            </thead>
            <tbody>
              ${project.processors.map((proc) => {
                const isXD = !!(proc.xdBoxCount && proc.xdBoxSize);
                const wallsServed = [
                  ...new Set(
                    proc.ports.filter((p) => p.wallId)
                      .map((p) => project.walls.find((w) => w.id === p.wallId)?.name ?? '?'),
                  ),
                ];
                const tilesRouted  = proc.ports.reduce((s, p) => s + p.tileIds.length, 0);
                const pixelsRouted = proc.ports.reduce(
                  (s, p) => s + p.tileIds.reduce((ps, tid) => ps + (tilePixels.get(tid) ?? 0), 0), 0,
                );
                const totalCap = proc.ports.reduce(
                  (s, p) => p.pixelCapacity !== undefined ? s + Math.floor(p.pixelCapacity * capMult) : s, 0,
                );
                const pct = totalCap > 0 ? Math.round((pixelsRouted / totalCap) * 100) : null;
                const pctColor = pct === null ? '' : pct >= 90 ? 'color:var(--red)' : pct >= 75 ? 'color:var(--amber)' : 'color:var(--green)';
                return `<tr>
                  <td><strong>${h(proc.name)}</strong></td>
                  <td><span class="tag${isXD ? ' tag-amber' : ' tag-green'}">${h(isXD ? `${proc.expanderLabel ?? 'XD'} Expander` : 'Standard')}</span></td>
                  <td class="num">${proc.ports.length}</td>
                  <td style="font-size:11px">${isXD ? `${proc.xdBoxCount}&times; ${h(proc.expanderLabel ?? 'XD Box')}` : '&ndash;'}</td>
                  <td style="font-size:11px">${h(wallsServed.join(', ') || '–')}</td>
                  <td class="num">${tilesRouted}</td>
                  <td class="num">${pixelsRouted.toLocaleString()}</td>
                  <td class="num">
                    ${totalCap > 0 ? totalCap.toLocaleString() : '&ndash;'}
                    ${pct !== null ? `<br><span style="font-size:10px;${pctColor}">${pct}% used</span>` : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        ${project.circuits.length > 0 ? `
          <div class="section">
            <div class="section-title">Circuit Requirements</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Circuit</th>
                  <th>Wall</th>
                  <th class="num">Tiles</th>
                  <th class="num">Power (W)</th>
                </tr>
              </thead>
              <tbody>
                ${project.circuits.map((circuit) => {
                  const wallName = project.walls.find((w) => w.id === circuit.wallId)?.name ?? '–';
                  let power = 0;
                  for (const tid of circuit.tileIds) {
                    for (const wall of project.walls) {
                      const t = wall.tiles.find((tt) => tt.id === tid);
                      if (t) { power += t.powerUse ?? 0; break; }
                    }
                  }
                  return `<tr>
                    <td>
                      <span class="dot" style="background:${h(circuit.color)}"></span>
                      <strong>${h(circuit.name)}</strong>
                    </td>
                    <td>${h(wallName)}</td>
                    <td class="num">${circuit.tileIds.length}</td>
                    <td class="num">${power.toLocaleString()}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : ''}

        ${(project.socas ?? []).length > 0 ? `
          <div class="section">
            <div class="section-title">Soca Splays</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Soca</th>
                  <th>Connector Type</th>
                  <th>Walls</th>
                  <th class="num">Circuits</th>
                  <th class="num">Tiles</th>
                  <th class="num">Power (W)</th>
                </tr>
              </thead>
              <tbody>
                ${(project.socas ?? []).map((soca) => {
                  const socaCircuits = project.circuits.filter((c) => c.socaId === soca.id);
                  const wallNames = [...new Set(socaCircuits.map((c) => project.walls.find((w) => w.id === c.wallId)?.name).filter(Boolean))].join(', ') || '–';
                  const tileCt = socaCircuits.reduce((s, c) => s + c.tileIds.length, 0);
                  let power = 0;
                  for (const circuit of socaCircuits) {
                    for (const tid of circuit.tileIds) {
                      for (const wall of project.walls) {
                        const t = wall.tiles.find((tt) => tt.id === tid);
                        if (t) { power += t.powerUse ?? 0; break; }
                      }
                    }
                  }
                  return `<tr>
                    <td><span style="color:#f97316;margin-right:4px">⚡</span><strong>${h(soca.name)}</strong></td>
                    <td>${h(soca.powerType ?? 'Powercon')}</td>
                    <td>${h(wallNames)}</td>
                    <td class="num">${socaCircuits.length}</td>
                    <td class="num">${tileCt}</td>
                    <td class="num">${power.toLocaleString()}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : ''}
      </div>
    </div>` : '';

  // ── Per-wall pages ───────────────────────────────────────────
  const wallPages = project.walls.map((wall) => {
    let minX = Infinity, minY = Infinity;
    let wallPower = 0, wallPx = 0;
    for (const t of wall.tiles) {
      minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
      wallPower += t.powerUse ?? 0;
      wallPx    += tilePixels.get(t.id) ?? 0;
    }
    const pos = wall.tiles.length === 0 ? '&ndash;' : `X: ${minX} &middot; Y: ${minY}`;
    const wallCircuits = project.circuits.filter((c) => c.wallId === wall.id);
    const wallProcObjs = project.processors.filter((proc) => proc.ports.some((p) => p.wallId === wall.id));

    // Per-wall type counts
    const wProcTypes = new Map<string, number>();
    const wBoxTypes  = new Map<string, number>();
    const wTileTypes = new Map<string, number>();
    for (const proc of wallProcObjs) {
      wProcTypes.set(proc.name, (wProcTypes.get(proc.name) ?? 0) + 1);
      if (proc.xdBoxCount && proc.expanderLabel) {
        wBoxTypes.set(proc.expanderLabel, (wBoxTypes.get(proc.expanderLabel) ?? 0) + proc.xdBoxCount);
      }
    }
    for (const t of wall.tiles) {
      const name = profileMap.get(t.profileId)?.name ?? 'Unknown';
      wTileTypes.set(name, (wTileTypes.get(name) ?? 0) + 1);
    }

    const wallPorts = project.processors.flatMap((proc) =>
      proc.ports.filter((p) => p.wallId === wall.id).map((port) => ({ proc, port })),
    );

    const circuitForTile = new Map<string, string>();
    for (const circuit of wallCircuits) {
      for (const tid of circuit.tileIds) circuitForTile.set(tid, circuit.name);
    }

    const sortedTiles = wall.tiles.slice().sort((a, b) => {
      const ap = a.portName ?? '\uFFFF';
      const bp = b.portName ?? '\uFFFF';
      if (ap !== bp) return ap.localeCompare(bp);
      return (a.chainOrder ?? 9999) - (b.chainOrder ?? 9999);
    });

    return `
      <div class="page">
        <div class="content-page">
          <div class="page-header">
            <span class="page-header-title">Wall Detail</span>
            <span class="page-header-project">${h(project.name)}</span>
          </div>

          <div class="wall-section">
            <div class="wall-title">
              <span class="wall-badge">Wall</span>${h(wall.name)}
            </div>

            <div class="stat-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:16px">
              <div class="stat-card">
                <div class="stat-label">Tiles</div>
                <div class="stat-value">${wall.tiles.length.toLocaleString()}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">LED Pixels</div>
                <div class="stat-value">${wallPx.toLocaleString()}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Power</div>
                <div class="stat-value">${wallPower.toLocaleString()}</div>
                <div class="stat-sub">watts</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Circuits</div>
                <div class="stat-value">${wallCircuits.length}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Position</div>
                <div class="stat-value" style="font-size:13px">${pos}</div>
              </div>
            </div>

            ${typeGrid(wProcTypes, wBoxTypes, wTileTypes)}

            ${wallPorts.length > 0 ? `
              <div class="sub-section">
                <div class="sub-title">Port Routing</div>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Processor</th><th>Port</th>
                      <th class="num">Tiles</th>
                      <th class="num">LED Pixels</th>
                      <th class="num">Capacity</th>
                      <th class="num">% Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${wallPorts.map(({ proc, port }) => {
                      const usedPx = port.tileIds.reduce((s, tid) => s + (tilePixels.get(tid) ?? 0), 0);
                      const cap    = port.pixelCapacity !== undefined ? Math.floor(port.pixelCapacity * capMult) : undefined;
                      const pct    = cap !== undefined && cap > 0 ? Math.round((usedPx / cap) * 100) : null;
                      const pctColor = pct === null ? '' : pct >= 90 ? 'color:var(--red)' : pct >= 75 ? 'color:var(--amber)' : 'color:var(--green)';
                      return `<tr>
                        <td>${h(proc.name)}</td>
                        <td><strong style="font-family:monospace">${h(port.name)}</strong></td>
                        <td class="num">${port.tileIds.length}</td>
                        <td class="num">${usedPx.toLocaleString()}</td>
                        <td class="num">${cap !== undefined ? cap.toLocaleString() : '&ndash;'}</td>
                        <td class="num" style="${pctColor}"><strong>${pct !== null ? `${pct}%` : '&ndash;'}</strong></td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>` : ''}

            ${wallCircuits.length > 0 ? (() => {
              const tileMap = new Map(wall.tiles.map((t) => [t.id, t]));
              let grandPower = 0;
              const circuitRows = wallCircuits.map((circuit) => {
                const power = circuit.tileIds.reduce(
                  (sum, tid) => sum + (tileMap.get(tid)?.powerUse ?? 0), 0,
                );
                grandPower += power;
                return `<tr>
                  <td><span class="dot" style="background:${h(circuit.color)}"></span><strong>${h(circuit.name)}</strong></td>
                  <td class="num">${circuit.tileIds.length}</td>
                  <td class="num">${power.toLocaleString()}</td>
                </tr>`;
              });
              circuitRows.push(`<tr style="background:#f0f9ff">
                <td><strong>TOTAL</strong></td>
                <td class="num"><strong>${wallCircuits.reduce((s, c) => s + c.tileIds.length, 0)}</strong></td>
                <td class="num"><strong>${grandPower.toLocaleString()} W</strong></td>
              </tr>`);
              return `
                <div class="sub-section">
                  <div class="sub-title">Power Circuits</div>
                  <table class="data-table">
                    <thead><tr>
                      <th>Circuit</th>
                      <th class="num">Tiles</th>
                      <th class="num">Total Power (W)</th>
                    </tr></thead>
                    <tbody>${circuitRows.join('')}</tbody>
                  </table>
                </div>`;
            })() : ''}

            ${sortedTiles.length > 0 ? `
              <div class="sub-section">
                <div class="sub-title">Tile List</div>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Tile Name</th><th>Port</th>
                      <th class="num">Chain</th>
                      <th>Circuit</th>
                      <th class="num">W</th>
                      <th>Resolution</th>
                      <th class="num">X</th>
                      <th class="num">Y</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sortedTiles.map((t) => {
                      const prof = profileMap.get(t.profileId);
                      const res  = prof ? `${prof.pixelWidth}&times;${prof.pixelHeight}` : '&ndash;';
                      const portLabel = t.portName && t.chainOrder !== undefined
                        ? `${t.portName}${t.chainOrder}` : '&ndash;';
                      return `<tr>
                        <td><strong>${h(t.name)}</strong></td>
                        <td style="font-family:monospace;font-size:12px">${portLabel}</td>
                        <td class="num">${t.chainOrder ?? '&ndash;'}</td>
                        <td style="font-size:11px">${h(circuitForTile.get(t.id) ?? '–')}</td>
                        <td class="num">${t.powerUse ?? '&ndash;'}</td>
                        <td style="font-size:11px;color:var(--mid)">${res}</td>
                        <td class="num" style="color:var(--mid)">${t.x}</td>
                        <td class="num" style="color:var(--mid)">${t.y}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  // ── Final HTML ───────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${h(project.name)} &ndash; Production Report</title>
  <style>${css}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
    Save as PDF
  </button>
  ${cover}
  ${overviewPage}
  ${processorPage}
  ${wallPages}
</body>
</html>`;
}

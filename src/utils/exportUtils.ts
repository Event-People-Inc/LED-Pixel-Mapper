import { Wall, TileProfile, Circuit, Project } from '../types';

/** Download a data-URL as a file. */
export function downloadDataURL(dataURL: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  a.click();
}

/** Download a raw SVG string as a .svg file. */
export function downloadSVG(svgString: string, filename: string) {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy per-wall CSV (kept for internal use)
// ─────────────────────────────────────────────────────────────────────────────
/** @deprecated Use exportProjectCSV for full production reports. */
export function exportCSV(
  wall: Wall,
  profiles: TileProfile[],
  filename: string,
  circuits?: Circuit[]
) {
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const header = [
    'wall_name', 'tile_id', 'tile_name', 'x', 'y',
    'port_label', 'port_name', 'chain_order',
    'tile_number', 'port_number',
    'power_position', 'power_use_w', 'tile_resolution',
  ].join(',');

  const rows = wall.tiles.map((t) => {
    const prof = profileMap.get(t.profileId);
    const resolution = prof ? `${prof.pixelWidth}x${prof.pixelHeight}` : '';
    const portLabel = (t.portName && t.chainOrder !== undefined)
      ? `${t.portName}${t.chainOrder}`
      : '';
    return [
      csvEscape(wall.name),
      csvEscape(t.id),
      csvEscape(t.name),
      t.x, t.y,
      csvEscape(portLabel),
      csvEscape(t.portName ?? ''),
      t.chainOrder ?? '',
      t.tileNumber ?? '',
      t.portNumber ?? '',
      csvEscape(t.powerPosition ?? ''),
      t.powerUse ?? '',
      csvEscape(resolution),
    ].join(',');
  });

  const tileMap = new Map(wall.tiles.map((t) => [t.id, t]));
  const wallCircuits = (circuits ?? []).filter((c) => c.wallId === wall.id && c.tileIds.length > 0);
  const summarySections: string[] = [];
  if (wallCircuits.length > 0) {
    const cols = header.split(',').length;
    const empty = Array(cols - 1).fill('').join(',');
    summarySections.push('');
    summarySections.push(`CIRCUIT POWER SUMMARY${empty}`);
    let grandTotal = 0;
    for (const circuit of wallCircuits) {
      const total = circuit.tileIds.reduce((sum, tid) => sum + (tileMap.get(tid)?.powerUse ?? 0), 0);
      grandTotal += total;
      summarySections.push(`${csvEscape(circuit.name)}${empty},${total} W`);
    }
    summarySections.push(`TOTAL${empty},${grandTotal} W`);
  }

  const csvContent = [header, ...rows, ...summarySections].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  downloadDataURL(url, filename);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Production Report CSV
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exports a full production-ready CSV report for the project.
 * Structure:
 *   1. Project title + canvas specs
 *   2. Canvas overview table (all walls at a glance)
 *   3. Project totals (tiles, circuits, processors, power)
 *   4. Processor requirements
 *   5. Circuit requirements
 *   6. Per-wall detail sections (ports · circuits · tile list)
 */
/** Build the full production report CSV string without triggering a download. */
export function buildProjectCSV(project: Project): string {
  const lines: string[] = [];
  _buildCSVLines(project, lines);
  return lines.join('\n');
}

export function exportProjectCSV(project: Project, filename: string) {
  const csvContent = buildProjectCSV(project);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  downloadDataURL(url, filename);
  URL.revokeObjectURL(url);
}

function _buildCSVLines(project: Project, lines: string[]) {

  // Helpers ──────────────────────────────────────────────────────────────────

  /** Fixed column width — every row is padded to this many columns. */
  const COLS = 8;

  /** Escape, pad to COLS, and join. */
  const row = (...cells: (string | number)[]) => {
    const padded = cells.map(String);
    while (padded.length < COLS) padded.push('');
    return padded.map((c) => csvEscape(c)).join(',');
  };

  /** Blank row — same width as all other rows. */
  const blank = () => lines.push(','.repeat(COLS - 1));

  /** Section header — label in first cell, rest empty. */
  const section = (text: string) => {
    blank();
    lines.push(row(text));
  };

  /** Table column headers. */
  const tableHead = (...cols: string[]) => lines.push(row(...cols));

  const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
  const capMult = (project.bitDepth ?? '8bit') === '10bit' ? 0.5 : 1;

  /** Build a quick tile → pixel count lookup across all walls. */
  const tilePixels = new Map<string, number>();
  for (const wall of project.walls) {
    for (const t of wall.tiles) {
      const prof = profileMap.get(t.profileId);
      if (prof) tilePixels.set(t.id, prof.pixelWidth * prof.pixelHeight);
    }
  }

  /** Stats derived from a single wall. */
  function wallStats(wall: Wall) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let totalPower = 0;
    let totalLedPixels = 0;

    for (const t of wall.tiles) {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x);
      maxY = Math.max(maxY, t.y);
      totalPower += t.powerUse ?? 0;
      totalLedPixels += tilePixels.get(t.id) ?? 0;
    }

    const connectedProcessors = project.processors
      .filter((proc) => proc.ports.some((p) => p.wallId === wall.id))
      .map((proc) => proc.name);

    const wallCircuits = project.circuits.filter((c) => c.wallId === wall.id);

    const canvasPos =
      wall.tiles.length === 0
        ? '-'
        : `X: ${minX}  Y: ${minY}`;

    return {
      totalTiles: wall.tiles.length,
      totalPower,
      totalLedPixels,
      canvasPos,
      connectedProcessors,
      wallCircuits,
    };
  }

  // ── 1. PROJECT HEADER ─────────────────────────────────────────────────────
  lines.push(row(`PROJECT: ${project.name}`));
  lines.push(
    row(
      `Canvas: ${project.canvasWidth} x ${project.canvasHeight} px`,
      '',
      `Bit Depth: ${project.bitDepth ?? '8bit'}`,
    ),
  );

  // ── 2. CANVAS OVERVIEW ────────────────────────────────────────────────────
  section('CANVAS OVERVIEW');
  tableHead(
    'Wall',
    'Canvas Position',
    'Total LED Pixels',
    'Total Tiles',
    'Total Power (W)',
    'Circuits',
    'Processors Connected',
  );

  for (const wall of project.walls) {
    const s = wallStats(wall);
    lines.push(
      row(
        wall.name,
        s.canvasPos,
        s.totalLedPixels.toLocaleString(),
        s.totalTiles,
        s.totalPower,
        s.wallCircuits.length,
        s.connectedProcessors.join(' / ') || '-',
      ),
    );
  }

  // ── 3. PROJECT TOTALS ─────────────────────────────────────────────────────
  section('PROJECT TOTALS');
  const totalTiles    = project.walls.reduce((s, w) => s + w.tiles.length, 0);
  const totalPower    = project.walls.reduce(
    (s, w) => s + w.tiles.reduce((ws, t) => ws + (t.powerUse ?? 0), 0), 0,
  );
  const totalLedPx    = [...tilePixels.values()].reduce((s, n) => s + n, 0);
  const totalCircuits = project.circuits.length;
  const totalPorts    = project.processors.reduce((s, p) => s + p.ports.length, 0);

  lines.push(row('Total Walls',     project.walls.length));
  lines.push(row('Total Tiles',     totalTiles));
  lines.push(row('Total LED Pixels',totalLedPx.toLocaleString()));
  lines.push(row('Total Circuits',  totalCircuits));
  lines.push(row('Total Ports',     totalPorts));
  lines.push(row('Total Processors',project.processors.length));
  lines.push(row('Total Power Draw',`${totalPower} W`));

  // Processor type breakdown
  const processorTypeCounts = new Map<string, number>();
  for (const proc of project.processors) {
    processorTypeCounts.set(proc.name, (processorTypeCounts.get(proc.name) ?? 0) + 1);
  }
  if (processorTypeCounts.size > 0) {
    lines.push(row('Processor Types'));
    for (const [name, count] of processorTypeCounts) {
      lines.push(row(`  ${name}`, count));
    }
  }

  // Extension box type breakdown
  const extBoxTypeCounts = new Map<string, number>();
  for (const proc of project.processors) {
    if (proc.xdBoxCount && proc.expanderLabel) {
      extBoxTypeCounts.set(proc.expanderLabel, (extBoxTypeCounts.get(proc.expanderLabel) ?? 0) + proc.xdBoxCount);
    }
  }
  if (extBoxTypeCounts.size > 0) {
    lines.push(row('Extension Box Types'));
    for (const [label, count] of extBoxTypeCounts) {
      lines.push(row(`  ${label}`, count));
    }
  }

  // Tile type breakdown
  const tileTypeCounts = new Map<string, number>();
  for (const wall of project.walls) {
    for (const t of wall.tiles) {
      const prof = profileMap.get(t.profileId);
      const typeName = prof?.name ?? 'Unknown';
      tileTypeCounts.set(typeName, (tileTypeCounts.get(typeName) ?? 0) + 1);
    }
  }
  if (tileTypeCounts.size > 0) {
    lines.push(row('Tile Types'));
    for (const [name, count] of tileTypeCounts) {
      lines.push(row(`  ${name}`, count));
    }
  }

  // Soca Splay breakdown
  const socaTypeCounts = new Map<string, number>();
  for (const soca of project.socas ?? []) {
    const type = soca.powerType ?? 'Powercon';
    socaTypeCounts.set(type, (socaTypeCounts.get(type) ?? 0) + 1);
  }
  const totalSocas = (project.socas ?? []).length;
  if (totalSocas > 0) {
    lines.push(row('Total Soca Splays', totalSocas));
    for (const [type, count] of socaTypeCounts) {
      lines.push(row(`  ${count}× ${type} Soca Splay`, count));
    }
  }

  // ── 4. PROCESSOR REQUIREMENTS ─────────────────────────────────────────────
  section('PROCESSOR REQUIREMENTS');
  tableHead(
    'Processor',
    'Type',
    'Total Ports',
    'Extension Boxes',
    'Walls Served',
    'Tiles Routed',
    'LED Pixels Routed',
    'Pixel Capacity',
  );

  for (const proc of project.processors) {
    const isXD = !!(proc.xdBoxCount && proc.xdBoxSize);
    const wallsServed = [
      ...new Set(
        proc.ports
          .filter((p) => p.wallId)
          .map((p) => project.walls.find((w) => w.id === p.wallId)?.name ?? '?'),
      ),
    ];
    const tilesRouted = proc.ports.reduce((s, p) => s + p.tileIds.length, 0);
    const pixelsRouted = proc.ports.reduce(
      (s, p) => s + p.tileIds.reduce((ps, tid) => ps + (tilePixels.get(tid) ?? 0), 0),
      0,
    );
    const totalCap = proc.ports.reduce(
      (s, p) =>
        p.pixelCapacity !== undefined
          ? s + Math.floor(p.pixelCapacity * capMult)
          : s,
      0,
    );

    lines.push(
      row(
        proc.name,
        isXD ? `${proc.expanderLabel ?? 'XD'} Expander` : 'Standard',
        proc.ports.length,
        isXD ? `${proc.xdBoxCount} x ${proc.expanderLabel ?? 'XD Box'}` : '-',
        wallsServed.join(' / ') || '-',
        tilesRouted,
        pixelsRouted.toLocaleString(),
        totalCap > 0 ? totalCap.toLocaleString() : '-',
      ),
    );
  }

  // ── 5. CIRCUIT REQUIREMENTS ───────────────────────────────────────────────
  if (project.circuits.length > 0) {
    section('CIRCUIT REQUIREMENTS');
    tableHead('Circuit', 'Wall', 'Tiles', 'Total Power (W)');

    for (const circuit of project.circuits) {
      const wallName = project.walls.find((w) => w.id === circuit.wallId)?.name ?? '-';
      let power = 0;
      for (const tid of circuit.tileIds) {
        for (const wall of project.walls) {
          const t = wall.tiles.find((t) => t.id === tid);
          if (t) { power += t.powerUse ?? 0; break; }
        }
      }
      lines.push(row(circuit.name, wallName, circuit.tileIds.length, power));
    }
  }

  // ── 5b. SOCA SPLAYS ───────────────────────────────────────────────────────
  const socas = project.socas ?? [];
  if (socas.length > 0) {
    section('SOCA SPLAYS');
    tableHead('Soca', 'Connector Type', 'Circuits', 'Walls', 'Tiles', 'Total Power (W)');
    for (const soca of socas) {
      const socaCircuits = project.circuits.filter((c) => c.socaId === soca.id);
      const wallNames = [...new Set(socaCircuits.map((c) => project.walls.find((w) => w.id === c.wallId)?.name).filter(Boolean))].join(' / ') || '-';
      const tileCt = socaCircuits.reduce((s, c) => s + c.tileIds.length, 0);
      let power = 0;
      for (const circuit of socaCircuits) {
        for (const tid of circuit.tileIds) {
          for (const wall of project.walls) {
            const t = wall.tiles.find((t) => t.id === tid);
            if (t) { power += t.powerUse ?? 0; break; }
          }
        }
      }
      lines.push(row(soca.name, soca.powerType ?? 'Powercon', socaCircuits.length, wallNames, tileCt, power));
    }
  }

  // ── 6. PER-WALL DETAIL SECTIONS ───────────────────────────────────────────
  for (const wall of project.walls) {
    const s = wallStats(wall);
    blank();
    blank();
    lines.push(row(`${'='.repeat(60)}`));
    lines.push(row(`WALL: ${wall.name.toUpperCase()}`));
    lines.push(row(`${'='.repeat(60)}`));
    lines.push(row('Canvas Position',      s.canvasPos));
    lines.push(row('Total Tiles',          s.totalTiles));
    lines.push(row('Total LED Pixels',     s.totalLedPixels.toLocaleString()));
    lines.push(row('Total Power Draw',     `${s.totalPower} W`));
    lines.push(row('Processors Connected', s.connectedProcessors.join(', ') || '-'));
    lines.push(row('Circuits',             s.wallCircuits.length));

    // Per-wall processor type breakdown
    const wallProcObjs = project.processors.filter((proc) =>
      proc.ports.some((p) => p.wallId === wall.id),
    );
    const wallProcTypes = new Map<string, number>();
    for (const proc of wallProcObjs) {
      wallProcTypes.set(proc.name, (wallProcTypes.get(proc.name) ?? 0) + 1);
    }
    if (wallProcTypes.size > 0) {
      lines.push(row('Processor Types'));
      for (const [name, count] of wallProcTypes) {
        lines.push(row(`  ${name}`, count));
      }
    }

    // Per-wall extension box type breakdown
    const wallExtBoxTypes = new Map<string, number>();
    for (const proc of wallProcObjs) {
      if (proc.xdBoxCount && proc.expanderLabel) {
        wallExtBoxTypes.set(proc.expanderLabel, (wallExtBoxTypes.get(proc.expanderLabel) ?? 0) + proc.xdBoxCount);
      }
    }
    if (wallExtBoxTypes.size > 0) {
      lines.push(row('Extension Box Types'));
      for (const [label, count] of wallExtBoxTypes) {
        lines.push(row(`  ${label}`, count));
      }
    }

    // Per-wall tile type breakdown
    const wallTileTypes = new Map<string, number>();
    for (const t of wall.tiles) {
      const prof = profileMap.get(t.profileId);
      const typeName = prof?.name ?? 'Unknown';
      wallTileTypes.set(typeName, (wallTileTypes.get(typeName) ?? 0) + 1);
    }
    if (wallTileTypes.size > 0) {
      lines.push(row('Tile Types'));
      for (const [name, count] of wallTileTypes) {
        lines.push(row(`  ${name}`, count));
      }
    }

    // Port routing table
    const wallPorts = project.processors.flatMap((proc) =>
      proc.ports
        .filter((p) => p.wallId === wall.id)
        .map((p) => ({ proc, port: p })),
    );

    if (wallPorts.length > 0) {
      blank();
      lines.push(row('PORT ROUTING'));
      tableHead('Processor', 'Port', 'Tiles in Chain', 'LED Pixels Used', 'Capacity', '% Used');

      for (const { proc, port } of wallPorts) {
        const usedPx = port.tileIds.reduce((s, tid) => s + (tilePixels.get(tid) ?? 0), 0);
        const cap    = port.pixelCapacity !== undefined
          ? Math.floor(port.pixelCapacity * capMult)
          : undefined;
        const pct    = cap !== undefined && cap > 0
          ? `${Math.round((usedPx / cap) * 100)}%`
          : '-';
        lines.push(
          row(
            proc.name,
            port.name,
            port.tileIds.length,
            usedPx.toLocaleString(),
            cap !== undefined ? cap.toLocaleString() : '-',
            pct,
          ),
        );
      }
    }

    // Power circuits table
    if (s.wallCircuits.length > 0) {
      blank();
      lines.push(row('POWER CIRCUITS'));
      tableHead('Circuit', 'Tiles', 'Total Power (W)');

      const tileMap = new Map(wall.tiles.map((t) => [t.id, t]));
      let grandPower = 0;
      for (const circuit of s.wallCircuits) {
        const power = circuit.tileIds.reduce((sum, tid) => sum + (tileMap.get(tid)?.powerUse ?? 0), 0);
        grandPower += power;
        lines.push(row(circuit.name, circuit.tileIds.length, power));
      }
      lines.push(row('TOTAL', s.wallCircuits.reduce((s, c) => s + c.tileIds.length, 0), grandPower));
    }

    // Tile list — sorted by port name + chain order, unassigned last
    if (wall.tiles.length > 0) {
      blank();
      lines.push(row('TILE LIST'));
      tableHead(
        'Tile Name',
        'Port Label',
        'Chain Order',
        'Circuit',
        'Power (W)',
        'Resolution',
        'Canvas X',
        'Canvas Y',
      );

      const circuitForTile = new Map<string, string>();
      for (const circuit of s.wallCircuits) {
        for (const tid of circuit.tileIds) circuitForTile.set(tid, circuit.name);
      }

      const sorted = wall.tiles.slice().sort((a, b) => {
        const ap = a.portName ?? '\uFFFF';
        const bp = b.portName ?? '\uFFFF';
        if (ap !== bp) return ap.localeCompare(bp);
        return (a.chainOrder ?? 9999) - (b.chainOrder ?? 9999);
      });

      for (const t of sorted) {
        const prof      = profileMap.get(t.profileId);
        const res       = prof ? `${prof.pixelWidth}x${prof.pixelHeight}` : '';
        const portLabel = t.portName && t.chainOrder !== undefined
          ? `${t.portName}${t.chainOrder}`
          : '-';
        lines.push(
          row(
            t.name,
            portLabel,
            t.chainOrder ?? '-',
            circuitForTile.get(t.id) ?? '-',
            t.powerUse ?? '',
            res,
            t.x,
            t.y,
          ),
        );
      }
    }
  }

}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

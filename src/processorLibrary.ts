export interface XDExpanderConfig {
  /** Maximum number of expander units this processor supports */
  maxBoxes: number;
  /** Number of 1G output ports per expander unit */
  portsPerBox: number;
  /** Pixel capacity per 1G output port */
  portCapacity: number;
  /** Display label for the expander unit (default: "XD Box") */
  expanderLabel?: string;
}

export interface ProcessorLibraryEntry {
  name: string;
  category: string;
  rj45Ports: number;
  perPortCapacity: number; // pixels (8-bit standard)
  totalCapacity: number;   // pixels
  hasOpticalPorts: boolean;
  /** If set, this processor drives XD expansion boxes rather than direct ports */
  xdExpander?: XDExpanderConfig;
}

/** Novastar processor library — 2008–2025 product range. */
export const PROCESSOR_LIBRARY: ProcessorLibraryEntry[] = [
  // ── Brompton Tessera series ──────────────────────────────────
  { name: 'Tessera S4',    category: 'Brompton Tessera',                 rj45Ports: 4,  perPortCapacity: 525000,  totalCapacity: 2100000,  hasOpticalPorts: false },
  { name: 'Tessera S8',    category: 'Brompton Tessera',                 rj45Ports: 8,  perPortCapacity: 525000,  totalCapacity: 4200000,  hasOpticalPorts: false },
  {
    name: 'Tessera SX40',  category: 'Brompton Tessera',
    rj45Ports: 0,          perPortCapacity: 525000,  totalCapacity: 9000000,  hasOpticalPorts: false,
    xdExpander: { maxBoxes: 4, portsPerBox: 10, portCapacity: 525000 },
  },
  // ── Megapixie HELIOS series ──────────────────────────────────
  { name: 'HELIOS Jr',  category: 'Megapixie HELIOS',  rj45Ports: 8,  perPortCapacity: 510000,  totalCapacity: 4080000,   hasOpticalPorts: false },
  {
    name: 'HELIOS 4K',  category: 'Megapixie HELIOS',
    rj45Ports: 0,       perPortCapacity: 510000,  totalCapacity: 15300000,  hasOpticalPorts: true,
    xdExpander: { maxBoxes: 3, portsPerBox: 10, portCapacity: 510000, expanderLabel: 'RS12 Switch' },
  },
  {
    name: 'HELIOS 8K',  category: 'Megapixie HELIOS',
    rj45Ports: 0,       perPortCapacity: 510000,  totalCapacity: 35000000,  hasOpticalPorts: true,
    xdExpander: { maxBoxes: 8, portsPerBox: 10, portCapacity: 510000, expanderLabel: 'RS12 Switch' },
  },
  // ── MCTRL series ────────────────────────────────────────────
  { name: 'MCTRL300',       category: 'LED display controller',          rj45Ports: 2,  perPortCapacity: 650000,  totalCapacity: 1300000,  hasOpticalPorts: false },
  { name: 'MCTRL500',       category: 'Independent controller',          rj45Ports: 4,  perPortCapacity: 650000,  totalCapacity: 2600000,  hasOpticalPorts: true  },
  { name: 'MCTRL600',       category: 'LED display controller',          rj45Ports: 4,  perPortCapacity: 650000,  totalCapacity: 2600000,  hasOpticalPorts: false },
  { name: 'MCTRL660',       category: 'LED display controller',          rj45Ports: 4,  perPortCapacity: 650000,  totalCapacity: 2600000,  hasOpticalPorts: false },
  { name: 'MCTRL660 PRO',   category: 'Professional controller',         rj45Ports: 6,  perPortCapacity: 650000,  totalCapacity: 3900000,  hasOpticalPorts: true  },
  { name: 'MCTRL700',       category: 'LED display controller',          rj45Ports: 6,  perPortCapacity: 650000,  totalCapacity: 3900000,  hasOpticalPorts: false },
  { name: 'MCTRL R5',       category: 'LED display controller',          rj45Ports: 8,  perPortCapacity: 650000,  totalCapacity: 5200000,  hasOpticalPorts: true  },
  { name: 'MCTRL4K',        category: 'LED display controller',          rj45Ports: 16, perPortCapacity: 650000,  totalCapacity: 8800000,  hasOpticalPorts: true  },
  // ── MSD sending cards ────────────────────────────────────────
  { name: 'MSD300',         category: 'Sending card',                    rj45Ports: 2,  perPortCapacity: 650000,  totalCapacity: 1300000,  hasOpticalPorts: false },
  { name: 'MSD600',         category: 'Sending card',                    rj45Ports: 4,  perPortCapacity: 650000,  totalCapacity: 2600000,  hasOpticalPorts: false },
  // ── NovaPro series ───────────────────────────────────────────
  { name: 'NovaPro HD',     category: 'All-in-one controller',           rj45Ports: 4,  perPortCapacity: 587500,  totalCapacity: 2350000,  hasOpticalPorts: true  },
  { name: 'NovaPro UHD',    category: 'All-in-one controller',           rj45Ports: 16, perPortCapacity: 650000,  totalCapacity: 10400000, hasOpticalPorts: true  },
  { name: 'NovaPro UHD Jr', category: 'All-in-one controller',           rj45Ports: 16, perPortCapacity: 650000,  totalCapacity: 10400000, hasOpticalPorts: true  },
  // ── VX series ────────────────────────────────────────────────
  { name: 'VX4S',           category: 'All-in-one controller',           rj45Ports: 4,  perPortCapacity: 575000,  totalCapacity: 2300000,  hasOpticalPorts: false },
  { name: 'VX4S-N',         category: 'All-in-one controller',           rj45Ports: 4,  perPortCapacity: 575000,  totalCapacity: 2300000,  hasOpticalPorts: false },
  { name: 'VX6s',           category: 'All-in-one controller',           rj45Ports: 6,  perPortCapacity: 650000,  totalCapacity: 3900000,  hasOpticalPorts: false },
  { name: 'VX16s',          category: 'All-in-one controller',           rj45Ports: 16, perPortCapacity: 650000,  totalCapacity: 10400000, hasOpticalPorts: false },
  { name: 'VX400',          category: 'All-in-one controller',           rj45Ports: 4,  perPortCapacity: 650000,  totalCapacity: 2600000,  hasOpticalPorts: true  },
  { name: 'VX600',          category: 'All-in-one controller',           rj45Ports: 6,  perPortCapacity: 650000,  totalCapacity: 3900000,  hasOpticalPorts: true  },
  { name: 'VX1000',         category: 'All-in-one controller',           rj45Ports: 10, perPortCapacity: 650000,  totalCapacity: 6500000,  hasOpticalPorts: true  },
  { name: 'VX400 Pro',      category: 'All-in-one controller',           rj45Ports: 4,  perPortCapacity: 650000,  totalCapacity: 2600000,  hasOpticalPorts: true  },
  { name: 'VX1000 Pro',     category: 'All-in-one controller',           rj45Ports: 10, perPortCapacity: 650000,  totalCapacity: 6500000,  hasOpticalPorts: true  },
  { name: 'VX2000 Pro',     category: 'All-in-one controller',           rj45Ports: 20, perPortCapacity: 650000,  totalCapacity: 13000000, hasOpticalPorts: true  },
  // ── MX / KU COEX series ──────────────────────────────────────
  { name: 'MX20',           category: 'COEX LED display controller',     rj45Ports: 6,  perPortCapacity: 659722,  totalCapacity: 3900000,  hasOpticalPorts: true  },
  { name: 'MX30',           category: 'COEX LED display controller',     rj45Ports: 10, perPortCapacity: 659722,  totalCapacity: 6500000,  hasOpticalPorts: true  },
  { name: 'MX40 Pro',       category: 'COEX LED display controller',     rj45Ports: 20, perPortCapacity: 659722,  totalCapacity: 9000000,  hasOpticalPorts: true  },
  {
    name: 'MX2000',         category: 'COEX LED display controller',
    rj45Ports: 0,           perPortCapacity: 659722,  totalCapacity: 35380000,  hasOpticalPorts: true,
    xdExpander: { maxBoxes: 8, portsPerBox: 10, portCapacity: 659722, expanderLabel: 'CVT Box' },
  },
  {
    name: 'MX6000',         category: 'COEX LED display controller',
    rj45Ports: 0,           perPortCapacity: 659722,  totalCapacity: 141000000, hasOpticalPorts: true,
    xdExpander: { maxBoxes: 32, portsPerBox: 10, portCapacity: 659722, expanderLabel: 'CVT Box' },
  },
  { name: 'KU20',           category: 'COEX LED display controller',     rj45Ports: 6,  perPortCapacity: 659722,  totalCapacity: 3900000,  hasOpticalPorts: true  },
];

/** Group entries by category for display in a grouped select. */
export function groupedLibrary(): Record<string, ProcessorLibraryEntry[]> {
  const groups: Record<string, ProcessorLibraryEntry[]> = {};
  for (const entry of PROCESSOR_LIBRARY) {
    (groups[entry.category] ??= []).push(entry);
  }
  return groups;
}

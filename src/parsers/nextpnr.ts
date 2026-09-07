import { FpgaUtilEntry, FpgaFmaxEntry } from "./types.js";

export function parseYosysStats(text: string): { cells?: number; wires?: number } {
  let cells: number | undefined;
  let wires: number | undefined;
  for (const line of text.split("\n")) {
    const c = line.match(/Number of cells:\s+(\d+)/);
    if (c) cells = parseInt(c[1], 10);
    const w = line.match(/Number of wires:\s+(\d+)/);
    if (w) wires = parseInt(w[1], 10);
  }
  return { ...(cells !== undefined ? { cells } : {}), ...(wires !== undefined ? { wires } : {}) };
}

export function extractWarnings(text: string, max: number = 10): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/warning/i.test(t) && !/0 warnings?/i.test(t)) out.push(t.slice(0, 200));
    if (out.length >= Math.max(1, max)) break;
  }
  return [...new Set(out)];
}

interface NextpnrReport {
  utilization?: Record<string, { available?: number; used?: number }>;
  fmax?: Record<string, { achieved?: number; constraint?: number }>;
}

/**
 * Parses nextpnr `--report` JSON: utilization {TYPE: {available, used}}
 * and fmax {clk: {achieved, constraint}} (MHz).
 */
export function parseNextpnrReport(
  jsonText: string
): { utilization?: Record<string, FpgaUtilEntry>; fmax?: Record<string, FpgaFmaxEntry> } {
  let parsed: NextpnrReport;
  try {
    parsed = JSON.parse(jsonText) as NextpnrReport;
  } catch {
    return {};
  }
  const result: { utilization?: Record<string, FpgaUtilEntry>; fmax?: Record<string, FpgaFmaxEntry> } = {};
  if (parsed.utilization && typeof parsed.utilization === "object") {
    const util: Record<string, FpgaUtilEntry> = {};
    for (const [k, v] of Object.entries(parsed.utilization)) {
      if (v && typeof v.available === "number" && typeof v.used === "number") {
        util[k] = { available: v.available, used: v.used };
      }
    }
    if (Object.keys(util).length > 0) result.utilization = util;
  }
  if (parsed.fmax && typeof parsed.fmax === "object") {
    const fmax: Record<string, FpgaFmaxEntry> = {};
    for (const [k, v] of Object.entries(parsed.fmax)) {
      const entry: FpgaFmaxEntry = {};
      if (v && typeof v.achieved === "number") entry.achievedMhz = v.achieved;
      if (v && typeof v.constraint === "number") entry.constraintMhz = v.constraint;
      if (Object.keys(entry).length > 0) fmax[k] = entry;
    }
    if (Object.keys(fmax).length > 0) result.fmax = fmax;
  }
  return result;
}

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ToolRunner } from "../runner.js";
import { parseYosysStats, extractWarnings } from "../parsers/nextpnr.js";
import { FpgaSynthResult } from "../parsers/types.js";
import { FpgaFamily } from "../boards.js";

export interface SynthOptions {
  verilogSources: string[];
  topModule: string;
  family?: FpgaFamily;
  outputJson?: string;
  cwd?: string;
  timeoutMs?: number;
}

const TOP_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/**
 * Synthesizes RTL to a nextpnr-ready JSON netlist (synth_ice40/synth_ecp5).
 */
export async function runFpgaSynth(
  runner: ToolRunner,
  options: SynthOptions
): Promise<FpgaSynthResult> {
  const family: FpgaFamily = options.family ?? "ice40";
  const fail = (errors: string[]): FpgaSynthResult => ({
    success: false, topModule: options.topModule, family,
    warnings: [], errors,
  });

  if (options.verilogSources.length === 0) return fail(["No Verilog sources specified."]);
  if (!TOP_RE.test(options.topModule)) return fail([`Invalid top module name: "${options.topModule}".`]);
  if (family !== "ice40" && family !== "ecp5") {
    return fail([`Unsupported family "${family}". Supported: ice40, ecp5.`]);
  }

  const base = path.resolve(options.cwd || process.cwd());
  const outJson = options.outputJson || `${options.topModule}_${family}_tmp.json`;
  const script = [
    ...options.verilogSources.map((s) => `read_verilog -sv ${s}`),
    `hierarchy -check -top ${options.topModule}`,
    family === "ice40" ? `synth_ice40 -top ${options.topModule} -json ${outJson}` : `synth_ecp5 -top ${options.topModule} -json ${outJson}`,
    "stat",
  ].join("; ");

  const res = await runner.execute("yosys", ["-p", script], {
    cwd: base,
    timeoutMs: options.timeoutMs ?? 120000,
  });
  const combined = `${res.stdout}\n${res.stderr}`;
  const stats = parseYosysStats(combined);
  const errors: string[] = [];
  if (res.timedOut) errors.push("Synthesis timed out.");
  for (const line of combined.split("\n")) {
    const t = line.trim();
    if (t.startsWith("ERROR:")) errors.push(t.slice(0, 300));
  }

  if (res.exitCode !== 0 || errors.length > 0) {
    return { ...fail(errors.length > 0 ? errors.slice(0, 10) : [`yosys exited with code ${res.exitCode}.`]), ...stats };
  }

  return {
    success: true, topModule: options.topModule, family,
    jsonNetlist: outJson,
    ...(stats.cells !== undefined ? { cellCount: stats.cells } : {}),
    ...(stats.wires !== undefined ? { wireCount: stats.wires } : {}),
    warnings: extractWarnings(combined),
    errors: [],
  };
}

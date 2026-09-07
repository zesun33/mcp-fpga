import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ToolRunner } from "../runner.js";
import { parseNextpnrReport, extractWarnings } from "../parsers/nextpnr.js";
import { FpgaPnrResult } from "../parsers/types.js";
import { FpgaFamily, resolvePreset } from "../boards.js";

export interface PnrOptions {
  jsonNetlist: string;
  topModule?: string;
  family?: FpgaFamily;
  board?: string;
  device?: string;
  package?: string;
  pcfFile?: string;
  outputFile?: string;
  cwd?: string;
  timeoutMs?: number;
}

/**
 * Runs nextpnr place-and-route for iCE40/ECP5. Device/package resolve from
 * an explicit pair or a board preset (explicit wins). Emits .asc (ice40)
 * or .config (ecp5) plus parsed utilization and Fmax from --report JSON.
 */
export async function runFpgaPnr(
  runner: ToolRunner,
  options: PnrOptions
): Promise<FpgaPnrResult> {
  const preset = resolvePreset(options.board);
  if (options.board && !preset) {
    return {
      success: false, topModule: options.topModule ?? "", family: options.family ?? "",
      device: options.device ?? "", package: options.package ?? "",
      warnings: [], errors: [`Unknown board "${options.board}". Use fpga_boards to list presets.`],
    };
  }
  const family: FpgaFamily = options.family ?? preset?.family ?? "ice40";
  const device = options.device ?? preset?.device;
  const pkg = options.package ?? preset?.package;
  if (!device || !pkg) {
    return {
      success: false, topModule: options.topModule ?? "", family,
      device: device ?? "", package: pkg ?? "",
      warnings: [], errors: ["device and package are required (directly or via board preset)."],
    };
  }
  if (!options.jsonNetlist) {
    return {
      success: false, topModule: options.topModule ?? "", family, device,
      package: pkg,
      warnings: [], errors: ["jsonNetlist (Yosys JSON from fpga_synth) is required."],
    };
  }

  const base = path.resolve(options.cwd || process.cwd());
  const ts = Date.now();
  const report = `.fpga_report_tmp_${ts}.json`;
  const out = options.outputFile || `${options.topModule ?? "top"}_${device}_tmp.${family === "ice40" ? "asc" : "config"}`;

  const args: string[] =
    family === "ice40"
      ? [`--${device}`, "--package", pkg, "--json", options.jsonNetlist]
      : [`--${device}`, "--package", pkg, "--json", options.jsonNetlist];
  if (family === "ice40") {
    if (options.pcfFile) args.push("--pcf", options.pcfFile);
    else args.push("--pcf-allow-unconstrained");
    args.push("--asc", out);
  } else {
    if (options.pcfFile) args.push("--lpf", options.pcfFile);
    args.push("--textcfg", out);
  }
  args.push("--report", report);

  const cmd = family === "ice40" ? "nextpnr-ice40" : "nextpnr-ecp5";
  const res = await runner.execute(cmd, args, {
    cwd: base,
    timeoutMs: options.timeoutMs ?? 300000,
  });
  const combined = `${res.stdout}\n${res.stderr}`;

  let reportParsed: ReturnType<typeof parseNextpnrReport> = {};
  try {
    reportParsed = parseNextpnrReport(await fs.readFile(path.join(base, report), "utf-8"));
  } catch {
    // report missing: errors below will explain
  } finally {
    await fs.rm(path.join(base, report), { force: true });
  }

  const errors: string[] = [];
  if (res.timedOut) errors.push("Place-and-route timed out.");
  const okMarkers = [/Program finished normally/i, /Placement.*completed/i];
  const finished = okMarkers.some((re) => re.test(combined));
  for (const line of combined.split("\n")) {
    const t = line.trim();
    if (/^ERROR/i.test(t)) errors.push(t.slice(0, 300));
  }
  if (res.exitCode !== 0 || !finished) {
    if (errors.length === 0) errors.push(`${cmd} exited with code ${res.exitCode} without finishing.`);
    return {
      success: false, topModule: options.topModule ?? "", family, device,
      package: pkg,
      warnings: extractWarnings(combined), errors: errors.slice(0, 10),
    };
  }

  return {
    success: true, topModule: options.topModule ?? "", family, device,
      package: pkg,
    outputFile: out,
    ...(reportParsed.utilization ? { utilization: reportParsed.utilization } : {}),
    ...(reportParsed.fmax ? { fmax: reportParsed.fmax } : {}),
    warnings: extractWarnings(combined),
    errors: [],
  };
}

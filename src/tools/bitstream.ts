import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ToolRunner } from "../runner.js";
import { extractWarnings } from "../parsers/nextpnr.js";
import { FpgaBitstreamResult, FpgaProgramResult } from "../parsers/types.js";

export interface BitstreamOptions {
  inputFile: string;
  outputFile?: string;
  compress?: boolean;
  cwd?: string;
  timeoutMs?: number;
}

/**
 * Packs a routed image to a bitstream: icepack (.asc→.bin) for iCE40,
 * ecppack (optionally --compress) for ECP5.
 */
export async function runFpgaBitstream(
  runner: ToolRunner,
  options: BitstreamOptions
): Promise<FpgaBitstreamResult> {
  const fail = (errors: string[]): FpgaBitstreamResult => ({
    success: false, inputFile: options.inputFile, warnings: [], errors,
  });
  if (!options.inputFile) return fail(["No input file specified."]);

  const base = path.resolve(options.cwd || process.cwd());
  const isAsc = /\.asc$/i.test(options.inputFile);
  const isConfig = /\.(config|textcfg)$/i.test(options.inputFile);
  if (!isAsc && !isConfig) {
    return fail(["inputFile must be a nextpnr .asc (iCE40) or .config (ECP5) image."]);
  }
  const out = options.outputFile || options.inputFile.replace(/\.(asc|config|textcfg)$/i, "") + (isAsc ? ".bin" : ".bit");

  const res = isAsc
    ? await runner.execute("icepack", [options.inputFile, out], { cwd: base, timeoutMs: options.timeoutMs ?? 60000 })
    : await runner.execute(
        "ecppack",
        [...(options.compress ? ["--compress"] : []), options.inputFile, out],
        { cwd: base, timeoutMs: options.timeoutMs ?? 60000 }
      );
  const combined = `${res.stdout}\n${res.stderr}`;

  let bytes: number | undefined;
  try {
    bytes = (await fs.stat(path.join(base, out))).size;
  } catch {
    bytes = undefined;
  }
  if (res.exitCode !== 0 || bytes === undefined) {
    const tail = combined.split("\n").map((l) => l.trim()).filter(Boolean).slice(-5);
    return { ...fail([`Packing failed (exit ${res.exitCode}).`, ...tail]) };
  }
  return {
    success: true, inputFile: options.inputFile, bitstreamFile: out, bytes,
    warnings: extractWarnings(combined), errors: [],
  };
}

export interface ProgramOptions {
  bitstreamFile: string;
  dryRun?: boolean;
  cwd?: string;
  timeoutMs?: number;
}

export function pickProgrammer(bitstreamFile: string): "iceprog" | "openFPGALoader" {
  if (/\.(bit|svf|fs)$/i.test(bitstreamFile)) return "openFPGALoader";
  return "iceprog";
}

/**
 * Flashes a bitstream: iceprog for iCE40 `.bin`, openFPGALoader for ECP5
 * `.bit`/`.svf`. Dry-run (default) only reports the planned command: real
 * flashing needs hardware USB this host cannot verify.
 */
export async function runFpgaProgram(
  runner: ToolRunner,
  options: ProgramOptions
): Promise<FpgaProgramResult> {
  if (!options.bitstreamFile) {
    return {
      success: false, bitstreamFile: "", programmer: "iceprog",
      flashed: false, warnings: [], errors: ["No bitstreamFile specified."],
    };
  }
  const programmer = pickProgrammer(options.bitstreamFile);
  const planned =
    programmer === "openFPGALoader"
      ? `openFPGALoader -b ${options.bitstreamFile}`
      : `iceprog ${options.bitstreamFile}`;
  if (options.dryRun ?? true) {
    return {
      success: true, bitstreamFile: options.bitstreamFile, programmer,
      flashed: false,
      warnings: [
        `Dry run only (${planned}): no hardware touched. Set dry_run=false on a host with the board attached.`,
      ],
      errors: [],
    };
  }

  const base = path.resolve(options.cwd || process.cwd());
  const res =
    programmer === "openFPGALoader"
      ? await runner.execute("openFPGALoader", [options.bitstreamFile], {
          cwd: base,
          timeoutMs: options.timeoutMs ?? 120000,
        })
      : await runner.execute("iceprog", [options.bitstreamFile], {
          cwd: base,
          timeoutMs: options.timeoutMs ?? 120000,
        });
  const combined = `${res.stdout}\n${res.stderr}`;
  const flashed = res.exitCode === 0;
  return {
    success: flashed,
    bitstreamFile: options.bitstreamFile,
    programmer,
    flashed,
    warnings: [],
    errors: flashed
      ? []
      : [
          `${programmer} failed (exit ${res.exitCode}); is a programmed board attached?`,
          ...combined.split("\n").map((l) => l.trim()).filter(Boolean).slice(-5),
        ],
  };
}

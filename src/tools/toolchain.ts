import { ToolRunner } from "../runner.js";
import { FpgaToolchainInfo } from "../parsers/types.js";

async function probe(runner: ToolRunner, cmd: string, args: string[], cwd?: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await runner.execute(cmd, args, { cwd });
      // Some tools (ecppack --help) exit non-zero while proving presence;
      // only a spawn failure means absent.
      const blob = `${res.stdout}\n${res.stderr}`;
      if (/Process spawn error|executable file not found|command not found/i.test(blob)) continue;
      const out = blob.split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "";
      if (out) return out.slice(0, 120);
    } catch {
      // retry below
    }
  }
  return "Not found";
}

export async function getFpgaToolchainInfo(runner: ToolRunner, cwd?: string): Promise<FpgaToolchainInfo> {
  const yosys = await probe(runner, "yosys", ["-V"], cwd);
  const ice40 = await probe(runner, "nextpnr-ice40", ["--version"], cwd);
  const ecp5 = await probe(runner, "nextpnr-ecp5", ["--version"], cwd);
  const icepack = await probe(runner, "icepack", ["-h"], cwd);
  const ecppack = await probe(runner, "ecppack", ["--help"], cwd);
  const iceprog = await probe(runner, "iceprog", ["--help"], cwd);
  const ofl = await probe(runner, "openFPGALoader", ["--help"], cwd);

  return {
    runtime: runner.getRuntime(),
    image: runner.getRuntime() !== "host" ? runner.getImageName() : undefined,
    versions: {
      yosys,
      "nextpnr-ice40": ice40 === "Not found" ? ice40 : "present",
      "nextpnr-ecp5": ecp5 === "Not found" ? ecp5 : "present",
      icepack: icepack === "Not found" ? icepack : "present",
      ecppack: ecppack === "Not found" ? ecppack : "present",
      iceprog: iceprog === "Not found" ? iceprog : "present",
      openFPGALoader: ofl === "Not found" ? ofl : "present",
    },
  };
}

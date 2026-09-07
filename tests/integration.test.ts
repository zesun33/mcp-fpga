import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ToolRunner } from "../src/runner.js";
import { runFpgaSynth } from "../src/tools/synth.js";
import { runFpgaPnr } from "../src/tools/pnr.js";
import { runFpgaBitstream, runFpgaProgram } from "../src/tools/bitstream.js";
import { getFpgaToolchainInfo } from "../src/tools/toolchain.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const runner = new ToolRunner();

test("Integration: fpga_toolchain_info probes the FPGA toolchain", async () => {
  const info = await getFpgaToolchainInfo(runner, projectRoot);
  assert.equal(info.runtime, "podman");
  assert.match(info.versions.yosys, /Yosys/i);
  assert.notEqual(info.versions["nextpnr-ice40"], "Not found");
  assert.notEqual(info.versions["nextpnr-ecp5"], "Not found");
  assert.notEqual(info.versions.icepack, "Not found");
  assert.notEqual(info.versions.ecppack, "Not found");
  assert.notEqual(info.versions.iceprog, "Not found");
  assert.match(info.versions.openFPGALoader, /Not installed/);
});

test("Integration: ice40 synth -> P&R -> bitstream on blink", async () => {
  const synth = await runFpgaSynth(runner, {
    verilogSources: ["fixtures/blink.v"],
    topModule: "blink",
    family: "ice40",
    outputJson: "blink_tmp.json",
    cwd: projectRoot,
  });
  assert.equal(synth.success, true, `synth failed: ${synth.errors.join("; ")}`);
  assert.ok((synth.cellCount ?? 0) > 0);

  const pnr = await runFpgaPnr(runner, {
    jsonNetlist: "blink_tmp.json",
    topModule: "blink",
    board: "icebreaker",
    outputFile: "blink_tmp.asc",
    cwd: projectRoot,
    timeoutMs: 300000,
  });
  assert.equal(pnr.success, true, `pnr failed: ${pnr.errors.join("; ")}`);
  assert.equal(pnr.device, "up5k");
  assert.ok(pnr.utilization?.ICESTORM_LC, "Expected LC utilization");
  assert.ok(pnr.fmax, "Expected fmax report");

  const bit = await runFpgaBitstream(runner, {
    inputFile: "blink_tmp.asc",
    outputFile: "blink_tmp.bin",
    cwd: projectRoot,
  });
  assert.equal(bit.success, true, `icepack failed: ${bit.errors.join("; ")}`);
  assert.ok((bit.bytes ?? 0) > 0);
});

test("Integration: ecp5 synth -> P&R -> bitstream on blink", async () => {
  const synth = await runFpgaSynth(runner, {
    verilogSources: ["fixtures/blink.v"],
    topModule: "blink",
    family: "ecp5",
    outputJson: "blink_ecp5_tmp.json",
    cwd: projectRoot,
  });
  assert.equal(synth.success, true, `synth failed: ${synth.errors.join("; ")}`);

  const pnr = await runFpgaPnr(runner, {
    jsonNetlist: "blink_ecp5_tmp.json",
    topModule: "blink",
    board: "ecp5_25k",
    outputFile: "blink_tmp.config",
    cwd: projectRoot,
    timeoutMs: 300000,
  });
  assert.equal(pnr.success, true, `pnr failed: ${pnr.errors.join("; ")}`);

  const bit = await runFpgaBitstream(runner, {
    inputFile: "blink_tmp.config",
    compress: true,
    outputFile: "blink_tmp.bit",
    cwd: projectRoot,
  });
  assert.equal(bit.success, true, `ecppack failed: ${bit.errors.join("; ")}`);
  assert.ok((bit.bytes ?? 0) > 0);
});

test("Integration: unknown board is rejected with guidance", async () => {
  const res = await runFpgaPnr(runner, {
    jsonNetlist: "blink_tmp.json",
    board: "nope_nonexistent",
    cwd: projectRoot,
  });
  assert.equal(res.success, false);
  assert.ok(res.errors.some((e) => e.includes("fpga_boards")));
});

test("Integration: fpga_program dry-run never touches hardware", async () => {
  const res = await runFpgaProgram(runner, {
    bitstreamFile: "blink_tmp.bin",
    cwd: projectRoot,
  });
  assert.equal(res.success, true);
  assert.equal(res.flashed, false);
  assert.equal(res.programmer, "iceprog");
});

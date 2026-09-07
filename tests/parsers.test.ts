import test from "node:test";
import assert from "node:assert/strict";
import { parseNextpnrReport, parseYosysStats } from "../src/parsers/nextpnr.js";
import { resolvePreset, listBoards } from "../src/boards.js";

test("parseNextpnrReport reads utilization and fmax", () => {
  const report = JSON.stringify({
    utilization: {
      ICESTORM_LC: { available: 7680, used: 28 },
      SB_IO: { available: 256, used: 2 },
    },
    fmax: {
      "clk$SB_IO_IN_$glb_clk": { achieved: 194.36, constraint: 12 },
    },
  });
  const parsed = parseNextpnrReport(report);
  assert.equal(parsed.utilization?.ICESTORM_LC.available, 7680);
  assert.equal(parsed.utilization?.ICESTORM_LC.used, 28);
  assert.equal(parsed.fmax?.["clk$SB_IO_IN_$glb_clk"].achievedMhz, 194.36);
  assert.deepEqual(parseNextpnrReport("not json"), {});
});

test("parseYosysStats reads cell and wire counts", () => {
  const stats = parseYosysStats("   Number of wires: 14\n   Number of cells: 24\n");
  assert.equal(stats.cells, 24);
  assert.equal(stats.wires, 14);
  assert.deepEqual(parseYosysStats("nothing"), {});
});

test("board presets resolve case-insensitively", () => {
  assert.equal(resolvePreset("icebreaker")?.device, "up5k");
  assert.equal(resolvePreset("ICEBREAKER")?.package, "sg48");
  assert.equal(resolvePreset("nope"), undefined);
  assert.ok(listBoards().length >= 4);
  assert.ok(listBoards().some((b) => b.family === "ecp5"));
});

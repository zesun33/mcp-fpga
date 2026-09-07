import test from "node:test";
import assert from "node:assert/strict";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../src/server.js";

test("MCP server registers required FPGA tools", async () => {
  const server = createServer();

  const handler = (server as any)._requestHandlers.get(ListToolsRequestSchema.shape.method.value);
  assert.ok(handler, "ListTools handler must be registered");

  const response = await handler({ method: "tools/list" });
  assert.ok(response.tools, "Tools list must be returned");

  const toolNames = response.tools.map((t: any) => t.name);
  assert.ok(toolNames.includes("fpga_synth"), "fpga_synth must be present");
  assert.ok(toolNames.includes("fpga_place_route"), "fpga_place_route must be present");
  assert.ok(toolNames.includes("fpga_bitstream"), "fpga_bitstream must be present");
  assert.ok(toolNames.includes("fpga_program"), "fpga_program must be present");
  assert.ok(toolNames.includes("fpga_boards"), "fpga_boards must be present");
  assert.ok(toolNames.includes("fpga_toolchain_info"), "fpga_toolchain_info must be present");

  for (const tool of response.tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.description && tool.description.length > 10);
  }
});

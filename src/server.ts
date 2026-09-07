import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { ToolRunner } from "./runner.js";
import { runFpgaSynth } from "./tools/synth.js";
import { runFpgaPnr } from "./tools/pnr.js";
import { runFpgaBitstream, runFpgaProgram } from "./tools/bitstream.js";
import { getFpgaToolchainInfo } from "./tools/toolchain.js";
import { listBoards } from "./boards.js";

export function createServer(runner: ToolRunner = new ToolRunner()): Server {
  const server = new Server(
    {
      name: "@zesun33/mcp-fpga",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const tools: Tool[] = [
    {
      name: "fpga_synth",
      description:
        "Synthesizes RTL to a nextpnr-ready JSON netlist with Yosys (synth_ice40/synth_ecp5), returning cell and wire counts. First stage of the FPGA flow; feed jsonNetlist into fpga_place_route.",
      inputSchema: {
        type: "object",
        properties: {
          verilog_sources: {
            type: "array",
            items: { type: "string" },
            description: "RTL source files.",
          },
          top_module: {
            type: "string",
            description: "Top module name.",
          },
          family: {
            type: "string",
            enum: ["ice40", "ecp5"],
            description: "FPGA family (default: ice40).",
          },
          cwd: {
            type: "string",
            description: "Optional working directory.",
          },
        },
        required: ["verilog_sources", "top_module"],
      },
    },
    {
      name: "fpga_place_route",
      description:
        "Runs nextpnr place-and-route for iCE40/ECP5 from a Yosys JSON netlist. Device and package resolve from an explicit pair or a board preset (explicit wins). Returns utilization and Fmax from the JSON report. Use fpga_boards to list presets.",
      inputSchema: {
        type: "object",
        properties: {
          json_netlist: {
            type: "string",
            description: "Yosys JSON netlist (jsonNetlist from fpga_synth).",
          },
          top_module: {
            type: "string",
            description: "Top module name (for output naming).",
          },
          family: {
            type: "string",
            enum: ["ice40", "ecp5"],
            description: "FPGA family (default: from board preset, else ice40).",
          },
          board: {
            type: "string",
            description: "Board preset name (see fpga_boards).",
          },
          device: {
            type: "string",
            description: "Device size, e.g. up5k, hx8k, 25k, 45k.",
          },
          package: {
            type: "string",
            description: "Package, e.g. sg48, ct256, CABGA256.",
          },
          cwd: {
            type: "string",
            description: "Optional working directory.",
          },
        },
        required: ["json_netlist"],
      },
    },
    {
      name: "fpga_bitstream",
      description:
        "Packs a routed image to a bitstream: icepack (.asc to .bin) for iCE40, ecppack (optionally --compress) for ECP5. Feed the result into fpga_program.",
      inputSchema: {
        type: "object",
        properties: {
          input_file: {
            type: "string",
            description: "Routed image: .asc (iCE40) or .config (ECP5).",
          },
          compress: {
            type: "boolean",
            description: "Pass --compress to ecppack (ECP5 only).",
          },
          cwd: {
            type: "string",
            description: "Optional working directory.",
          },
        },
        required: ["input_file"],
      },
    },
    {
      name: "fpga_program",
      description:
        "Flashes an iCE40 bitstream via iceprog. Dry-run (default) only reports the planned command: real flashing needs board hardware this host cannot verify. ECP5 needs openFPGALoader, which is absent from the image.",
      inputSchema: {
        type: "object",
        properties: {
          bitstream_file: {
            type: "string",
            description: "Bitstream file to flash.",
          },
          dry_run: {
            type: "boolean",
            description: "Report the plan without touching hardware (default: true).",
          },
          cwd: {
            type: "string",
            description: "Optional working directory.",
          },
        },
        required: ["bitstream_file"],
      },
    },
    {
      name: "fpga_boards",
      description:
        "Lists board presets (device, package, programmer) for place-and-route targeting. Use a preset name as fpga_place_route board input.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "fpga_toolchain_info",
      description:
        "Returns active container/host runtime and versions of Yosys, nextpnr, icepack, ecppack, and iceprog.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case "fpga_synth": {
          const result = await runFpgaSynth(runner, {
            verilogSources: (args.verilog_sources as string[]) || [],
            topModule: (args.top_module as string) || "",
            family: (args.family as "ice40" | "ecp5" | undefined) ?? undefined,
            cwd: args.cwd as string | undefined,
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fpga_place_route": {
          const result = await runFpgaPnr(runner, {
            jsonNetlist: (args.json_netlist as string) || "",
            topModule: args.top_module as string | undefined,
            family: (args.family as "ice40" | "ecp5" | undefined) ?? undefined,
            board: args.board as string | undefined,
            device: args.device as string | undefined,
            package: args.package as string | undefined,
            cwd: args.cwd as string | undefined,
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fpga_bitstream": {
          const result = await runFpgaBitstream(runner, {
            inputFile: (args.input_file as string) || "",
            compress: Boolean(args.compress),
            cwd: args.cwd as string | undefined,
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fpga_program": {
          const result = await runFpgaProgram(runner, {
            bitstreamFile: (args.bitstream_file as string) || "",
            dryRun: args.dry_run === undefined ? true : Boolean(args.dry_run),
            cwd: args.cwd as string | undefined,
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "fpga_boards": {
          return { content: [{ type: "text", text: JSON.stringify({ boards: listBoards() }, null, 2) }] };
        }

        case "fpga_toolchain_info": {
          const result = await getFpgaToolchainInfo(runner);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        default:
          return {
            content: [{ type: "text", text: `Error: Unknown tool "${name}".` }],
            isError: true,
          };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Tool execution failed: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

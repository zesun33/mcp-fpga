# @zesun33/mcp-fpga

> Model Context Protocol (MCP) server for FPGA synthesis, place-and-route, and bitstream programming (iCE40/ECP5).

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![CI](https://github.com/zesun33/mcp-fpga/actions/workflows/ci.yml/badge.svg)](https://github.com/zesun33/mcp-fpga/actions/workflows/ci.yml)
[![Protocol: MCP](https://img.shields.io/badge/protocol-MCP_stdio-blueviolet)](https://modelcontextprotocol.io)
[![Runtime: Rootless Podman](https://img.shields.io/badge/runtime-rootless_podman-brightgreen)](#execution-runtime)

`mcp-fpga` gives AI coding agents and IDEs (**Cursor**, **Windsurf**, **GitHub Copilot / OpenAI Codex**, **Claude Code**, **Google Antigravity**, **OpenCode**, **Cline**) a complete open-source FPGA flow: Yosys synthesis to nextpnr JSON, nextpnr place-and-route with utilization/Fmax reports, bitstream packing (icepack/ecppack), and hardware programming via iceprog. Board presets (iCEBreaker, HX8K, ULX3S-class, generic ECP5) resolve device/package details.

> Hardware honesty: bitstream flashing needs a board on USB, which CI hosts cannot verify. `fpga_program` dry-runs by default and only reports the plan; set `dry_run: false` on a host with hardware attached. ECP5 flashing needs openFPGALoader, which is absent from the image — program ECP5 bitstreams externally.

---

## ⚡ Quick Tour: See It in Action

### Real Agent Scenarios in 60 Seconds

#### 1. Probing the Toolchain (Zero-Config Verification)
```json
// Tool Call: fpga_toolchain_info
{
  "runtime": "podman",
  "image": "ghcr.io/zesun33/fpga",
  "versions": {
    "yosys": "Yosys 0.38+92",
    "nextpnr-ice40": "present",
    "nextpnr-ecp5": "present",
    "icepack": "present",
    "ecppack": "present",
    "iceprog": "present",
    "openFPGALoader": "Not installed (ECP5 flashing needs external tooling)"
  }
}
```

#### 2. Listing Board Presets
```json
// Tool Call: fpga_boards
{
  "boards": [
    { "board": "icebreaker", "family": "ice40", "device": "up5k", "package": "sg48", "programmer": "iceprog" },
    { "board": "hx8k", "family": "ice40", "device": "hx8k", "package": "ct256", "programmer": "iceprog" }
  ]
}
```

#### 3. iCEBreaker Flow: Synth, Place-and-Route, Bitstream
```json
// Tool Call: fpga_synth {"verilog_sources": ["blink.v"], "top_module": "blink", "family": "ice40"}
// -> { "success": true, "jsonNetlist": "blink_ice40.json", "cellCount": 30 }
// Tool Call: fpga_place_route {"json_netlist": "blink_ice40.json", "top_module": "blink", "board": "icebreaker"}
// -> { "success": true, "device": "up5k", "utilization": { "ICESTORM_LC": { "used": 28 } }, "fmax": { "clk": { "achievedMhz": 194.3 } } }
// Tool Call: fpga_bitstream {"input_file": "blink_up5k.asc"}
// -> { "success": true, "bitstreamFile": "blink_up5k.bin", "bytes": 135100 }
```

#### 4. Safe Programming Default (Dry Run)
```json
// Tool Call: fpga_program {"bitstream_file": "blink_up5k.bin"}
{
  "success": true,
  "programmer": "iceprog",
  "flashed": false,
  "warnings": ["Dry run only: no hardware touched. Set dry_run=false on a host with the board attached."]
}
```

---

## Tools Exposed

| Tool | Parameters | Engine | Description |
| :--- | :--- | :--- | :--- |
| `fpga_synth` | `verilog_sources: string[]`, `top_module: string`, `family?: "ice40" \| "ecp5"`, `cwd?: string` | `synth_ice40` / `synth_ecp5` | RTL to nextpnr JSON netlist with cell/wire counts. |
| `fpga_place_route` | `json_netlist: string`, `top_module?: string`, `family?: "ice40" \| "ecp5"`, `board?: string`, `device?: string`, `package?: string`, `cwd?: string` | `nextpnr-ice40` / `nextpnr-ecp5` | P&R with utilization and Fmax from `--report` JSON. Explicit device/package wins over presets. |
| `fpga_bitstream` | `input_file: string`, `compress?: boolean`, `cwd?: string` | `icepack` / `ecppack` | Routed image to bitstream (`.asc`→`.bin`, `.config`→`.bit`). |
| `fpga_program` | `bitstream_file: string`, `dry_run?: boolean`, `cwd?: string` | `iceprog` | iCE40 flashing; dry-run default, honest HW errors otherwise. |
| `fpga_boards` | *none* | Static presets | Board → device/package/programmer table. |
| `fpga_toolchain_info` | *none* | Probe | Versions of the FPGA toolchain, including openFPGALoader absence. |

---

## Execution Runtime

`mcp-fpga` runs inside the [`zesun33/fpga`](https://github.com/zesun33/eda-docker-images) rootless Podman image so tools are identical on any Linux host.

**Public install (recommended — anyone can pull):**
```bash
podman pull ghcr.io/zesun33/fpga:latest
export MCP_FPGA_IMAGE=ghcr.io/zesun33/fpga
```

Local builds from `eda-docker-images` still work as `localhost/zesun33/fpga` (the historical default). Override anytime with `MCP_FPGA_IMAGE`.

- Container mount: `-v <workspace>:/workspace:Z -w /workspace`
- Podman storage option: `--storage-opt overlay.ignore_chown_errors=true`

To force host binaries instead of container execution:
```bash
export MCP_FPGA_RUNTIME=host
```

Targets iCE40 / ECP5 toolchains shipped in `zesun33/fpga`.


---

## Universal Client & AI IDE Setup

Because `mcp-fpga` implements the standard [Model Context Protocol (MCP)](https://modelcontextprotocol.io), it connects seamlessly to any MCP-compliant AI IDE or agent interface:

```json
{
  "mcpServers": {
    "fpga": {
      "command": "node",
      "args": ["/path/to/mcp-fpga/dist/index.js"]
    }
  }
}
```

- **Cursor**: Configure in `.cursor/mcp.json`.
- **Windsurf**: Configure in `~/.codeium/windsurf/mcp_config.json`.
- **GitHub Copilot / OpenAI Codex**: Configure via Copilot MCP settings or Codex tool proxy.
- **Claude Code**: Configure via `claude mcp add fpga node /path/to/dist/index.js`.
- **Google Antigravity**: Load as workspace MCP server in `antigravity.json`.
- **OpenCode & Cline**: Direct stdio JSON-RPC connection.

---

## Verification & Testing

Run the full 6-gate verification suite:

```bash
# Full verification (with Podman FPGA synthesis and P&R)
./scripts/verify.sh

# Fast / CI verification (headless environments)
./scripts/verify.sh --quick
```

## License

Apache-2.0 © 2026 Md Zesun Ahmed Mia

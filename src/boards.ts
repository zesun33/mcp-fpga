export type FpgaFamily = "ice40" | "ecp5";

export interface BoardPreset {
  board: string;
  family: FpgaFamily;
  device: string;
  package: string;
  programmer: string;
  notes: string;
}

export const BOARD_PRESETS: BoardPreset[] = [
  {
    board: "icebreaker",
    family: "ice40",
    device: "up5k",
    package: "sg48",
    programmer: "iceprog",
    notes: "iCEBreaker (iCE40UP5K-SG48). Flash via iceprog; needs hardware USB.",
  },
  {
    board: "hx8k",
    family: "ice40",
    device: "hx8k",
    package: "ct256",
    programmer: "iceprog",
    notes: "iCE40HX8K breakout (CT256). Flash via iceprog; needs hardware USB.",
  },
  {
    board: "ulx3s_45f",
    family: "ecp5",
    device: "45k",
    package: "CABGA381",
    programmer: "openFPGALoader (not installed)",
    notes: "ULX3S ECP5-45F. openFPGALoader is absent from the image; program externally.",
  },
  {
    board: "ecp5_25k",
    family: "ecp5",
    device: "25k",
    package: "CABGA256",
    programmer: "openFPGALoader (not installed)",
    notes: "Generic ECP5-25K CABGA256 target. openFPGALoader is absent from the image.",
  },
];

export function resolvePreset(board?: string): BoardPreset | undefined {
  if (!board) return undefined;
  return BOARD_PRESETS.find((b) => b.board.toLowerCase() === board.toLowerCase());
}

export function listBoards(): BoardPreset[] {
  return BOARD_PRESETS.map((b) => ({ ...b }));
}

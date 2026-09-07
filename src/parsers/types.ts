export interface FpgaUtilEntry {
  available: number;
  used: number;
}

export interface FpgaFmaxEntry {
  achievedMhz?: number;
  constraintMhz?: number;
}

export interface FpgaSynthResult {
  success: boolean;
  topModule: string;
  family: string;
  jsonNetlist?: string;
  cellCount?: number;
  wireCount?: number;
  warnings: string[];
  errors: string[];
}

export interface FpgaPnrResult {
  success: boolean;
  topModule: string;
  family: string;
  device: string;
  package: string;
  outputFile?: string;
  utilization?: Record<string, FpgaUtilEntry>;
  fmax?: Record<string, FpgaFmaxEntry>;
  warnings: string[];
  errors: string[];
}

export interface FpgaBitstreamResult {
  success: boolean;
  inputFile: string;
  bitstreamFile?: string;
  bytes?: number;
  warnings: string[];
  errors: string[];
}

export interface FpgaProgramResult {
  success: boolean;
  bitstreamFile: string;
  programmer: string;
  flashed: boolean;
  warnings: string[];
  errors: string[];
}

export interface FpgaToolchainInfo {
  runtime: "podman" | "docker" | "host";
  image?: string;
  versions: Record<string, string>;
}

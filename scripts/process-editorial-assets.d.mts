export interface EditorialAsset {
  readonly width: number;
  readonly height: number;
  readonly maxBytes: number;
  readonly kind: "photo" | "mark";
  readonly color?: string;
}

export const REPOSITORY_ROOT: string;
export const PRODUCTION_ASSET_ROOT: string;
export const QA_EVIDENCE_ROOT: string;
export const EDITORIAL_ASSETS: Readonly<Record<string, EditorialAsset>>;

export function photo(
  inputPath: string,
  outputPath: string,
  options?: { width?: number | string; height?: number | string },
): Promise<void>;

export function mark(inputPath: string, outputPath: string, options?: { color?: string }): Promise<void>;

export function check(outputPaths?: string[]): Promise<
  Array<{
    file: string;
    bytes: number;
    width: number;
    height: number;
    alphaBounds?: { hasTransparent: boolean; hasOpaque: boolean };
  }>
>;

export function compare(leftPath: string, rightPath: string, outputPath: string): Promise<void>;

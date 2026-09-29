export type LocalBootstrapMarker = {
  root: string;
  projectId: string;
  port: number;
  configHash: string;
};

export function assertBootstrapDirectory(root: string): string;
export function prepareLocalBootstrap(root: string): void;
export function assertLocalBootstrap(root: string): LocalBootstrapMarker;

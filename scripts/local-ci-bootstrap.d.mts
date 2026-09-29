export type LocalBootstrapResult = {
  status: number;
  stdout?: string;
  stderr?: string;
};

export function runLocalBootstrap(args: string[], options?: {
  cwd?: string;
  env?: Record<string, string | undefined>;
  probe?: (command: string, args: string[], options: {
    env: Record<string, string | undefined>;
    encoding: 'utf8';
    windowsHide: boolean;
  }) => { status: number | null; stdout?: string; stderr?: string };
  run?: (args: string[], options: {
    cwd: string;
    env: Record<string, string | undefined>;
  }) => LocalBootstrapResult;
}): LocalBootstrapResult;

export function runLocalBootstrapMain(args: string[], options?: {
  run?: (args: string[]) => LocalBootstrapResult;
  logger?: (message: string) => void;
}): number;

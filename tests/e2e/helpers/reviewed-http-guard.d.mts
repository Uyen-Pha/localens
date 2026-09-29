import type { APIResponse, Route } from '@playwright/test';
export function forwardReviewedHttp(
  route: Route,
  allowedOrigins: Set<string>,
  blocked: string[],
  inspect?: (response: APIResponse) => void | Promise<void>,
): Promise<void>;

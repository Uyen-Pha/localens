import {
  createCorrelationId,
  errorResponse,
} from "@/supabase/functions/_shared/gateway";
import { parseItineraryEdgeEnv } from "@/supabase/functions/_shared/edge-env";
import { createRefineItineraryHandler } from "@/supabase/functions/_shared/refine-itinerary";
import { createSupabaseRefineAdapter } from "@/supabase/functions/_shared/supabase-itinerary-adapter";

declare const Deno: {
  readonly env: { toObject(): Record<string, string> };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function unavailableResponse(): Response {
  return errorResponse(
    {
      code: "SERVICE_UNAVAILABLE",
      messageKey: "planner.service_unavailable",
      retryable: true,
      status: 503,
    },
    createCorrelationId(),
  );
}

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    const env = parseItineraryEdgeEnv(Deno.env.toObject());
    const adapter = await createSupabaseRefineAdapter(env, request);
    const handler = createRefineItineraryHandler(adapter, {
      policy: {
        allowedOrigins: env.allowedOrigins,
        allowedMethods: ["POST", "OPTIONS"],
      },
      requireAuthenticated: true,
    });
    return await handler(request);
  } catch {
    return unavailableResponse();
  }
});

import {
  hasToken,
  validateToken,
  checkRateLimit,
  unauthorizedResponse,
  rateLimitedResponse,
} from "./auth.ts";
import { generateRequestId, log } from "./logging.ts";
import { handleCleanup } from "./cleanup.ts";
import { handleHomepage } from "./homepage.ts";
import { handleInspect } from "./inspect.ts";
import { handleServe } from "./serve.ts";
import { handleUpload } from "./upload.ts";
import type { Env } from "./types.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = generateRequestId();
    const url = new URL(request.url);
    const host = url.hostname;
    const path = url.pathname;

    try {
      // POST /upload — open endpoint, rate limited by IP
      if (request.method === "POST" && path === "/upload") {
        const { allowed } = await checkRateLimit(request, env.SHOW_META);
        if (!allowed) {
          return rateLimitedResponse(requestId);
        }
        return await handleUpload(request, env, requestId);
      }

      // GET /_admin/deployments/:id — protected inspect endpoint
      const adminMatch = path.match(/^\/_admin\/deployments\/([^/]+)$/);
      if (request.method === "GET" && adminMatch) {
        if (hasToken(env) && !validateToken(request, env)) {
          return unauthorizedResponse(requestId);
        }
        return await handleInspect(env, requestId, adminMatch[1]);
      }

      // GET /* on homepage host — serve landing page
      if (request.method === "GET" && env.HOMEPAGE_HOST && host === env.HOMEPAGE_HOST) {
        return await handleHomepage(request, env);
      }

      // GET /* on subdomain — serve deployment files
      const baseDomain = env.BASE_DOMAIN;
      if (request.method === "GET" && host.endsWith(`.${baseDomain}`)) {
        const deploymentId = host.slice(0, -(baseDomain.length + 1));
        if (deploymentId) {
          return await handleServe(request, env, requestId, deploymentId);
        }
      }

      return Response.json(
        { error: "NOT_FOUND", message: "Not found", requestId },
        { status: 404 },
      );
    } catch (err) {
      log("internal_error", {
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      return Response.json(
        { error: "INTERNAL_ERROR", message: "Internal server error", requestId },
        { status: 500 },
      );
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCleanup(env));
  },
};

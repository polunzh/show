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
    const method = request.method;
    const isGetOrHead = method === "GET" || method === "HEAD";

    try {
      // POST /upload — open endpoint, rate limited by IP
      if (method === "POST" && path === "/upload") {
        const { allowed } = await checkRateLimit(request, env.SHOW_META);
        if (!allowed) {
          return rateLimitedResponse(requestId);
        }
        return await handleUpload(request, env, requestId);
      }

      // GET /_admin/deployments/:id — protected inspect endpoint
      const adminMatch = path.match(/^\/_admin\/deployments\/([^/]+)$/);
      if (method === "GET" && adminMatch) {
        if (hasToken(env) && !(await validateToken(request, env))) {
          return unauthorizedResponse(requestId);
        }
        return await handleInspect(env, requestId, adminMatch[1]);
      }

      // GET|HEAD /* on homepage host — serve landing page
      if (isGetOrHead && env.HOMEPAGE_HOST && host === env.HOMEPAGE_HOST) {
        const response = await handleHomepage(request, env);
        return method === "HEAD" ? new Response(null, response) : response;
      }

      // GET|HEAD /* on subdomain — serve deployment files
      const baseDomain = env.BASE_DOMAIN;
      if (isGetOrHead && host.endsWith(`.${baseDomain}`)) {
        const deploymentId = host.slice(0, -(baseDomain.length + 1));
        if (deploymentId && /^[a-z0-9-]+$/.test(deploymentId)) {
          const response = await handleServe(request, env, requestId, deploymentId);
          return method === "HEAD" ? new Response(null, response) : response;
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

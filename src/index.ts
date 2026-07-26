/**
 * hevy-http-mcp — HTTP MCP server for the Hevy workout tracker API.
 *
 * Entry point: configures Elysia, the MCP plugin, authentication,
 * and registers all Hevy tools.
 */

import { Elysia } from "elysia";
import { mcp } from "elysia-mcp";

import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { HevyClient } from "./hevy/client";
import {
  registerWorkoutTools,
  registerRoutineTools,
  registerTemplateTools,
  registerFolderTools,
} from "./tools";

// ── Bootstrap ───────────────────────────────────────────────────────────

const config = loadConfig();
const logger = createLogger(
  (process.env["LOG_LEVEL"] as "debug" | "info" | "warn" | "error") ?? "info",
);
const hevy = new HevyClient(config.hevyApiKey, logger);

logger.info("Starting hevy-http-mcp server…");

// ── Elysia App ──────────────────────────────────────────────────────────

const app = new Elysia()
  .use(
    mcp({
      basePath: "/mcp",
      serverInfo: {
        name: "hevy-http-mcp",
        version: "1.0.0",
      },
      capabilities: {
        tools: {},
      },
      enableLogging: true,
      enableJsonResponse: true,
      // PATCH: Authentication check disabled.
      //
      // Why: this server was built to send back 401/403 for missing/invalid
      // Authorization headers, expecting an MCP client that can be configured
      // with a static Bearer token. Claude Cowork's custom-connector UI does
      // not currently expose a plain-header/Bearer-token field (only OAuth
      // Client ID/Secret) for this account, so any server that enforces
      // Authorization causes Cowork to attempt OAuth dynamic client
      // registration against it, which fails outright since this server has
      // no OAuth endpoints.
      //
      // MCP_API_KEY is still required at startup by config.ts (loadConfig
      // calls requireEnv, which process.exit(1)s if it's missing) - keep a
      // value set in Railway's Variables tab, it's just no longer checked
      // against incoming requests below.
      //
      // Trade-off: the /mcp endpoint is reachable by anyone who has the
      // Railway URL, with no credential required. The URL itself is a long,
      // effectively unguessable random subdomain, so practical exposure risk
      // is low for personal workout data - but it is not zero. Revert this
      // once Claude's header-based custom-connector auth (currently beta)
      // is available on this account, and re-enable the original check.
      authentication: async (_ctx) => {
        return {
          authInfo: {
            token: config.mcpApiKey,
            clientId: "mcp-client",
            scopes: ["hevy:read", "hevy:write"],
          },
        };
      },
      setupServer: (server) => {
        registerWorkoutTools(server, hevy, logger);
        registerRoutineTools(server, hevy, logger);
        registerTemplateTools(server, hevy, logger);
        registerFolderTools(server, hevy, logger);
        logger.info("All Hevy MCP tools registered");
      },
    }),
  )
  .listen({ port: config.port, hostname: config.host });

logger.info(`hevy-http-mcp listening on http://${config.host}:${config.port}/mcp`);

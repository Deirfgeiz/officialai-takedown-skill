/**
 * Official AI takedown MCP server.
 *
 * A thin client over the free Official AI takedown API. The hosted API
 * does the deterministic work (evidence capture with archiving and
 * hashing, platform playbook data, statutory notice drafting); this
 * server just exposes it as MCP tools.
 *
 * Everything returned is a DRAFT: a human reviews and files it. Filing
 * and monitoring require a verified account at https://theofficial.ai.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { INPUT_LIMITS } from "./limits.js";

export interface ServerOptions {
  apiBase?: string;
  fetch?: typeof globalThis.fetch;
}

export function createServer(options: ServerOptions = {}) {
  const API_BASE =
    options.apiBase ?? process.env["OFFICIAL_AI_API_URL"] ?? "https://theofficial.ai";
  const fetchApi = options.fetch ?? globalThis.fetch;
  const url = z.string().max(INPUT_LIMITS.url).url();
  const shortText = z.string().max(INPUT_LIMITS.shortText);
  const text = z.string().max(INPUT_LIMITS.text);
  // Refuse an oversized record before Zod walks its values. The SDK also caps
  // the total number of input elements before running any tool schema.
  const extraFields = z.preprocess((value, ctx) => {
    if (
      value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length > INPUT_LIMITS.extraFields
    ) {
      ctx.addIssue({
        code: "custom",
        message: `At most ${INPUT_LIMITS.extraFields} extra fields are allowed`,
      });
      return z.NEVER;
    }
    return value;
  }, z.record(z.string().max(INPUT_LIMITS.fieldName), z.string().max(INPUT_LIMITS.fieldValue)));

  async function api(
    path: string,
    init?: RequestInit,
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const response = await fetchApi(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "officialai-takedown-mcp/0.1",
        ...init?.headers,
      },
    });
    const body = await response.json().catch(() => ({
      error: `Non-JSON response (HTTP ${response.status})`,
    }));
    return { ok: response.ok, status: response.status, body };
  }

  function asText(body: unknown): { content: { type: "text"; text: string }[] } {
    return {
      content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
    };
  }

  const server = new McpServer(
    { name: "officialai-takedown", version: "0.1.0" },
    { maxToolInputElements: INPUT_LIMITS.elements },
  );

  server.registerTool(
    "capture_evidence",
    {
      description:
        "Capture evidence of a URL hosting impersonating or stolen content: independent archive snapshot, retrieval timestamp, SHA-256 of the exact bytes, and a PDQ perceptual fingerprint of any image. Returns a typed evidence manifest. Run this FIRST, before the content is taken down or changed.",
      inputSchema: {
        url: url.describe("The URL of the infringing post or media"),
        mediaUrls: z
          .array(url)
          .max(INPUT_LIMITS.mediaUrls)
          .optional()
          .describe("Direct media URLs on the page to capture as well"),
      },
    },
    async ({ url, mediaUrls }) => {
      const result = await api("/api/v1/capture_evidence", {
        method: "POST",
        body: JSON.stringify({ url, ...(mediaUrls ? { mediaUrls } : {}) }),
      });
      return asText(result.body);
    },
  );

  server.registerTool(
    "get_playbook",
    {
      description:
        "Get the takedown playbook for a platform: legal bases, report-form URLs, documented email intakes, required fields, ID requirements, and response times. Every fact carries a primary-source citation with a retrieval date; unverifiable facts are marked UNVERIFIED, never guessed. Platforms: meta, youtube, tiktok, x, google.",
      inputSchema: {
        platform: z
          .enum(["meta", "youtube", "tiktok", "x", "google"])
          .optional()
          .describe("Omit to fetch all platforms"),
      },
    },
    async ({ platform }) => {
      const query = platform ? `?platform=${platform}` : "";
      const result = await api(`/api/v1/playbook${query}`);
      return asText(result.body);
    },
  );

  server.registerTool(
    "draft_notice",
    {
      description:
        "Draft a platform-correct takedown notice from captured evidence. Statutory fields are computed deterministically; the result is a DRAFT the human must review and file themselves (the draft includes the form URL or documented email intake, plus step-by-step instructions). Use capture_evidence first to get an evidenceManifestId, and get_playbook to pick the right reportPathId.",
      inputSchema: {
        reportPathId: shortText
          .describe(
            "Playbook report path id, e.g. 'youtube.copyright' or 'meta.instagram.impersonation'",
          ),
        evidenceManifestId: z
          .string()
          .length(36)
          .uuid()
          .describe("Manifest id returned by capture_evidence"),
        claimant: z.object({
          fullName: shortText,
          email: z.string().max(INPUT_LIMITS.email).email(),
          mailingAddress: z.string().max(INPUT_LIMITS.address).optional(),
          phone: z.string().max(INPUT_LIMITS.phone).optional(),
          country: shortText.optional(),
          relationship: z.enum(["self", "authorized_representative"]),
          representedPartyName: shortText.optional(),
          authorityDescription: text.optional(),
        }),
        work: z.object({
          description: text
            .describe("Description of the original work or persona"),
          originalUrls: z.array(url).max(INPUT_LIMITS.originalUrls),
          workType: z
            .enum(["photo", "video", "text", "voice", "persona", "other"])
            .optional(),
        }),
        infringementDescription: text
          .describe("Factual description of what is infringing and why"),
        extraFields: extraFields
          .optional()
          .describe(
            "Platform-specific values the drafter cannot derive (e.g. reported_username)",
          ),
      },
    },
    async (input) => {
      const result = await api("/api/v1/draft_notice", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return asText(result.body);
    },
  );

  server.registerTool(
    "check_authorization",
    {
      description:
        "Check whether content matches a registered authentic work in the Official AI registry. Query by sha256 (exact bytes) or pdq (perceptual fingerprint from capture_evidence). Returns the registry record or an honest 'unknown'; absence of a record is not a judgment about the content, and perceptual matches require human confirmation.",
      inputSchema: {
        sha256: z
          .string()
          .length(64)
          .regex(/^[0-9a-f]{64}$/)
          .optional(),
        pdq: z
          .string()
          .length(64)
          .regex(/^[0-9a-f]{64}$/)
          .optional(),
        maxDistance: z.number().int().min(0).max(64).optional(),
      },
    },
    async ({ sha256, pdq, maxDistance }) => {
      const params = new URLSearchParams();
      if (sha256) params.set("sha256", sha256);
      if (pdq) params.set("pdq", pdq);
      if (maxDistance !== undefined) params.set("maxDistance", String(maxDistance));
      const result = await api(`/api/v1/check_authorization?${params}`);
      return asText(result.body);
    },
  );

  return server;
}

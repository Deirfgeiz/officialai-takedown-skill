import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../dist/server.js";
import { INPUT_LIMITS } from "../dist/limits.js";

const notice = () => ({
  reportPathId: "youtube.copyright",
  evidenceManifestId: "123e4567-e89b-42d3-a456-426614174000",
  claimant: { fullName: "Test User", email: "test@example.com", relationship: "self" },
  work: { description: "Original photo", originalUrls: ["https://example.com/original"] },
  infringementDescription: "An unauthorized copy",
});

async function fixture(t, reply = { draft: true }) {
  const calls = [];
  const server = createServer({
    apiBase: "https://api.example.test",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return Response.json(reply);
    },
  });
  const client = new Client({ name: "test-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, calls };
}

async function rejected(t, name, args) {
  const { client, calls } = await fixture(t);
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, true);
  assert.equal(calls.length, 0, "invalid input must never reach the hosted API");
  return result.content.map((c) => c.text ?? "").join("\n");
}

test("all four MCP tools remain discoverable after the Zod migration", async (t) => {
  const { client } = await fixture(t);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["capture_evidence", "check_authorization", "draft_notice", "get_playbook"]);
  assert.equal(tools.find((t) => t.name === "capture_evidence").inputSchema.properties.mediaUrls.maxItems, 10);
  assert.equal(tools.find((t) => t.name === "draft_notice").inputSchema.properties.work.properties.originalUrls.maxItems, 20);
});

test("capture_evidence preserves the API request and response with optional media", async (t) => {
  const reply = { id: "manifest", draft: true };
  const { client, calls } = await fixture(t, reply);
  for (const args of [{ url: "https://example.com/post" }, { url: "https://example.com/post", mediaUrls: ["https://example.com/photo"] }]) {
    const result = await client.callTool({ name: "capture_evidence", arguments: args });
    assert.deepEqual(JSON.parse(result.content[0].text), reply);
    const call = calls.at(-1);
    assert.equal(call.url, "https://api.example.test/api/v1/capture_evidence");
    assert.equal(call.init.method, "POST");
    assert.deepEqual(JSON.parse(call.init.body), args);
    assert.equal(call.init.headers["Content-Type"], "application/json");
  }
});

test("get_playbook supports both all platforms and a selected platform", async (t) => {
  const { client, calls } = await fixture(t, { platforms: ["youtube"] });
  for (const args of [{}, { platform: "youtube" }]) {
    const result = await client.callTool({ name: "get_playbook", arguments: args });
    assert.deepEqual(JSON.parse(result.content[0].text), { platforms: ["youtube"] });
  }
  assert.deepEqual(calls.map((c) => c.url), ["https://api.example.test/api/v1/playbook", "https://api.example.test/api/v1/playbook?platform=youtube"]);
});

test("draft_notice preserves nested data, representative fields and extra fields", async (t) => {
  const { client, calls } = await fixture(t, { status: "DRAFT" });
  const args = notice();
  Object.assign(args.claimant, { mailingAddress: "Test address", phone: "+1 555 0100", country: "US", relationship: "authorized_representative", representedPartyName: "Example", authorityDescription: "Authorized agent" });
  args.work.workType = "photo";
  args.extraFields = { reported_username: "example" };
  const result = await client.callTool({ name: "draft_notice", arguments: args });
  assert.deepEqual(JSON.parse(result.content[0].text), { status: "DRAFT" });
  assert.equal(calls[0].url, "https://api.example.test/api/v1/draft_notice");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), args);
});

test("check_authorization preserves hashes and a zero maxDistance", async (t) => {
  const { client, calls } = await fixture(t, { status: "unknown" });
  const args = { sha256: "a".repeat(64), pdq: "b".repeat(64), maxDistance: 0 };
  const result = await client.callTool({ name: "check_authorization", arguments: args });
  assert.deepEqual(JSON.parse(result.content[0].text), { status: "unknown" });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/api/v1/check_authorization");
  assert.deepEqual(Object.fromEntries(url.searchParams), { ...args, maxDistance: "0" });
});

for (const [name, args] of [
  ["capture_evidence", { url: "not a URL" }],
  ["get_playbook", { platform: "unknown" }],
  ["draft_notice", { ...notice(), evidenceManifestId: "not-a-uuid" }],
  ["check_authorization", { sha256: "bad", maxDistance: 65 }],
]) test(`${name} rejects invalid inputs before any API request`, async (t) => { await rejected(t, name, args); });

test("oversized malformed media arrays produce a bounded error without walking every bad item", async (t) => {
  const error = await rejected(t, "capture_evidence", { url: "https://example.com/post", mediaUrls: Array(500).fill(0) });
  assert.ok(error.length < 1_000, "a length violation must not generate hundreds of element errors");
});

test("the previously unbounded originalUrls array rejects excessive malformed elements", async (t) => {
  const args = notice();
  args.work.originalUrls = Array(500).fill(0);
  const error = await rejected(t, "draft_notice", args);
  assert.ok(error.length < 1_000);
});

test("extraFields refuses excess keys before validating their malformed values", async (t) => {
  const args = { ...notice(), extraFields: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, null])) };
  const error = await rejected(t, "draft_notice", args);
  assert.match(error, /At most 32 extra fields/);
  assert.ok(error.length < 1_000);
});

test("the SDK rejects a wide unknown argument object before stripping unknown keys", async (t) => {
  const args = Object.fromEntries(Array.from({ length: INPUT_LIMITS.elements + 1 }, (_, i) => [`key${i}`, null]));
  const error = await rejected(t, "get_playbook", args);
  assert.match(error, /maximum of 1024 elements/);
});

test("the SDK bounds deeply nested arguments before tool validation", async (t) => {
  let nested = null;
  for (let i = 0; i < INPUT_LIMITS.elements + 1; i++) nested = { nested };
  const error = await rejected(t, "get_playbook", { nested });
  assert.match(error, /maximum of 1024 elements/);
});

test("documented collection boundaries are accepted", async (t) => {
  const { client, calls } = await fixture(t);
  const media = Array(INPUT_LIMITS.mediaUrls).fill("https://example.com/media");
  const capture = await client.callTool({ name: "capture_evidence", arguments: { url: "https://example.com/post", mediaUrls: media } });
  assert.ok(!capture.isError);
  const args = notice();
  args.work.originalUrls = Array(INPUT_LIMITS.originalUrls).fill("https://example.com/original");
  args.extraFields = Object.fromEntries(Array.from({ length: INPUT_LIMITS.extraFields }, (_, i) => [`field${i}`, "value"]));
  const draft = await client.callTool({ name: "draft_notice", arguments: args });
  assert.ok(!draft.isError);
  assert.equal(calls.length, 2);
});

for (const field of ["url", "text", "fieldName", "fieldValue"]) {
  test(`oversized ${field} is rejected before any API request`, async (t) => {
    if (field === "url") {
      await rejected(t, "capture_evidence", { url: "https://example.com/" + "x".repeat(INPUT_LIMITS.url) });
    } else {
      const args = notice();
      if (field === "text") args.infringementDescription = "x".repeat(INPUT_LIMITS.text + 1);
      if (field === "fieldName") args.extraFields = { ["x".repeat(INPUT_LIMITS.fieldName + 1)]: "value" };
      if (field === "fieldValue") args.extraFields = { field: "x".repeat(INPUT_LIMITS.fieldValue + 1) };
      await rejected(t, "draft_notice", args);
    }
  });
}

test("the actual CLI starts and exposes all tools over stdio", async (t) => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"], stderr: "pipe" });
  const client = new Client({ name: "cli-test", version: "1" });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 4);
});

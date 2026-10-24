import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import { createStdioTransport } from "../dist/transport.js";
import { INPUT_LIMITS } from "../dist/limits.js";

for (const newline of [false, true]) {
  test(`stdio closes on oversized ${newline ? "complete" : "unterminated"} input before JSON parsing`, async (t) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = createStdioTransport(input, output);
    t.after(async () => { await transport.close(); input.destroy(); output.destroy(); });
    let parsed = 0;
    let closed = false;
    const errors = [];
    transport.onmessage = () => parsed++;
    transport.onerror = (error) => errors.push(error);
    transport.onclose = () => { closed = true; };
    await transport.start();
    const prefix = '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_playbook","arguments":{"unused":"';
    input.write(prefix);
    input.write("x".repeat(INPUT_LIMITS.messageBytes));
    if (newline) input.write('"}}}\n');
    assert.equal(parsed, 0);
    assert.equal(closed, true);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /exceeded maximum size/);
  });
}

test("normal newline-delimited messages still pass through stdio", async (t) => {
  const input = new PassThrough();
  const output = new PassThrough();
  const transport = createStdioTransport(input, output);
  t.after(async () => { await transport.close(); input.destroy(); output.destroy(); });
  const messages = [];
  transport.onmessage = (message) => messages.push(message);
  transport.onerror = (error) => assert.fail(error.message);
  await transport.start();
  const msg = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
  const raw = JSON.stringify(msg);
  input.write(raw.slice(0, 10));
  input.write(raw.slice(10) + "\n" + raw + "\n");
  assert.deepEqual(messages, [msg, msg]);
});

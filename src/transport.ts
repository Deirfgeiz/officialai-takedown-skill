import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Readable, Writable } from "node:stream";
import { INPUT_LIMITS } from "./limits.js";

// The byte ceiling applies before JSON parsing, including incomplete lines.
export function createStdioTransport(stdin?: Readable, stdout?: Writable) {
  return new StdioServerTransport(stdin, stdout, {
    maxBufferSize: INPUT_LIMITS.messageBytes,
  });
}

#!/usr/bin/env node
import { createServer } from "./server.js";
import { createStdioTransport } from "./transport.js";

await createServer().connect(createStdioTransport());

# 2026-10-24: dependency updates and bounded MCP inputs

Dave explicitly requested fixes for the 40 dependency findings, tests, a product PR,
two independent reviews, and a merge once both reviews clear the same commit and CI
is green. This authorization supersedes the earlier hub-only scope for this change.
All work is in an isolated checkout; the live mission-control checkout is untouched.

## Changes

- Raise direct minimums to MCP SDK 1.32.2 and Zod 4.6.7, retaining SDK 1.x. Refresh
  the lockfile: Hono 4.13.13, its Node adapter 2.1.5, body-parser 2.4.0, fast-uri
  3.1.9, ip-address 10.7.4, proxy-addr 2.0.8 and qs 6.16.1 cover the reviewed
  advisories. The SDK explicitly supports the adapter's newer major version.
- Activate the SDK's 1,024-element tool-argument ceiling and 256 KiB stdio buffer
  ceiling before expensive validation and JSON parsing, respectively.
- Bound every tool string, original URL lists and extra-field records. Oversized
  extra-field records are refused before their values are validated. Zod's patched
  array handling rejects excess elements before walking each one.
- Extract a server factory with an injected fetch for tests; preserve the CLI,
  tool names, HTTP mappings and response format. Add Node 22/24 CI with type
  checking, tests and dependency auditing. No test contacts the hosted API.

## Verification and review

The 23 regression/smoke tests cover all four tools, optional/representative fields,
normal boundary values, malformed and oversized arrays/records/strings, wide/deep
arguments, actual CLI discovery, and fragmented/oversized stdio input. Exact final
validation and both independent read-only review receipts are recorded on the PR.
Every actionable review finding must be fixed and reviewed again before merge.

Before initial review: type checking and all 23 tests pass. npm's live audit reports
zero vulnerabilities. OSV-Scanner 2.7.0 scanned the updated lockfile's 95 packages
against the mini's existing offline npm database and reported zero findings (the
same database used for the earlier 40). The scanner received no GitHub credentials
and wrote results only into the isolated scratch area.

## Rollout and remaining scope

A merge updates source and its lockfile, not existing installations. Build and
install the merged package through the normal release process, then restart MCP
clients that run it. A published release needs its normal versioning/publishing
step; this PR does not publish or deploy. Confirm the actual installed dependency
tree and rescan after rollout before calling installed tools remediated.

The other 39 advisory paths were not demonstrated as reachable in this local
stdio-only client. Their vulnerable package versions are updated anyway. If HTTP,
OAuth, task sharing, proxy trust or static serving is added, reassess those paths:
some SDK fixes need configuration as well as an upgrade. The separately hosted
theofficial.ai API and actual deployed instances were not audited by this change.

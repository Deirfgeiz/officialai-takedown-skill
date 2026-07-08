# Official AI Takedown Skill

Someone posted a fake of you, or stole your work. This toolkit gets you
from "there's the link" to a filed takedown, free:

1. **Capture evidence** before it disappears: independent archive
   snapshot, retrieval timestamps, SHA-256 of the exact bytes, and a PDQ
   perceptual fingerprint of the media.
2. **Get the platform's real process**: report-form URLs, documented email
   intakes, required fields, and ID requirements for Meta (Facebook +
   Instagram), YouTube, TikTok, X, and Google. Every fact is cited to the
   platform's own pages with a retrieval date; anything we could not
   verify is marked UNVERIFIED instead of guessed.
3. **Draft the correct notice**: statutory fields computed by code, with
   step-by-step filing instructions. You review it and you file it.

The heavy lifting runs on the free Official AI API; this package is a thin
client you can read in one sitting.

## Install as an MCP server (Claude Code, Claude Desktop, and other MCP clients)

```bash
npm install -g @officialai/takedown-skill

# Claude Code
claude mcp add officialai-takedown -- officialai-takedown-mcp
```

For Claude Desktop or other MCP clients, add to your MCP config:

```json
{
  "mcpServers": {
    "officialai-takedown": {
      "command": "officialai-takedown-mcp"
    }
  }
}
```

Tools exposed: `capture_evidence`, `get_playbook`, `draft_notice`,
`check_authorization`.

## Install as a Claude Agent Skill

Copy `SKILL.md` into your skills directory (for Claude Code:
`.claude/skills/takedown/SKILL.md` in your project, or
`~/.claude/skills/takedown/SKILL.md` globally). The skill works best with
the MCP server installed; without it, the skill can still call the API
over HTTP.

## Use the API directly

No signup, rate-limited:

```bash
# 1. Capture evidence
curl -s -X POST https://theofficial.ai/api/v1/capture_evidence \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com/the-fake-post"}'

# 2. See a platform's reporting process
curl -s 'https://theofficial.ai/api/v1/playbook?platform=youtube'

# 3. Draft a notice (see /api/v1/playbook for report path ids)
curl -s -X POST https://theofficial.ai/api/v1/draft_notice \
  -H 'Content-Type: application/json' \
  -d '{
    "reportPathId": "youtube.copyright",
    "evidenceManifestId": "<id from step 1>",
    "claimant": {"fullName": "Your Name", "email": "you@example.com",
      "mailingAddress": "...", "country": "United States",
      "relationship": "self"},
    "work": {"description": "My original photo", "originalUrls": ["https://..."]},
    "infringementDescription": "This account reposted my photo without permission."
  }'
```

## What the free tier does not do

Drafts only. Filing on your behalf, stay-down monitoring, weekly briefs,
and a public verified page require a verified identity at
[theofficial.ai](https://theofficial.ai): a government-ID check plus proof
you control your official accounts. That gate exists on purpose; it is
what makes a notice filed through Official AI worth more than a form
letter.

## Honesty notes

- Every notice is a DRAFT until a human reviews and submits it. Platform
  notices carry legal liability for misrepresentation.
- Playbook facts are cited to platform primary sources with retrieval
  dates. Platforms change their processes; if you hit a dead form URL,
  please open an issue.
- Perceptual fingerprint matches are approximate by design. A match is a
  lead for a human to confirm, not a verdict.
- This toolkit is not legal advice.

## Environment

- `OFFICIAL_AI_API_URL`: override the API base URL (defaults to
  `https://theofficial.ai`).

## License

Apache-2.0. See [LICENSE](./LICENSE).

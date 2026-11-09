# GSC MCP Core

[![GSC MCP Core on Glama](https://glama.ai/mcp/connectors/io.github.glq0546/gsc-mcp-core/badges/score.svg)](https://glama.ai/mcp/connectors/io.github.glq0546/gsc-mcp-core)

Query Google Search Console from Cursor or Claude. Find striking-distance keywords in natural language — no CSV exports.

## Features
- Multi-tenant Google OAuth
- Secure self-serve API keys (SHA-256 hashed)
- Rate limiting (50 requests/day per user)

## Quick Start
1. Go to [https://mcp.glq-api.asia](https://mcp.glq-api.asia) and log in with Google.
2. Generate your API Key.
3. Add this to your `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gsc": {
      "url": "https://mcp.glq-api.asia/api/mcp",
      "type": "streamableHttp",
      "headers": {
        "Authorization": "Bearer gsc_live_YOUR_API_KEY"
      }
    }
  }
}
```

## Tech Stack
Next.js 14, Supabase, Vercel, MCP SDK.
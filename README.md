# GSC MCP Core

Query Google Search Console from Cursor or Claude. Find striking-distance keywords in natural language — no CSV exports.

## Features
- Multi-tenant Google OAuth
- Secure self-serve API keys (SHA-256 hashed)
- Rate limiting (50 requests/day per user)

## Quick Start
1. Go to [https://gsc-mcp-core.vercel.app](https://gsc-mcp-core.vercel.app) and log in with Google.
2. Generate your API Key.
3. Add this to your `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gsc": {
      "url": "https://gsc-mcp-core.vercel.app/api/mcp",
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
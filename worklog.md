# StreamVault Worklog

---
Task ID: 1
Agent: Main Agent
Task: Apply 7 surgical bug fixes to StreamVault codebase

Work Log:
- Read all relevant files: Caddyfile, torrent-service/index.ts, progress route, package.json, .gitignore, .env, .env.example, middleware.ts (doesn't exist)
- Fix 1: Rewrote Caddyfile with flush_interval -1 for XTransformPort proxy and dedicated streaming route block for /api/torrent/progress/*, /api/torrent/stream/*, /api/torrent/hls/*, /api/torrent/hls-segment/*, /api/file/*
- Fix 2: Added broadcast-based progress system to torrent service — per-torrent setInterval (2s), broadcastProgress() function, sseClients Map for subscriber tracking, torrent.on('destroy') cleanup. Added startProgressBroadcast() calls to all 3 torrent-add paths (magnet, file, restore). Added torrent.destroy() to DELETE handler before client.remove()
- Fix 3: Replaced SSE proxy polling with direct stream forwarding — removed auth check, removed ReadableStream+setInterval polling, now fetches upstream SSE and pipes body directly
- Fix 4: Added X-Accel-Buffering: no header to torrent service SSE response + initial flush
- Fix 5: Removed webtorrent from root package.json (kept in mini-services/torrent-service/package.json)
- Fix 6: Updated .env.example with COOKIE_SECRET, ADMIN_PASSWORD, SITE_URL, TORRENT_SERVICE_URL, NODE_ENV. .gitignore already had .env*
- Fix 7: middleware.ts doesn't exist — no fix needed
- Removed unused `import path from 'path'` from torrent-client.ts
- Ran bun install (removed webtorrent from root), bun run lint passes
- Torrent service runs correctly in foreground testing

Stage Summary:
- All 7 fixes applied successfully
- Caddyfile now has flush_interval -1 for streaming routes
- SSE progress is now broadcast-based (per-torrent interval) instead of per-connection polling
- Next.js SSE proxy forwards the stream byte-for-byte instead of re-polling
- webtorrent removed from root package.json (prevents build issues)
- .env.example updated with proper placeholder values
- No middleware.ts exists in the project, so no auth blocking issues

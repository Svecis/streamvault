# StreamVault Worklog

---
Task ID: 1
Agent: Main
Task: Set up Prisma schema and install dependencies

Work Log:
- Created Prisma schema with 4 tables: User, InviteCode, Torrent, File
- Ran db:push successfully
- Installed webtorrent, nanoid, ass-compiler, fastify, @fastify/static, @fastify/multipart, @fastify/cookie

Stage Summary:
- Database schema is live with all tables
- All dependencies installed in both main project and mini-service
- Torrent mini-service created and tested on port 3001

---
Task ID: 3
Agent: Main
Task: Create torrent manager mini-service

Work Log:
- Created mini-services/torrent-service/ with Fastify + WebTorrent
- Implemented routes: /health, POST /torrent/add, POST /torrent/add-file, GET /stream/:infoHash, GET /progress/:infoHash (SSE), GET /torrent/status/:infoHash, GET /torrent/active, DELETE /torrent/:infoHash
- Stubbed node-datachannel native module (WebRTC not needed server-side)
- Tested successfully with Node.js (Bun crashes due to libuv limitations)

Stage Summary:
- Torrent service runs on port 3001 via Node.js
- Full Range request support for video streaming
- SSE progress updates every 2 seconds

---
Task ID: 4
Agent: Subagent - Subtitle Utility
Task: Create the subtitle converter utility for StreamVault

Work Log:
- Created /home/z/my-project/src/lib/subtitle.ts with three exported functions
- Implemented srtToVtt: normalizes line endings, replaces comma→period in timestamps, strips SRT sequence numbers, prepends WEBVTT header
- Implemented assToVtt: parses [Events] section, extracts Format field indices, parses Dialogue lines, converts ASS timestamps (H:MM:SS.CC) to VTT (HH:MM:SS.mmm), strips {\...} formatting tags, handles \N and \n as newlines, handles Text field with commas correctly
- Implemented convertToVtt: dispatches by file extension (.vtt → passthrough, .srt → srtToVtt, .ass/.ssa → assToVtt, else → throws error)
- No external npm packages used — all parsing is manual
- TypeScript with proper typing throughout
- ESLint passes with zero errors

Stage Summary:
- Subtitle converter utility complete at src/lib/subtitle.ts
- Supports VTT passthrough, SRT→VTT, ASS/SSA→VTT conversion
- Ready for integration with the subtitle serving API route

---
Task ID: 6
Agent: Subagent - Upload & File API Routes
Task: Create file upload and serving API routes for StreamVault

Work Log:
- Created /home/z/my-project/src/app/api/upload/route.ts — POST handler for video file upload
- Created /home/z/my-project/src/app/api/file/[id]/route.ts — GET handler for serving uploaded files
- Created /home/z/my-project/src/app/api/files/route.ts — GET handler for listing files
- ESLint passes with zero errors

Stage Summary:
- Three API routes created: upload (POST), file serve with Range support (GET), file list (GET)
- Upload validates video file types and stores files with nanoid filenames
- File serving supports HTTP Range requests for video seeking in browser

---
Task ID: 5
Agent: Subagent - Auth API Routes
Task: Create auth-related API routes for StreamVault

Work Log:
- Created /src/lib/auth.ts with helper functions
- Created auth routes: join, session, logout
- ESLint passes with zero errors

Stage Summary:
- Complete auth API layer: join (register with invite code), session check, logout

---
Task ID: 7-8
Agent: Subagent - Admin & Subtitle API Routes
Task: Create admin and subtitle API routes for StreamVault

Work Log:
- Created subtitle upload/serve routes
- Created admin routes: stats, invite, users, files delete, torrents delete
- ESLint passes with zero errors

Stage Summary:
- 6 API routes created covering subtitle upload/serve and admin operations

---
Task ID: 9-17
Agent: Main
Task: Build torrent proxy API routes, frontend views, and integrate

Work Log:
- Created all torrent proxy API routes and frontend views
- Built 5 frontend views: Login, Library, Watch, Upload, Admin
- All lint checks pass

Stage Summary:
- Complete full-stack StreamVault application with 15+ API routes

---
Task ID: 18
Agent: Main
Task: Fix torrent stats not updating - stale data in UI

Work Log:
- Fixed Next.js fetch caching with cache: 'no-store'
- Fixed SSE progress endpoint with ReadableStream polling
- Created ensureTorrentService() auto-start mechanism

Stage Summary:
- Fixed Next.js fetch caching and SSE buffering issues

---
Task ID: 19
Agent: Main
Task: Fix "e.map is not a function" + MKV streaming while downloading

Work Log:
- Added ESM polyfill for `require` in torrent-service/index.ts (fixes "require is not defined" on torrent restoration)
- Added `fetchList()` and `fetchOne()` safe helpers to src/lib/api.ts - always returns arrays/objects, never throws, unwraps envelope shapes
- Updated library-view.tsx to use `fetchList()` instead of raw fetch+json+map pattern
- Updated admin-view.tsx to use `fetchOne()` and `fetchList()` instead of raw fetch patterns
- Updated watch-view.tsx to use `fetchList()` and `fetchOne()` for safe data access
- Added FFmpeg remux streaming for MKV/AVI/MOV/M4V/FLV files in torrent service (streamTranscoded function)
- MP4/WebM files still use raw Range-based streaming (streamRaw function)
- Added inline HLS job manager in torrent service with startHLS/isHLSReady/hlsCleanup functions
- Added HLS endpoints in torrent service: GET /hls/:infoHash/stream.m3u8, GET /hls/:infoHash/:segment, GET /hls/:infoHash/status
- Created Next.js proxy API routes for HLS: /api/torrent/hls/[infoHash] and /api/torrent/hls-segment/[infoHash]/[segment]
- HLS playlist proxy rewrites segment URLs to go through Next.js proxy
- Added HLS toggle button in watch-view.tsx for MKV/AVI files (SwitchCamera icon)
- Loaded hls.js from CDN for browser HLS playback support
- Installed fluent-ffmpeg dependency in torrent-service
- Added hlsCleanup on torrent deletion

Stage Summary:
- Bug 1 (e.map): Fixed with fetchList/fetchOne helpers that always return safe arrays, used in all 3 views
- Bug 2 (MKV streaming): Fixed with FFmpeg remux to fMP4 (frag_keyframe+empty_moov) + HLS fallback
- require fix: Added createRequire polyfill for ESM context
- Files modified: api.ts, library-view.tsx, watch-view.tsx, admin-view.tsx, torrent-service/index.ts, torrent-service/package.json
- Files created: src/app/api/torrent/hls/[infoHash]/route.ts, src/app/api/torrent/hls-segment/[infoHash]/[segment]/route.ts

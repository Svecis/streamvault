# Task 7-8: Admin & Subtitle API Routes

## Summary
Created all 6 API routes and 1 utility file for the StreamVault admin and subtitle features.

## Files Created

### Utility
- `/src/lib/subtitle.ts` — Subtitle converter supporting SRT, VTT, ASS, SSA → WebVTT conversion with `convertToVtt()` and `detectSubtitleFormat()` exports

### Subtitle API
- `/src/app/api/subtitle/[videoId]/route.ts` — POST (upload + convert + save subtitle) and GET (serve VTT)

### Admin APIs
- `/src/app/api/admin/invite/route.ts` — POST (generate invite code)
- `/src/app/api/admin/stats/route.ts` — GET (system stats, disk usage, users, invite codes)
- `/src/app/api/admin/users/route.ts` — GET (all users with activity)
- `/src/app/api/admin/files/[id]/route.ts` — DELETE (remove file from disk + DB)
- `/src/app/api/admin/torrents/[infoHash]/route.ts` — DELETE (stop active torrent + remove from DB)

## Key Decisions
- All admin routes use `x-admin-password` header auth against `ADMIN_PASSWORD` env var (default: 'admin123')
- Subtitle files are saved as VTT in `/home/z/my-project/uploads/{videoId}.vtt`
- Disk usage calculated via `du -sb` command on uploads + torrents directories
- Torrent deletion calls torrent mini-service on port 3001 to stop active seeds
- File deletion also cleans up associated subtitle .vtt files
- Lint passes with zero errors

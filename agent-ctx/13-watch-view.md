# Task 13 - Watch View Component

## Work Summary
Created `/home/z/my-project/src/components/views/watch-view.tsx` — the WatchView React component for StreamVault.

## Implementation Details

### Features Implemented
1. **Back to Library** button at top-left using ArrowLeft icon, calls `setView('library')`
2. **Video Player** with Plyr.js loaded dynamically from CDN:
   - Script and CSS injected via `useEffect` with dynamic `<script>` and `<link>` elements
   - `<video>` element with id="player", playsInline, crossOrigin="anonymous"
   - Video source routing: torrent → `/api/torrent/stream/${id}?XTransformPort=3001`, file → `/api/file/${id}`
   - Subtitle track with `<track kind="captions">` only rendered when subtitle is detected
   - Plyr initialized with controls: play, progress, current-time, duration, mute, volume, settings, pip, fullscreen
   - Playback speed settings: 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x
3. **Info Section** with two-column layout (desktop) / single-column (mobile):
   - Left: Video title, size, source type badge, added date
   - Right: Torrent stats card (only for torrent type) with:
     - Progress percentage + animated progress bar
     - Download speed (green color)
     - Peers count
     - Ratio
     - Live updates via SSE (`/api/torrent/progress/${id}`) with polling fallback (`/api/torrent/status/${id}` every 5s)
4. **Load Subtitle** button:
   - Opens file picker accepting .srt, .vtt, .ass, .ssa
   - Uploads via POST multipart form to `/api/subtitle/${id}`
   - After upload: reloads track element with cache-busting query param, shows CC indicator
5. **Share** button: Copies current URL to clipboard, shows "Copied!" toast for 2s
6. **Error handling**: Video error event listener shows error overlay on the player

### Design Spec Compliance
- Background: #0d0d0d, Surface: #141414, Border: #222, Text: #e8e8e8, Muted: #666, Accent: #e8552a
- No shadows, no gradients, 200ms transitions throughout
- Responsive grid layout: `grid-cols-1 md:grid-cols-2`

### Cleanup
- Plyr instance destroyed on unmount
- SSE connection closed on unmount
- Polling interval cleared on unmount
- Dynamically added script/link elements removed from DOM on unmount

### Lint Status
- ESLint passes with zero errors

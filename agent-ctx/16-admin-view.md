# Task 16 - Admin View Component

## Agent: Subagent - Admin View

## Work Log

- Read worklog.md to understand project context and existing API routes
- Reviewed Zustand store at `@/store/app-store` for types and available actions
- Reviewed all relevant API routes:
  - `/api/admin/stats` (GET) - returns stats with `x-admin-password` auth
  - `/api/admin/users` (GET) - returns user list with admin auth
  - `/api/admin/invite` (POST) - generates invite code with admin auth
  - `/api/admin/torrents/[infoHash]` (DELETE) - deletes torrent with admin auth
  - `/api/admin/files/[id]` (DELETE) - deletes file with admin auth
  - `/api/torrent/list` (GET) - lists torrents (session auth)
  - `/api/files` (GET) - lists files
- Created `/home/z/my-project/src/components/views/admin-view.tsx` with full AdminView component

## Component Features

1. **Admin Auth Gate** - Password input form at top, authenticates via `/api/admin/stats` with `x-admin-password` header. Default test password: 'admin123'. Persists password in sessionStorage for page revisits.

2. **Stats Section** - Row of 4 stat cards showing: Disk Usage, Active Torrents, Total Users, Total Files. Uses data from `/api/admin/stats`.

3. **Invite Link Generator** - Button to POST to `/api/admin/invite`, displays generated code and full link with copy-to-clipboard functionality.

4. **Users Table** - Fetched from `/api/admin/users`. Columns: Label, Last Seen, Invite Code, Created. Styled with border-[#222] and text-[#666].

5. **Torrents Table** - Fetched from `/api/torrent/list`. Columns: Name, Info Hash (truncated), Added, Actions (Delete button). Delete calls DELETE `/api/admin/torrents/${infoHash}`.

6. **Files Table** - Fetched from `/api/files`. Columns: Name, Size, Type, Added, Actions (Delete button). Delete calls DELETE `/api/admin/files/${id}`.

7. **Back to Library** - ArrowLeft icon link at top-left, calls `setView('library')`.

## Design Spec Compliance
- Background: #0d0d0d, Surface: #141414, Border: #222, Text: #e8e8e8, Muted: #666, Accent: #e8552a
- No shadows, no gradients, only 200ms transitions
- Font: system-ui
- All icons from lucide-react
- Loading states, error handling, size formatting (KB/MB/GB), date formatting

## Lint Status
- Passes with zero errors and zero warnings

## Stage Summary
- Complete AdminView component created at `src/components/views/admin-view.tsx`
- All 7 features implemented with proper auth, data fetching, mutations, and UI
- Ready for integration into the main page

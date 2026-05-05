# Task 14 - Upload View

## Agent: Subagent - Upload View

## Work Log

- Read worklog.md to understand project context (Prisma schema, API routes, auth, store structure)
- Read app-store.ts to understand the Zustand store interface (ViewType, setView, navigateToWatch)
- Read upload API route (`/api/upload/route.ts`) to understand request/response format
- Read subtitle API route (`/api/subtitle/[videoId]/route.ts`) to understand subtitle upload flow
- Created `/home/z/my-project/src/components/views/upload-view.tsx` with named export `UploadView`

## Component Features

1. **Back to Library** - Top-left button with ArrowLeft icon, calls `setView('library')`
2. **Title** - "Upload Video" heading
3. **Video drag-and-drop zone**:
   - Dashed border (#333, 2px), becomes #e8552a on drag-over
   - Upload icon + "Drop video here or click to browse"
   - Accepts: .mp4, .mkv, .avi, .mov, .webm, .m4v
   - Shows selected file info (name + size) after selection
   - Click opens file picker
4. **Upload progress bar** (using XMLHttpRequest):
   - Shows filename being uploaded
   - Progress percentage in accent color
   - Visual bar with #e8552a fill on #222 track
   - Cancel button during upload
5. **Subtitle upload zone** (optional):
   - Separate drop zone for .srt, .vtt, .ass, .ssa files
   - Subtitles icon + "Add subtitle (optional)"
   - Clear button (X) to remove selected subtitle
   - Uploaded after video completes (uses video ID from upload response)
6. **On upload complete**:
   - Parses response: `{ id, originalName, size, mimeType }`
   - If subtitle present, uploads it to `/api/subtitle/{id}` then navigates
   - Calls `navigateToWatch({ type: 'file', id: data.id, name: data.originalName })`
7. **Error handling**: Red-tinted error messages for invalid formats, network errors, and server errors

## Design Compliance

- Background: #0d0d0d, Surface/Border: #222/#333, Text: #e8e8e8, Muted: #666, Accent: #e8552a
- No shadows, no gradients, only 200ms transitions
- Font: system-ui
- Named export matching page.tsx import style

## ESLint

- Passes with zero errors and zero warnings

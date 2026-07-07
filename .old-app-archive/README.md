Archived legacy app shell and pre-router code.

Current active runtime:
- Entry: `src/main.tsx`
- UI architecture: router-based play app under `src/pages`, `src/routes`, and the telemetry-backed providers

Why this archive exists:
- Preserve the old monolithic shell for historical reference
- Keep dead storage paths and shell-only flows out of the compiled `src/` tree
- Reduce confusion about which architecture is active

Important:
- Files under `.old-app-archive/` are not part of the active runtime
- Do not treat archived files as current architecture without explicitly restoring them

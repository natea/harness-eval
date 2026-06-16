# Tasks: Auditable / Replayable Trial Transcripts

## 1. Renderer (pure core)

- [x] 1.1 Add `src/report/transcript-render.ts`: `parseTranscript(jsonl): Turn[]`
      mapping stream-json events to role/direction-tagged turns (prompt,
      assistant, tool_use=request, tool_result=response linked by id, result);
      drop bootstrap `system`, surface `init` as a compact header
- [x] 1.2 `renderMarkdown(turns): string` with REQUEST/RESPONSE headings, error
      badges, and payload truncation at a size cap (marker names elided size +
      source `.jsonl`)
- [x] 1.3 `renderTrial(trialDir): { conversationMd, perSession }` concatenating
      sessions in order under labeled session headings
- [x] 1.4 Unit tests over a fixture `.jsonl`: tool_use→tool_result pairing,
      ordering preserved, `system` noise excluded, truncation marker, multi-session
      concatenation

## 2. Archive-time emission

- [x] 2.1 In `src/driver/archive.ts`, after writing redacted `session-NNN.jsonl`,
      write `transcripts/conversation.md` + `session-NNN.md` from the renderer
- [x] 2.2 Confirm the renderer reads only the redacted text (no new secret path);
      add a test asserting a redacted token does not appear in the Markdown

## 3. Backfill

- [x] 3.1 `scripts/render-transcripts.ts <run-dir> [trial-id]`: render Markdown
      for archived trials from existing `.jsonl`; idempotent; never touches
      `.jsonl`/grades/results
- [x] 3.2 Run it over an existing archived run and eyeball the output

## 4. Studio Conversation tab

- [x] 4.1 Add `/api/runs/:id/trials/:trialId/transcript` returning structured
      turns from the shared parser
- [x] 4.2 Add a Conversation tab to `TrialView.tsx`: role lanes, request/response
      delineation, collapsible payloads, per-result cost/usage
- [x] 4.3 Studio test: the route returns turns and request/response turns are
      distinguishable

## 5. Validation

- [x] 5.1 `bun run test` green; `bunx tsc --noEmit` clean
- [x] 5.2 `openspec validate add-trial-transcript-audit --strict`

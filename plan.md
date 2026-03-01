# Fix Plan: Codex Findings (8 valid issues)

## 1. [P1] Loop retrigger part accumulation — `playback.ts`

**Problem:** `scheduleLoopAudioRetrigger()` pushes new `Tone.Part`s into `this.parts` on every call. During loop dragging, `setLoopRegion()` fires on every mouse-move, so parts accumulate without cleanup until `stop()` is called.

**Fix:** Track retrigger parts separately in a `private loopRetriggerParts: Tone.Part[]` field. At the top of `scheduleLoopAudioRetrigger()`, dispose and clear the previous retrigger parts before creating new ones. Keep `this.parts` for non-retrigger parts, and clean up `loopRetriggerParts` in `cleanupPlayback()` too.

**Files:** `src/core/playback.ts`

---

## 2. [P1] Per-frame console.log calls — `SceneCompositor.tsx`, `visualPlayback.ts`

**Problem:** 7 `console.log('[SceneCopy]...')` statements in per-frame code paths, several with `JSON.stringify`. Hurts frame rate.

**Fix:** Delete all 7 hot-path log statements (lines 424, 440, 462 in SceneCompositor; lines 517, 524, 541, 551 in visualPlayback). Leave the cold-path one at visualPlayback:105 (runs once on project load) — or remove it too if you want a clean sweep.

**Files:** `src/components/VisualView/SceneCompositor.tsx`, `src/core/visualPlayback.ts`

---

## 3. [P1] MIDI editor fingerprint misses middle-event edits — `useMidiEditorState.ts`

**Problem:** `blockFingerprint()` only hashes event count + first/last events. If undo/redo changes only a middle event, fingerprint is unchanged and the editor won't refresh.

**Fix:** Hash ALL events. The event list is typically small (a few hundred max in a single block), so iterating them is negligible cost. Replace the first/last sampling with a loop over all events, hashing `startTimeInBeats`, `pitch`, `duration` for each.

**Files:** `src/hooks/useMidiEditorState.ts`

---

## 4. [P2] Swing editor stale on undo/redo — `SwingEditor.tsx`

**Problem:** `useEffect` deps are `[blockId]` only, with eslint-disable suppressing the exhaustive-deps warning. Undo/redo changes block content without changing `block.id`.

**Fix:** Apply the same fingerprint approach as the MIDI editor. Extract or share a `blockFingerprint` utility and use it as the dependency instead of `blockId`. (Can import the same function from useMidiEditorState or extract to a shared util.)

**Files:** `src/components/SwingEditor/SwingEditor.tsx`, possibly a new shared util or import from `useMidiEditorState.ts`

---

## 5. [P2] Track tree remount on rename — `TrackTree.tsx`

**Problem:** `treeKey` useMemo includes `t.name` in the hash, so renaming any track forces a full `UncontrolledTreeEnvironment` remount (destroying expand/scroll state).

**Fix:** Remove `t.name` from the key computation. The key should only reflect structural changes (track IDs and parent-child relationships), not display-name changes. Change:
```
`${id}:${t.childIds.join('.')}:${t.name}`
```
to:
```
`${id}:${t.childIds.join('.')}`
```

**Files:** `src/components/TrackHierarchy/TrackTree.tsx`

---

## 6. [P2] Broad Zustand subscriptions — `useDragDrop.ts`, `useKeyboard.ts`, `EditorPanel.tsx`

**Problem:** `useProjectStore()` with no selector subscribes to the entire store, causing re-renders on every store update. All three locations only need action functions (stable refs) or `project`.

**Fix per file:**
- `useDragDrop.ts`: Use `useProjectStore.getState()` for the action functions (they're stable and don't need reactivity)
- `useKeyboard.ts`: Same — `getState()` for actions, keep the selector for `project`
- `EditorPanel.tsx`: Split into `useProjectStore(s => s.project)` for project and `useProjectStore.getState()` for `updateBlock`

**Files:** `src/hooks/useDragDrop.ts`, `src/hooks/useKeyboard.ts`, `src/components/shared/EditorPanel.tsx`

---

## 7. [P2] Runtime `require()` calls — `projectStore.ts`

**Problem:** Four `require('@/instruments')` / `require('@/plugins')` calls used to break circular deps. Weakens type safety, breaks tree-shaking, brittle in ESM.

**Fix:** Replace with lazy-init pattern. Create a module-level getter that caches the import:
```ts
let _getInstrument: typeof import('@/instruments').getInstrument;
function lazyGetInstrument(id: string) {
  if (!_getInstrument) _getInstrument = require('@/instruments').getInstrument;
  return _getInstrument(id);
}
```
This still breaks the circular dep at module-load time but gives us type safety and a single require call. Same pattern for `getPlugin`. (True fix would be restructuring the dependency graph, but that's a larger refactor.)

**Files:** `src/stores/projectStore.ts`

---

## 8. [P3] Duplication naming bug — `projectStore.ts`

**Problem:** In `duplicateTrack`, line 452 sets `rootCloneId = cloneId` BEFORE line 472 checks `const isRoot = !rootCloneId`. Since `rootCloneId` is always truthy by line 472, `isRoot` is always `false` and `(Copy)` suffix is never applied.

**Fix:** Capture `isRoot` BEFORE setting `rootCloneId`:
```ts
const cloneId = generateId();
const isRoot = !rootCloneId;     // check FIRST
if (!rootCloneId) rootCloneId = cloneId;  // then set
```

**Files:** `src/stores/projectStore.ts`

---

## Execution Order

1. **Fix 8** (naming bug) — trivial 2-line swap, zero risk
2. **Fix 5** (tree key) — remove `t.name`, one line
3. **Fix 2** (delete console.logs) — pure deletion
4. **Fix 6** (Zustand selectors) — mechanical refactor, 3 files
5. **Fix 3** (MIDI fingerprint) — small function rewrite
6. **Fix 4** (Swing editor) — apply fingerprint pattern
7. **Fix 1** (loop retrigger) — new field + cleanup logic
8. **Fix 7** (require → lazy) — mechanical but touches 4 callsites

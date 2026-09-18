import { useCallback, useRef, useState } from "react";
import type { EditorState } from "./model";

// Immutable snapshots share unchanged pages/assets. Pointer gestures commit once.
export function useEditorHistory(initial: EditorState) {
  const [state, setState] = useState(initial);
  const current = useRef(initial);
  const past = useRef<EditorState[]>([]), future = useRef<EditorState[]>([]);
  const update = useCallback((next: EditorState, record = true) => {
    if (record) { past.current = [...past.current.slice(-79), current.current]; future.current = []; }
    current.current = next; setState(next);
  }, []);
  const undo = useCallback(() => {
    const previous = past.current.pop(); if (!previous) return;
    future.current.push(current.current); current.current = previous; setState(previous);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop(); if (!next) return;
    past.current.push(current.current); current.current = next; setState(next);
  }, []);
  return { state, update, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

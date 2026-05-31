import { useEffect } from "react";

export interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  allowInInput?: boolean;
  handler: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      for (const s of shortcuts) {
        const keyMatch = e.key === s.key;
        const hasModifier = s.ctrlKey || s.metaKey;
        const modifierMatch = hasModifier ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey);
        const shiftMatch = s.shiftKey ? e.shiftKey : !e.shiftKey;
        const shouldSkipForInput = !hasModifier && inInput && !s.allowInInput;

        if (keyMatch && modifierMatch && shiftMatch && !shouldSkipForInput) {
          e.preventDefault();
          s.handler();
          return;
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, enabled]);
}

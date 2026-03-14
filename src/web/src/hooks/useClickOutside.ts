import { useEffect, type RefObject } from "react";

/** Close/dismiss when user clicks outside the referenced element. */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside]);
}

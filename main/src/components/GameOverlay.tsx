import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** Focus stays within the active overlay; gameplay controls regain focus on close. */
export function GameOverlay({
  title,
  children,
  onDismiss,
  modal = true,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onDismiss?: () => void;
  modal?: boolean;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = panel.current!;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => [
      ...node.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input, select, [tabindex="0"]',
      ),
    ];
    (controls()[0] ?? node).focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onDismiss) {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      }
      if (event.key !== "Tab" || !modal) return;
      const elements = controls(),
        first = elements[0],
        last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !node.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !node.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onDismiss, modal]);
  return (
    <div className={`overlay-scrim ${className}`}>
      <div
        ref={panel}
        className="game-overlay"
        role="dialog"
        aria-modal={modal}
        aria-label={title}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}

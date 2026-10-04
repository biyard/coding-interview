import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, cn } from "@biyard/components";

/**
 * 본체 전용 모달(네이티브 dialog). 마운트되면 showModal()로 열고, 언마운트되면 닫으며
 * 열기 전 포커스 요소로 되돌린다. X·ESC·배경 클릭은 모두 onClose다.
 */
export function Modal({
  labelId,
  closeLabel,
  onClose,
  className,
  header,
  children,
}: {
  labelId: string;
  closeLabel: string;
  onClose: () => void;
  className?: string;
  header: ReactNode;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!element.open) element.showModal();
    return () => {
      if (element.open) element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={labelId}
      className={cn(
        "m-auto flex max-h-[90vh] w-[min(42rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-border bg-card p-0 text-foreground backdrop:bg-black/50",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">{header}</div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11 shrink-0"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </Button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

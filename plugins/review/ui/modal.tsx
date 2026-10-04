import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, cn } from "@biyard/components";

/**
 * 네이티브 dialog 기반 공용 모달. 마운트되면 showModal()로 열고, 언마운트되면 닫으며
 * 열기 전 포커스 요소로 되돌린다. X·Esc·바깥 클릭은 모두 onClose다.
 */
export function Modal({
  labelId,
  title,
  header,
  fixedBody = false,
  closeLabel,
  onClose,
  className,
  children,
}: {
  labelId: string;
  title?: ReactNode;
  /** 주어지면 기본 h2 제목 대신 이 헤더를 그린다(h2에 labelId를 직접 달아야 한다). */
  header?: ReactNode;
  /** true면 dialog는 스크롤하지 않고 본문 영역(min-h-0 flex-1)만 스크롤하도록 맞춘다. */
  fixedBody?: boolean;
  closeLabel: string;
  onClose: () => void;
  className?: string;
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
        "m-auto max-h-[90vh] border border-border bg-card p-0 text-foreground backdrop:bg-black/50",
        fixedBody
          ? "flex w-[min(42rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl"
          : "w-[min(40rem,calc(100vw-1rem))] overflow-y-auto rounded-lg",
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
      <div
        className={
          fixedBody ? "flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6" : "space-y-4 p-4 sm:p-6"
        }
      >
        <div className="flex items-start justify-between gap-3">
          {header ? (
            <div className="min-w-0 flex-1">{header}</div>
          ) : (
            <h2 id={labelId} className="min-w-0 break-words text-heading-5 font-semibold">
              {title}
            </h2>
          )}
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

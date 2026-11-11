import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './ActionSheet.module.css';

// A `···` button and the sheet it slides up from the bottom of the screen.
// The native modal dialog keeps focus inside and closes on Esc; a tap on
// the backdrop or 닫기 closes it too, and focus goes back to the button.
export function ActionSheet({
  label,
  title,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open === open) return;
    if (open) dialog.showModal();
    else dialog.close();
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(true)}
      >
        ···
      </button>
      <dialog
        ref={dialogRef}
        className={styles.sheet}
        aria-labelledby={headingId}
        onClose={() => {
          onOpenChange(false);
          triggerRef.current?.focus();
        }}
        onClick={(e) => {
          // The sheet's content fills the dialog box, so only a tap on the
          // backdrop lands on the dialog itself.
          if (e.target === e.currentTarget) onOpenChange(false);
        }}
      >
        <div className={styles.content}>
          <div className={styles.header}>
            <h2 id={headingId} className={styles.title}>
              {title}
            </h2>
            <button
              type="button"
              className={styles.close}
              onClick={() => onOpenChange(false)}
            >
              닫기
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}

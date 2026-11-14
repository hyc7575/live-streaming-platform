import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './ActionSheet.module.css';

// `···` 버튼과, 그 버튼이 화면 아래에서 밀어 올리는 시트다.
// 네이티브 모달 dialog가 포커스를 안에 가두고 Esc로 닫힌다. 배경이나
// 닫기를 탭해도 닫히고, 포커스는 버튼으로 돌아간다.
export function ActionSheet({
  label,
  title,
  titleAside,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  title: string;
  // 제목 바로 옆에 붙는 것(카테고리 배지). dialog 이름에는 들어가지 않는다.
  titleAside?: ReactNode;
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
          // 시트 내용이 dialog 상자를 채우므로, dialog 자체에 닿는 탭은
          // 배경을 탭했을 때뿐이다.
          if (e.target === e.currentTarget) onOpenChange(false);
        }}
      >
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.heading}>
              <h2 id={headingId} className={styles.title}>
                {title}
              </h2>
              {titleAside}
            </div>
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

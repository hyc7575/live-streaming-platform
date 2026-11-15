import { onTestFinished, vi } from 'vitest';

// jsdom에는 모달 <dialog>가 없다. 브라우저처럼 `open`을 켜고 끄며 close를
// 발생시키는 showModal과 close만 있으면 된다.
export function stubModalDialog(): void {
  const dialog = HTMLDialogElement.prototype;
  dialog.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  dialog.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  onTestFinished(() => {
    delete (dialog as Partial<HTMLDialogElement>).showModal;
    delete (dialog as Partial<HTMLDialogElement>).close;
  });
}

// jsdom에는 matchMedia도 없어 `useWideScreen`이 넓은 화면으로 본다.
// 1024px 미만 화면을 흉내 낸다. 좁은 화면은 시트(모달 dialog)를 쓰므로
// dialog도 함께 갖춘다.
export function stubNarrowScreen(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  stubModalDialog();
}

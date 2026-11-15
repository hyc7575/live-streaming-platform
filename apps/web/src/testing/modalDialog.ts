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

// 마우스를 쓰는 넓은 PC 화면이다. 모든 media query(`min-width: 1024px`,
// `pointer: fine`)가 맞는다. 후원 모달이 결제를 모달 안 iframe에서 한다.
export function stubMousePc(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  stubModalDialog();
}

// 이 문서가 다른 창의 iframe 안에 있는 것처럼 `window.self`를 바꾼다.
// jsdom의 최상위 창은 `parent`가 자기 자신이라, 부모에게 보낸 메시지는
// 이 창의 `message` 이벤트로 돌아온다.
export function stubInFrame(): void {
  vi.stubGlobal('self', {});
}

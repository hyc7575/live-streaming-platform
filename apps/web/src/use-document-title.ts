import { useEffect } from 'react';

const APP_NAME = 'Lime';

// 탭 제목을 `<name> - Lime`으로 정한다. `name`이 null이면 그냥 `Lime`이다
// (아직 로딩 중이거나 붙일 이름이 없다). 화면을 떠나면 `Lime`으로 되돌린다.
export function useDocumentTitle(name: string | null) {
  useEffect(() => {
    document.title = name ? `${name} - ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [name]);
}

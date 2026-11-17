import { Component, Suspense, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import styles from './PageOutlet.module.css';

// 레이아웃 본문 자리. 경로별로 나눈 화면(AppRoutes의 lazy)을 내려받는 동안
// 이 자리만 비우고 헤더·왼쪽 열은 그대로 둔다. 화면들도 데이터를 읽는 동안
// null을 그리므로 fallback도 null이다.
export function PageOutlet() {
  const { pathname } = useLocation();
  return (
    <PageErrorBoundary pathname={pathname}>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </PageErrorBoundary>
  );
}

type BoundaryProps = { pathname: string; children: ReactNode };
type BoundaryState = { pathname: string; failed: boolean };

// 화면 청크를 받지 못하면(배포로 해시가 바뀌었거나 네트워크가 끊겼다) lazy가
// 오류를 던진다. 경계가 없으면 앱 전체가 빈 화면이 되므로 본문 자리에만
// 안내를 보인다. React.lazy는 실패한 import를 다시 시도하지 않아 새로고침이
// 복구 방법이다. 다른 경로로 옮기면 안내를 거두고 그 화면을 그린다.
class PageErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { pathname: props.pathname, failed: false };
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState,
  ): Partial<BoundaryState> | null {
    return props.pathname === state.pathname
      ? null
      : { pathname: props.pathname, failed: false };
  }

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className={styles.failed} role="alert">
        <p className={styles.message}>
          화면을 불러오지 못했습니다. 새로고침해 주세요.
        </p>
        <button
          type="button"
          className={styles.reload}
          onClick={() => window.location.reload()}
        >
          새로고침
        </button>
      </section>
    );
  }
}

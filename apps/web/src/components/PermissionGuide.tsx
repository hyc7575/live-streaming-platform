import styles from './PermissionGuide.module.css';

/** Where to turn camera and mic back on once the browser has blocked them. */
export function PermissionGuide() {
  return (
    <div role="alert" className={styles.guide}>
      <h2>카메라·마이크 권한이 꺼져 있습니다</h2>
      <p>아래 방법으로 권한을 허용한 뒤 이 페이지를 새로고침하세요.</p>
      <h3>iPhone (Safari)</h3>
      <ol>
        <li>주소창 왼쪽의 페이지 메뉴(aA) 버튼을 누릅니다.</li>
        <li>
          &quot;웹 사이트 설정&quot;에서 카메라와 마이크를 &quot;허용&quot;으로
          바꿉니다.
        </li>
        <li>
          메뉴에 없으면 설정 앱 → Safari → 카메라·마이크를 &quot;묻기&quot;로
          바꿉니다.
        </li>
      </ol>
      <h3>Android (Chrome)</h3>
      <ol>
        <li>주소창 왼쪽의 사이트 정보 아이콘을 누릅니다.</li>
        <li>&quot;권한&quot;에서 카메라와 마이크를 허용합니다.</li>
        <li>
          목록에 없으면 휴대폰 설정 → 애플리케이션 → Chrome → 권한에서
          카메라·마이크를 허용합니다.
        </li>
      </ol>
    </div>
  );
}

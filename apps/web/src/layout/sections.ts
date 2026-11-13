// 시청하는 곳이 아니라 사용자 자신의 작업 공간인 영역. 이 영역의
// 페이지는 왼쪽에 팔로우 패널 대신 영역 메뉴를 보인다.
export interface Section {
  label: string;
  // 이 접두사 아래 경로는 이 영역에 속한다.
  prefix: string;
  items: readonly { to: string; label: string }[];
}

export const SECTIONS: readonly Section[] = [
  {
    label: '스튜디오',
    prefix: '/studio',
    items: [
      { to: '/studio', label: '내 방송' },
      { to: '/studio/channel', label: '내 채널' },
      { to: '/studio/donations', label: '후원' },
      { to: '/studio/followers', label: '팔로워' },
    ],
  },
  {
    label: '마이페이지',
    prefix: '/me',
    items: [
      { to: '/me', label: '라임 내역' },
      { to: '/me/donations', label: '보낸 후원' },
      { to: '/me/profile', label: '프로필' },
    ],
  },
];

export function sectionOf(pathname: string): Section | null {
  return (
    SECTIONS.find(
      (s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`),
    ) ?? null
  );
}

// `pathname`이 메뉴 자체 페이지인지 여부. 송출 페이지처럼 영역 안의
// 더 깊은 페이지와 구분한다.
export function isMenuPage(section: Section, pathname: string): boolean {
  return section.items.some((item) => item.to === pathname);
}

// Areas that are the user's own workspace rather than places to watch. Their
// pages show the area's menu on the left instead of the follow panel.
export interface Section {
  label: string;
  // Paths under this prefix belong to the area.
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

// Whether `pathname` is one of the menu's own pages, as opposed to a page
// deeper in the area such as the publish page.
export function isMenuPage(section: Section, pathname: string): boolean {
  return section.items.some((item) => item.to === pathname);
}

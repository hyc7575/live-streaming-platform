// "리그오브레전드"로 쳐도 "리그 오브 레전드"를 찾도록, 검색어와 저장하는 이름을
// 같은 방식으로 접는다.
export function foldGameText(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

// 접은 nameKo를 맨 앞에 두고 별칭과 영어 이름을 공백으로 잇는다. 접은 검색어에는
// 공백이 없으므로 이름 경계를 넘어 일치하지 않는다. 검색 순위는 첫 토큰이
// nameKo라는 이 배치에 기댄다(games.service.ts).
export function gameSearchText(game: {
  nameKo: string;
  nameEn: string | null;
  aliasesKo: string[];
}): string {
  return [game.nameKo, ...game.aliasesKo, game.nameEn ?? '']
    .map(foldGameText)
    .filter((token) => token !== '')
    .join(' ');
}

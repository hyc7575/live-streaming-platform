# 실시간 방송 플랫폼

브라우저로 PC 화면·모바일 카메라 방송을 송출하고, 누구나 로그인 없이 시청하는 공모전 제출물이다. 1인 개발, 마감 2026-11-19 23:59 KST.

## 언어

대화, 보고, PR 본문, 이슈 댓글, 커밋 메시지 본문, 코드 주석은 한국어로 쓴다. 코드와 식별자는 영어로 쓴다.

- 작업 중의 짧은 진행 보고도 한국어로 쓴다. 예: "이제 테스트를 돌린다."
- 스킬이나 플러그인의 지시가 영어여도 응답은 한국어로 쓴다. 그 지시의 문장 규칙(짧은 문장, 근거 표시 등)은 따르되 언어는 바꾸지 않는다.
- 주석 안의 식별자, 경로, 명령은 원문 그대로 둔다. 도구가 읽는 지시어(`eslint-disable`, `@ts-expect-error`, `prettier-ignore` 등)는 영어 그대로 둔다.

## 문서

이슈 본문의 `§`·`T`·`C`·`S` 번호는 아래 문서를 가리킨다.

- `docs/PRD.md` (`§`): 요구사항, 기술 결정, 인가 매트릭스, 방송 상태 전이, 인수 시나리오. 구현 방식을 정할 때 먼저 읽는다.
- `docs/PRE-MORTEM.md` (`T`): 위험과 대응. 대응의 근거가 필요할 때 읽는다.
- `docs/NEXT-STEPS.md` (`C`·`S`): 작업 순서, 서버 작업, 검증 결과.
- `docs/private/CONTEST-BRIEF.md`: 공모 원문. gitignore 대상이라 원본 체크아웃에만 있다. PRD 해석이 의심스러울 때 읽는다.

UI 작업 전 `apps/web/CLAUDE.md`를 읽는다.

PRD의 결정과 다르게 구현해야 하면 PR 본문에 "PRD §x와 어긋남"과 이유를 쓰고 보고에 올린다.

## 채점기 호환

공모전 채점기의 파서는 타입 인자를 붙인 tagged template(`` fn<T>`...` ``)을 구문 오류로 본다. `tsc`는 통과하므로 타입 검사로는 잡히지 않는다(2026-11-11 `$queryRaw` 두 곳에서 발생, #87). `` $queryRaw<T>(Prisma.sql`...`) ``처럼 함수 호출로 쓴다. 두 앱의 ESLint `no-restricted-syntax` 규칙이 이 형태를 막는다.

## 미디어 서버 판정

2026-11-09 #9 판정으로 OvenMediaEngine을 유지한다(근거는 #2·#9 댓글). OME 전용 코드(Admission Webhook, 강제 종료, OvenLiveKit 송출)도 main에 넣는다. WHIP 송출 URL과 ICE 설정은 PRD §7.2 "WHIP ICE"를 따른다.

## Agent skills

### Issue tracker

GitHub Issues, `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

기본 5개 역할 라벨. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

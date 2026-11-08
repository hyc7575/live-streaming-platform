# 실시간 방송 플랫폼

브라우저로 PC 화면·모바일 카메라 방송을 송출하고, 누구나 로그인 없이 시청하는 공모전 제출물이다. 1인 개발, 마감 2026-11-19 23:59 KST.

## 언어

대화, 보고, PR 본문, 이슈 댓글, 커밋 메시지 본문은 한국어로 쓴다. 코드와 식별자는 영어로 쓴다.

## 문서

이슈 본문의 `§`·`T`·`C`·`S` 번호는 아래 문서를 가리킨다.

- `docs/PRD.md` (`§`): 요구사항, 기술 결정, 인가 매트릭스, 방송 상태 전이, 인수 시나리오. 구현 방식을 정할 때 먼저 읽는다.
- `docs/PRE-MORTEM.md` (`T`): 위험과 대응. 대응의 근거가 필요할 때 읽는다.
- `docs/NEXT-STEPS.md` (`C`·`S`): 작업 순서, 서버 작업, 검증 결과.
- `docs/private/CONTEST-BRIEF.md`: 공모 원문. gitignore 대상이라 원본 체크아웃에만 있다. PRD 해석이 의심스러울 때 읽는다.

PRD의 결정과 다르게 구현해야 하면 PR 본문에 "PRD §x와 어긋남"과 이유를 쓰고 보고에 올린다.

## 컷 규칙 (#9 판정 전까지)

main에는 LiveKit으로 바꿔도 그대로 남는 코드(인증, 방송 CRUD, 인가)만 넣는다. OME 전용 코드(Admission Webhook, 강제 종료, OvenLiveKit 송출)는 `spike/` 브랜치에서만 실험한다. #9가 닫히면 이 절을 판정 결과로 바꾼다.

## Agent skills

### Issue tracker

GitHub Issues, `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

기본 5개 역할 라벨. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

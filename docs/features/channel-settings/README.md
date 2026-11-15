# 채널 설정

스트리머가 "내 채널"(`/studio/channel`)에서 기본 대기 이미지 한 장을 올리고 바꾸고 지운다.

- 우선순위: P2
- 상태: 구현 완료

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "채널 설정" 행
- §7.3 `standbyImageExt`
- §7.5 기본 대기 이미지 행과 그 아래 규칙

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #63 | #79 | 내 채널 화면에서 기본 대기 이미지 설정 |

## 코드

- api: `apps/api/src/channel/standby-image.controller.ts`, `user-image.service.ts`
- api: `apps/api/src/images/`
- web: `apps/web/src/pages/ChannelPage.tsx`
- web: `apps/web/src/components/UserImageField.tsx`

## 확인

- 인수 시나리오: §8.3에는 채널 설정 전용 시나리오가 없다
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 "기본 대기 이미지"

## 관련 기능

기본 대기 이미지를 두기로 한 전략은 [thumbnail-standby](../thumbnail-standby/)에 있다.

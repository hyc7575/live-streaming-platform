# 댓글

끝난 방송에 댓글을 쓰고 작성자만 고치고 지운다. 방송 전·중에는 채팅을 쓴다.

- 우선순위: P1
- 상태: 구현 완료

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "댓글" 행
- §7.3 `Comment`
- §7.5 댓글 작성·수정·삭제 행과 그 아래 채팅·댓글 규칙

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #18 | #50 | 방송 댓글 작성·목록·수정·삭제 |
| #54 | #55 | LIVE 중 댓글을 채팅처럼 보이기 (#91에서 채팅으로 분리) |
| #91 | #94 | 방송 중 채팅과 방송 후 댓글을 나눈다 |

## 코드

- api: `apps/api/src/comments/`
- web: `apps/web/src/components/CommentPanel.tsx`
- web: `apps/web/src/comments.ts`

## 확인

- 인수 시나리오: §8.3에는 댓글 전용 시나리오가 없다
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 6절

## 관련 기능

채팅과 댓글을 나눈 결정은 [chat-and-ready](../chat-and-ready/)에 있다.

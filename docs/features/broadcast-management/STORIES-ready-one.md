# 백로그: 방송 준비 중은 사용자당 1개 (#255)

- **형식**: User Stories
- **만든 방법**: `/pm-execution:write-stories`. 사용자 결정(2026-11-17 "방송 만들기는 한 번에 최대 1개씩만, 추가로 만들려 하면 이미 준비 중인 방송이 있다는 경고나 알림을 사용자에게 전한다")와 `docs/PRD.md` §7.4, [STORIES-ready-cap.md](./STORIES-ready-cap.md)(#212)를 근거로 했다.
- **실사용자 데이터 없음**. 근거는 사용자 결정이다. #212 문서에 "1개로 하지 않은 이유"는 따로 적혀 있지 않았고, 상한 20은 "심사위원 여럿이 테스트 계정 하나를 나눠 쓰다 버린 방송이 쌓여도 바로 막히지 않게" 정한 값이었다. 이 결정으로 그 값이 1로 바뀐다.
- **크기 판단**: 방향이 정해진 기능(`docs/agents/pm-skills.md`). DB 스키마는 그대로이고, 기존 `POST /api/broadcasts`의 거부 조건과 문구만 바뀐다. #212의 상한 20과 24시간 창을 대체한다.

## 정한 것

| 항목 | 값 | 근거 |
|---|---|---|
| 상한 N | 1 | 사용자 결정. 방송 만들기는 한 번에 하나만 둔다. |
| 세는 대상 | 호출자의 `READY` **전부**(만든 지 24시간이 지난 것도 센다) | 내 방송 목록은 24시간이 지난 READY도 "방송 준비 중"으로 계속 보인다(PRD §7.4). 사용자가 보기에 "준비 중인 방송이 있다"면 그것이 막아야 한다. 24시간 창은 공개 목록 몫을 세던 #212의 기준이라 N이 1이면 필요 없다. |
| 세지 않는 것 | `LIVE`, `ENDED`, 삭제한 방송, 다른 사용자의 방송 | 1인 1 LIVE는 별도 규칙이다(§7.4). 방송 중이거나 끝난 방송은 새 방송을 막지 않는다. |
| 거부 응답 | 409 + 사용자용 문구 | #212와 같은 방식. 지금 가진 방송 때문이라 429가 아니다. |
| 문구 | "이미 준비 중인 방송이 있습니다. 내 방송에서 그 방송으로 송출하거나 삭제한 뒤 새로 만들어 주세요." | 무엇이 막았는지와 할 일을 함께 말한다(존댓말 평서문, GLOSSARY 용어). |
| 화면 안내 | 방송 만들기 폼의 오류 줄(`role="alert"`)에 API 문구를 그대로 보인다 | #212 Story 3에서 이미 있는 경로(`ApiError.serverMessage`)를 쓴다. 새 화면·창은 만들지 않는다. |
| 빠져나갈 길 | 송출 화면의 "방송 삭제"(#252, #253) | 이미 머지됐다. 막혔을 때 시청 화면까지 가지 않고 지울 수 있다. |

## Stories

#### Story 1: 두 번째 방송 준비 중 거부
**스트리머로서, 이미 방송 준비 중인 방송이 있으면 새 방송 만들기가 거부되기를 원한다. 그래야 쓰지 않는 방송이 쌓이지 않고 한 번에 하나만 준비한다.**

Acceptance Criteria:
- [ ] `READY`가 없는 사용자의 `POST /api/broadcasts`는 201이다.
- [ ] `READY`가 하나 있는 사용자의 `POST /api/broadcasts`는 409이고 방송을 저장하지 않는다.
- [ ] 그 `READY`가 만든 지 24시간이 지났어도 409다.
- [ ] 같은 사용자가 동시에 여러 요청을 보내도 `READY`는 1개를 넘지 않는다(201 하나, 나머지 409).
- [ ] 그 방송을 삭제하면 다시 만들 수 있다.
- [ ] 방송이 `LIVE`이거나 `ENDED`면 `READY`가 없는 것으로 보고 만들 수 있다.
- [ ] 다른 사용자의 `READY`는 내 생성에 영향을 주지 않는다.

Priority: P0 | Effort: S | Dependencies: none

---

#### Story 2: 막혔을 때 화면 안내
**스트리머로서, 방송 만들기가 거부되면 이미 준비 중인 방송이 있다는 이유와 할 일을 알고 싶다. 그래야 그 방송으로 송출하거나 지우고 다시 만들 수 있다.**

Acceptance Criteria:
- [ ] 방송 만들기 화면(`/studio/new`)이 409를 받으면 API가 보낸 문구를 폼 오류로 그대로 보인다(`apps/web/CLAUDE.md` "`ApiError.serverMessage`" 규칙).
- [ ] 문구는 "이미 준비 중인 방송이 있습니다. 내 방송에서 그 방송으로 송출하거나 삭제한 뒤 새로 만들어 주세요."다.
- [ ] 폼에 입력한 값은 지워지지 않는다.
- [ ] 화면은 송출 화면으로 이동하지 않고 만들기 화면에 머문다.

Priority: P0 | Effort: S | Dependencies: Story 1

---

#### Story 3: 다른 사용자의 행이 목록에 남는다 (회귀)
**시청자로서, 한 계정이 방송을 계속 만들려 해도 다른 스트리머의 방송 준비 중과 방송 종료를 홈 목록에서 보고 싶다.**

Acceptance Criteria:
- [ ] 한 사용자가 생성을 100번 반복해도 그 사용자의 `READY`는 목록에 1개만 있다.
- [ ] 다른 사용자의 `LIVE`·`READY`·`ENDED` 행이 `GET /api/broadcasts`(전체)에 남는다.
- [ ] `?status=READY` 탭에도 다른 사용자의 `READY`가 남는다.
- [ ] 목록 순서(LIVE → READY → ENDED)와 100행 상한은 그대로다.

Priority: P1 | Effort: S | Dependencies: Story 1

---

#### Story 4: 막힌 사용자가 지울 수 있다
**스트리머로서, 만들기가 막혔을 때 문구가 가리키는 방송을 바로 지울 수 있기를 원한다.**

Acceptance Criteria:
- [ ] "내 방송"의 "방송 준비 중" 카드를 열면 송출 화면에 "방송 삭제"가 있다(#252, 이미 있음). 이 이슈에서 새로 만들지 않는다.
- [ ] 지운 뒤 "방송 만들기"가 201로 성공한다.

Priority: P1 | Effort: S | Dependencies: #252(머지됨)

---

### Story Map

```
필수:  Story 1 (생성 거부) → Story 2 (화면 안내)
       Story 3 (회귀 테스트)
확인:  Story 4 (#252로 이미 있음, 시나리오로만 확인)
```

### Technical Notes

- 코드: `apps/api/src/broadcasts/broadcasts.service.ts`의 `READY_PER_STREAMER_CAP`을 1로, `create`의 세기에서 `createdAt: { gt: listedSince }`를 뺀다. `READY_CAP_MESSAGE`는 새 문구로 바꾼다. 세기와 insert 사이 경쟁은 #212가 만든 사용자별 advisory lock과 `ConfirmGate`가 그대로 막는다.
- `READY_LISTED_MS`는 공개 목록·검색·스트리머 목록의 24시간 노출에 계속 쓰므로 남긴다. 생성 거부에서만 쓰지 않는다.
- `apps/api/test/broadcasts.e2e.spec.ts`의 "READY cap per streamer" 묶음은 N=1과 "24시간이 지나도 센다"에 맞춰 다시 쓴다. 같은 계정으로 방송을 여러 개 만드는 다른 테스트(`reconnect-grace`, `authorization-matrix`, `standby-image`, `profile`, `ome-api`, `e2e-stack`)는 `READY`를 `LIVE`·`ENDED`로 보내거나 지우지 않으면 깨진다. 전부 돌려 확인한다.
- 문서: PRD §7.4 "목록 노출", `STORIES-ready-cap.md`·`SCENARIOS-ready-cap.md`(대체됨 표시), `README.md` 이슈 표, `apps/web/CLAUDE.md`의 방송 만들기 줄, `docs/VERIFICATION.md`의 해당 절.

### Open Questions

- 막혔을 때 문구가 가리키는 방송으로 바로 가는 링크를 보일지는 정하지 않았다. 지금은 API 문구만 보이고, 링크를 달려면 409 본문에 기존 `READY`의 id를 담아야 한다. 이번 범위에는 넣지 않는다.
- 계정 여러 개로 나누는 경우는 막지 않는다(#212와 같다).
- 방송 종료 직후 곧바로 새로 만드는 흐름은 `ENDED`가 세지 않으므로 막히지 않는다. 의도한 동작이다.

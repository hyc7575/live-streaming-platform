// AppRoutes는 시청·송출·후원·충전 화면을 lazy로 내려받는다(#226). 테스트에서
// 그 첫 import는 vitest가 모듈을 변환하느라 실제 시간이 걸린다. 가짜 시계의
// `eventually`는 시간이 아니라 이벤트 루프 차례 수(200)로 끊으므로, 여러 파일을
// 함께 돌려 기계가 바쁘면 import가 끝나기 전에 차례가 바닥난다. 가짜 시계를
// 쓰는 파일은 beforeAll에서 이것을 불러 모듈을 미리 캐시에 올려 둔다.
export async function preloadLazyPages(): Promise<void> {
  await Promise.all([
    import('../pages/BroadcastPage'),
    import('../pages/PublishPage'),
    import('../pages/DonatePage'),
    import('../pages/LimeChargePage'),
  ]);
}

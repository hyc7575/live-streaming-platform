import type { Prisma } from '../generated/prisma/client.js';

// 후원이 PAID가 되는 트랜잭션 안에서 부른다. 후원자를 작성자로, 후원
// 메시지를 본문으로 한 채팅 한 줄을 남긴다(#166).
//
// createdAt은 지금 시각으로 넣는다. 카드 승인 트랜잭션은 토스 응답을
// 기다리느라 몇 초 열려 있다. 트랜잭션 시작 시각(PostgreSQL CURRENT_TIMESTAMP)을
// 쓰면 그사이 쓰인 채팅보다 앞에 놓여, (createdAt, id) 커서로 읽는 클라이언트가
// 이 줄을 건너뛴다. 지금은 Prisma의 @default(now())도 삽입 시각을 채우지만,
// 그 동작에 기대지 않으려고 직접 넣는다. 일반 채팅도 그렇게 채운 실제
// 시각이므로 주입한 Clock(테스트에서는 멈춰 있다)이 아니라 new Date()다.
export async function addDonationLine(
  tx: Prisma.TransactionClient,
  donation: {
    id: string;
    broadcastId: string;
    donorId: string;
    message: string;
  },
): Promise<void> {
  await tx.chatMessage.create({
    data: {
      broadcastId: donation.broadcastId,
      authorId: donation.donorId,
      body: donation.message,
      donationId: donation.id,
      createdAt: new Date(),
    },
  });
}

-- 게임 타이틀(PRD-category 7.1). Game은 Wikidata 게임 목록이고, 방송은 저장 시점의
-- 게임을 스냅샷(gameQid, gameName)으로 들고 있다. 둘 사이에 외래 키는 없다.

-- CreateTable
CREATE TABLE "Game" (
    "qid" TEXT NOT NULL,
    "nameKo" TEXT NOT NULL,
    "nameEn" TEXT,
    "aliasesKo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchText" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("qid")
);

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "gameName" TEXT,
ADD COLUMN     "gameQid" TEXT;

-- 게임 필드는 GAME 방송에만 있고, gameQid가 있으면 gameName도 있다.
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_game_only_for_game_category"
  CHECK ("gameName" IS NULL OR "category" = 'GAME');
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_game_qid_has_name"
  CHECK ("gameQid" IS NULL OR "gameName" IS NOT NULL);

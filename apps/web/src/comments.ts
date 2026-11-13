// apps/api/src/comments/comments.service.ts의 CommentView와 같은 모양이다.
export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; nickname: string };
}

export const COMMENT_MAX_LENGTH = 500;

// API는 생성할 때 두 날짜를 같은 시각으로 두고, 수정할 때는
// updatedAt만 옮긴다.
export function isEdited(comment: Comment): boolean {
  return comment.updatedAt !== comment.createdAt;
}

// Mirrors CommentView from apps/api/src/comments/comments.service.ts.
export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; nickname: string };
}

export const COMMENT_MAX_LENGTH = 500;

// The API sets both dates to the same instant on create and moves only
// updatedAt on an edit.
export function isEdited(comment: Comment): boolean {
  return comment.updatedAt !== comment.createdAt;
}

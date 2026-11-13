/**
 * 评论 API。
 *
 * 对齐网页端 [annualreport/src/components/CommentSection.vue:39-97]：
 *   GET /share/<id>/comments → { comments: Comment[] }
 *   POST /share/<id>/comments body: { content, author_display_name, media_urls }
 */
import { request } from './request'
import type { Comment } from '@/types'

export function fetchComments(shareId: string) {
  return request<{ comments: Comment[] }>({
    method: 'GET',
    path: `/share/${shareId}/comments`,
    requireAuth: false,
  })
}

export interface PostCommentPayload {
  content: string
  author_display_name: string
  media_urls?: string[]
}

export function postComment(shareId: string, payload: PostCommentPayload) {
  return request<{ comment: Comment }>({
    method: 'POST',
    path: `/share/${shareId}/comments`,
    body: { media_urls: [], ...payload },
  })
}

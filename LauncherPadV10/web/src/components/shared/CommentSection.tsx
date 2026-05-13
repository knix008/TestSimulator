"use client"

import { useActionState } from "react"
import { useSession } from "next-auth/react"
import { createComment, ActionResult } from "@/lib/actions"
import { formatRelativeDate } from "@/lib/utils"
import { MessageSquare, User, Send } from "lucide-react"
import Link from "next/link"

type Comment = {
  id: string
  content: string
  createdAt: Date | string
  user: { id: string; name: string | null; image: string | null }
}

type Props = {
  comments: Comment[]
  listingId?: string
  postId?: string
}

const initial: ActionResult = {}

export function CommentSection({ comments, listingId, postId }: Props) {
  const { data: session } = useSession()
  const [state, formAction, pending] = useActionState(createComment, initial)

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <MessageSquare className="w-5 h-5" />
        댓글 {comments.length}개
      </h2>

      {session ? (
        <form action={formAction} className="mb-6">
          {listingId && <input type="hidden" name="listingId" value={listingId} />}
          {postId && <input type="hidden" name="postId" value={postId} />}
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              {session.user?.image ? (
                <img src={session.user.image} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-indigo-600" />
              )}
            </div>
            <div className="flex-1">
              <textarea
                name="content"
                rows={3}
                placeholder="댓글을 입력하세요..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                required
              />
              {state.error && (
                <p className="text-red-500 text-xs mt-1">{state.error}</p>
              )}
              <div className="flex justify-end mt-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  {pending ? "등록 중..." : "댓글 등록"}
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg text-center">
          <p className="text-sm text-gray-500 mb-2">댓글을 작성하려면 로그인이 필요합니다</p>
          <Link href="/signin" className="text-sm text-indigo-600 hover:underline font-medium">
            로그인하기
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-6">첫 번째 댓글을 작성해보세요!</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                {comment.user.image ? (
                  <img src={comment.user.image} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <User className="w-3.5 h-3.5 text-gray-500" />
                )}
              </div>
              <div className="flex-1 bg-gray-50 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-800">{comment.user.name}</span>
                  <span className="text-xs text-gray-400">{formatRelativeDate(comment.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

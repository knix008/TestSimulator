"use client"

import { useActionState } from "react"
import Link from "next/link"
import { createPost, ActionResult } from "@/lib/actions"
import { ArrowLeft } from "lucide-react"

const initial: ActionResult = {}

export default function NewPostPage() {
  const [state, formAction, pending] = useActionState(createPost, initial)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/community"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        커뮤니티로 돌아가기
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">글 작성</h1>

        <form action={formAction} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input
              type="text"
              name="title"
              required
              minLength={2}
              placeholder="제목을 입력하세요"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">내용</label>
            <textarea
              name="content"
              required
              minLength={10}
              rows={10}
              placeholder="내용을 입력하세요..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              태그 <span className="text-gray-400 font-normal">(쉼표로 구분)</span>
            </label>
            <input
              type="text"
              name="tags"
              placeholder="예: 정보, 질문, 후기"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {state.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {state.error}
            </div>
          )}

          <div className="flex gap-3">
            <Link
              href="/community"
              className="flex-1 py-3 text-center border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              취소
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "등록 중..." : "게시하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

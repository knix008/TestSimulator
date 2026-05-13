import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
import { auth } from "@/auth"
import { CommentSection } from "@/components/shared/CommentSection"
import { formatDate, formatRelativeDate } from "@/lib/utils"
import { deletePost } from "@/lib/actions"
import { ArrowLeft, Tag, User, Trash2, Calendar } from "lucide-react"

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [post, session] = await Promise.all([
    prisma.post.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, image: true, bio: true, createdAt: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, name: true, image: true } } },
        },
      },
    }),
    auth(),
  ])

  if (!post) notFound()

  const isOwner = session?.user?.id === post.userId
  const deleteAction = deletePost.bind(null, post.id)

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/community"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        커뮤니티로 돌아가기
      </Link>

      <article className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 mb-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{post.title}</h1>
          {isOwner && (
            <form action={deleteAction}>
              <button
                type="submit"
                className="p-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                title="삭제하기"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </form>
          )}
        </div>

        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100">
          <Link href={`/profile/${post.user.id}`}>
            {post.user.image ? (
              <img src={post.user.image} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <User className="w-4 h-4 text-indigo-600" />
              </div>
            )}
          </Link>
          <div>
            <Link href={`/profile/${post.user.id}`} className="font-medium text-gray-900 hover:text-indigo-600 transition-colors">
              {post.user.name}
            </Link>
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
              <Calendar className="w-3 h-3" />
              {formatRelativeDate(post.createdAt)}
            </div>
          </div>
        </div>

        <div className="prose prose-sm max-w-none mb-6">
          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{post.content}</p>
        </div>

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={`/community?tag=${encodeURIComponent(tag)}`}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full hover:bg-indigo-100 transition-colors"
              >
                <Tag className="w-3 h-3" />
                {tag}
              </Link>
            ))}
          </div>
        )}
      </article>

      <CommentSection comments={post.comments} postId={post.id} />
    </div>
  )
}

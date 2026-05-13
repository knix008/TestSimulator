import Link from "next/link"
import { formatRelativeDate } from "@/lib/utils"
import { MessageSquare, Tag, User } from "lucide-react"

type Post = {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: Date | string
  user: { name: string | null; image: string | null }
  _count: { comments: number }
}

export function PostCard({ post }: { post: Post }) {
  return (
    <Link href={`/community/post/${post.id}`}>
      <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-indigo-200 transition-all duration-200">
        <div className="flex items-start gap-3">
          {post.user.image ? (
            <img
              src={post.user.image}
              alt={post.user.name ?? ""}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-indigo-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 line-clamp-2 leading-snug mb-1">
              {post.title}
            </h3>
            <p className="text-sm text-gray-500 line-clamp-2 mb-3">
              {post.content}
            </p>

            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {post.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-0.5 text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                    <Tag className="w-2.5 h-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="font-medium text-gray-700">{post.user.name}</span>
                <span>·</span>
                <span>{formatRelativeDate(post.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-400">
                <MessageSquare className="w-4 h-4" />
                <span>{post._count.comments}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

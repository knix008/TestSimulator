import Link from "next/link"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
import { PostCard } from "@/components/community/PostCard"
import { Plus, Search } from "lucide-react"

type SearchParams = { q?: string; tag?: string }

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const { q, tag } = params

  const posts = await prisma.post.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { content: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, image: true } },
      _count: { select: { comments: true } },
    },
  })

  const allTags = await prisma.post
    .findMany({ select: { tags: true } })
    .then((tagPosts) => {
      const tagSet = new Set<string>()
      tagPosts.forEach((p) => p.tags.forEach((t: string) => tagSet.add(t)))
      return Array.from(tagSet).slice(0, 20)
    })

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">커뮤니티</h1>
          <p className="text-sm text-gray-500 mt-1">총 {posts.length}개의 게시글</p>
        </div>
        <Link
          href="/community/post/new"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          글 작성
        </Link>
      </div>

      {/* Search */}
      <form className="mb-4">
        {tag && <input type="hidden" name="tag" value={tag} />}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="게시글 검색..."
            className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
          />
        </div>
      </form>

      {/* Tags */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href="/community"
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              !tag ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:border-indigo-300"
            }`}
          >
            전체
          </Link>
          {allTags.map((t) => (
            <Link
              key={t}
              href={`/community?tag=${encodeURIComponent(t)}`}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                tag === t ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:border-indigo-300"
              }`}
            >
              #{t}
            </Link>
          ))}
        </div>
      )}

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <p className="text-gray-400 mb-3">게시글이 없습니다</p>
          <Link href="/community/post/new" className="text-sm text-indigo-600 hover:underline">
            첫 번째 글을 작성해보세요
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}

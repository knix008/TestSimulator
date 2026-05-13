import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
import { ListingCard } from "@/components/marketplace/ListingCard"
import { PostCard } from "@/components/community/PostCard"
import { formatDate } from "@/lib/utils"
import { User, Calendar, ShoppingBag, FileText } from "lucide-react"

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      listings: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { category: true },
      },
      posts: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { _count: { select: { comments: true } } },
      },
      _count: {
        select: { listings: true, posts: true, comments: true },
      },
    },
  })

  if (!user) notFound()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 mb-6">
        <div className="flex items-start gap-5">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name ?? ""}
              className="w-20 h-20 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <User className="w-8 h-8 text-indigo-600" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
            {user.bio && (
              <p className="text-gray-600 mt-1 leading-relaxed">{user.bio}</p>
            )}
            <div className="flex items-center gap-1 text-sm text-gray-400 mt-2">
              <Calendar className="w-4 h-4" />
              {formatDate(user.createdAt)} 가입
            </div>

            <div className="flex gap-6 mt-4">
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">{user._count.listings}</p>
                <p className="text-xs text-gray-500">등록 상품</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">{user._count.posts}</p>
                <p className="text-xs text-gray-500">게시글</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">{user._count.comments}</p>
                <p className="text-xs text-gray-500">댓글</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Listings */}
      {user.listings.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-indigo-600" />
              등록한 상품
            </h2>
            <Link href={`/marketplace`} className="text-sm text-indigo-600 hover:underline">
              전체 보기
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {user.listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={{ ...listing, user: { name: user.name, image: user.image } }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Posts */}
      {user.posts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              작성한 글
            </h2>
          </div>
          <div className="space-y-3">
            {user.posts.map((post) => (
              <PostCard
                key={post.id}
                post={{ ...post, user: { name: user.name, image: user.image } }}
              />
            ))}
          </div>
        </section>
      )}

      {user.listings.length === 0 && user.posts.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <p className="text-gray-400">아직 활동이 없습니다</p>
        </div>
      )}
    </div>
  )
}

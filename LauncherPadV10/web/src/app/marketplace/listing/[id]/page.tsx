import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
import { auth } from "@/auth"
import { CommentSection } from "@/components/shared/CommentSection"
import { formatPrice, formatDate } from "@/lib/utils"
import { deleteListing } from "@/lib/actions"
import { Package, FileText, Briefcase, Tag, Calendar, User, ArrowLeft, Trash2 } from "lucide-react"

const typeConfig = {
  PHYSICAL: { label: "중고 상품", icon: Package, color: "text-blue-600 bg-blue-50" },
  DIGITAL: { label: "디지털 콘텐츠", icon: FileText, color: "text-purple-600 bg-purple-50" },
  SERVICE: { label: "서비스/재능", icon: Briefcase, color: "text-green-600 bg-green-50" },
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [listing, session] = await Promise.all([
    prisma.listing.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, image: true, bio: true, createdAt: true } },
        category: true,
        comments: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true, image: true } } },
        },
      },
    }),
    auth(),
  ])

  if (!listing) notFound()

  const typeInfo = typeConfig[listing.type]
  const TypeIcon = typeInfo.icon
  const isOwner = session?.user?.id === listing.userId

  const deleteAction = deleteListing.bind(null, listing.id)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        마켓플레이스로 돌아가기
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeInfo.color}`}>
                    <TypeIcon className="w-3 h-3" />
                    {typeInfo.label}
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500">{listing.category.name}</span>
                  {listing.status === "SOLD" && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">거래완료</span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">{listing.title}</h1>
              </div>
              {isOwner && (
                <form action={deleteAction}>
                  <button
                    type="submit"
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="삭제하기"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </form>
              )}
            </div>

            <div className="text-3xl font-bold text-indigo-600 mb-4">
              {formatPrice(listing.price, listing.currency)}
            </div>

            {listing.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {listing.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    <Tag className="w-3 h-3" />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-4 text-sm text-gray-400 pb-4 border-b border-gray-100">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDate(listing.createdAt)}
              </span>
            </div>

            <div className="pt-4 prose prose-sm max-w-none">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">상품 설명</h3>
              <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{listing.description}</p>
            </div>
          </div>

          <CommentSection comments={listing.comments} listingId={listing.id} />
        </div>

        {/* Seller Info */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">판매자 정보</h3>
            <div className="flex items-center gap-3 mb-3">
              {listing.user.image ? (
                <img src={listing.user.image} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-indigo-600" />
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900">{listing.user.name}</p>
                <p className="text-xs text-gray-400">
                  {formatDate(listing.user.createdAt)} 가입
                </p>
              </div>
            </div>
            {listing.user.bio && (
              <p className="text-sm text-gray-500 leading-relaxed">{listing.user.bio}</p>
            )}
            <Link
              href={`/profile/${listing.user.id}`}
              className="block mt-3 text-center py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              프로필 보기
            </Link>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">안전 거래 안내</p>
            <p className="text-xs leading-relaxed">직거래 시 공공장소에서 만나고, 상품 확인 후 결제하세요. 사기 피해 시 경찰에 신고하세요.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

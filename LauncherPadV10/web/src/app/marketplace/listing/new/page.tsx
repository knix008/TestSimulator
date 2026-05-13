"use client"

import { useActionState, useEffect, useState } from "react"
import Link from "next/link"
import { createListing, ActionResult } from "@/lib/actions"
import { ArrowLeft, Package, FileText, Briefcase } from "lucide-react"

type Category = { id: string; name: string; slug: string; type: string }

const initial: ActionResult = {}

export default function NewListingPage() {
  const [state, formAction, pending] = useActionState(createListing, initial)
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedType, setSelectedType] = useState("PHYSICAL")

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) =>
        setCategories(data.filter((c: Category) => c.type !== "COMMUNITY"))
      )
  }, [])

  const filteredCategories = categories.filter((c) => c.type === selectedType)

  const typeOptions = [
    { value: "PHYSICAL", label: "중고 상품", icon: Package, desc: "실물 상품을 판매합니다" },
    { value: "DIGITAL", label: "디지털 콘텐츠", icon: FileText, desc: "파일, 강의, 소프트웨어 등" },
    { value: "SERVICE", label: "서비스/재능", icon: Briefcase, desc: "전문 서비스나 재능을 제공합니다" },
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        마켓플레이스로 돌아가기
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">상품 등록</h1>

        <form action={formAction} className="space-y-6">
          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">거래 유형</label>
            <div className="grid grid-cols-3 gap-3">
              {typeOptions.map((opt) => {
                const Icon = opt.icon
                return (
                  <label
                    key={opt.value}
                    className={`relative flex flex-col items-center gap-2 p-3 border-2 rounded-xl cursor-pointer transition-all ${
                      selectedType === opt.value
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="type"
                      value={opt.value}
                      checked={selectedType === opt.value}
                      onChange={() => setSelectedType(opt.value)}
                      className="sr-only"
                    />
                    <Icon className={`w-5 h-5 ${selectedType === opt.value ? "text-indigo-600" : "text-gray-400"}`} />
                    <span className={`text-xs font-medium text-center ${selectedType === opt.value ? "text-indigo-700" : "text-gray-600"}`}>
                      {opt.label}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
            <select
              name="categoryId"
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">카테고리 선택</option>
              {filteredCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input
              type="text"
              name="title"
              required
              minLength={2}
              placeholder="상품명을 입력하세요"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
            <textarea
              name="description"
              required
              minLength={10}
              rows={5}
              placeholder="상품에 대해 자세히 설명해주세요..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              가격 <span className="text-gray-400 font-normal">(비워두면 무료 또는 협의)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₩</span>
              <input
                type="number"
                name="price"
                min={0}
                placeholder="0"
                className="w-full pl-7 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              태그 <span className="text-gray-400 font-normal">(쉼표로 구분)</span>
            </label>
            <input
              type="text"
              name="tags"
              placeholder="예: 아이폰, 중고, 싸게팔아요"
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
              href="/marketplace"
              className="flex-1 py-3 text-center border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              취소
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "등록 중..." : "등록하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const listingSchema = z.object({
  title: z.string().min(2, "제목은 2자 이상이어야 합니다"),
  description: z.string().min(10, "설명은 10자 이상이어야 합니다"),
  price: z.string().optional(),
  type: z.enum(["PHYSICAL", "DIGITAL", "SERVICE"]),
  categoryId: z.string().min(1, "카테고리를 선택해주세요"),
  tags: z.string().optional(),
})

const postSchema = z.object({
  title: z.string().min(2, "제목은 2자 이상이어야 합니다"),
  content: z.string().min(10, "내용은 10자 이상이어야 합니다"),
  tags: z.string().optional(),
})

const commentSchema = z.object({
  content: z.string().min(1, "댓글을 입력해주세요"),
  listingId: z.string().optional(),
  postId: z.string().optional(),
})

export type ActionResult = {
  error?: string
  success?: boolean
}

function firstError(err: z.ZodError): string {
  // Zod v4 uses .issues, v3 uses .errors — handle both
  const issues = (err as { issues?: { message: string }[] }).issues ?? (err as { errors?: { message: string }[] }).errors
  return issues?.[0]?.message ?? "입력값이 올바르지 않습니다"
}

export async function createListing(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: "로그인이 필요합니다" }

  const parsed = listingSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: firstError(parsed.error) }
  }

  const { title, description, price, type, categoryId, tags } = parsed.data

  await prisma.listing.create({
    data: {
      title,
      description,
      price: price ? parseFloat(price) : null,
      type,
      categoryId,
      userId: session.user.id,
      tags: tags
        ? tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    },
  })

  revalidatePath("/marketplace")
  redirect("/marketplace")
}

export async function createPost(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: "로그인이 필요합니다" }

  const parsed = postSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: firstError(parsed.error) }
  }

  const { title, content, tags } = parsed.data

  const post = await prisma.post.create({
    data: {
      title,
      content,
      userId: session.user.id,
      tags: tags
        ? tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    },
  })

  revalidatePath("/community")
  redirect(`/community/post/${post.id}`)
}

export async function createComment(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: "로그인이 필요합니다" }

  const parsed = commentSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: firstError(parsed.error) }
  }

  const { content, listingId, postId } = parsed.data

  if (!listingId && !postId) {
    return { error: "댓글 대상이 없습니다" }
  }

  await prisma.comment.create({
    data: {
      content,
      userId: session.user.id,
      listingId: listingId || undefined,
      postId: postId || undefined,
    },
  })

  if (listingId) revalidatePath(`/marketplace/listing/${listingId}`)
  if (postId) revalidatePath(`/community/post/${postId}`)

  return { success: true }
}

export async function deleteListing(
  listingId: string,
  _formData: FormData
): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return

  const listing = await prisma.listing.findUnique({ where: { id: listingId } })
  if (!listing || listing.userId !== session.user.id) return

  await prisma.listing.delete({ where: { id: listingId } })
  revalidatePath("/marketplace")
  redirect("/marketplace")
}

export async function deletePost(
  postId: string,
  _formData: FormData
): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return

  const post = await prisma.post.findUnique({ where: { id: postId } })
  if (!post || post.userId !== session.user.id) return

  await prisma.post.delete({ where: { id: postId } })
  revalidatePath("/community")
  redirect("/community")
}

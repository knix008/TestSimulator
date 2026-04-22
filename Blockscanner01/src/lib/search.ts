import {
  type Address,
  type Hash,
  type Transaction,
  type TransactionReceipt,
  type Block,
  isAddress,
  isHash,
} from 'viem'
import { publicClient } from './client'

export type SearchMode = 'auto' | 'address' | 'tx' | 'block' | 'blockHash'

const HEX64 = /^0x[a-fA-F0-9]{64}$/
const DEC = /^\d+$/

function normalizeInput(raw: string): string {
  return raw.trim()
}

export function classifyQuery(
  raw: string,
  mode: SearchMode,
):
  | { kind: 'address'; address: Address }
  | { kind: 'tx'; hash: Hash }
  | { kind: 'block'; blockNumber: bigint }
  | { kind: 'blockTag'; tag: 'latest' | 'pending' | 'earliest' | 'safe' | 'finalized' }
  | { kind: 'blockHash'; hash: Hash }
  | { kind: 'ambiguousHash'; hash: Hash }
  | { kind: 'invalid'; reason: string } {
  const q = normalizeInput(raw)

  if (!q) {
    return { kind: 'invalid', reason: '검색어를 입력하세요.' }
  }

  const lower = q.toLowerCase()

  if (mode === 'address') {
    if (!isAddress(q)) {
      return { kind: 'invalid', reason: '유효한 이더리움 주소가 아닙니다.' }
    }
    return { kind: 'address', address: q as Address }
  }

  if (mode === 'tx') {
    if (!isHash(q) || q.length !== 66) {
      return { kind: 'invalid', reason: '유효한 트랜잭션 해시(32바이트)가 아닙니다.' }
    }
    return { kind: 'tx', hash: q as Hash }
  }

  if (mode === 'blockHash') {
    if (!HEX64.test(q)) {
      return { kind: 'invalid', reason: '유효한 블록 해시가 아닙니다.' }
    }
    return { kind: 'blockHash', hash: q as Hash }
  }

  if (mode === 'block') {
    if (lower === 'latest' || lower === 'pending' || lower === 'earliest' || lower === 'safe' || lower === 'finalized') {
      return { kind: 'blockTag', tag: lower as 'latest' | 'pending' | 'earliest' | 'safe' | 'finalized' }
    }
    if (DEC.test(q)) {
      return { kind: 'block', blockNumber: BigInt(q) }
    }
    if (/^0x[0-9a-fA-F]+$/.test(q)) {
      if (HEX64.test(q)) {
        return { kind: 'blockHash', hash: q as Hash }
      }
      try {
        const n = BigInt(q)
        if (n >= 0n) return { kind: 'block', blockNumber: n }
      } catch {
        /* fallthrough */
      }
    }
    return { kind: 'invalid', reason: '블록 번호(10진/16진), 블록 해시, 또는 latest 등의 태그를 입력하세요.' }
  }

  // auto
  if (isAddress(q)) {
    return { kind: 'address', address: q as Address }
  }
  if (lower === 'latest' || lower === 'pending' || lower === 'earliest' || lower === 'safe' || lower === 'finalized') {
    return { kind: 'blockTag', tag: lower as 'latest' | 'pending' | 'earliest' | 'safe' | 'finalized' }
  }
  if (DEC.test(q)) {
    return { kind: 'block', blockNumber: BigInt(q) }
  }
  if (/^0x[0-9a-fA-F]+$/.test(q)) {
    if (HEX64.test(q)) {
      return { kind: 'ambiguousHash', hash: q as Hash }
    }
    try {
      const n = BigInt(q)
      if (n >= 0n) return { kind: 'block', blockNumber: n }
    } catch {
      /* fallthrough */
    }
  }

  return {
    kind: 'invalid',
    reason: '주소, 트랜잭션/블록 해시(0x+64자), 블록 번호, 또는 latest 등을 입력하세요.',
  }
}

export type SearchResult =
  | {
      type: 'address'
      address: Address
      balanceWei: bigint
      nonce: number
      isContract: boolean
      bytecode: `0x${string}` | undefined
    }
  | {
      type: 'transaction'
      tx: Transaction
      receipt: TransactionReceipt | null
    }
  | { type: 'block'; block: Block }
  | { type: 'not_found'; message: string }
  | { type: 'error'; message: string }

async function resolveAmbiguousHash(hash: Hash): Promise<SearchResult> {
  const tx = await publicClient.getTransaction({ hash })
  if (tx) {
    let receipt: TransactionReceipt | null = null
    try {
      receipt = await publicClient.getTransactionReceipt({ hash })
    } catch {
      receipt = null
    }
    return { type: 'transaction', tx, receipt }
  }
  const block = await publicClient.getBlock({ blockHash: hash })
  if (block) {
    return { type: 'block', block }
  }
  return { type: 'not_found', message: '해당 해시의 트랜잭션 또는 블록을 찾을 수 없습니다.' }
}

export async function runSearch(
  raw: string,
  mode: SearchMode,
): Promise<SearchResult> {
  const parsed = classifyQuery(raw, mode)
  if (parsed.kind === 'invalid') {
    return { type: 'error', message: parsed.reason }
  }

  try {
    if (parsed.kind === 'address') {
      const [balanceWei, nonce, bytecode] = await Promise.all([
        publicClient.getBalance({ address: parsed.address }),
        publicClient.getTransactionCount({ address: parsed.address }),
        publicClient.getBytecode({ address: parsed.address }),
      ])
      const bc = bytecode && bytecode !== '0x' ? bytecode : undefined
      return {
        type: 'address',
        address: parsed.address,
        balanceWei,
        nonce,
        isContract: Boolean(bc),
        bytecode: bc,
      }
    }

    if (parsed.kind === 'tx') {
      const tx = await publicClient.getTransaction({ hash: parsed.hash })
      if (!tx) {
        return { type: 'not_found', message: '트랜잭션을 찾을 수 없습니다.' }
      }
      let receipt: TransactionReceipt | null = null
      try {
        receipt = await publicClient.getTransactionReceipt({ hash: parsed.hash })
      } catch {
        receipt = null
      }
      return { type: 'transaction', tx, receipt }
    }

    if (parsed.kind === 'blockHash') {
      const block = await publicClient.getBlock({ blockHash: parsed.hash })
      if (!block) {
        return { type: 'not_found', message: '블록을 찾을 수 없습니다.' }
      }
      return { type: 'block', block }
    }

    if (parsed.kind === 'blockTag') {
      const block = await publicClient.getBlock({ blockTag: parsed.tag })
      return { type: 'block', block }
    }

    if (parsed.kind === 'block') {
      const block = await publicClient.getBlock({ blockNumber: parsed.blockNumber })
      if (!block) {
        return { type: 'not_found', message: '블록을 찾을 수 없습니다.' }
      }
      return { type: 'block', block }
    }

    if (parsed.kind === 'ambiguousHash') {
      return resolveAmbiguousHash(parsed.hash)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { type: 'error', message: msg || 'RPC 요청에 실패했습니다.' }
  }

  return { type: 'error', message: '알 수 없는 검색 유형입니다.' }
}

import { createContext, useContext } from 'react'
import type { ArchiveService } from '@core/ArchiveService'

/** 런타임에 주입되는 ArchiveService 를 UI 전역에 제공. */
export const ServiceContext = createContext<ArchiveService | null>(null)

export function useArchiveService(): ArchiveService {
  const svc = useContext(ServiceContext)
  if (!svc) throw new Error('ArchiveService 가 주입되지 않았습니다.')
  return svc
}

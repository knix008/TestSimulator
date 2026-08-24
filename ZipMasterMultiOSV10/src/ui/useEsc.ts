import { useEffect } from 'react'

/** 컴포넌트가 마운트된 동안 ESC 키를 누르면 onEsc 를 호출한다(모달 닫기 공용). */
export function useEsc(onEsc: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEsc()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEsc])
}

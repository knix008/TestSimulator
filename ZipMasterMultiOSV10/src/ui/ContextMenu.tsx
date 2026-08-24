import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode
} from 'react'

/** 컨텍스트 메뉴 항목. separator=true 면 구분선. */
export interface MenuItem {
  label?: string
  /** 라벨 앞에 표시할 아이콘(이모지). */
  icon?: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  separator?: boolean
}

interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

interface Ctx {
  /** 우클릭 이벤트 위치에 항목들로 컨텍스트 메뉴를 연다. */
  openMenu: (e: MouseEvent, items: MenuItem[]) => void
  closeMenu: () => void
}

const ContextMenuContext = createContext<Ctx | null>(null)

export function useContextMenu(): Ctx {
  const c = useContext(ContextMenuContext)
  if (!c) throw new Error('ContextMenuProvider 가 필요합니다.')
  return c
}

/** 전역 컨텍스트 메뉴 제공자. 하나의 메뉴만 표시하며 바깥 클릭/ESC/스크롤 시 닫힘. */
export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  const openMenu = useCallback((e: MouseEvent, items: MenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    if (items.length === 0) return
    setMenu({ x: e.clientX, y: e.clientY, items })
  }, [])

  const closeMenu = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!menu) return
    const onDown = () => closeMenu()
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && closeMenu()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, closeMenu])

  return (
    <ContextMenuContext.Provider value={{ openMenu, closeMenu }}>
      {children}
      {menu && <MenuView state={menu} onClose={closeMenu} />}
    </ContextMenuContext.Provider>
  )
}

function MenuView({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: state.x, y: state.y })

  // 뷰포트 밖으로 나가지 않도록 위치 보정.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    let x = state.x
    let y = state.y
    if (x + w > window.innerWidth) x = Math.max(4, window.innerWidth - w - 4)
    if (y + h > window.innerHeight) y = Math.max(4, window.innerHeight - h - 4)
    setPos({ x, y })
  }, [state])

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      // 메뉴 내부 mousedown 은 바깥-닫기 리스너로 전파되지 않도록 차단.
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      {state.items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-menu-sep" />
        ) : (
          <button
            key={i}
            className={'context-menu-item' + (item.danger ? ' danger' : '')}
            disabled={item.disabled}
            role="menuitem"
            onClick={() => {
              item.onClick?.()
              onClose()
            }}
          >
            <span className="context-menu-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="context-menu-label">{item.label}</span>
          </button>
        )
      )}
    </div>
  )
}

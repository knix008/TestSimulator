import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';

const VALID_LAYOUTS = ['vertical', 'horizontal'];

function normalizeMenuLayout(layout) {
  return VALID_LAYOUTS.includes(layout) ? layout : 'vertical';
}

const MenuLayoutContext = createContext(null);

export function MenuLayoutProvider({ children }) {
  const { user, updateUserLocal } = useAuth();
  const [menuLayout, setMenuLayoutState] = useState('vertical');

  useEffect(() => {
    setMenuLayoutState(user ? normalizeMenuLayout(user.menuLayout) : 'vertical');
  }, [user?.id, user?.menuLayout]);

  const setMenuLayout = useCallback(async (layout) => {
    const next = normalizeMenuLayout(layout);
    setMenuLayoutState(next);

    if (user) {
      try {
        await api.put('/settings/menu-layout', { menuLayout: next });
        updateUserLocal({ menuLayout: next });
      } catch {
        /* UI already updated */
      }
    }
  }, [user, updateUserLocal]);

  return (
    <MenuLayoutContext.Provider value={{ menuLayout, setMenuLayout }}>
      {children}
    </MenuLayoutContext.Provider>
  );
}

export function useMenuLayout() {
  return useContext(MenuLayoutContext);
}

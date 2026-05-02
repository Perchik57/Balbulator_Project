import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const FAVORITES_STORAGE_KEY = 'balbulator:favorites:v1';

type FavoritesContextValue = {
  favorites: string[];
  toggleFavorite: (code: string) => void;
  isFavorite: (code: string) => boolean;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function readStoredFavorites() {
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return Array.from(
      new Set(parsed.filter((item): item is string => typeof item === 'string').map(normalizeCode).filter(Boolean)),
    );
  } catch {
    return [];
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>(readStoredFavorites);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // Favorites are optional; the app should continue if localStorage is unavailable.
    }
  }, [favorites]);

  const toggleFavorite = useCallback((code: string) => {
    const normalized = normalizeCode(code);
    if (!normalized) return;

    setFavorites((current) => (
      current.includes(normalized)
        ? current.filter((item) => item !== normalized)
        : [...current, normalized]
    ));
  }, []);

  const isFavorite = useCallback((code: string) => favorites.includes(normalizeCode(code)), [favorites]);

  const value = useMemo(
    () => ({ favorites, toggleFavorite, isFavorite }),
    [favorites, isFavorite, toggleFavorite],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }

  return context;
}

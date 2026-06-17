"use client";

import { useEffect, useState } from "react";

export type ColumnCount = 1 | 2 | 3;

/**
 * Remembers a 1/2/3 column choice for a card grid in localStorage. Shared by the
 * compact card grids across the site (engagement list, dashboard dimensions,
 * sortable editor cards) so the toggle behaves identically everywhere.
 */
export function useColumnPreference(
  storageKey: string,
  defaultCols: ColumnCount = 2,
): [ColumnCount, (n: ColumnCount) => void] {
  const [cols, setCols] = useState<ColumnCount>(defaultCols);

  // Apply any stored preference on mount.
  useEffect(() => {
    try {
      const n = Number(window.localStorage.getItem(storageKey));
      if (n === 1 || n === 2 || n === 3) setCols(n);
    } catch {
      /* storage may be unavailable; the in-memory default still works */
    }
  }, [storageKey]);

  function persist(n: ColumnCount) {
    setCols(n);
    try {
      window.localStorage.setItem(storageKey, String(n));
    } catch {
      /* ignore unavailable storage */
    }
  }

  return [cols, persist];
}

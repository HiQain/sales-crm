export interface StoredCustomColumn {
  id: string;
  label: string;
}

export interface StoredColumnLayout {
  order: string[];
  visible: string[];
  widths?: Record<string, number>;
  customColumns?: StoredCustomColumn[];
}

export function loadColumnLayout(storageKey: string): StoredColumnLayout | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredColumnLayout>;
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.visible)) {
      return null;
    }
    return {
      order: parsed.order.map(String),
      visible: parsed.visible.map(String),
      widths: parsed.widths && typeof parsed.widths === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.widths).flatMap(([id, width]) => {
              const normalizedWidth = Number(width);
              return Number.isFinite(normalizedWidth) && normalizedWidth > 0
                ? [[String(id), normalizedWidth]]
                : [];
            }),
          )
        : {},
      customColumns: Array.isArray(parsed.customColumns)
        ? parsed.customColumns.flatMap((column) => {
            if (!column || typeof column !== 'object') return [];

            const id = 'id' in column ? String(column.id ?? '').trim() : '';
            const label = 'label' in column ? String(column.label ?? '').trim() : '';
            return id && label ? [{ id, label }] : [];
          })
        : [],
    };
  } catch {
    return null;
  }
}

export function saveColumnLayout(storageKey: string, layout: StoredColumnLayout) {
  localStorage.setItem(storageKey, JSON.stringify(layout));
}

export function mergeOrderedIds(allIds: string[], storedOrder: string[] | undefined) {
  if (!storedOrder?.length) return allIds;

  const retained = storedOrder.filter((id) => allIds.includes(id));
  const missing = allIds.filter((id) => !retained.includes(id));
  return [...retained, ...missing];
}

export function mergeVisibleIds(orderedIds: string[], storedVisible: string[] | undefined) {
  if (!storedVisible?.length) return orderedIds;

  const visibleSet = new Set(storedVisible.filter((id) => orderedIds.includes(id)));
  return orderedIds.filter((id) => visibleSet.has(id));
}

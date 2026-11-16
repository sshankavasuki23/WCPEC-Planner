export const storageKey = 'wcpec9:agenda:v1';

export function restoreAgenda(known) {
  let raw;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    return { ids: new Set(), available: false };
  }
  try {
    const list = JSON.parse(raw);
    return { ids: new Set(Array.isArray(list) ? list.filter((id) => known.has(id)) : []), available: true };
  } catch {
    return { ids: new Set(), available: true };
  }
}

export function saveAgenda(ids) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...ids]));
    return true;
  } catch {
    return false;
  }
}

export function conflicts(items) {
  const result = new Set();
  const timed = items.filter((item) => item.start && item.end);
  for (let i = 0; i < timed.length; i++) {
    const a = timed[i];
    for (const b of timed.slice(i + 1)) {
      if (a.date !== b.date || (a.sharedWindow && b.sharedWindow)) continue;
      if (a.start < b.end && b.start < a.end) {
        result.add(a.id);
        result.add(b.id);
      }
    }
  }
  return result;
}

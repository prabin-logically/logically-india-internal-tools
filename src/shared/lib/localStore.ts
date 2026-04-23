const PREFIX = "tool";

function key(slug: string, k: string): string {
  return `${PREFIX}:${slug}:${k}`;
}

export function read<T>(slug: string, k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(slug, k));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function write<T>(slug: string, k: string, value: T): void {
  try {
    localStorage.setItem(key(slug, k), JSON.stringify(value));
  } catch (err) {
    console.warn(`localStore write failed for ${key(slug, k)}`, err);
  }
}

export function remove(slug: string, k: string): void {
  try {
    localStorage.removeItem(key(slug, k));
  } catch (err) {
    console.warn(`localStore remove failed for ${key(slug, k)}`, err);
  }
}

export function clearTool(slug: string): void {
  try {
    const prefix = `${PREFIX}:${slug}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch (err) {
    console.warn(`localStore clearTool failed for ${slug}`, err);
  }
}

export function buildTicketUrl(
  baseUrl: string | null | undefined,
  key: string,
): string | null {
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, "")}/browse/${encodeURIComponent(key)}`;
}

export async function openExternal(url: string): Promise<void> {
  // Tauri 2 plugin if present
  try {
    const mod = await import("@tauri-apps/plugin-opener").catch(() => null);
    if (mod && typeof (mod as any).openUrl === "function") {
      await (mod as any).openUrl(url);
      return;
    }
  } catch {
    // fall through
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

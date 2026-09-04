export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
}

export type UpdateProgress =
  | { status: "downloading"; downloaded: number; total: number | null }
  | { status: "installing" };

type CheckResult = { available: false } | { available: true; info: UpdateInfo };

export function isDesktopRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export async function checkForUpdate(): Promise<CheckResult> {
  if (!isDesktopRuntime()) return { available: false };

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return { available: false };

  return {
    available: true,
    info: {
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body ?? undefined,
      date: update.date ?? undefined,
    },
  };
}

export async function downloadAndInstallUpdate(
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  if (!isDesktopRuntime()) throw new Error("Mise à jour disponible uniquement dans l'application de bureau.");

  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");

  const update = await check();
  if (!update) throw new Error("Aucune mise à jour disponible.");

  let total: number | null = null;
  let downloaded = 0;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? null;
        onProgress?.({ status: "downloading", downloaded: 0, total });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ status: "downloading", downloaded, total });
        break;
      case "Finished":
        onProgress?.({ status: "installing" });
        break;
    }
  });

  await relaunch();
}

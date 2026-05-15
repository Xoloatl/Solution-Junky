import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

const inTauri = Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);

export async function exportChatMarkdown(chatId: string, chatTitle: string): Promise<void> {
  if (!inTauri) return;
  const content = await invoke<string>("export_chat_markdown", { chatId });
  const path = await save({
    defaultPath: `${sanitizeFilename(chatTitle)}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (path) await writeTextFile(path, content);
}

export async function exportChatJson(chatId: string, chatTitle: string): Promise<void> {
  if (!inTauri) return;
  const content = await invoke<string>("export_chat_json", { chatId });
  const path = await save({
    defaultPath: `${sanitizeFilename(chatTitle)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (path) await writeTextFile(path, content);
}

export async function backupDatabase(): Promise<void> {
  if (!inTauri) return;
  const now = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = await save({
    defaultPath: `solution-junky-backup-${now}.db`,
    filters: [{ name: "SQLite Database", extensions: ["db"] }],
  });
  if (path) await invoke("backup_database", { destPath: path });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "chat";
}

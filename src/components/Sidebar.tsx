import { useEffect, useState, type MouseEvent } from "react";
import {
  MessageSquare, Pin, Archive, Plus, Search,
  ChevronDown, ChevronRight, Trash2, MoreHorizontal, Brain, Command,
  Download, FileText, FileJson, DatabaseBackup,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { categoryColor } from "@/lib/categoryColors";
import { useAppStore, type Chat } from "@/store";
import * as db from "@/lib/db";
import { exportChatMarkdown, exportChatJson, backupDatabase } from "@/lib/export";
import { MemoryManager } from "@/components/MemoryManager";

interface ChatRowProps {
  chat: Chat;
  active: boolean;
  onSelect: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function ChatRow({ chat, active, onSelect, onPin, onArchive, onDelete }: ChatRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete();
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
      onClick={onSelect}
      onMouseLeave={() => setConfirmDelete(false)}
    >
      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate flex-1">{chat.title || "New Chat"}</span>

      {chat.pinned && !menuOpen && (
        <Pin className="w-3 h-3 shrink-0 opacity-40" />
      )}

      <div className="flex items-center gap-1">
        <button
          onClick={handleDeleteClick}
          className={cn(
            "shrink-0 rounded p-0.5 transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/10",
            confirmDelete ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          aria-label={confirmDelete ? "Confirm delete chat" : "Delete chat"}
          type="button"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        {confirmDelete && (
          <span className="text-[11px] text-destructive font-medium select-none">
            Confirm?
          </span>
        )}

        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
                menuOpen && "opacity-100",
                "hover:bg-accent text-muted-foreground hover:text-foreground"
              )}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="right"
              align="start"
              sideOffset={4}
              onClick={(e) => e.stopPropagation()}
              className="z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-lg text-xs"
            >
              <DropdownMenu.Item
                onSelect={onPin}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-foreground hover:bg-accent outline-none"
              >
                <Pin className="w-3 h-3" />
                {chat.pinned ? "Unpin" : "Pin"}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={onArchive}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-foreground hover:bg-accent outline-none"
              >
                <Archive className="w-3 h-3" />
                Archive
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="h-px bg-border my-1" />

              {/* Export submenu */}
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-foreground hover:bg-accent outline-none">
                  <Download className="w-3 h-3" />
                  Export
                  <ChevronRight className="w-3 h-3 ml-auto" />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent
                    sideOffset={4}
                    className="z-50 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-lg text-xs"
                  >
                    <DropdownMenu.Item
                      onSelect={() => exportChatMarkdown(chat.id, chat.title)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-foreground hover:bg-accent outline-none"
                    >
                      <FileText className="w-3 h-3" />
                      Markdown
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={() => exportChatJson(chat.id, chat.title)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-foreground hover:bg-accent outline-none"
                    >
                      <FileJson className="w-3 h-3" />
                      JSON
                    </DropdownMenu.Item>
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>

              <DropdownMenu.Separator className="h-px bg-border my-1" />
              <DropdownMenu.Item
                onSelect={onDelete}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-destructive hover:bg-destructive/10 outline-none"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}

interface ChatGroupProps {
  label: string;
  labelColor?: string;
  chats: Chat[];
  activeChatId: string | null;
  onSelect: (id: string) => void;
  onPin: (chat: Chat) => void;
  onArchive: (chat: Chat) => void;
  onDelete: (chat: Chat) => void;
  defaultOpen?: boolean;
}

function ChatGroup({
  label, labelColor, chats, activeChatId, onSelect, onPin, onArchive, onDelete, defaultOpen = true,
}: ChatGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (chats.length === 0) return null;

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors no-select"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {labelColor && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: labelColor }}
          />
        )}
        {label}
      </button>
      {open && (
        <div className="mt-0.5">
          {chats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              active={activeChatId === chat.id}
              onSelect={() => onSelect(chat.id)}
              onPin={() => onPin(chat)}
              onArchive={() => onArchive(chat)}
              onDelete={() => onDelete(chat)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const {
    chats, chatsLoaded, activeChatId,
    setActiveChatId, setChats, setChatsLoaded, upsertChat, removeChat,
    setMemoryManagerOpen, setSearchPaletteOpen,
    categories, categoriesLoaded, setCategories, setCategoriesLoaded,
  } = useAppStore();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (chatsLoaded) return;
    db.listChats().then((rows) => {
      setChats(rows);
      setChatsLoaded(true);
    });
  }, [chatsLoaded, setChats, setChatsLoaded]);

  useEffect(() => {
    if (categoriesLoaded) return;
    db.listCategories().then((rows) => {
      setCategories(rows);
      setCategoriesLoaded(true);
    });
  }, [categoriesLoaded, setCategories, setCategoriesLoaded]);

  const filtered = chats.filter(
    (c) => !c.archived && c.title.toLowerCase().includes(search.toLowerCase())
  );
  const pinned = filtered.filter((c) => c.pinned);
  const unpinned = filtered.filter((c) => !c.pinned);

  // Group unpinned chats by category
  const uncategorized = unpinned.filter((c) => !c.category_id);
  const byCategory = categories
    .map((cat) => ({
      cat,
      chats: unpinned.filter((c) => c.category_id === cat.id),
    }))
    .filter(({ chats }) => chats.length > 0);

  async function handleNewChat() {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const chat = await db.createChat({ id, title: "New Chat", created_at: now });
    upsertChat(chat);
    setActiveChatId(id);
  }

  async function handlePin(chat: Chat) {
    const next = !chat.pinned;
    await db.pinChat(chat.id, next);
    upsertChat({ ...chat, pinned: next });
  }

  async function handleArchive(chat: Chat) {
    await db.archiveChat(chat.id);
    removeChat(chat.id);
    if (activeChatId === chat.id) setActiveChatId(null);
  }

  async function handleDelete(chat: Chat) {
    const remainingChats = chats.filter((c) => c.id !== chat.id);
    await db.deleteChat(chat.id);
    removeChat(chat.id);

    if (activeChatId === chat.id) {
      const nextChat = remainingChats
        .slice()
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];

      if (nextChat) {
        setActiveChatId(nextChat.id);
      } else {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const newChat = await db.createChat({ id, title: "New Chat", created_at: now });
        upsertChat(newChat);
        setActiveChatId(id);
      }
    }
  }

  return (
    <aside className="flex flex-col h-full bg-sidebar border-r border-sidebar-border w-64 shrink-0">
      <div className="flex items-center justify-between px-3 py-3 no-select">
        <span className="text-sm font-semibold text-foreground tracking-tight">Solution Junky</span>
        <Button size="icon" variant="ghost" onClick={handleNewChat} className="h-7 w-7">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="px-3 pb-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 bg-muted rounded-md px-2 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter chats…"
            className="flex-1 bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={() => setSearchPaletteOpen(true)}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md bg-muted/50 hover:bg-muted text-xs text-muted-foreground transition-colors no-select"
        >
          <Command className="w-3 h-3" />
          <span>Global search</span>
          <kbd className="ml-auto font-mono text-[10px] bg-background border border-border rounded px-1">Ctrl+K</kbd>
        </button>
      </div>

      <Separator />

      <ScrollArea className="flex-1 px-1 py-2">
        <ChatGroup
          label="Pinned"
          chats={pinned}
          activeChatId={activeChatId}
          onSelect={setActiveChatId}
          onPin={handlePin}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />

        {byCategory.map(({ cat, chats: catChats }) => (
          <ChatGroup
            key={cat.id}
            label={cat.name}
            labelColor={cat.color ?? categoryColor(cat.name)}
            chats={catChats}
            activeChatId={activeChatId}
            onSelect={setActiveChatId}
            onPin={handlePin}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        ))}

        <ChatGroup
          label={byCategory.length > 0 ? "Uncategorized" : "Recent"}
          chats={uncategorized}
          activeChatId={activeChatId}
          onSelect={setActiveChatId}
          onPin={handlePin}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />

        {filtered.length === 0 && chatsLoaded && (
          <p className="text-xs text-muted-foreground text-center py-8">
            {search ? "No results" : "No chats yet"}
          </p>
        )}
      </ScrollArea>

      <Separator />
      <div className="px-3 py-2 flex items-center gap-1 flex-wrap">
        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground gap-1.5">
          <Archive className="w-3.5 h-3.5" />
          Archived
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground gap-1.5"
          onClick={() => backupDatabase()}
          title="Backup database"
        >
          <DatabaseBackup className="w-3.5 h-3.5" />
          Backup
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground gap-1.5 ml-auto"
          onClick={() => setMemoryManagerOpen(true)}
        >
          <Brain className="w-3.5 h-3.5" />
          Memory
        </Button>
      </div>

      <MemoryManager />
    </aside>
  );
}

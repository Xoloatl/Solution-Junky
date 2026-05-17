import { useEffect } from "react";
import * as Select from "@radix-ui/react-select";
import { ChevronDown, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { getModels, inTauri } from "@/lib/db";

function formatSize(bytes: number): string {
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  const mb = bytes / 1e6;
  return `${mb.toFixed(0)}MB`;
}

export function ModelSelector() {
  const { availableModels, setAvailableModels, updateSetting, settings } = useAppStore();

  useEffect(() => {
    fetchModels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.ollama_url]);

  async function fetchModels() {
    try {
      const models = inTauri ? await getModels() : [];
      setAvailableModels(models.map((m) => ({
        name: m.name,
        size: m.size,
        family: m.details?.family ?? "",
      })));
    } catch {
      // Ollama not running — show placeholder
    }
  }

  return (
    <Select.Root value={settings.chat_model} onValueChange={(value) => updateSetting("chat_model", value)}>
      <Select.Trigger
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs",
          "bg-secondary border border-border text-foreground",
          "hover:bg-accent transition-colors outline-none",
          "data-[placeholder]:text-muted-foreground"
        )}
      >
        <Cpu className="w-3.5 h-3.5 text-primary" />
        <Select.Value placeholder="Select model…" />
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-[200px] rounded-md border border-border bg-popover shadow-lg"
        >
          <Select.Viewport className="p-1">
            {availableModels.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No models found — is Ollama running?
              </div>
            ) : (
              availableModels.map((model) => (
                <Select.Item
                  key={model.name}
                  value={model.name}
                  className={cn(
                    "flex items-center justify-between gap-4 px-3 py-2 rounded-sm text-xs cursor-pointer",
                    "text-foreground hover:bg-accent outline-none",
                    "data-[highlighted]:bg-accent"
                  )}
                >
                  <Select.ItemText>{model.name}</Select.ItemText>
                  <span className="text-muted-foreground shrink-0">{formatSize(model.size)}</span>
                </Select.Item>
              ))
            )}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

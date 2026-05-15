import { useEffect } from "react";
import { FileText, CheckCircle, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface IngestJob {
  docId: string;
  filename: string;
  stage: string;
  current: number;
  total: number;
  status: "running" | "done" | "error";
  errorMessage?: string;
  chunkCount?: number;
}

interface Props {
  jobs: IngestJob[];
  onDismiss: (docId: string) => void;
}

function JobToast({ job, onDismiss }: { job: IngestJob; onDismiss: () => void }) {
  // Auto-dismiss completed jobs after 4s
  useEffect(() => {
    if (job.status === "done") {
      const t = setTimeout(onDismiss, 4000);
      return () => clearTimeout(t);
    }
  }, [job.status, onDismiss]);

  const progress =
    job.total > 0 ? Math.round((job.current / job.total) * 100) : null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border shadow-lg w-72 text-sm",
        "bg-card border-border animate-in slide-in-from-bottom-2"
      )}
    >
      <div className="shrink-0 mt-0.5">
        {job.status === "done" && <CheckCircle className="w-4 h-4 text-green-500" />}
        {job.status === "error" && <XCircle className="w-4 h-4 text-destructive" />}
        {job.status === "running" && (
          <FileText className="w-4 h-4 text-primary animate-pulse" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{job.filename}</p>
        {job.status === "running" && (
          <>
            <p className="text-xs text-muted-foreground mt-0.5">{job.stage}</p>
            {progress !== null && (
              <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </>
        )}
        {job.status === "done" && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {job.chunkCount} chunks indexed · {job.filename}
          </p>
        )}
        {job.status === "error" && (
          <p className="text-xs text-destructive mt-0.5">{job.errorMessage}</p>
        )}
      </div>

      <button
        onClick={onDismiss}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function IngestToastStack({ jobs, onDismiss }: Props) {
  if (jobs.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {jobs.map((job) => (
        <JobToast key={job.docId} job={job} onDismiss={() => onDismiss(job.docId)} />
      ))}
    </div>
  );
}

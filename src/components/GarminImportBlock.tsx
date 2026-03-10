import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useIntervalsIntegration } from "@/hooks/useIntervalsIntegration";
import { importGarminZip, importGarminZipServer, importGarminFolder, type ImportResult } from "@/lib/garmin-import";
import { setGarminLastImport, clearGarminLastImport, useGarminLastImportTs, useGarminLastImportResult, formatLastImport } from "@/hooks/useGarminImportStatus";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Loader2, RotateCcw, LayoutDashboard, BarChart3 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

async function readDirRecursive(entry: FileSystemDirectoryEntry, basePath = ""): Promise<Array<{ file: File; path: string }>> {
  const results: Array<{ file: File; path: string }> = [];
  const reader = entry.createReader();
  let batch: FileSystemEntry[];
  do {
    batch = await new Promise((resolve) => reader.readEntries(resolve));
    for (const e of batch) {
      const path = basePath ? `${basePath}/${e.name}` : e.name;
      if (e.isFile) {
        const file = await new Promise<File>((resolve) => (e as FileSystemFileEntry).file(resolve));
        results.push({ file, path });
      } else if (e.isDirectory) {
        results.push(...(await readDirRecursive(e as FileSystemDirectoryEntry, path)));
      }
    }
  } while (batch.length > 0);
  return results;
}

async function getFilesFromDrop(dataTransfer: DataTransfer): Promise<{
  files: Array<File | { file: File; path: string }>;
  fileCount: number;
  folderCount: number;
}> {
  const items = Array.from(dataTransfer.items);
  const files: Array<File | { file: File; path: string }> = [];
  let folderCount = 0;
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (!entry) {
      const file = item.getAsFile();
      if (file) files.push(file);
      continue;
    }
    if (entry.isFile) {
      const file = await new Promise<File>((resolve) => (entry as FileSystemFileEntry).file(resolve));
      files.push(file);
    } else if (entry.isDirectory) {
      folderCount++;
      const dirFiles = await readDirRecursive(entry as FileSystemDirectoryEntry, entry.name);
      files.push(...dirFiles);
    }
  }
  return { files, fileCount: files.length, folderCount };
}

export function GarminImportBlock() {
  const { user } = useAuth();
  const { isConnected } = useIntervalsIntegration();
  const lastImportTs = useGarminLastImportTs();
  const persistedResult = useGarminLastImportResult();
  const queryClient = useQueryClient();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [dropCounts, setDropCounts] = useState<{ files: number; folders: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const reimportGarmin = useCallback(async () => {
    if (!user) return;
    if (!confirm("Clear Garmin activities (wrong dates) so you can re-import with correct dates? Drop your Garmin export again after this. intervals.icu data will be kept.")) return;
    try {
      const { error } = await supabase.from("activity").delete().eq("user_id", user.id).eq("source", "garmin");
      if (error) throw error;
      setLastResult(null);
      setDropCounts(null);
      setImportError(null);
      clearGarminLastImport();
      queryClient.invalidateQueries({ queryKey: ["activities"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["activityCount"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["weekStats"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["intervals-activities-chunked"], refetchType: "all" });
      toast.success("Garmin activities cleared. Drop your export again to re-import with correct dates.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear");
    }
  }, [user, queryClient]);

  const resetDropper = useCallback(async () => {
    if (!user) return;
    const msg = isConnected
      ? "Clear imported Garmin data so you can retry? intervals.icu data (activities, HRV, wellness) will be kept."
      : "Clear imported Garmin data so you can retry the import?";
    if (!confirm(msg)) return;
    try {
      await supabase.from("activity").delete().eq("user_id", user.id);
      await supabase.from("daily_readiness").delete().eq("user_id", user.id);
      setLastResult(null);
      setDropCounts(null);
      setImportError(null);
      clearGarminLastImport();
      queryClient.invalidateQueries({ queryKey: ["activities"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["daily_readiness"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["activityCount"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["weekStats"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["intervals-activities-chunked"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["intervals-data"], refetchType: "all" });
      toast.success("Garmin data cleared. Drop a new export to retry.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset");
    }
  }, [user, queryClient, isConnected]);

  const runImport = useCallback(
    async (result: ImportResult) => {
      setLastResult(result);
      setGarminLastImport({ activitiesCount: result.activitiesCount, readinessDaysCount: result.readinessDaysCount });
      queryClient.invalidateQueries({ queryKey: ["activities"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["daily_readiness"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["activityCount"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["weekStats"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["athlete_profile"], refetchType: "all" });
      if (result.activitiesCount > 0 || result.readinessDaysCount > 0) {
        const runs = result.activitiesCount;
        const wellness = result.readinessDaysCount;
        toast.success(`Imported ${runs} run${runs !== 1 ? "s" : ""}, ${wellness} day${wellness !== 1 ? "s" : ""} of wellness → check Dashboard & Stats`);
      } else {
        const filesMsg =
          result.filesProcessed != null
            ? `Processed ${result.filesProcessed} file${result.filesProcessed !== 1 ? "s" : ""}`
            : "";
        const jsonHint =
          result.jsonProcessed != null && result.jsonProcessed > 0
            ? ` (${result.jsonProcessed} JSON). Garmin exports mostly JSON—we support Activity Summary format and FIT files. Try the full export ZIP from Garmin Connect.`
            : ".";
        toast.error(
          filesMsg
            ? `No activities or wellness data imported. ${filesMsg}${jsonHint} Open browser console (F12) for details.`
            : "No activities or wellness data imported. Drop the full Garmin export ZIP or DI_CONNECT folder."
        );
      }
    },
    [queryClient]
  );

  const handleZipFiles = useCallback(
    async (files: FileList | null) => {
      if (!user || !files?.length) return;
      const file = files[0];
      if (!file?.name.toLowerCase().endsWith(".zip")) return;
      setDropCounts({ files: files.length, folders: 0 });
      setIsImporting(true);
      setProgress("Uploading ZIP...");
      setProgressPct(0);
      setLastResult(null);
      setImportError(null);
      try {
        let result: ImportResult;
        try {
          result = await importGarminZipServer(file, user.id, (msg, pct) => {
            setProgress(msg);
            setProgressPct(pct ?? null);
          });
        } catch (serverErr) {
          setProgress("Trying browser extraction...");
          result = await importGarminZip(file, user.id, (msg, pct) => {
            setProgress(msg);
            setProgressPct(pct ?? null);
          });
        }
        await runImport(result);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Import failed";
        setImportError(errMsg);
        toast.error(errMsg);
      } finally {
        setIsImporting(false);
        setProgress(null);
        setProgressPct(null);
      }
    },
    [user, runImport]
  );

  const handleFolderFiles = useCallback(
    async (files: FileList | null) => {
      if (!user || !files?.length) return;
      const fileList = Array.from(files);
      const hasPaths = fileList.some((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath);
      console.log("[Garmin] Folder files:", fileList.length, "paths:", hasPaths, "sample:", (fileList[0] as File & { webkitRelativePath?: string })?.webkitRelativePath);
      setDropCounts({ files: fileList.length, folders: 1 });
      setIsImporting(true);
      setProgress("Reading files...");
      setProgressPct(0);
      setLastResult(null);
      setImportError(null);
      try {
        const result = await importGarminFolder(fileList, user.id, (msg, pct) => {
          setProgress(msg);
          setProgressPct(pct ?? null);
        });
        await runImport(result);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Import failed";
        setImportError(errMsg);
        toast.error(errMsg);
      } finally {
        setIsImporting(false);
        setProgress(null);
        setProgressPct(null);
      }
    },
    [user, runImport]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (!user) return;
      const { files, fileCount, folderCount } = await getFilesFromDrop(e.dataTransfer);
      console.log("[Garmin] Drop:", fileCount, "files,", folderCount, "folders, sample path:", (files[0] as { path?: string })?.path ?? (files[0] as File)?.name);
      if (!files.length) {
        toast.error("No files received. Folder drag may not work in your browser. Try: 1) Drop the original ZIP, or 2) Right‑click folder → Compress → drop the .zip");
        return;
      }
      setDropCounts({ files: fileCount, folders: folderCount });
      const singleZip = files.length === 1 && files[0] instanceof File && (files[0] as File).name.toLowerCase().endsWith(".zip");
      if (singleZip) {
        const dt = new DataTransfer();
        dt.items.add(files[0] as File);
        handleZipFiles(dt.files);
        return;
      }
      const hasFolderFiles = files.some((f) => typeof f === "object" && "path" in f);
      if (hasFolderFiles || files.length > 1) {
        setIsImporting(true);
        setProgress("Reading files...");
        setProgressPct(0);
        setLastResult(null);
        try {
          const result = await importGarminFolder(files, user.id, (msg, pct) => {
            setProgress(msg);
            setProgressPct(pct ?? null);
          });
          await runImport(result);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Import failed");
        } finally {
          setIsImporting(false);
          setProgress(null);
          setProgressPct(null);
        }
        return;
      }
      if (files[0] instanceof File && (files[0] as File).name.toLowerCase().endsWith(".zip")) {
        const dt = new DataTransfer();
        dt.items.add(files[0] as File);
        handleZipFiles(dt.files);
      }
    },
    [user, handleZipFiles, runImport]
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const hasFiles = Array.from(e.dataTransfer.items).some((i) => i.kind === "file");
    if (hasFiles) {
      e.dataTransfer.dropEffect = "copy";
      setIsDragging(true);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const hasFiles = Array.from(e.dataTransfer.items).some((i) => i.kind === "file");
    if (hasFiles) e.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }, []);

  const onZipInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleZipFiles(e.target.files);
      e.target.value = "";
    },
    [handleZipFiles]
  );

  const onFolderInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFolderFiles(e.target.files);
      e.target.value = "";
    },
    [handleFolderFiles]
  );

  const triggerFolderInput = () => folderInputRef.current?.click();
  const triggerZipInput = () => zipInputRef.current?.click();

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onDrop={onDrop}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          triggerZipInput();
        }}
        onKeyDown={(e) => e.key === "Enter" && triggerZipInput()}
        className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-border bg-secondary/30"
        } ${isImporting ? "pointer-events-none opacity-80" : "cursor-pointer"}`}
      >
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,.json,.csv,.fit,application/json,application/zip,text/csv,*/*"
          multiple
          onChange={onZipInput}
          disabled={!user || isImporting}
          className="sr-only"
          tabIndex={-1}
        />
        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={onFolderInput}
          disabled={!user || isImporting}
          className="sr-only"
        />
        {isImporting ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">{progress ?? "Importing..."}</p>
            {progressPct != null && (
              <div className="w-full max-w-xs h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>
        ) : lastResult || dropCounts || persistedResult ? (
          <div className="space-y-2">
            {(lastResult || persistedResult) && (
              <>
                <p className="text-sm font-medium text-foreground">
                  Imported {(lastResult ?? persistedResult)!.activitiesCount} run
                  {(lastResult ?? persistedResult)!.activitiesCount !== 1 ? "s" : ""},{" "}
                  {(lastResult ?? persistedResult)!.readinessDaysCount} day
                  {(lastResult ?? persistedResult)!.readinessDaysCount !== 1 ? "s" : ""} of wellness data
                </p>
                {((lastResult ?? persistedResult)!.activitiesCount > 0 || (lastResult ?? persistedResult)!.readinessDaysCount > 0) && (
                  <div className="flex items-center justify-center gap-4 pt-1">
                    <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                      <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
                    </Link>
                    <Link to="/stats" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                      <BarChart3 className="h-3.5 w-3.5" /> Stats
                    </Link>
                  </div>
                )}
                {(lastResult ?? persistedResult)!.activitiesCount === 0 && ((lastResult ?? persistedResult)!.readinessDaysCount ?? 0) > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    Wellness imported but no runs. Try dropping a ZIP (with DI-Connect-Fitness inside) instead of a folder, or ensure your export includes summarizedActivitiesExport JSON or FIT files.
                  </p>
                )}
                {(lastResult ?? persistedResult)!.activitiesCount === 0 && (lastResult ?? persistedResult)!.readinessDaysCount === 0 && (lastResult as ImportResult)?.samplePaths?.length && (
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    Found {(lastResult as ImportResult).samplePaths!.length} JSON files but none had activity data. Ensure DI-Connect-Fitness with summarizedActivitiesExport or FIT files is included.
                  </p>
                )}
              </>
            )}
            {dropCounts && (
              <p className="text-xs text-muted-foreground">
                {dropCounts.files} file{dropCounts.files !== 1 ? "s" : ""}
                {dropCounts.folders > 0 && `, ${dropCounts.folders} folder${dropCounts.folders !== 1 ? "s" : ""}`} dropped
              </p>
            )}
            {importError && (
              <p className="text-xs text-amber-600 dark:text-amber-500">{importError}</p>
            )}
            {!lastResult && !persistedResult && (
              <p className="text-xs text-muted-foreground pt-1">Drop another ZIP or folder to import</p>
            )}
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Drop Garmin activity & wellness data
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              We need: <strong>DI-Connect-Fitness</strong> (runs), <strong>DI-Connect-Wellness</strong> (sleep/HRV), and <strong>DI-Connect-Metrics</strong> (training load, VO2max). Unzip your export, drag those three folders into a new ZIP, then drop it here.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Or click to upload ZIP ·{" "}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerFolderInput();
                }}
                className="text-primary hover:underline"
              >
                select folder
              </button>
            </p>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-muted-foreground">
          For best results: unzip your Garmin export, select <strong>DI-Connect-Fitness</strong>, <strong>DI-Connect-Wellness</strong>, and <strong>DI-Connect-Metrics</strong>, right‑click → Compress, then drop that ZIP. Skip Profiles, Social, etc. if you want a smaller file.
          {lastImportTs != null && (
            <span className="ml-1">· Last import: {formatLastImport(lastImportTs)}</span>
          )}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={reimportGarmin}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Re-import
          </button>
          <button
            type="button"
            onClick={resetDropper}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

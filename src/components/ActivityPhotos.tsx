import { useState, useRef } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type PhotoEntry = { url: string; path?: string };

export function ActivityPhotos({
  activityId,
  photos,
  userId,
  onUpdate,
}: {
  activityId: string | undefined;
  photos: PhotoEntry[];
  userId: string | undefined;
  onUpdate: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !activityId || !userId) return;

    setUploading(true);
    try {
      const existing = Array.isArray(photos) ? photos : [];
      const newEntries: PhotoEntry[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;

        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/${activityId}/${Date.now()}_${i}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("activity-photos")
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadErr) {
          const msg = uploadErr.message?.includes("Bucket") || uploadErr.message?.includes("bucket")
            ? `${uploadErr.message} Run migrations: supabase db push`
            : uploadErr.message;
          toast({ title: "Upload failed", description: msg, variant: "destructive" });
          continue;
        }

        const { data: urlData } = supabase.storage.from("activity-photos").getPublicUrl(path);
        newEntries.push({ url: urlData.publicUrl, path });
      }

      if (newEntries.length === 0) {
        setUploading(false);
        return;
      }

      const updated = [...existing, ...newEntries];
      const { error: updateErr } = await supabase
        .from("activity")
        .update({ photos: updated })
        .eq("id", activityId)
        .eq("user_id", userId);

      if (updateErr) {
        const hint = /column.*photos|does not exist/i.test(updateErr.message ?? "")
          ? " Run migrations: supabase db push"
          : "";
        toast({ title: "Failed to save photos", description: `${updateErr.message}${hint}`, variant: "destructive" });
        return;
      }

      onUpdate();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (path: string | undefined, url: string) => {
    if (!activityId || !userId) return;
    if (!path) {
      const updated = photos.filter((p) => p.url !== url);
      const { error } = await supabase
        .from("activity")
        .update({ photos: updated })
        .eq("id", activityId)
        .eq("user_id", userId);
      if (!error) onUpdate();
      return;
    }

    setDeleting(path);
    try {
      await supabase.storage.from("activity-photos").remove([path]);
      const updated = photos.filter((p) => p.path !== path && p.url !== url);
      const { error } = await supabase
        .from("activity")
        .update({ photos: updated })
        .eq("id", activityId)
        .eq("user_id", userId);
      if (!error) onUpdate();
    } catch {
      toast({ title: "Failed to delete photo", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const list = Array.isArray(photos) ? photos : [];

  return (
    <div className="card-standard space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImagePlus className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Photos</span>
        </div>
        {userId && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={uploading || !activityId}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || !activityId}
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
              )}
              Add photos
            </Button>
          </>
        )}
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add photos from your run to share with friends.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {list.map((p, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
              <img
                src={p.url}
                alt=""
                className="w-full h-full object-cover"
              />
              {userId && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(p.path, p.url); }}
                  disabled={deleting === p.path}
                  title="Remove photo"
                  className="absolute top-0 right-0 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90 transition-colors"
                >
                  {deleting === p.path ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

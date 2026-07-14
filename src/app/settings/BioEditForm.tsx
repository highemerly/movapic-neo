"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { toastSaved, toastSettingsError } from "./settingsToast";

const BIO_MAX_LENGTH = 40;
const SAVE_DEBOUNCE_MS = 800;

interface BioEditFormProps {
  initialBio: string | null;
}

export function BioEditForm({ initialBio }: BioEditFormProps) {
  const router = useRouter();
  const [bio, setBio] = useState(initialBio ?? "");

  const savedBioRef = useRef(initialBio ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOverLimit = bio.length > BIO_MAX_LENGTH;

  useEffect(() => {
    if (bio === savedBioRef.current) return;
    if (isOverLimit) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const response = await fetch("/api/v1/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bio }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "保存に失敗しました");
        }
        savedBioRef.current = bio;
        toastSaved("settings-bio");
        router.refresh();
      } catch (err) {
        toastSettingsError(err instanceof Error ? err.message : "保存に失敗しました");
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bio, isOverLimit, router]);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Label htmlFor="bio-input">プロフィール</Label>
          {isOverLimit && (
            <span className="text-xs text-destructive truncate">{BIO_MAX_LENGTH}文字以内で入力してください</span>
          )}
        </div>
        <span className={`text-xs flex-shrink-0 ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}>
          {bio.length}/{BIO_MAX_LENGTH}
        </span>
      </div>
      <Input
        id="bio-input"
        type="text"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="プロフィールを入力"
        maxLength={BIO_MAX_LENGTH + 10}
      />
    </div>
  );
}

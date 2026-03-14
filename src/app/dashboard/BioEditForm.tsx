"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

const BIO_MAX_LENGTH = 40;

interface BioEditFormProps {
  initialBio: string | null;
}

export function BioEditForm({ initialBio }: BioEditFormProps) {
  const router = useRouter();
  const [bio, setBio] = useState(initialBio ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasChanges = bio !== (initialBio ?? "");
  const isOverLimit = bio.length > BIO_MAX_LENGTH;

  const handleSave = async () => {
    if (isOverLimit) return;

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bio }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "保存に失敗しました");
      }

      setSuccess(true);
      router.refresh();
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="text"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="プロフィールを入力"
          maxLength={BIO_MAX_LENGTH + 10}
          className="flex-1"
        />
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isOverLimit || isSaving}
          size="sm"
        >
          {isSaving ? "保存中..." : "保存"}
        </Button>
      </div>
      <div className="flex justify-between text-xs">
        <span>
          {error && <span className="text-destructive">{error}</span>}
          {success && <span className="text-green-600">保存しました</span>}
        </span>
        <span className={isOverLimit ? "text-destructive" : "text-muted-foreground"}>
          {bio.length}/{BIO_MAX_LENGTH}
        </span>
      </div>
    </div>
  );
}

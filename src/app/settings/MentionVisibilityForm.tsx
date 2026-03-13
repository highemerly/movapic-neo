"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const VISIBILITY_OPTIONS = [
  { value: "public", label: "公開", description: "公開投稿としてFediverseに投稿" },
  { value: "unlisted", label: "非収載", description: "非収載としてFediverseに投稿（ローカルTLには表示されない）" },
  { value: "local", label: "このサービスのみ", description: "Fediverseには投稿せず、このサービスにのみ保存" },
] as const;

type Visibility = typeof VISIBILITY_OPTIONS[number]["value"];

interface MentionVisibilityFormProps {
  initialVisibility: Visibility;
}

export function MentionVisibilityForm({ initialVisibility }: MentionVisibilityFormProps) {
  const router = useRouter();
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasChanges = visibility !== initialVisibility;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mentionVisibility: visibility }),
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
    <div className="space-y-4">
      <div className="space-y-2">
        {VISIBILITY_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              visibility === option.value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <input
              type="radio"
              name="mentionVisibility"
              value={option.value}
              checked={visibility === option.value}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="font-medium">{option.label}</div>
              <div className="text-xs text-muted-foreground">{option.description}</div>
            </div>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          size="sm"
        >
          {isSaving ? "保存中..." : "保存"}
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
        {success && <span className="text-sm text-green-600">保存しました</span>}
      </div>
    </div>
  );
}

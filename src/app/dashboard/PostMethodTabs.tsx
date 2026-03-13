"use client";

import { useState, ReactNode } from "react";
import Link from "next/link";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PostMethodTabsProps {
  instanceDomain: string;
  mentionSettingsContent: ReactNode;
  emailSettingsContent: ReactNode;
}

type TabId = "web" | "mention" | "email";

export function PostMethodTabs({
  instanceDomain,
  mentionSettingsContent,
  emailSettingsContent,
}: PostMethodTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("web");

  const tabs: { id: TabId; label: string }[] = [
    { id: "web", label: "Webから" },
    { id: "mention", label: `${instanceDomain}から` },
    { id: "email", label: "メールから" },
  ];

  return (
    <div className="space-y-4">
      {/* タブボタン */}
      <div className="flex border-b-2 border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-primary text-primary bg-primary/5 -mb-[2px]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      <div className="pt-2">
        {activeTab === "web" && (
          <div className="py-4">
            <Link href="/create">
              <Button className="w-full h-auto py-4 flex flex-col gap-2" size="lg">
                <ImagePlus className="h-6 w-6" />
                <span>写真を投稿する</span>
              </Button>
            </Link>
          </div>
        )}

        {activeTab === "mention" && (
          <div>{mentionSettingsContent}</div>
        )}

        {activeTab === "email" && (
          <div>{emailSettingsContent}</div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, ReactNode, ReactElement } from "react";
import Link from "next/link";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";

interface PostMethodTabsProps {
  instanceDomain: string;
  instanceType: string;
  mentionSettingsContent: ReactNode;
  emailSettingsContent: ReactNode;
}

type TabId = "web" | "mention" | "email";

export function PostMethodTabs({
  instanceDomain: _instanceDomain,
  instanceType,
  mentionSettingsContent,
  emailSettingsContent,
}: PostMethodTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("web");

  const InstanceIcon = instanceType === "misskey" ? MisskeyIcon : MastodonIcon;

  const tabs: { id: TabId; label: ReactElement | string }[] = [
    { id: "web", label: "Webから" },
    {
      id: "mention",
      label: (
        <span className="inline-flex items-center justify-center gap-1">
          <InstanceIcon className="w-3.5 h-3.5" />
          から
        </span>
      ),
    },
    { id: "email", label: "メールから" },
  ];

  return (
    <div className="space-y-3">
      {/* タブボタン */}
      <div className="flex border-b-2 border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
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
      <div>
        {activeTab === "web" && (
          <Link href="/create">
            <Button className="w-full h-auto py-2 flex flex-col gap-0.5" size="lg">
              <ImagePlus className="h-6 w-6" />
              <span>写真をアップロード</span>
            </Button>
          </Link>
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

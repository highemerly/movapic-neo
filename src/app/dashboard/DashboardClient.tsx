"use client";

import { useState } from "react";
import { ImageGrid } from "@/components/gallery/ImageGrid";

interface Image {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  overlayText: string;
  createdAt: string;
}

interface DashboardClientProps {
  initialImages: Image[];
  publicUrl: string;
}

export function DashboardClient({ initialImages, publicUrl }: DashboardClientProps) {
  const [images, setImages] = useState(initialImages);

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/v1/images/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete image");
      }

      setImages((prev) => prev.filter((img) => img.id !== id));
    } catch (error) {
      console.error("Delete error:", error);
      alert("画像の削除に失敗しました");
    }
  };

  return (
    <ImageGrid
      images={images}
      publicUrl={publicUrl}
      showDelete
      onDelete={handleDelete}
    />
  );
}

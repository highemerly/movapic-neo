import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { MissingUserProfile } from "./MissingUserProfile";

/**
 * 存在しないユーザーページ（/u/[username] とその配下タブ）の404。
 * 画像詳細の404（status/[imageId]/not-found.tsx）が画像詳細の体裁を保つのと同じく、
 * ここはユーザーページの体裁（見出し＋タブ＋本文）のまま中身を404にする。
 */
export default function UserNotFound() {
  return (
    <>
      <SiteHeader user={null} />
      {/* 実在ユーザーのページ（page.tsx）と同じコンテナ幅・余白 */}
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-6xl overflow-x-clip">
        <MissingUserProfile />
        <Footer />
      </div>
    </>
  );
}

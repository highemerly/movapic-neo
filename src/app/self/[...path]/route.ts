import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { userPathSegment } from "@/lib/userHandle";

// /self/* へのアクセスを /u/[username]/* にリダイレクト
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  const { path } = await params;
  const targetPath = path.join("/");
  redirect(`/u/${userPathSegment(user.username, user.instance.domain)}/${targetPath}`);
}

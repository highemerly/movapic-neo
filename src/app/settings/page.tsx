import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/?reason=login_required&returnTo=%2Fsettings");
  }
  redirect("/dashboard");
}

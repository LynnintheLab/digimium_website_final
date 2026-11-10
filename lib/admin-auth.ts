import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";
import { chatGPTSignInPath, getChatGPTUser, type ChatGPTUser } from "../app/chatgpt-auth";
import { authorizeAdmin, type AdminCheck } from "./admin-auth-policy";

export async function checkAdmin(): Promise<AdminCheck> {
  return authorizeAdmin(await getChatGPTUser(), env.ADMIN_EMAILS);
}

export async function requireAdminPage(): Promise<ChatGPTUser> {
  const result = await checkAdmin();
  if (result.ok) return result.user;
  if (result.status === 401) redirect(chatGPTSignInPath("/admin"));
  redirect("/?admin=unauthorized");
}

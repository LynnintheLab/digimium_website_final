import { redirect } from "next/navigation";
import * as auth from "@digimium/auth";
import type { ChatGPTUser } from "../app/chatgpt-auth";
import type { AdminCheck } from "./admin-auth-policy";

export const { emailCodeLogin, signInPath, signOutPath, isAllowedMutation, createSession, endSession } = auth;
export const checkAdmin: () => Promise<AdminCheck> = auth.checkAdmin;

export async function requireAdminPage(): Promise<ChatGPTUser> {
  const result = await checkAdmin();
  if (result.ok) return result.user;
  if (result.status === 401) redirect(signInPath);
  if (result.status === 503) redirect("/admin/login?error=unavailable");
  redirect("/?admin=unauthorized");
}

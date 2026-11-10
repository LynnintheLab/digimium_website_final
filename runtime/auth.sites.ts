import { env } from "cloudflare:workers";
import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "../app/chatgpt-auth";
import { authorizeAdmin, isSameOriginMutation } from "../lib/admin-auth-policy";

export const passwordLogin: boolean = false;
export const signInPath = chatGPTSignInPath("/admin");
export const signOutPath = chatGPTSignOutPath("/");
export const isAllowedMutation = isSameOriginMutation;

export async function checkAdmin() {
  return authorizeAdmin(await getChatGPTUser(), env.ADMIN_EMAILS);
}

export async function createSession(_request: Request) {
  return new Response(null, { status: 404 });
}
export async function endSession(_request: Request) {
  return new Response(null, { status: 404 });
}

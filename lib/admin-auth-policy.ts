import type { ChatGPTUser } from "../app/chatgpt-auth";

export type AdminCheck =
  | { ok: true; user: ChatGPTUser }
  | { ok: false; status: 401 | 403 | 503; message: string };

export function authorizeAdmin(user: ChatGPTUser | null, adminEmails: string | undefined): AdminCheck {
  if (!user) return { ok: false, status: 401, message: "Sign in to manage the catalog." };

  const allowedEmails = new Set(
    (adminEmails ?? "").split(/[,\n]/).map((email) => email.trim().toLowerCase()).filter(Boolean),
  );
  const email = user.email.trim().toLowerCase();
  if (!email || !allowedEmails.has(email)) {
    return { ok: false, status: 403, message: "This account does not have catalog access." };
  }
  return { ok: true, user };
}

export function isSameOriginMutation(request: Request, expectedOrigin: string = new URL(request.url).origin): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin !== expectedOrigin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

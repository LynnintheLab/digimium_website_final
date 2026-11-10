import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { passwordLogin, signInPath } from "@/lib/admin-auth";
import "./login.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin sign in — digimium.",
  robots: { index: false, follow: false },
};

const errors: Record<string, string> = {
  credentials: "The email or password is incorrect.",
  retry: "Too many sign-in attempts. Try again in five minutes.",
  unavailable: "Admin sign-in is temporarily unavailable.",
};

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  if (!passwordLogin) redirect(signInPath);
  const { error } = await searchParams;
  const message = typeof error === "string" && Object.hasOwn(errors, error) ? errors[error] : undefined;
  return <main className="admin-login">
    <section aria-labelledby="login-title">
      <a href="/" aria-label="Digimium storefront"><img src="/assets/logo.png" alt="Digimium" width="142" /></a>
      <h1 id="login-title">Admin sign in</h1>
      <form action="/admin/session" method="post">
        <label>Email<input name="email" type="email" autoComplete="username" autoCapitalize="none" required maxLength={254} /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>
        {message && <p role="alert">{message}</p>}
        <button type="submit">Sign in</button>
      </form>
    </section>
  </main>;
}

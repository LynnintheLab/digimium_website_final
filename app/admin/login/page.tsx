import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { checkAdmin, emailCodeLogin, signInPath } from "@/lib/admin-auth";
import "./login.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin sign in — digimium.",
  robots: { index: false, follow: false },
};

const errors: Record<string, string> = {
  code: "That code didn’t match. Check the six digits and try again.",
  expired: "That code has expired or has already been used. Request a new one.",
  retry: "Wait a minute before requesting another code. After five emails, try again in an hour.",
  delivery: "We couldn’t send the email. Please try again in a minute.",
  unavailable: "Admin sign-in is temporarily unavailable. Please try again later.",
};

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string; step?: string }>;
}) {
  if (!emailCodeLogin) redirect(signInPath);
  if ((await checkAdmin()).ok) redirect("/admin");

  const { error, step } = await searchParams;
  const verify = step === "verify";
  const message = typeof error === "string" && Object.hasOwn(errors, error) ? errors[error] : undefined;

  return (
    <main className="admin-login">
      <section aria-labelledby="login-title">
        <Link href="/" aria-label="Digimium storefront" prefetch={false}>
          <Image src="/assets/logo.png" alt="Digimium" width={142} height={48} unoptimized />
        </Link>
        <h1 id="login-title">{verify ? "Check your email" : "Admin sign in"}</h1>
        <p className="login-help" id="login-help">
          {verify
            ? "Enter the code from your admin inbox. It’s valid for 10 minutes in this browser."
            : "Get a one-time code by email. This browser will remember you for up to 180 days."}
        </p>
        <form action="/admin/session" method="post" aria-describedby="login-help">
          <input type="hidden" name="action" value={verify ? "verify" : "request"} />
          {verify ? (
            <label>
              Six-digit code
              <input name="code" type="text" inputMode="numeric" pattern="[0-9]{6}"
                maxLength={6} autoComplete="one-time-code" spellCheck={false} dir="ltr" required />
            </label>
          ) : (
            <label>
              Admin email
              <input name="email" type="email" autoComplete="email"
                autoCapitalize="none" spellCheck={false} maxLength={254} required />
            </label>
          )}
          {message && <p role="alert">{message}</p>}
          <button type="submit">{verify ? "Verify and sign in" : "Email me a code"}</button>
        </form>
        {verify && (
          <div className="login-actions">
            <form action="/admin/session" method="post">
              <input type="hidden" name="action" value="request" />
              <button type="submit">Send a new code</button>
            </form>
            <a href={signInPath}>Change email</a>
          </div>
        )}
      </section>
    </main>
  );
}

import { commerceEnabled } from "@/lib/commerce-enabled";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  const { customerSession } = await import("@/hostinger/customer-auth");
  return customerSession(request);
}

export { handle as GET, handle as POST, handle as DELETE };

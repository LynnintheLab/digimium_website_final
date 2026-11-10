import { checkAdmin, isAllowedMutation } from "../../../../lib/admin-auth";
import { LogoInputError, readLogoBody, storeLogo } from "../../../../lib/logo-storage";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const errorResponse = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function POST(request: Request) {
  const admin = await checkAdmin();
  if (!admin.ok) return errorResponse(admin.message, admin.status);
  if (!isAllowedMutation(request)) return errorResponse("Logo uploads must come from this website.", 403);
  const mime = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!mime || !["image/png", "image/jpeg", "image/webp"].includes(mime)) return errorResponse("Choose a PNG, JPEG, or WebP image.", 415);
  try {
    const path = await storeLogo(await readLogoBody(request), mime);
    return Response.json({ path }, { status: 201, headers });
  } catch (error) {
    if (error instanceof LogoInputError) return errorResponse(error.message, error.status);
    console.error("Logo upload failed", error);
    return errorResponse("The logo could not be saved. Please try again shortly.", 503);
  }
}

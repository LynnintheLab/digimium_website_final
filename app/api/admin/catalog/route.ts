import { checkAdmin, isAllowedMutation } from "../../../../lib/admin-auth";
import { CatalogConflictError, getCatalog, saveCatalog } from "../../../../lib/catalog-store";
import { MAX_CATALOG_BYTES, saveCatalogSchema } from "../../../../lib/catalog-validation";
import { LogoInputError, validateLogoReferences } from "../../../../lib/logo-storage";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: privateHeaders });
}

export async function GET() {
  const admin = await checkAdmin();
  if (!admin.ok) return errorResponse(admin.message, admin.status);
  try {
    return Response.json(await getCatalog(), { headers: privateHeaders });
  } catch (error) {
    console.error("Admin catalog read failed", error);
    return errorResponse("The catalog is temporarily unavailable. Please try again shortly.", 503);
  }
}

export async function PUT(request: Request) {
  const admin = await checkAdmin();
  if (!admin.ok) return errorResponse(admin.message, admin.status);
  if (!isAllowedMutation(request)) return errorResponse("Catalog updates must come from this website.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return errorResponse("Send catalog changes as JSON.", 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_CATALOG_BYTES) return errorResponse("The catalog is too large.", 413);

  let payload: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return errorResponse("The request body must contain valid JSON.", 400);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "";
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_CATALOG_BYTES) {
          await reader.cancel();
          return errorResponse("The catalog is too large.", 413);
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    payload = JSON.parse(text);
  } catch {
    return errorResponse("The request body must contain valid JSON.", 400);
  }

  const parsed = saveCatalogSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Some catalog details need attention.", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400, headers: privateHeaders });
  }
  try {
    await validateLogoReferences(parsed.data.products);
    return Response.json(await saveCatalog(parsed.data), { headers: privateHeaders });
  } catch (error) {
    if (error instanceof CatalogConflictError) return errorResponse(error.message, 409);
    if (error instanceof LogoInputError) return errorResponse(error.message, error.status);
    console.error("Catalog save failed", error);
    return errorResponse("The catalog could not be saved. Please try again shortly.", 503);
  }
}

import { getPublicCatalog } from "../../../lib/catalog-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getPublicCatalog(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Public catalog read failed", error);
    return Response.json({ error: "The catalog is temporarily unavailable. Please try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } });
  }
}

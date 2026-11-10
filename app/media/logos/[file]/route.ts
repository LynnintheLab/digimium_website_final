import { LOGO_FILE_PATTERN } from "../../../../lib/logo-path";
import { getLogo, logoContentType } from "../../../../lib/logo-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!LOGO_FILE_PATTERN.test(file)) return new Response("Logo not found.", { status: 404 });
  try {
    const object = await getLogo(file);
    if (!object) return new Response("Logo not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
    const headers = {
      "Content-Type": logoContentType(file),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": `inline; filename="${file}"`,
      "Cross-Origin-Resource-Policy": "same-origin",
      ETag: object.httpEtag,
    };
    if (request.headers.get("if-none-match") === object.httpEtag) return new Response(null, { status: 304, headers });
    return new Response(object.body, { headers: { ...headers, "Content-Length": String(object.size) } });
  } catch (error) {
    console.error("Logo read failed", error);
    return new Response("Logo temporarily unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

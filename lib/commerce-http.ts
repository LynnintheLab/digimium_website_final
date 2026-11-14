export class CommerceError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function commerceJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
}

export function commerceErrorResponse(error: unknown) {
  if (error instanceof CommerceError) return commerceJson({ error: error.message }, error.status);
  // Driver errors may contain bound data. Never pass them through to logs or responses.
  return commerceJson({ error: 'Orders are temporarily unavailable. Please try again.' }, 503);
}

export async function readCommerceJson(request: Request, limit: number): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new CommerceError(415, 'Send the order as JSON.');
  }
  const tooLarge = () => new CommerceError(413, 'The order is too large.');
  if (Number(request.headers.get('content-length')) > limit) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new CommerceError(400, 'The request body must contain JSON.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw tooLarge();
      }
      body += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch (error) {
    if (error instanceof CommerceError) throw error;
    throw new CommerceError(400, 'The request body must contain valid JSON.');
  } finally {
    reader.releaseLock();
  }
}

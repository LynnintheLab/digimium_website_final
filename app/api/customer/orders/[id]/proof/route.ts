import { checkAdmin } from '../../../../../../lib/admin-auth';
import { commerceEnabled } from '../../../../../../lib/commerce-enabled';
import { CommerceError, commerceErrorResponse, commerceJson } from '../../../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';
const maxBytes = 5 * 1024 * 1024;

async function readProofBody(request: Request) {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new CommerceError(413, 'Choose an image smaller than 5 MB.');
  const reader = request.body?.getReader();
  if (!reader) throw new CommerceError(400, 'Choose a payment screenshot.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new CommerceError(413, 'Choose an image smaller than 5 MB.');
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!commerceEnabled) return commerceJson({ error: 'Payment proof is unavailable.' }, 404);
  try {
    const admin = await checkAdmin();
    let customerId: string | undefined;
    if (!admin.ok) {
      const { currentCustomer } = await import('../../../../../../hostinger/customer-auth');
      const customer = await currentCustomer(request);
      if (!customer) return commerceJson({ error: 'Sign in to view payment proof.' }, 401);
      customerId = customer.id;
    }
    const { id } = await context.params;
    const { orderProof } = await import('../../../../../../hostinger/orders');
    const proof = await orderProof(id, customerId, new URL(request.url).searchParams.get('version'));
    return new Response(new Uint8Array(proof.bytes), { headers: {
      'Content-Type': proof.contentType, 'Content-Length': String(proof.bytes.length),
      'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline; filename="payment-proof.' + (proof.contentType === 'image/jpeg' ? 'jpg' : proof.contentType.split('/')[1]) + '"',
    } });
  } catch (error) { return commerceErrorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!commerceEnabled) return commerceJson({ error: 'Payment proof is unavailable.' }, 404);
  try {
    const { currentCustomer, customerMutationAllowed } = await import('../../../../../../hostinger/customer-auth');
    if (!customerMutationAllowed(request)) return commerceJson({ error: 'Upload payment proof from this website.' }, 403);
    const customer = await currentCustomer(request);
    if (!customer) return commerceJson({ error: 'Sign in to upload payment proof.' }, 401);
    const mime = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return commerceJson({ error: 'Choose a PNG, JPEG or WebP screenshot.' }, 415);
    const query = new URL(request.url).searchParams;
    const { id } = await context.params;
    const { submitOrderProof } = await import('../../../../../../hostinger/orders');
    return commerceJson(await submitOrderProof(customer.id, id, { revision: Number(query.get('revision')), requestId: query.get('requestId') }, await readProofBody(request), mime));
  } catch (error) { return commerceErrorResponse(error); }
}

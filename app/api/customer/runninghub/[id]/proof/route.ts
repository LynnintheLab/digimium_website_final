import { commerceErrorResponse, commerceJson } from '@/lib/commerce-http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { runningHubProofOwner } = await import('@/hostinger/runninghub-http');
    const customerId = await runningHubProofOwner(request);
    const { runningHubProof } = await import('@/hostinger/runninghub');
    const proof = await runningHubProof((await context.params).id, customerId);
    return new Response(new Uint8Array(proof.bytes), { headers: {
      'Content-Type': proof.contentType, 'Content-Length': String(proof.bytes.length),
      'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline; filename="payment-receipt"', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    } });
  } catch (error) { return commerceErrorResponse(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { runningHubCustomer, readRunningHubProof } = await import('@/hostinger/runninghub-http');
    const customer = await runningHubCustomer(request, true);
    const { bytes, mime } = await readRunningHubProof(request);
    const query = new URL(request.url).searchParams;
    const { submitRunningHubProof } = await import('@/hostinger/runninghub');
    return commerceJson(await submitRunningHubProof(customer.id, (await context.params).id,
      { revision: Number(query.get('revision')), requestId: query.get('requestId') }, bytes, mime));
  } catch (error) { return commerceErrorResponse(error); }
}

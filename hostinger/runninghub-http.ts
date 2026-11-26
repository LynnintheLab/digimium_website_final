import { checkAdmin, isAllowedMutation } from '../lib/admin-auth';
import { commerceEnabled } from '../lib/commerce-enabled';
import { CommerceError } from '../lib/commerce-http';
import { RUNNINGHUB_PROOF_MAX_BYTES } from '../lib/runninghub';
import { currentCustomer, customerMutationAllowed } from './customer-auth';

function enabled() {
  if (!commerceEnabled) throw new CommerceError(404, 'Running HUB purchases are unavailable.');
}
export async function runningHubCustomer(request: Request, mutation = false) {
  enabled();
  if (mutation && !customerMutationAllowed(request)) throw new CommerceError(403, 'Submit Running HUB purchases from this website.');
  const customer = await currentCustomer(request);
  if (!customer) throw new CommerceError(401, 'Sign in to manage your Running HUB purchases.');
  return customer;
}
export async function runningHubAdmin(request: Request, mutation = false) {
  enabled();
  const admin = await checkAdmin();
  if (!admin.ok) throw new CommerceError(admin.status, admin.message);
  if (mutation && !isAllowedMutation(request)) throw new CommerceError(403, 'Manage Running HUB from this website.');
  return admin.user;
}
export async function runningHubProofOwner(request: Request): Promise<string | undefined> {
  enabled();
  const admin = await checkAdmin();
  if (admin.ok) return undefined;
  const customer = await currentCustomer(request);
  if (!customer) throw new CommerceError(401, 'Sign in to view this payment screenshot.');
  return customer.id;
}
export async function readRunningHubProof(request: Request) {
  const mime = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new CommerceError(415, 'Choose a PNG, JPG or WebP screenshot.');
  if (Number(request.headers.get('content-length')) > RUNNINGHUB_PROOF_MAX_BYTES) throw new CommerceError(413, 'Choose an image no larger than 5 MB.');
  const reader = request.body?.getReader();
  if (!reader) throw new CommerceError(400, 'Choose a payment screenshot.');
  let length = 0;
  const chunks: Buffer[] = [];
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > RUNNINGHUB_PROOF_MAX_BYTES) {
        await reader.cancel();
        throw new CommerceError(413, 'Choose an image no larger than 5 MB.');
      }
      chunks.push(Buffer.from(part.value));
    }
  } finally { reader.releaseLock(); }
  return { bytes: Buffer.concat(chunks), mime };
}

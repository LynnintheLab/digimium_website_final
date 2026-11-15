import { checkAdmin, isAllowedMutation } from '../../../../../lib/admin-auth';
import { commerceEnabled } from '../../../../../lib/commerce-enabled';
import { CommerceError, commerceJson, readCommerceJson } from '../../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

function customerErrorResponse(error: unknown) {
  return error instanceof CommerceError
    ? commerceJson({ error: error.message }, error.status)
    : commerceJson({ error: 'Customer details are temporarily unavailable. Please try again.' }, 503);
}

async function customerBody(request: Request) {
  try { return await readCommerceJson(request, 4096); }
  catch (error) {
    if (!(error instanceof CommerceError)) throw error;
    const message = error.status === 413 ? 'The customer request is too large.'
      : error.status === 415 ? 'Send customer details as JSON.' : 'Send valid customer details as JSON.';
    throw new CommerceError(error.status, message);
  }
}

export async function GET(request: Request, context: Context) {
  if (!commerceEnabled) return commerceJson({ error: 'Customer management is unavailable.' }, 404);
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    // Same-origin browser GETs may omit Origin. Reject explicitly foreign requests;
    // mutations below require the existing strict Origin/Fetch-Site policy.
    if (request.headers.get('sec-fetch-site') === 'cross-site' ||
        (request.headers.has('origin') && !isAllowedMutation(request))) {
      return commerceJson({ error: 'Open customer details from this website.' }, 403);
    }
    const { id } = await context.params;
    const { getAdminCustomer } = await import('../../../../../hostinger/admin-customers');
    return commerceJson(await getAdminCustomer(id));
  } catch (error) { return customerErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  if (!commerceEnabled) return commerceJson({ error: 'Customer management is unavailable.' }, 404);
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    if (!isAllowedMutation(request)) return commerceJson({ error: 'Update customers from this website.' }, 403);
    const { id } = await context.params;
    const body = await customerBody(request);
    const { updateAdminCustomer } = await import('../../../../../hostinger/admin-customers');
    return commerceJson(await updateAdminCustomer(id, body));
  } catch (error) { return customerErrorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  if (!commerceEnabled) return commerceJson({ error: 'Customer management is unavailable.' }, 404);
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    if (!isAllowedMutation(request)) return commerceJson({ error: 'Remove customers from this website.' }, 403);
    const { id } = await context.params;
    const body = await customerBody(request);
    const { removeAdminCustomer } = await import('../../../../../hostinger/admin-customers');
    return commerceJson(await removeAdminCustomer(id, body));
  } catch (error) { return customerErrorResponse(error); }
}

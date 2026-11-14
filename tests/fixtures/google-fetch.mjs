// Injected only into the disposable integration server; production has fixed Google endpoints.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
const originalFetch = globalThis.fetch;
const { privateKey, publicKey } = await generateKeyPair('RS256');
const { privateKey: otherKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'fixture-key', alg: 'RS256', use: 'sig' };
globalThis.fetch = async function(input, options) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({keys:[jwk]});
  if (url === 'https://oauth2.googleapis.com/token') {
    const fields = new URLSearchParams(options?.body);
    assert.equal(fields.get('client_id'), process.env.GOOGLE_CLIENT_ID);
    assert.equal(fields.get('client_secret'), process.env.GOOGLE_CLIENT_SECRET);
    assert.equal(fields.get('redirect_uri'), process.env.APP_ORIGIN + '/api/customer/google/callback');
    assert.equal(fields.get('grant_type'), 'authorization_code');
    const input = JSON.parse(Buffer.from(fields.get('code'), 'base64url').toString('utf8'));
    assert.equal(createHash('sha256').update(fields.get('code_verifier')).digest('base64url'), input.challenge);
    if (input.delay) await new Promise(resolve=>setTimeout(resolve,input.delay));
    if (input.tokenError) return Response.json({error:'invalid_grant'}, {status:400});
    const now = Math.floor(Date.now()/1000);
    const claims = { sub: 'fixture-sub', email: 'google@example.invalid', email_verified: true, name: 'Google Customer', nonce: input.nonce,
      iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, iat: now, exp: now+300, ...input.claims };
    for (const field of input.remove || []) delete claims[field];
    const id_token = await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'fixture-key'}).sign(input.badSignature ? otherKey : privateKey);
    return Response.json({id_token, access_token:'never-persist-fixture-access-token', token_type:'Bearer'});
  }
  return originalFetch(input, options);
};

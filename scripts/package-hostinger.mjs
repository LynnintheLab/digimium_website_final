import { access, cp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Next's standalone server needs both directories when it serves its own assets.
const bundle = '.next/standalone';
await access(join(bundle, 'server.js'));
await cp('public', join(bundle, 'public'), { recursive: true });
await cp('.next/static', join(bundle, '.next/static'), { recursive: true });

// Credentials are configured in hPanel at runtime.
for (const name of await readdir(bundle)) {
  if (name === '.env' || name.startsWith('.env.')) await rm(join(bundle, name));
}

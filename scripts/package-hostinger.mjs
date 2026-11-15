import { access, cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Next's standalone server needs both directories when it serves its own assets.
const bundle = '.next/standalone';
await access(join(bundle, 'server.js'));
await cp('public', join(bundle, 'public'), { recursive: true });
await cp('.next/static', join(bundle, '.next/static'), { recursive: true });

await mkdir(join(bundle, 'hostinger'), { recursive: true });
await mkdir(join(bundle, 'scripts'), { recursive: true });
await cp('scripts/run-notifications.mjs', join(bundle, 'scripts', 'run-notifications.mjs'));
await cp('hostinger/data', join(bundle, 'hostinger/data'), { recursive: true });
for (const schema of ['customer-auth-schema.sql', 'order-schema.sql', 'google-identity-schema.sql', 'google-auth-schema.sql', 'telegram-identity-schema.sql', 'telegram-auth-schema.sql', 'giveaway-schema.sql', 'notification-schema.sql']) {
  await cp(join('hostinger', schema), join(bundle, 'hostinger', schema));
}

// Credentials are configured in hPanel at runtime.
for (const name of await readdir(bundle)) {
  if (name === '.env' || name.startsWith('.env.')) await rm(join(bundle, name));
}

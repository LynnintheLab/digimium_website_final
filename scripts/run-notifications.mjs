import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** hPanel's Node.js cron supplies its existing private runtime env file. */
export async function runNotificationMaintenance(env = process.env) {
  const origin = new URL(env.APP_ORIGIN ?? '');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))) throw new Error('Invalid job origin.');
  const secret = env.NOTIFICATIONS_CRON_SECRET?.trim();
  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error('Notification job is not configured.');
  const response = await fetch(new URL('/api/internal/notifications/run', origin), {
    method: 'POST', headers: { Authorization: 'Bearer ' + secret },
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error('Notification job returned HTTP ' + response.status + '.');
}

// Hostinger launches through hbuilds/current, a symlink to the active version.
// Node resolves import.meta.url while argv retains that symlinked entry path.
const directEntry = process.argv[1] && await realpath(process.argv[1]).catch(() => null) === await realpath(fileURLToPath(import.meta.url));
if (directEntry) {
  try { await runNotificationMaintenance(); console.log('Notification maintenance completed.'); }
  catch { console.error('Notification maintenance failed. Check the private runtime configuration and job status.'); process.exitCode = 1; }
}

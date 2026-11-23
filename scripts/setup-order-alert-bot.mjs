import { execFileSync } from 'node:child_process';
import { chmod, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';

const topics = [
  { key: 'payment', name: 'Payment approval', env: 'ORDER_ALERTS_TELEGRAM_PAYMENT_TOPIC_ID' },
  { key: 'orders', name: 'Orders', env: 'ORDER_ALERTS_TELEGRAM_ORDERS_TOPIC_ID' },
  { key: 'registration', name: 'Registration', env: 'ORDER_ALERTS_TELEGRAM_REGISTRATION_TOPIC_ID' },
  { key: 'fulfillment', name: 'Order send', env: 'ORDER_ALERTS_TELEGRAM_FULFILLMENT_TOPIC_ID' },
];
const topicKeys = topics.map(topic => topic.key).join('|');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export class OrderAlertSetupError extends Error {
  constructor(message, confirmedRejection = false) {
    super(message);
    this.confirmedRejection = confirmedRejection;
  }
}

function positiveId(value) {
  return /^[1-9][0-9]*$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 2 ** 52 - 1;
}

async function telegramResult(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new OrderAlertSetupError('Telegram returned an incomplete response.');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) {
        await reader.cancel();
        throw new OrderAlertSetupError('Telegram returned an oversized response.');
      }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!response.ok || data?.ok !== true || !Object.hasOwn(data, 'result')) {
      const rejected = response.status >= 400 && response.status < 500 && data?.ok === false;
      throw new OrderAlertSetupError('Telegram rejected the request. Check the dedicated bot and owner chat settings.', rejected);
    }
    return data.result;
  } catch (error) {
    if (error instanceof OrderAlertSetupError) throw error;
    throw new OrderAlertSetupError('Telegram returned an incomplete response.');
  } finally { reader.releaseLock(); }
}

/** Injected transport and persistence allow local tests without contacting Telegram. */
export async function provisionOrderAlertTopics(env, { fetchImpl = fetch, state = null, persist, retryPending } = {}) {
  const token = env.ORDER_ALERTS_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.ORDER_ALERTS_TELEGRAM_CHAT_ID?.trim();
  if (!token || !/^[1-9][0-9]{4,15}:[A-Za-z0-9_-]{30,100}$/.test(token)) {
    throw new OrderAlertSetupError('Set ORDER_ALERTS_TELEGRAM_BOT_TOKEN in the private environment file.');
  }
  const botId = Number(token.split(':')[0]);
  if (!positiveId(botId) || !positiveId(chatId)) throw new OrderAlertSetupError('Set a positive private owner ID in ORDER_ALERTS_TELEGRAM_CHAT_ID.');
  if (typeof persist !== 'function') throw new OrderAlertSetupError('Topic setup needs its private progress journal.');
  if (retryPending && !topics.some(topic => topic.key === retryPending)) throw new OrderAlertSetupError(`Choose ${topicKeys} for --retry-pending.`);
  const journal = state ? structuredClone(state) : { version: 1, botId, chatId: Number(chatId), topics: {}, pending: null };
  if (journal.version !== 1 || journal.botId !== botId || journal.chatId !== Number(chatId) ||
      !journal.topics || typeof journal.topics !== 'object' || Array.isArray(journal.topics) ||
      Object.keys(journal.topics).some(key => !topics.some(topic => topic.key === key)) ||
      Object.values(journal.topics).some(id => !Number.isSafeInteger(id) || !positiveId(id)) ||
      (journal.pending !== null && !topics.some(topic => topic.key === journal.pending))) {
    throw new OrderAlertSetupError('The private setup journal does not match this bot and owner chat. Use their matching environment and journal.');
  }
  for (const topic of topics) {
    const supplied = env[topic.env]?.trim();
    if (!supplied) continue;
    if (!positiveId(supplied)) throw new OrderAlertSetupError(`Set a positive topic ID in ${topic.env}.`);
    if (journal.topics[topic.key] && journal.topics[topic.key] !== Number(supplied)) {
      throw new OrderAlertSetupError(`${topic.env} differs from its saved setup result. Review the private journal before proceeding.`);
    }
    journal.topics[topic.key] = Number(supplied);
    if (journal.pending === topic.key) journal.pending = null;
  }
  const knownIds = Object.values(journal.topics);
  if (new Set(knownIds).size !== knownIds.length) throw new OrderAlertSetupError('Use a different topic ID for each alert category.');
  if (journal.pending && retryPending !== journal.pending) {
    const topic = topics.find(topic => topic.key === journal.pending);
    throw new OrderAlertSetupError(`${topic.name} creation has an unconfirmed outcome. Recover its existing ID into ${topic.env}, or check Telegram and use --retry-pending=${topic.key} only if it was not created.`);
  }
  if (retryPending && journal.pending !== retryPending) throw new OrderAlertSetupError('--retry-pending must match the unconfirmed category in the private journal.');

  async function api(method, body = {}) {
    try {
      return await telegramResult(await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }));
    } catch (error) {
      if (error instanceof OrderAlertSetupError) throw error;
      // Network exceptions can contain the bot token in a request URL.
      throw new OrderAlertSetupError('Telegram did not return a confirmed result. The private journal records any pending topic creation.');
    }
  }
  const me = await api('getMe');
  if (!me || me.id !== botId || me.is_bot !== true || typeof me.username !== 'string') {
    throw new OrderAlertSetupError('Telegram did not verify the configured alert bot.');
  }
  if (me.username.toLowerCase() === 'digimium_login_bot' || token === env.TELEGRAM_BOT_TOKEN?.trim()) {
    throw new OrderAlertSetupError('Select the dedicated order-alert bot token. This token identifies the customer login bot.');
  }
  if (me.has_topics_enabled !== true) throw new OrderAlertSetupError('Enable Threaded mode for this bot in BotFather, then run setup again.');
  const chat = await api('getChat', { chat_id: Number(chatId) });
  if (!chat || chat.id !== Number(chatId) || chat.type !== 'private') {
    throw new OrderAlertSetupError('The configured destination must be the owner’s private chat with the alert bot.');
  }
  journal.pending = null;
  await persist(journal);
  for (const topic of topics) {
    if (journal.topics[topic.key]) continue;
    journal.pending = topic.key;
    await persist(journal);
    let created;
    try { created = await api('createForumTopic', { chat_id: Number(chatId), name: topic.name }); }
    catch (error) {
      if (error instanceof OrderAlertSetupError && error.confirmedRejection) {
        journal.pending = null;
        await persist(journal);
      }
      throw error;
    }
    if (!created || !Number.isSafeInteger(created.message_thread_id) || !positiveId(created.message_thread_id) || created.name !== topic.name ||
        Object.values(journal.topics).includes(created.message_thread_id)) {
      throw new OrderAlertSetupError('Telegram returned an unexpected topic result. Recover the pending topic before running setup again.');
    }
    journal.topics[topic.key] = created.message_thread_id;
    journal.pending = null;
    await persist(journal);
  }
  return { username: me.username, topicCount: Object.keys(journal.topics).length };
}

async function atomicPrivateWrite(filename, text) {
  const temporary = filename + '.tmp-' + randomUUID();
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, filename);
    await chmod(filename, 0o600);
  } finally {
    await handle?.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function main() {
  let lock;
  let lockPath;
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
      console.log(`Node 24, from the repository root:\n  node scripts/setup-order-alert-bot.mjs --env-file=.env.order-alerts.testing.local\n\nCreates the four private-chat topics and saves their IDs in the ignored environment file.\nRecovery after checking Telegram: add the existing topic ID, or use --retry-pending=${topicKeys} if creation did not happen.`);
      return;
    }
    const envArg = args.find(arg => arg.startsWith('--env-file='));
    const retryArg = args.find(arg => arg.startsWith('--retry-pending='));
    if (!envArg || args.length !== 1 + Number(Boolean(retryArg))) throw new OrderAlertSetupError(`Use --env-file=path/to/ignored.env and optionally --retry-pending=${topicKeys}.`);
    const filename = await realpath(resolve(envArg.slice('--env-file='.length)));
    const repository = await realpath(root);
    const projectPath = relative(repository, filename);
    if (projectPath.startsWith('..') || isAbsolute(projectPath)) throw new OrderAlertSetupError('Keep the private environment file inside this repository’s ignored files.');
    try {
      for (const suffix of ['', '.topics.json', '.setup.lock']) {
        execFileSync('git', ['check-ignore', '--quiet', '--', projectPath + suffix], { cwd: repository, stdio: 'ignore' });
      }
    } catch { throw new OrderAlertSetupError('The environment file and its setup files must be git-ignored. Use .env.order-alerts.testing.local.'); }
    lockPath = filename + '.setup.lock';
    try { lock = await open(lockPath, 'wx', 0o600); }
    catch { throw new OrderAlertSetupError('A setup lock exists. Finish the running setup, or remove its stale .setup.lock after confirming that process ended.'); }
    await lock.writeFile(String(process.pid) + '\n');
    await chmod(filename, 0o600);
    const contents = await readFile(filename, 'utf8');
    if (Buffer.byteLength(contents) > 65536) throw new OrderAlertSetupError('The private environment file is too large.');
    const env = parseEnv(contents);
    const journalPath = filename + '.topics.json';
    let state = null;
    try { state = JSON.parse(await readFile(journalPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new OrderAlertSetupError('The private topic journal could not be read. Keep it for recovery.'); }
    const result = await provisionOrderAlertTopics(env, {
      state, retryPending: retryArg?.slice('--retry-pending='.length),
      persist: async journal => {
        await atomicPrivateWrite(journalPath, JSON.stringify(journal, null, 2) + '\n');
        let current = await readFile(filename, 'utf8');
        const latest = parseEnv(current);
        if (latest.ORDER_ALERTS_TELEGRAM_BOT_TOKEN !== env.ORDER_ALERTS_TELEGRAM_BOT_TOKEN || latest.ORDER_ALERTS_TELEGRAM_CHAT_ID !== env.ORDER_ALERTS_TELEGRAM_CHAT_ID) {
          throw new OrderAlertSetupError('The private bot or owner settings changed during setup. Completed topic IDs remain in the journal.');
        }
        for (const topic of topics) {
          const id = journal.topics[topic.key];
          if (!id) continue;
          if (latest[topic.env]?.trim() && Number(latest[topic.env]) !== id) throw new OrderAlertSetupError(`${topic.env} changed during setup. Completed IDs remain in the private journal.`);
          const line = topic.env + '=' + id;
          const pattern = new RegExp('^(?:export[\\t ]+)?' + topic.env + '[\\t ]*=.*$', 'gm');
          current = pattern.test(current) ? current.replace(pattern, line) : current.trimEnd() + '\n' + line + '\n';
        }
        await atomicPrivateWrite(filename, current);
      },
    });
    console.log(`Prepared ${result.topicCount} private alert topics for @${result.username}. Topic IDs are saved in the ignored environment file.`);
  } catch (error) {
    console.error(error instanceof OrderAlertSetupError ? error.message : 'Order-alert topic setup failed. Check local file permissions and the private settings.');
    process.exitCode = 1;
  } finally {
    if (lock) {
      await lock.close();
      await unlink(lockPath).catch(() => {});
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

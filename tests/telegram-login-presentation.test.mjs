import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  telegramBrowserContext, telegramLoginApproved, telegramLoginComplete, telegramLoginRequest, telegramLoginTitleEntities,
} from '../lib/telegram-login-presentation.ts';

const notice = { origin: 'https://shop.example.invalid', context: 'Safari · iPhone', created: 1794675600 };

test('mobile browsers report their own name instead of every iOS browser becoming Safari', () => {
  assert.equal(telegramBrowserContext('Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit/605.1.15 CriOS/130.0 Mobile Safari/604.1'), 'Chrome · iPhone');
  assert.equal(telegramBrowserContext('Mozilla/5.0 (iPad; CPU OS) FxiOS/120.0 Mobile Safari/605.1.15'), 'Firefox · iPad');
  assert.equal(telegramBrowserContext('Mozilla/5.0 (Linux; Android) Chrome/131.0 SamsungBrowser/26.0'), 'Samsung Internet · Android');
  assert.equal(telegramBrowserContext('Mozilla/5.0 (Windows NT) Chrome/131.0 Edg/131.0'), 'Edge · Windows');
  assert.equal(telegramBrowserContext('Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Mobile Safari/605.1.15'), 'Safari · iPad');
  assert.equal(telegramBrowserContext('unrecognized\nunsafe data'), 'Browser · Device');
});

test('login request shows useful context without inventing a location or exposing raw user agent', () => {
  const text = telegramLoginRequest(notice);
  assert.match(text, /🔐/); assert.match(text, /📱 Safari · iPhone/);
  assert.match(text, /shop\.example\.invalid/); assert.match(text, /📍 တည်နေရာ မသိနိုင်ပါ/);
  assert.match(text, /MMT/); assert.match(text, /၅ မိနစ်/);
  assert.doesNotMatch(text, /Mozilla|123\.123|logged in/i);
  assert.ok(text.length < 1024);
});

test('approximate location is explicitly labelled and approval never claims a website session exists', () => {
  const approved = telegramLoginApproved({ ...notice, location: 'Thailand' });
  assert.match(approved, /နိုင်ငံ \(IP ခန့်မှန်း\) — Thailand/);
  assert.match(approved, /IP Geolocation by DB-IP: https:\/\/db-ip\.com/);
  assert.ok(!telegramLoginApproved(notice).includes('db-ip.com'));
  assert.match(approved, /Code အတည်ပြုပြီး/);
  assert.doesNotMatch(approved, /Website အကောင့်ဝင်ပြီးပါပြီ/);
  assert.match(telegramLoginComplete(notice), /Website အကောင့်ဝင်ပြီးပါပြီ/);
});

test('bold title entities use Telegram UTF-16 offsets and never include the context or instructions', () => {
  for (const text of [telegramLoginRequest(notice), telegramLoginApproved(notice), telegramLoginComplete(notice)]) {
    const [entity] = telegramLoginTitleEntities(text);
    assert.equal(entity.type, 'bold'); assert.equal(entity.offset, 0);
    assert.equal(text.slice(entity.offset, entity.offset + entity.length), text.split('\n')[0]);
  }
  const request = telegramLoginRequest(notice);
  assert.equal(telegramLoginTitleEntities(request)[0].length, [...request.split('\n')[0]].length + 1, 'Lock emoji occupies two UTF-16 code units');
});

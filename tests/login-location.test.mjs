import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginLocation } from '../hostinger/login-location.ts';

function request(headers = {}) { return new Request('https://shop.example.invalid', { headers }); }

test('missing, invalid and private IPs do not invent a country or trust caller geo headers', async () => {
  for (const ip of ['', 'invalid', '127.0.0.1', '10.0.0.2', '192.168.1.2', '100.64.2.1',
    '169.254.1.1', '203.0.113.7', '::1', 'fc00::1', 'fe80::1', '2001:db8::1', '::ffff:10.0.0.1']) {
    assert.equal(await loginLocation(request({
      'x-forwarded-for': ip, 'cf-ipcountry': 'TH', 'x-vercel-ip-city': 'Bangkok',
    })), undefined, ip);
  }
  assert.equal(await loginLocation(request({ 'x-forwarded-for': '8.8.8.8, invalid' })), undefined);
});

test('offline IPv4/IPv6 estimates use only the rightmost public address', async () => {
  assert.equal(await loginLocation(request({ 'x-forwarded-for': '8.8.8.8' })), 'United States');
  assert.equal(await loginLocation(request({ 'x-forwarded-for': 'arbitrary, 8.8.8.8' })), 'United States');
  assert.equal(await loginLocation(request({ 'x-forwarded-for': '8.8.8.8, 10.0.0.1' })), undefined);
  assert.equal(await loginLocation(request({ 'x-forwarded-for': '::ffff:8.8.8.8' })), 'United States');
  // Anycast address: this database snapshot assigns its network to Canada.
  assert.equal(await loginLocation(request({ 'x-forwarded-for': '2001:4860:4860::8888' })), 'Canada');
});

import { readFile } from 'node:fs/promises';
import { BlockList, isIP } from 'node:net';
import { join } from 'node:path';
import { Reader, type CountryResponse } from 'mmdb-lib';

// Advisory display only. Never use an IP estimate to approve or reject a login.
// Match the existing rate limiter's rightmost proxy address, not caller-supplied
// country/city headers. Missing/private/proxy-only addresses remain unknown.
const privateNetworks = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) privateNetworks.addSubnet(network, prefix, 'ipv4');
privateNetworks.addSubnet('2001:db8::', 32, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
type DatabaseCountry = CountryResponse & { country_code?: string };
const readers = new Map<number, Promise<Reader<DatabaseCountry> | undefined>>();

function publicAddress(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded || forwarded.length > 2048) return;
  let ip = forwarded.split(',').at(-1)?.trim() ?? '';
  let family = isIP(ip);
  if (!family) return;
  if (family === 6) {
    ip = new URL('http://[' + ip + ']').hostname.slice(1, -1);
    const mapped = /^::ffff:([a-f\d]{1,4}):([a-f\d]{1,4})$/i.exec(ip);
    if (mapped) {
      const high = Number.parseInt(mapped[1], 16), low = Number.parseInt(mapped[2], 16);
      ip = [high >> 8, high & 255, low >> 8, low & 255].join('.');
      family = 4;
    }
  }
  if (privateNetworks.check(ip, family === 4 ? 'ipv4' : 'ipv6') ||
      (family === 6 && !globalV6.check(ip, 'ipv6'))) return;
  return { ip, family };
}

async function countryReader(family: number) {
  let reader = readers.get(family);
  if (!reader) {
    reader = readFile(join(process.cwd(), 'hostinger/data', 'dbip-country-ipv' + family + '.mmdb'))
      .then(bytes => new Reader<DatabaseCountry>(bytes))
      .catch(() => undefined);
    readers.set(family, reader);
  }
  return reader;
}

export async function loginLocation(request: Request): Promise<string | undefined> {
  try {
    const address = publicAddress(request);
    if (!address) return;
    const database = await countryReader(address.family);
    const result = database?.get(address.ip);
    const code = result?.country_code ?? result?.country?.iso_code;
    if (!code || !/^[A-Z]{2}$/.test(code)) return;
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    // Context is optional; database/lookup failure must never prevent sign-in.
    return;
  }
}

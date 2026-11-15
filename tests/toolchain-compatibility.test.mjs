import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import vm from 'node:vm';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const runFile = promisify(execFile);

function checkSourceMap(result, source, filename) {
  assert.equal(result.map.version, 3);
  assert.ok(result.map.sources.some(name => name.endsWith(path.basename(filename))));
  assert.ok(result.map.sourcesContent.includes(source));
  assert.ok(result.map.mappings.length > 0);
}

test('Drizzle loader core transforms typed CommonJS and ESM without losing source maps', { timeout: 15000 }, async () => {
  const { transformSync, transform } = require('@esbuild-kit/core-utils');
  const filename = path.join(tmpdir(), 'digimium-toolchain-config.cts');
  const source = `
    interface Plan { amount: number; quantity: number }
    enum Currency { MMK = 'MMK' }
    const plans: Plan[] = [{ amount: 16000, quantity: 2 }, { amount: 22000, quantity: 1 }];
    export const total = plans.reduce((sum, plan) => sum + plan.amount * plan.quantity, 0);
    export const currency = Currency.MMK;
  `;
  const transformed = transformSync(source, filename);
  checkSourceMap(transformed, source, filename);
  const cjsModule = { exports: {} };
  vm.runInNewContext(transformed.code, { module: cjsModule, exports: cjsModule.exports }, { filename });
  assert.equal(cjsModule.exports.total, 54000);
  assert.equal(cjsModule.exports.currency, 'MMK');

  const esmFilename = filename.replace(/\.cts$/, '.mts');
  const esmSource = `
    type Config = { dialect: 'sqlite'; out: string };
    export const config: Config = await Promise.resolve({ dialect: 'sqlite', out: './drizzle' });
    export const count: number = 3;
  `;
  const esm = await transform(esmSource, esmFilename);
  checkSourceMap(esm, esmSource, esmFilename);
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(esm.code).toString('base64')}`);
  assert.deepEqual(loaded.config, { dialect: 'sqlite', out: './drizzle' });
  assert.equal(loaded.count, 3);
});

test('typed ESLint project service allows a dot-directory glob and rejects an unrelated file', { timeout: 30000 }, async t => {
  const { parseAndGenerateServices, clearCaches } = require('@typescript-eslint/typescript-estree');
  const directory = await mkdtemp(path.join(tmpdir(), 'digimium-eslint-'));
  t.after(async () => {
    clearCaches();
    await rm(directory, { recursive: true, force: true });
  });
  await mkdir(path.join(directory, '.fixtures'));
  await mkdir(path.join(directory, 'other'));
  await writeFile(path.join(directory, 'included.ts'), 'export const included = true;\n');
  await writeFile(path.join(directory, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2022' },
    files: ['included.ts'],
  }));
  const code = 'export const remainingDays: number = 30;\n';
  const allowedFile = path.join(directory, '.fixtures', 'plan.ts');
  const rejectedFile = path.join(directory, 'other', 'plan.ts');
  await writeFile(allowedFile, code);
  await writeFile(rejectedFile, code);
  const options = {
    tsconfigRootDir: directory,
    sourceType: 'module',
    projectService: { allowDefaultProject: ['.fixtures/*.{ts,cts}'] },
  };
  const allowed = parseAndGenerateServices(code, { ...options, filePath: allowedFile });
  assert.equal(allowed.ast.body[0].type, 'ExportNamedDeclaration');
  assert.ok(allowed.services.program.getSourceFile(allowedFile), 'Allowed file receives a real TypeScript program');
  const declaration = allowed.services.program.getSourceFile(allowedFile).statements[0].declarationList.declarations[0];
  const checker = allowed.services.program.getTypeChecker();
  assert.equal(checker.typeToString(checker.getTypeAtLocation(declaration.name)), 'number');
  assert.throws(
    () => parseAndGenerateServices(code, { ...options, filePath: rejectedFile }),
    /was not found by the project service|not.*allowDefaultProject/i,
  );
});

test('Satori-resolved fflate round-trips ZIPs and rejects a missing ZIP64 extra field within a bound', { timeout: 10000 }, async () => {
  const satoriRequire = createRequire(require.resolve('satori'));
  const fflatePath = satoriRequire.resolve('fflate');
  // A single-entry archive claims ZIP64 sizes but provides a different extra
  // field. Keep the malformed parser invocation in a child that can be killed.
  const archive = Buffer.alloc(149);
  archive.writeUInt32LE(0x02014b50, 0);
  archive.writeUInt32LE(0xffffffff, 20);
  archive.writeUInt32LE(0xffffffff, 24);
  archive.writeUInt16LE(1, 28);
  archive.writeUInt16LE(4, 30);
  archive.write('x', 46);
  archive.writeUInt16LE(2, 47);
  const zip64End = 51;
  archive.writeUInt32LE(0x06064b50, zip64End);
  archive.writeUInt32LE(44, zip64End + 4);
  archive.writeUInt32LE(1, zip64End + 32);
  archive.writeUInt32LE(0x07064b50, 107);
  archive.writeUInt32LE(zip64End, 115);
  const end = 127;
  archive.writeUInt32LE(0x06054b50, end);
  archive.writeUInt16LE(1, end + 8);
  archive.writeUInt32LE(0xffffffff, end + 16);
  const script = `
    const assert = require('node:assert/strict');
    const { zipSync, unzipSync, strToU8, strFromU8 } = require(process.argv[1]);
    const files = { 'plans.txt': strToU8('Digimium: 30 days remaining'), 'empty.txt': new Uint8Array() };
    const unpacked = unzipSync(zipSync(files));
    assert.equal(strFromU8(unpacked['plans.txt']), 'Digimium: 30 days remaining');
    assert.equal(unpacked['empty.txt'].length, 0);
    assert.throws(() => unzipSync(Buffer.from(process.argv[2], 'base64')), error => error.code === 13);
    process.stdout.write('zip-compatible-and-malformed-zip64-rejected');
  `;
  const result = await runFile(process.execPath, ['-e', script, fflatePath, archive.toString('base64')], {
    timeout: 2000, killSignal: 'SIGKILL', maxBuffer: 4096,
  });
  assert.equal(result.stdout, 'zip-compatible-and-malformed-zip64-rejected');
});

// WOFF wraps the installed OG font's existing sfnt tables. Using Node's zlib to
// compress them ensures rendering traverses Satori's fflate decompression path.
function compressedWoff(ttf) {
  const tableCount = ttf.readUInt16BE(4);
  const tables = [];
  let offset = 44 + tableCount * 20;
  let compressedTables = 0;
  for (let index = 0; index < tableCount; index++) {
    const entry = 12 + index * 16;
    const length = ttf.readUInt32BE(entry + 12);
    const original = ttf.subarray(ttf.readUInt32BE(entry + 8), ttf.readUInt32BE(entry + 8) + length);
    const compressed = deflateSync(original);
    const data = compressed.length < length ? compressed : original;
    if (data === compressed) compressedTables++;
    tables.push({ tag: ttf.readUInt32BE(entry), checksum: ttf.readUInt32BE(entry + 4), length, data, offset });
    offset += (data.length + 3) & ~3;
  }
  assert.ok(compressedTables > 0, 'Fixture must contain compressed tables');
  const woff = Buffer.alloc(offset);
  woff.write('wOFF');
  woff.writeUInt32BE(ttf.readUInt32BE(0), 4);
  woff.writeUInt32BE(woff.length, 8);
  woff.writeUInt16BE(tableCount, 12);
  woff.writeUInt32BE(ttf.length, 16);
  woff.writeUInt16BE(1, 20);
  for (const [index, table] of tables.entries()) {
    const entry = 44 + index * 20;
    for (const [field, value] of [table.tag, table.offset, table.data.length, table.length, table.checksum].entries()) {
      woff.writeUInt32BE(value, entry + field * 4);
    }
    table.data.copy(woff, table.offset);
  }
  return woff;
}

test('Satori and OG render a compressed local font with network access disabled', { timeout: 30000 }, async t => {
  const originalFetch = globalThis.fetch;
  const originalRequire = Object.getOwnPropertyDescriptor(globalThis, 'require');
  const originalDirname = Object.getOwnPropertyDescriptor(globalThis, '__dirname');
  const requests = [];
  globalThis.fetch = async (...args) => {
    const target = args[0] instanceof Request ? args[0].url : String(args[0]);
    // Yoga's embedded WASM uses a data URL. It remains entirely local.
    if (target.startsWith('data:')) return originalFetch(...args);
    requests.push(target);
    throw new Error('Toolchain rendering fixtures must not request network assets');
  };
  // OG's prebundled ESM retains an esbuild dynamic-require helper for Node
  // built-ins. Supply the require bridge normally supplied by the app bundler;
  // Node's test runner isolates this file, and cleanup restores the globals.
  Object.defineProperty(globalThis, 'require', { value: require, configurable: true, writable: true });
  Object.defineProperty(globalThis, '__dirname', {
    value: path.dirname(require.resolve('harfbuzzjs')), configurable: true, writable: true,
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalRequire) Object.defineProperty(globalThis, 'require', originalRequire);
    else delete globalThis.require;
    if (originalDirname) Object.defineProperty(globalThis, '__dirname', originalDirname);
    else delete globalThis.__dirname;
  });
  const { default: satori } = await import('satori');
  const { ImageResponse } = await import('@vercel/og');
  const { createElement } = await import('react');
  const ttf = await readFile(path.join(path.dirname(require.resolve('@vercel/og')), 'Geist-Regular.ttf'));
  const woff = compressedWoff(ttf);
  const element = createElement('div', {
    style: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: 40, color: '#ffffff', background: '#102b8b', fontFamily: 'LocalGeist' },
  },
  createElement('div', { style: { display: 'flex', fontSize: 42 } }, 'digimium.'),
  createElement('div', { style: { display: 'flex', marginTop: 20, fontSize: 25 } }, 'Giveaway: 3 plans'),
  createElement('div', { style: { display: 'flex', marginTop: 12, fontSize: 18 } }, '30 days remaining'));
  const options = font => ({ width: 640, height: 320, fonts: [{ name: 'LocalGeist', data: font, weight: 400, style: 'normal' }] });
  const originalSvg = await satori(element, options(ttf));
  const compressedSvg = await satori(element, options(woff));
  assert.match(compressedSvg, /<svg[^>]+width="640"[^>]+height="320"/);
  const glyphPaths = svg => [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(match => match[1]);
  assert.ok(glyphPaths(compressedSvg).length > 0, 'Text must be rendered into glyph paths');
  assert.deepEqual(glyphPaths(compressedSvg), glyphPaths(originalSvg), 'Compressed and original font tables produce identical glyph geometry');
  const response = new ImageResponse(element, options(woff));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /image\/png/);
  const png = Buffer.from(await response.arrayBuffer());
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 640);
  assert.equal(png.readUInt32BE(20), 320);
  assert.ok(png.length > 1000, 'OG output contains rasterized content');
  assert.deepEqual(requests, []);
});

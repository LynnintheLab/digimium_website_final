// The legacy Sites worker still uses Telegram drafts. Vite sets this target at build time.
export const commerceEnabled = process.env.NEXT_PUBLIC_DIGIMIUM_TARGET !== 'sites';

export type ShopTheme = 'light' | 'dark';

export const SHOP_THEME_STORAGE_KEY = 'digimium-theme';
export const SHOP_THEME_EVENT = 'digimium-theme-change';

export function resolveShopTheme(preference: unknown, systemDark: boolean): ShopTheme {
  return preference === 'light' || preference === 'dark' ? preference : systemDark ? 'dark' : 'light';
}

export function customerThemeAllowed(pathname: string): boolean {
  return pathname !== '/admin' && !pathname.startsWith('/admin/');
}

// Runs before the body paints. Storage and media-query failures are independent;
// a privacy restriction must not prevent a usable page or a system preference.
export const SHOP_THEME_BOOTSTRAP = `(function(){var p,t='light',dark=false;try{p=localStorage.getItem('digimium-theme')}catch(e){}try{dark=window.matchMedia('(prefers-color-scheme: dark)').matches}catch(e){}if(location.pathname!=='/admin'&&location.pathname.indexOf('/admin/')!==0){t=p==='light'||p==='dark'?p:dark?'dark':'light'}document.documentElement.dataset.shopTheme=t;document.documentElement.style.colorScheme=t})()`;

type ProductMark = { mark: string; logoPath?: string };

export function productLogoSrc(product: ProductMark): string | undefined {
  if (product.logoPath) return product.logoPath;
  if (!product.mark) return undefined;
  const extension = product.mark === 'expressvpn' ? 'png' : 'svg';
  return `/assets/marks/${product.mark}.${extension}`;
}

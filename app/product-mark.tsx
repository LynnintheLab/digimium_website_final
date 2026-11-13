import { useState } from 'react';
import type { Product } from '../lib/catalog';
import { productLogoSrc } from '../lib/product-logo';

export function Mark({ product }: { product: Product }) {
  const src = productLogoSrc(product);
  const [failed, setFailed] = useState<string>();
  if (!src || failed === src) return <span className="letter-mark" aria-hidden="true">{product.name.slice(0, 1)}</span>;
  return <img src={src} alt="" className={`service-mark mark-${product.logoPath ? 'uploaded' : product.mark}`} onError={() => setFailed(src)} />;
}

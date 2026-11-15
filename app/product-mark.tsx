import { useState } from 'react';
import Image from 'next/image';
import type { Product } from '../lib/catalog';
import { productLogoSrc } from '../lib/product-logo';

export function Mark({ product }: { product: Product }) {
  const src = productLogoSrc(product);
  const [failed, setFailed] = useState<string>();
  if (!src || failed === src) return <span className="letter-mark" aria-hidden="true">{product.name.slice(0, 1)}</span>;
  const width = product.logoPath ? 35 : product.mark === 'canva' ? 65 : product.mark === 'netflix' ? 72 : 35;
  return <Image src={src} width={width} height={35} alt="" unoptimized className={`service-mark mark-${product.logoPath ? 'uploaded' : product.mark}`} onError={() => setFailed(src)} />;
}

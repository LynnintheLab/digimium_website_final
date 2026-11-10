import original from '../data/catalog.json';
import imported from '../data/import-catalog.json';
import type { Catalog, Product } from './catalog';

// The import supplies a starting catalog. Subsequent admin saves own the catalog.
export function initialCatalog(): Catalog {
  const catalog = structuredClone(original) as Catalog;
  const byId = new Map(catalog.products.map(product => [product.id, product]));
  for (const entry of structuredClone(imported.products) as Product[]) {
    const existing = byId.get(entry.id);
    if (existing) existing.plans = entry.plans;
    else catalog.products.push(entry);
  }
  return catalog;
}

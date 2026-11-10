export interface CatalogSnapshot {
  payload: string;
  revision: number;
  updatedAt: string;
}

export interface StoredLogo {
  body: BodyInit;
  size: number;
  httpEtag: string;
}

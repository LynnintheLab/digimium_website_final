import seed from '../data/catalog.json';
export const categories = ['All services','AI & productivity','Design & creativity','Music & entertainment','Everyday essentials'];
export const markKeys=['chatgpt','canva','spotify','gemini','adobe','netflix','claude','cursor','perplexity','grok','capcut','freepik','suno','applemusic','youtube','steam','zoom','notion','duolingo','vpn','microsoft365'] as const;
export type Product={id:string;name:string;category:number;mark:string;description:string;mm?:string;price:string;duration:string;availability:'available'|'on-request'|'unavailable';featured:boolean;published:boolean};
export type CatalogSettings={email:string;viber:string;viberLabel:string};
export type Catalog={revision:number;updatedAt:string|null;products:Product[];settings:CatalogSettings};
export const defaultCatalog=seed as Catalog;

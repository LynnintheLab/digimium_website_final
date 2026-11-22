import type { CustomerField, PaymentMethod, PaymentMethodId } from './payment';

export const categories = ['All services','AI & productivity','Design & creativity','Music & entertainment','Everyday essentials'];
export const markKeys=['chatgpt','canva','spotify','gemini','adobe','netflix','claude','cursor','perplexity','grok','capcut','freepik','suno','applemusic','youtube','steam','zoom','notion','duolingo','vpn','microsoft365',
  'coursera','discord','disneyplus','expressvpn','figma','githubcopilot','googledrive','grammarly','hbomax','icloud','kling','linkedin','manus','midjourney','picsart','playstation','primevideo','runway','telegram','udemy','windows'] as const;
export type ProductPlan={id:string;name:string;price:string;discountPrice?:string;duration:string;bestSeller?:boolean;published:boolean;checkoutFields?:CustomerField[]};
export type Product={id:string;name:string;category:number;mark:string;logoPath?:string;plans?:ProductPlan[];description:string;mm?:string;price:string;discountPrice?:string;duration:string;availability:'available'|'on-request'|'unavailable';featured:boolean;bestSeller?:boolean;published:boolean;checkoutFields?:CustomerField[]};
export type CatalogSettings={email:string;viber:string;viberLabel:string;telegram?:string;hideShortDescriptions?:boolean;paymentMethods?:PaymentMethod[]};
export type Catalog={revision:number;updatedAt:string|null;products:Product[];settings:CatalogSettings;paymentMethodIds?:PaymentMethodId[]};

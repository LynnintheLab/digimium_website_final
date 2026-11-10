export const categories = ['All services','AI & productivity','Design & creativity','Music & entertainment','Everyday essentials'];
export const markKeys=['chatgpt','canva','spotify','gemini','adobe','netflix','claude','cursor','perplexity','grok','capcut','freepik','suno','applemusic','youtube','steam','zoom','notion','duolingo','vpn','microsoft365',
  'coursera','discord','disneyplus','expressvpn','figma','githubcopilot','googledrive','grammarly','hbomax','icloud','kling','linkedin','manus','midjourney','picsart','playstation','primevideo','runway','telegram','udemy','windows'] as const;
export type ProductPlan={id:string;name:string;price:string;duration:string;published:boolean};
export type Product={id:string;name:string;category:number;mark:string;logoPath?:string;plans?:ProductPlan[];description:string;mm?:string;price:string;duration:string;availability:'available'|'on-request'|'unavailable';featured:boolean;published:boolean};
export type CatalogSettings={email:string;viber:string;viberLabel:string;telegram?:string;hideShortDescriptions?:boolean};
export type Catalog={revision:number;updatedAt:string|null;products:Product[];settings:CatalogSettings};

import Storefront from "./storefront";
import { getPublicCatalog } from "../lib/catalog-store";
export const dynamic = "force-dynamic";
export default async function Home(){ const catalog=await getPublicCatalog(); return <Storefront initialCatalog={catalog}/>; }

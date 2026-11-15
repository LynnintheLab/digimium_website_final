"use client";
import Image from 'next/image';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <main className="store-error wrap"><Image src="/assets/logo.png" alt="Digimium" width={1000} height={340} style={{width: 190, height: 'auto'}} unoptimized loading="eager"/><h1>We couldn’t load the services.</h1><p>Please try again in a moment.</p><button className="button primary" onClick={reset}>Try again</button></main>}

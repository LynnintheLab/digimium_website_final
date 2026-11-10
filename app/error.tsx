"use client";
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <main className="store-error wrap"><img src="/assets/logo.png" alt="Digimium" width="190"/><h1>We couldn’t load the services.</h1><p>Please try again in a moment.</p><button className="button primary" onClick={reset}>Try again</button></main>}

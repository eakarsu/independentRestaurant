"use client";
import {Suspense,useEffect,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {Header} from '@/components/layout/header';
function Results(){const q=useSearchParams().get('q')||'';const [rows,setRows]=useState<{id:string;label:string;type:string;href:string}[]>([]);const [message,setMessage]=useState('');useEffect(()=>{const controller=new AbortController();setMessage('Searching…');fetch(`/api/search?q=${encodeURIComponent(q)}`,{signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.results);setMessage(d.results.length?'':'No matching records.');}).catch(e=>{if(!controller.signal.aborted){setRows([]);setMessage(e.message);}});return()=>controller.abort();},[q]);return <div><Header title="Search"/><div className="p-6 space-y-3"><h2 className="text-xl font-semibold">Results for “{q}”</h2><p role="status">{message}</p>{rows.map(r=><Link key={`${r.type}:${r.id}`} className="block rounded border p-3 hover:bg-muted" href={r.href}><small>{r.type}</small><p>{r.label}</p></Link>)}</div></div>;}
export default function SearchPage(){return <Suspense fallback={<p>Loading search…</p>}><Results/></Suspense>;}

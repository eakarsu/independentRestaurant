"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
export function useOperation<T>(url:string){
 const [data,setData]=useState<T|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);const key=useRef<{signature:string;key:string}|null>(null);const active=useRef(false);
 const load=useCallback(async()=>{setLoading(true);try{const r=await fetch(url);const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to load');setData(d);setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load');}finally{setLoading(false);}},[url]);
 useEffect(()=>{void load();},[load]);
 async function save(input:unknown,method='POST',target=url){if(active.current)return false;active.current=true;setBusy(true);setError('');const signature=JSON.stringify({target,method,input});if(key.current?.signature!==signature)key.current={signature,key:crypto.randomUUID()};try{const r=await fetch(target,{method,headers:{'Content-Type':'application/json','Idempotency-Key':key.current.key},body:JSON.stringify(input)});const d=await r.json();if(!r.ok)throw Error(d.error||'Save failed');key.current=null;await load();return true;}catch(e){setError(e instanceof Error?e.message:'Save failed');return false;}finally{active.current=false;setBusy(false);}}
 return {data,error,busy,loading,load,save};
}

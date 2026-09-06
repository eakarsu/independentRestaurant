"use client";
import {useRef} from 'react';
/** Retains the same key after network failures; successful new intents receive new keys. */
export function useMutationFetch(){const keys=useRef(new Map<string,string>());return async(url:string,init:RequestInit)=>{const signature=JSON.stringify([url,init.method,init.body]);let key=keys.current.get(signature);if(!key){key=crypto.randomUUID();keys.current.set(signature,key);}const headers=new Headers(init.headers);headers.set('Idempotency-Key',key);const response=await fetch(url,{...init,headers});if(response.ok)keys.current.delete(signature);return response;};}

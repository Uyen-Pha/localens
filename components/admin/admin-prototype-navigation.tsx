'use client';
import {createContext,useContext,type ReactNode} from 'react';
export const PrototypeNavigation=createContext<(href:string)=>void>(()=>{});
export default function PrototypeLink({href,children}:{href:string;children:ReactNode}){
 const navigate=useContext(PrototypeNavigation);
 return <button type="button" onClick={()=>navigate(href)}>{children}</button>;
}

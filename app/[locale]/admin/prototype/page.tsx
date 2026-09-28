import {notFound} from 'next/navigation';
import {PortalSurface} from '@/components/portals/portal-surface';
import {isLocale} from '@/lib/i18n/config';
export const dynamicParams=false;
export const metadata={title:'QTV mô phỏng | LocalLens',robots:{index:false,follow:false}};
export function generateStaticParams(){return [{locale:'vi'},{locale:'en'}];}
export default async function Page({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isLocale(locale))notFound();return <PortalSurface locale={locale} expectedRole="admin"/>;}

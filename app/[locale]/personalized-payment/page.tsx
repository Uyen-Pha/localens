import {Suspense} from 'react';
import {notFound} from 'next/navigation';
import {isLocale} from '@/lib/i18n/config';
import {PersonalizedRequestPage} from '@/components/customer/personalized-request-page';
export const dynamicParams=false;
export const metadata={title:'Thanh toán tour cá nhân hóa | LocalLens',robots:{index:false,follow:false}};
export function generateStaticParams(){return [{locale:'vi'},{locale:'en'}];}
export default async function Page({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isLocale(locale))notFound();return <Suspense fallback={<p>Đang tải…</p>}><PersonalizedRequestPage locale={locale} payment/></Suspense>;}

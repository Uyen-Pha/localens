import {Suspense} from 'react';
import {notFound} from 'next/navigation';
import {isLocale} from '@/lib/i18n/config';
import {TourDetailRoute} from '@/components/customer/tour-detail-route';

export const dynamicParams=false;
export function generateStaticParams(){return [{locale:'vi'},{locale:'en'}];}
export const metadata={title:'Tour | LocalLens'};
export default async function TourDetailPage({params}:{params:Promise<{locale:string}>}) {
  const {locale}=await params;
  if(!isLocale(locale)) notFound();
  return <Suspense fallback={<p role="status">{locale==='vi'?'Đang tải thông tin tour…':'Loading tour…'}</p>}><TourDetailRoute locale={locale}/></Suspense>;
}

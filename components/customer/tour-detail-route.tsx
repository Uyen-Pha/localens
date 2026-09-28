"use client";
import {useSearchParams} from 'next/navigation';
import {BookingLocalPreview} from '@/components/dev/booking-local-preview';
import type {Locale} from '@/lib/i18n/config';

export function TourDetailRoute({locale}:{locale:Locale}) {
  const params=useSearchParams();
  return <BookingLocalPreview locale={locale} catalog tourSlug={params.get('tour')??''}/>;
}

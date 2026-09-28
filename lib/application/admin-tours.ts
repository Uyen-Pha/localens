export type TourContent = {
 name:string;nameEn:string;description:string;descriptionEn:string;category:string;
 pickup:string;pickupEn:string;duration:number;price:number;languages:string;imageUrl:string;
 itinerary:string;itineraryEn:string;included:string;includedEn:string;excluded:string;excludedEn:string;
 cancellation:string;cancellationEn:string;sourceUrl:string;
};
export type TourVersion=TourContent & {version:number};
export type TourDeparture={id:string;date:string;status:'scheduled'|'sold_out'|'completed'|'cancelled'};
export type AdminTour={id:string;status:'draft'|'published'|'archived';published:TourVersion|null;draft:TourVersion|null;history:TourVersion[];departures:TourDeparture[];/** Customer-facing calendar used by the demo preview; operational actions use departures. */calendarDepartures?:TourDeparture[];updatedAt:string};
export interface AdminToursPort{list():Promise<AdminTour[]>;save(data:TourContent,id?:string):Promise<void>;publish(id:string):Promise<void>;archive(id:string):Promise<void>}
export class AdminTourError extends Error{constructor(message:string,public field?:keyof TourContent){super(message);}}
export const activeDepartures=(t:AdminTour)=>t.departures.filter(d=>d.status==='scheduled'||d.status==='sold_out');
export const calendarDepartures=(t:AdminTour)=>t.calendarDepartures??t.departures;
export const currentTour=(t:AdminTour)=>t.draft??t.published!;

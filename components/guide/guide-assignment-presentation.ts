import type { GuideOwnAssignment } from '@/lib/application/guide-assignment/contracts';
import { reviewedDataset } from '@/components/dev/reviewed-tours';
import { tourIllustration } from '@/lib/domain/data/tour-illustrations';

/** The hypothetical timetable uses the same published demo program as /tours.
 * Historical booking snapshots are never overwritten with this presentation. */
export function presentGuideAssignment(item:GuideOwnAssignment,locale:'vi'|'en'):GuideOwnAssignment {
  if(!item.isDemo)return item;
  const tour=reviewedDataset.tours.find(tour=>tour.versionId===item.tourVersionId);
  if(!tour)return item;
  const content=tour.translations[locale];
  return {...item,title:content.title,meetingPoint:content.meetingPoint,imageUrl:tourIllustration(tour.slug).src,
    itinerary:tour.stopPlaceIds.map(id=>{
      const title=reviewedDataset.places.find(place=>place.id===id)?.translations[locale].title;
      if(!title)return null;
      const match=title.match(/^(\d{2}:\d{2}(?:[–-]\d{2}:\d{2})?)\s*·\s*(.*)$/);
      return match?{time:match[1],title:match[2]}:{title};
    }).filter((stop):stop is {title:string;time?:string}=>stop!==null),
  };
}

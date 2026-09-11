'use client';
import {useState} from 'react';
import Image from 'next/image';
import {Share2,Check,MapPin} from 'lucide-react';
import type {Locale} from '@/lib/i18n/config';
export function TourGallery({locale,slug,src,alt}:{locale:Locale;slug:string;src:string;alt:string}) {
 const [shared,setShared]=useState(false),[error,setError]=useState(false);
 const river=slug.includes('waterways');
 return <div className="tour-detail-gallery"><figure className="tour-detail-gallery__main"><Image src={river?'/images/green/saigon-skyline.webp':src} alt={river?(locale==='vi'?'Khung cảnh Sài Gòn bên sông':'Saigon riverfront skyline'):alt} width={1100} height={700} priority/><figcaption><MapPin size={14}/>{locale==='vi'?'TP. Hồ Chí Minh':'Ho Chi Minh City'}</figcaption></figure><div className="tour-detail-gallery__side"><Image src="/images/editorial/saigon-post-office-inset.webp" alt={locale==='vi'?'Kiến trúc Bưu điện Trung tâm Sài Gòn':'Saigon Central Post Office architecture'} width={500} height={340}/><Image src="/images/green/street-food.webp" alt={locale==='vi'?'Hương vị ẩm thực Sài Gòn':'Saigon food'} width={500} height={340}/></div><button className="tour-detail-share" onClick={()=>{void navigator.clipboard.writeText(window.location.href).then(()=>{setShared(true);setError(false);}).catch(()=>setError(true));}}>{shared?<Check size={16}/>:<Share2 size={16}/>} {shared?(locale==='vi'?'Đã sao chép liên kết':'Link copied'):(locale==='vi'?'Chia sẻ':'Share')}</button>{error&&<p role="status">{locale==='vi'?'Bạn có thể sao chép đường dẫn trên thanh địa chỉ để chia sẻ.':'Copy the address from your browser to share this tour.'}</p>}</div>;
}
export function TourFAQs({locale}:{locale:Locale}) {
 const vi=locale==='vi';
 const items=vi?[
 ['Tôi nên chuẩn bị gì?','Bạn nên mang giày thoải mái, nước uống và ô hoặc áo mưa gọn nhẹ. Với các điểm tham quan tôn giáo, hãy chọn trang phục lịch sự.'],
 ['Tôi có yêu cầu riêng về ăn uống thì sao?','Hãy trao đổi về dị ứng hoặc chế độ ăn trước khi xác nhận chuyến đi. Khả năng đáp ứng phụ thuộc vào từng điểm ăn uống trong lịch trình.'],
 ['Sau khi bấm Đặt tour, tôi cần làm gì?','Đăng nhập, kiểm tra ngày đi và số khách, sau đó tiếp tục đến bước thanh toán. Chỗ được giữ trong 15 phút. Trên bản trải nghiệm này, thanh toán được mô phỏng và không thu tiền thật.']
 ]:[
 ['What should I bring?','Wear comfortable shoes and bring water and a compact umbrella or raincoat. Dress respectfully when visiting religious sites.'],
 ['What if I have dietary requirements?','Discuss any allergies or dietary requirements before confirming your trip. What can be accommodated depends on the venues in your itinerary.'],
 ['What happens after I select Book tour?','Sign in, check your date and group size, then continue to payment. Places are held for 15 minutes. Payments in this preview are simulated; no real charge is made.']
 ];
 return <section className="tour-detail-faq"><h2>{vi?'Câu hỏi thường gặp':'Frequently asked questions'}</h2><div>{items.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>;
}

'use client';
import {PrototypeNavigation} from './admin-prototype-navigation';
import {useState} from 'react';
import {Leaf,House,CalendarDays,Users,MapPin,Map,ClipboardList,BarChart3,Menu,X,ShieldCheck} from 'lucide-react';
import {AdminAccounts} from './admin-accounts';
import {AdminPlaces} from './admin-places';
import {AdminTours} from './admin-tours';
import {AdminDepartures} from './admin-departures';
import {AdminBookingsPreview} from './admin-bookings-preview';
import {AdminReportsPreview} from './admin-reports-preview';
import {createDemoAdminAccountsPort} from '@/lib/infrastructure/demo/admin-accounts';
import {createDemoAdminPlacesPort} from '@/lib/infrastructure/demo/admin-places';
import {createAdminPrototypeWorkspace} from '@/lib/infrastructure/demo/admin-workspace';
import s from './admin-prototype.module.css';

const sections=[['overview','Tổng quan',House],['bookings','Đơn đặt tour',ClipboardList],['departures','Lịch khởi hành',CalendarDays],['accounts','Quản lý tài khoản',ShieldCheck],['places','Quản lý địa điểm',MapPin],['tours','Quản lý tour cố định',Map],['reports','Báo cáo & Thống kê',BarChart3]] as const;
type Section=typeof sections[number][0];
export function AdminPrototype(){
 const [section,setSection]=useState<Section>('overview');
 const [menu,setMenu]=useState(false);
 const [revision,setRevision]=useState(0);
 const [workspace]=useState(()=>createAdminPrototypeWorkspace(()=>setRevision(v=>v+1)));
 const [ports]=useState(()=>({accounts:createDemoAdminAccountsPort(),places:createDemoAdminPlacesPort(),tours:workspace.tours}));
 const [visited,setVisited]=useState<Section[]>(['overview']);
 function select(next:Section){setSection(next);setVisited(v=>v.includes(next)?v:[...v,next]);setMenu(false);}
 const screens={accounts:<AdminAccounts port={ports.accounts}/>,places:<AdminPlaces port={ports.places}/>,tours:<AdminTours port={ports.tours} revision={revision}/>,departures:<AdminDepartures workspace={workspace} revision={revision}/>,bookings:<AdminBookingsPreview/>,reports:<AdminReportsPreview/>};
 return <PrototypeNavigation.Provider value={href=>{const target=href.split('/')[3];select(sections.some(([key])=>key===target)?target as Section:'overview');}}><div className={s.root}>
  <aside className={`${s.sidebar} ${menu?s.open:''}`}><div className={s.brand}><Leaf/><span>LocalLens<small>Không gian quản trị</small></span></div><nav aria-label="Điều hướng quản trị">{sections.map(([key,label,Icon])=><button key={key} aria-current={key===section?'page':undefined} onClick={()=>select(key)}><Icon size={19}/><span>{label}</span></button>)}</nav><p className={s.sideNote}>Nguyên mẫu giao diện<br/>Không kết nối dữ liệu thật</p></aside>
  <div className={s.workspace}><header className={s.header}><button className={s.mobile} aria-label={menu?'Đóng menu quản trị':'Mở menu quản trị'} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button><strong>{sections.find(([key])=>key===section)?.[1]}</strong><span className={s.identity}><Users size={22}/><span>Quản trị viên mẫu<small>Prototype · dữ liệu mô phỏng</small></span></span></header>
   <p className={s.notice} role="note">Dữ liệu mô phỏng — thao tác chỉ lưu tạm trong trình duyệt, không ghi Supabase. Thay đổi sẽ mất khi tải lại trang.</p>
   <div className={s.content}>
    <section hidden={section!=='overview'} className={s.overview}><p>KHÔNG GIAN QUẢN TRỊ LOCALLENS</p><h1>Tổng quan quản trị</h1><p>Minh họa thao tác quản trị của nguyên mẫu LocalLens.</p><div className={s.cards}>{sections.filter(([key])=>key!=='overview').map(([key,label,Icon])=><button onClick={()=>select(key)} key={key}><Icon/><h2>{label}</h2><span>Mở màn hình mô phỏng</span></button>)}</div><p>Planner, báo giá, phân công hướng dẫn viên, hủy đơn và thanh toán thật không bị thay đổi trong bản này. Đơn đặt tour và thanh toán tại đây chỉ để xem dữ liệu mẫu.</p></section>
    {visited.filter((key):key is Exclude<Section,'overview'>=>key!=='overview').map(key=><div key={key} hidden={section!==key}>{screens[key]}</div>)}
   </div>
  </div>
 </div></PrototypeNavigation.Provider>;
}

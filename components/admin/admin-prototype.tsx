'use client';
import {PrototypeNavigation} from './admin-prototype-navigation';
import {useState, type ReactNode} from 'react';
import {Leaf,House,CalendarDays,Users,MapPin,Map,ClipboardList,BarChart3,Menu,X,ShieldCheck} from 'lucide-react';
import {AdminAccounts} from './admin-accounts';
import {AdminPlaces} from './admin-places';
import {AdminTours} from './admin-tours';
import {AdminDepartures} from './admin-departures';
import {AdminBookingsPreview} from './admin-bookings-preview';
import {AdminReportsPreview} from './admin-reports-preview';
import {AdminAssignmentsFixture} from '@/components/dev/admin-assignments-fixture';
import {createDemoAdminAccountsPort} from '@/lib/infrastructure/demo/admin-accounts';
import {createDemoAdminPlacesPort} from '@/lib/infrastructure/demo/admin-places';
import {createAdminPrototypeWorkspace} from '@/lib/infrastructure/demo/admin-workspace';
import s from './admin-prototype.module.css';

const baseSections=[['overview','Tổng quan',House],['bookings','Đơn đặt tour',ClipboardList],['departures','Lịch khởi hành',CalendarDays],['accounts','Quản lý tài khoản',ShieldCheck],['places','Quản lý địa điểm',MapPin],['tours','Quản lý tour cố định',Map],['reports','Báo cáo & Thống kê',BarChart3]] as const;
type Section=typeof baseSections[number][0] | 'assignments' | 'operations';
export function AdminPrototype({identity,onSignOut,signOutLabel='Đăng xuất',actionError,connectedScreens={}}:{identity?:{displayName:string;email:string};onSignOut?:()=>void;signOutLabel?:string;actionError?:string|null;connectedScreens?:Partial<Record<Section,ReactNode>>}={}){
 const sections=[...baseSections.slice(0,2),['assignments','Phân công hướng dẫn viên',Users] as const,...baseSections.slice(2,6),...(connectedScreens.operations ? [['operations','Tour cá nhân hóa',ClipboardList] as const] : []),...baseSections.slice(6)];
 const [section,setSection]=useState<Section>('overview');
 const [menu,setMenu]=useState(false);
 const [revision,setRevision]=useState(0);
 const [workspace]=useState(()=>createAdminPrototypeWorkspace(()=>setRevision(v=>v+1)));
 const [ports]=useState(()=>({accounts:createDemoAdminAccountsPort(),places:createDemoAdminPlacesPort(),tours:workspace.tours}));
 const [visited,setVisited]=useState<Section[]>(['overview']);
 function select(next:Section){setSection(next);setVisited(v=>v.includes(next)?v:[...v,next]);setMenu(false);}
 const screens:Partial<Record<Section,ReactNode>>={assignments:<AdminAssignmentsFixture/>,accounts:<AdminAccounts port={ports.accounts}/>,places:<AdminPlaces port={ports.places}/>,tours:<AdminTours port={ports.tours} revision={revision}/>,departures:<AdminDepartures workspace={workspace} revision={revision}/>,bookings:<AdminBookingsPreview/>,reports:<AdminReportsPreview/>,...connectedScreens};
 return <PrototypeNavigation.Provider value={href=>{const target=href.split('/')[3];select(sections.some(([key])=>key===target)?target as Section:'overview');}}><div className={s.root}>
  <aside className={`${s.sidebar} ${menu?s.open:''}`}><div className={s.brand}><Leaf/><span>LocalLens<small>Không gian quản trị</small></span></div><nav aria-label="Điều hướng quản trị">{sections.map(([key,label,Icon])=><button key={key} aria-current={key===section?'page':undefined} onClick={()=>select(key)}><Icon size={19}/><span>{label}</span></button>)}</nav><p className={s.sideNote}>{connectedScreens[section]?'Phân hệ kết nối':'Phân hệ mẫu · dữ liệu minh họa'}</p></aside>
  <div className={s.workspace}><header className={s.header}><button className={s.mobile} aria-label={menu?'Đóng menu quản trị':'Mở menu quản trị'} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button><strong>{sections.find(([key])=>key===section)?.[1]}</strong><span className={s.identity}><Users size={22}/><span>{identity?.displayName ?? 'Quản trị viên mẫu'}<small>{identity?.email ?? 'Prototype · dữ liệu mô phỏng'}</small></span></span>{onSignOut && <button onClick={onSignOut}>{signOutLabel}</button>}</header>
   {actionError&&<p className={s.notice} role="alert">{actionError}</p>}
   <div className={s.content}>
    {!connectedScreens.overview && <section hidden={section!=='overview'} className={s.overview}><p>KHÔNG GIAN QUẢN TRỊ LOCALLENS</p><h1>Tổng quan quản trị</h1><p>Chọn một phân hệ để bắt đầu quản lý.</p><div className={s.cards}>{sections.filter(([key])=>key!=='overview').map(([key,label,Icon])=><button onClick={()=>select(key)} key={key}><Icon/><h2>{label}</h2><span>Mở trang quản lý</span></button>)}</div></section>}{section==='overview' && connectedScreens.overview}
    {visited.filter((key):key is Exclude<Section,'overview'>=>key!=='overview'&&(!connectedScreens[key]||section===key)).map(key=><div key={key} hidden={section!==key}>{screens[key]}</div>)}
   </div>
  </div>
 </div></PrototypeNavigation.Provider>;
}

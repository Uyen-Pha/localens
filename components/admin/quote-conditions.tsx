'use client';
import {useEffect,useId,useRef,useState} from 'react';
import s from './quote-conditions.module.css';

const includedOptions=[['Vé tham quan theo lịch trình','Vé tham quan'],['Hướng dẫn viên','Hướng dẫn viên'],['Ăn/uống theo chương trình','Ăn/uống'],['Chi phí di chuyển','Di chuyển']] as const;
const excludedOptions=[['Chi phí cá nhân','Chi phí cá nhân'],['Dịch vụ phát sinh','Dịch vụ phát sinh']] as const;
export const defaultQuoteConditions=excludedOptions.map(([name])=>`- Không bao gồm: ${name}`).join('\n');
function parse(value:string){
 const lines=value.split('\n').map(line=>line.trim()).filter(Boolean),selected:string[]=[],other:string[]=[];
 for(const line of lines){
  const label=line.replace(/^- /,'');
  if(includedOptions.some(([name])=>name===label)){selected.push(label);continue;}
  if(excludedOptions.some(([name])=>label===name||label===`Không bao gồm: ${name}`))continue;
  other.push(line.replace(/^Khác: /,''));
 }
 return {selected,other:other.join('\n')};
}
export function QuoteConditions({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}){
 const initial=parse(value),[selected,setSelected]=useState(initial.selected),[other,setOther]=useState(initial.other),[hasOther,setHasOther]=useState(Boolean(initial.other)),[open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),last=useRef(value),id=useId();
 useEffect(()=>{if(value!==last.current){const next=parse(value);setSelected(next.selected);setOther(next.other);setHasOther(Boolean(next.other));last.current=value;}},[value]);
 useEffect(()=>{function outside(event:PointerEvent){if(root.current&&!root.current.contains(event.target as Node))setOpen(false);}document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 function update(items:string[],text:string,includeOther:boolean){setSelected(items);setOther(text);setHasOther(includeOther);const next=[...includedOptions.filter(([name])=>items.includes(name)).map(([name])=>'- '+name),...excludedOptions.map(([name])=>`- Không bao gồm: ${name}`),...(includeOther&&text.trim()?['Khác: '+text.trim()]:[])].join('\n');last.current=next;onChange(next);}
 return <div ref={root} className={s.root} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}}}>
 <p id={id+'-label'} className={s.label}>Điều kiện báo giá</p>
 <button ref={trigger} type="button" className={s.trigger} disabled={disabled} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>Chọn điều kiện báo giá <span aria-hidden="true">{open?'▴':'▾'}</span></button>
 {open&&<div id={id} className={s.menu} role="group" aria-labelledby={id+'-label'}><p className={s.groupLabel}>Bao gồm trong giá</p>{includedOptions.map(([name])=><label key={name}><input type="checkbox" checked={selected.includes(name)} disabled={disabled} onChange={e=>update(e.target.checked?[...selected,name]:selected.filter(v=>v!==name),other,hasOther)}/><span>{name}</span></label>)}<p className={s.groupLabel}>Không bao gồm (mặc định)</p>{excludedOptions.map(([name])=><label key={name} className={s.excludedOption}><input type="checkbox" checked readOnly disabled/><span>{name}</span><small>Không bao gồm</small></label>)}<label><input type="checkbox" checked={hasOther} disabled={disabled} onChange={e=>update(selected,other,e.target.checked)}/><span>Khác</span></label><button type="button" className={s.done} onClick={()=>{setOpen(false);trigger.current?.focus();}}>Xong</button></div>}
 <div className={s.tags}>{includedOptions.filter(([name])=>selected.includes(name)).map(([name,short])=><span key={name}>{short}<button type="button" disabled={disabled} aria-label={'Bỏ '+name} onClick={()=>update(selected.filter(v=>v!==name),other,hasOther)}>×</button></span>)}{excludedOptions.map(([name,short])=><span key={name} className={s.excludedTag}>Không bao gồm: {short}</span>)}{hasOther&&<span>Khác<button type="button" disabled={disabled} aria-label="Bỏ điều kiện khác" onClick={()=>update(selected,other,false)}>×</button></span>}</div>
 {hasOther&&<label className={s.other}>Nội dung khác<textarea aria-label="Nội dung điều kiện khác" value={other} disabled={disabled} required maxLength={3000} placeholder="Nhập dịch vụ hoặc điều kiện bổ sung…" onChange={e=>{e.target.setCustomValidity(e.target.value.trim()?'':'Vui lòng nhập nội dung khác');update(selected,e.target.value,true);}}/></label>}
 <p className={s.hint}>Chọn các dịch vụ đã bao gồm trong giá. Chi phí cá nhân và dịch vụ phát sinh luôn được ghi rõ là không bao gồm.</p>
 </div>;
}

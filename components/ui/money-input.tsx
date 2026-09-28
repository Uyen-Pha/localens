'use client';
import {useEffect,useRef,type InputHTMLAttributes} from 'react';
import {moneyInputDisplay,moneyInputRaw} from '@/lib/format-money-input';
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'|'defaultValue'> & {value:string|number;onValueChange:(raw:string)=>void};
export function MoneyInput({value,onValueChange,name,min,max,step,...props}:Props){
 const input=useRef<HTMLInputElement>(null),hidden=useRef<HTMLInputElement>(null);
 const decimals=step==='0.01'||step===0.01;
 useEffect(()=>{
  const n=Number(value);
  const invalid=value!==''&&(!Number.isFinite(n)||(min!==undefined&&n<Number(min))||(max!==undefined&&n>Number(max)));
  input.current?.setCustomValidity(invalid?'Vui lòng nhập số tiền hợp lệ / Enter a valid amount':'');
 },[value,min,max]);
 return <><input {...props} ref={input} type="text" inputMode={decimals?'decimal':'numeric'} value={moneyInputDisplay(value)} onChange={event=>{
  const raw=moneyInputRaw(event.target.value,decimals);
  if(raw===null)return;
  if(hidden.current)hidden.current.value=raw;
  onValueChange(raw);
 }}/>{name&&<input ref={hidden} type="hidden" name={name} value={value} disabled={props.disabled}/>}</>;
}

/** Display grouping is independent of the page language; stored values stay numeric. */
export function moneyInputDisplay(value:string|number):string{
 const raw=String(value);
 if(!/^\d*(?:\.\d*)?$/.test(raw))return '';
 const [whole,fraction]=raw.split('.');
 return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(fraction===undefined?'':','+fraction);
}
export function moneyInputRaw(display:string,decimals:boolean):string|null{
 const raw=display.replace(/[.\s\u00a0]/g,'').replace(',','.');
 return (decimals?/^\d*(?:\.\d{0,2})?$/:/^\d*$/).test(raw)?raw.replace(/^0+(?=\d)/,''):null;
}

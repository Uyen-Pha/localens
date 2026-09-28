'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import styles from './review-tour-dialog.module.css';

export function ReviewModal({title,closeLabel,busy,onClose,children}:{title:string;closeLabel:string;busy:boolean;onClose:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=ref.current;const trigger=document.activeElement as HTMLElement|null;element?.showModal();return()=>{element?.close();if(trigger?.isConnected)trigger.focus();};},[]);
 return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}><button type="button" className={styles.close} aria-label={closeLabel} disabled={busy} onClick={onClose}>×</button><h2>{title}</h2>{children}</dialog>;
}

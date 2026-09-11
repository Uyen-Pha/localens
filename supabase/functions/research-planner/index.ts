import {createClient} from '@supabase/supabase-js';
import {researchPlan} from '@/lib/application/planner/research-planner';
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
const recent=new Map<string,number>();
Deno.serve(async request=>{
 const origin=request.headers.get('origin')??'';
 const allowed=(Deno.env.get('ALLOWED_ORIGINS')??'').split(',').map(s=>s.trim());
 const headers={'content-type':'application/json','cache-control':'no-store','vary':'Origin',...(allowed.includes(origin)?{'access-control-allow-origin':origin}:{}),'access-control-allow-headers':'authorization, apikey, content-type, x-client-info','access-control-allow-methods':'POST, OPTIONS'};
 const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
 if(origin&&!allowed.includes(origin))return respond({error:'origin'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return respond({error:'method'},405);
 try{
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)return respond({error:'auth'},401);
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false}});
  const {data,error}=await client.auth.getUser(token);if(error||!data.user)return respond({error:'auth'},401);
  const now=Date.now();for(const [id,time]of recent)if(now-time>60000)recent.delete(id);
  if(now-(recent.get(data.user.id)??0)<5000)return respond({error:'busy'},429);
  const text=await request.text();if(text.length>12000)return respond({error:'input'},400);
  let body:unknown;try{body=JSON.parse(text);}catch{return respond({error:'input'},400);}
  recent.set(data.user.id,now);
  const result=await researchPlan(body,async input=>{
   const key=Deno.env.get('GEMINI_API_KEY');
   if(!key||Deno.env.get('LOCALLENS_RESEARCH_GEMINI_ENABLED')!=='1')throw Error('AI unavailable');
   const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',{
    method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},signal:AbortSignal.timeout(45000),
    body:JSON.stringify({systemInstruction:{parts:[{text:'Order every supplied candidate ID exactly once, using experience priorities as soft preferences and efficient geographic order. Keep every candidate even if its type has zero priority. Never filter by preference. Tag mapping: street_food=local_food, history=history_culture, traditional_market=market_local_life. Return only JSON {"orderedIds":[...]}. Never invent IDs, facts, costs or schedules.'}]},contents:[{role:'user',parts:[{text:JSON.stringify(input)}]}],generationConfig:{temperature:0,responseMimeType:'application/json'}}),
   });
   if(!response.ok)throw Error('AI request failed');
   const raw=await response.text();if(raw.length>65536)throw Error('AI response too large');
   const output=JSON.parse(raw);const content=output.candidates?.[0]?.content?.parts?.[0]?.text;
   if(typeof content!=='string')throw Error('AI response invalid');return JSON.parse(content);
  });
  return respond(result);
 }catch{return respond({status:'ai_error',reasons:['service_unavailable']},503);}
});

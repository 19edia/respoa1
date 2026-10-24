import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/member-support.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/member.html',import.meta.url),'utf8');
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
const snapshot=(overrides={})=>({enabled:true,conversation:{id:1,status:'ai',member_name:'Lyra',model:'gpt-oss:20b',processing:false},messages:[],ticket:null,...overrides});

// DOM behavior checks; this deliberately does not claim a screenshot/browser review.
function fixture(handler=async()=>snapshot()){
 class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.attrs={};this.events={};this.value='';this.hidden=false;this.disabled=false;this.scrollHeight=100;this.scrollTop=0;this.clientHeight=100;this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  set innerHTML(_){throw new Error('Conversation text must never be interpreted as HTML');}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this._text='';this.children=[];this.append(...nodes);}
  setAttribute(key,value){this.attrs[key]=value;}removeAttribute(key){delete this.attrs[key];if(key==='href')delete this.href;}
  addEventListener(event,fn){this.events[event]=fn;}
 }
 const ids=[...html.matchAll(/\bid="(support-[^"]+)"/g)].map(m=>m[1]),nodes=new Map(ids.map(id=>[id,new Element()])),listeners={},timers=new Map(),calls=[];
 let member={name:'Lyra',discord_id:'100'},timerId=0,requestId=0,unauthorized=0;
 const document={hidden:false,getElementById:id=>{assert.ok(nodes.has(id),`Missing HTML node ${id}`);return nodes.get(id);},createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('fragment'),addEventListener:(event,fn)=>listeners[event]=fn};
 const window={};runInNewContext(source,{window,document,AbortController,URL,setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),crypto:{randomUUID:()=>`request-${++requestId}`}});
 const controller=window.MemberSupport.create({getMember:()=>member,onUnauthorized:()=>{unauthorized++;controller.reset();member=null;},request:async(...args)=>{calls.push(args);return handler(...args);}});
 return {controller,nodes,calls,timers,document,setMember:value=>member=value,unauthorized:()=>unauthorized,text:()=>nodes.get('support-messages').textContent,
  async open(){controller.setActive(true);await flush();},
  async submit(message){nodes.get('support-input').value=message;nodes.get('support-form').events.submit({preventDefault(){}});await flush();},
  async click(id){nodes.get(id).events.click();await flush();},
  async visibility(hidden){document.hidden=hidden;listeners.visibilitychange();await flush();},
  async poll(){const entry=[...timers.entries()][0];assert.ok(entry,'Expected one scheduled poll');timers.delete(entry[0]);await entry[1].fn();await flush();},
 };
}

test('support only polls in the active visible member view and renders untrusted names/messages as text',async()=>{
 const content='<img src=x onerror=alert(1)>';
 const f=fixture(async()=>snapshot({messages:[{id:1,role:'user',content,author_name:'<script>name</script>',created_at:'2026-10-24T12:00:00Z'}]}));
 assert.equal(f.calls.length,0);await f.open();assert.equal(f.calls.length,1);assert.match(f.text(),/<img src=x onerror=alert\(1\)>/);assert.equal(f.timers.size,1);
 await f.visibility(true);assert.equal(f.timers.size,0);await f.visibility(false);assert.equal(f.calls.length,2);
 f.controller.setActive(false);assert.equal(f.timers.size,0);await f.visibility(false);assert.equal(f.calls.length,2);
});

test('message failures preserve the draft and request ID; success clears only the submitted draft',async()=>{
 let fail=true;
 const f=fixture(async(path,method,body)=>{if(path==='/support/messages'&&fail)throw new Error('Rede indisponível');return snapshot({messages:body?[{role:'user',content:body.message}]:[]});});
 await f.open();await f.submit('Minha carteira não abre');const sent=f.calls.at(-1);
 assert.equal(sent[1],'POST');assert.equal(sent[4].timeoutMs,90000);assert.equal(f.nodes.get('support-input').value,'Minha carteira não abre');assert.match(f.nodes.get('support-feedback').textContent,/mantida/);
 fail=false;await f.submit('Minha carteira não abre');assert.equal(f.calls.at(-1)[2].requestId,sent[2].requestId);assert.equal(f.nodes.get('support-input').value,'');
 await f.submit('Outro assunto');assert.notEqual(f.calls.at(-1)[2].requestId,sent[2].requestId);
 const count=f.calls.length;await f.submit(' '.repeat(2));await f.submit('a'.repeat(2001));assert.equal(f.calls.length,count);
});

test('processing conflict polls quickly and does not lose the request for a safe retry',async()=>{
 let conflict=true;const f=fixture(async path=>{if(path==='/support/messages'&&conflict)throw Object.assign(new Error('Processando'),{status:409});return snapshot();});
 await f.open();await f.submit('Como funciona o tryout?');const token=f.calls.at(-1)[2].requestId;
 assert.equal(f.nodes.get('support-send').disabled,true);assert.equal(f.nodes.get('support-handoff').disabled,false);assert.equal([...f.timers.values()][0].ms,2500);
 conflict=false;await f.poll();assert.equal(f.nodes.get('support-send').disabled,false);await f.submit('Como funciona o tryout?');assert.equal(f.calls.at(-1)[2].requestId,token);
});

test('human handoff interrupts waiting for AI and late AI responses cannot overwrite the human conversation',async()=>{
 let resolveAI;const human=snapshot({conversation:{id:1,status:'human',member_name:'Lyra',model:'gpt-oss:20b'},ticket:{id:9,status:'aberto',channel_url:'https://discord.com/channels/123/456'},messages:[{role:'staff',content:'Recebi seu histórico.',author_name:'Comandante HB'}]});
 const f=fixture(async path=>path==='/support/messages'?new Promise(resolve=>resolveAI=resolve):path==='/support/handoff'?human:snapshot());
 await f.open();await f.submit('Estou com um problema');const messageCall=f.calls.at(-1);
 assert.equal(f.nodes.get('support-handoff').disabled,false);await f.click('support-handoff');assert.equal(messageCall[4].signal.aborted,true);
 assert.equal(f.calls.at(-1)[0],'/support/handoff');assert.equal(f.nodes.get('support-status').textContent,'Com a equipe');assert.match(f.text(),/Comandante HB/);assert.match(f.text(),/Recebi seu histórico/);
 resolveAI(snapshot({messages:[{role:'assistant',content:'Resposta atrasada'}]}));await flush();assert.doesNotMatch(f.text(),/Resposta atrasada/);
 assert.equal(f.nodes.get('support-ticket-link').href,'https://discord.com/channels/123/456');assert.equal(f.nodes.get('support-send').textContent,'Enviar à equipe ↗');
});

test('handoff retains its request ID on retry, human messages continue to the relay, and unsafe ticket links stay hidden',async()=>{
 let failed=true;const human=snapshot({conversation:{status:'human',member_name:'Lyra'},ticket:{status:'aberto',channel_url:'javascript:alert(1)',notification_status:'failed'}});
 const f=fixture(async path=>{if(path==='/support/handoff'){if(failed)throw new Error('Falha temporária');return human;}return path==='/support/messages'?human:snapshot();});
 await f.open();await f.click('support-handoff');const token=f.calls.at(-1)[2].requestId;failed=false;await f.click('support-handoff');assert.equal(f.calls.at(-1)[2].requestId,token);
 assert.equal(f.nodes.get('support-ticket-link').hidden,true);assert.equal(f.nodes.get('support-ticket-link').href,undefined);assert.match(f.nodes.get('support-ticket-status').textContent,/entrega pendente/);
 await f.submit('Obrigado, vou aguardar');assert.equal(f.calls.at(-1)[0],'/support/messages');assert.equal(f.nodes.get('support-input').value,'');
});

test('logout aborts pending support, erases account content and rejects stale results after a different member signs in',async()=>{
 let resolveRequest,first=true;const f=fixture(async()=>first?new Promise(resolve=>resolveRequest=resolve):snapshot({conversation:{status:'ai',member_name:'Kael'}}));
 await f.open();const request=f.calls[0];f.controller.reset();f.setMember(null);assert.equal(request[4].signal.aborted,true);assert.equal(f.text(),'');assert.equal(f.timers.size,0);
 first=false;f.setMember({name:'Kael',discord_id:'200'});await f.open();assert.match(f.text(),/Kael/);
 resolveRequest(snapshot({messages:[{role:'user',content:'Conteúdo privado de Lyra'}]}));await flush();assert.doesNotMatch(f.text(),/Lyra/);
});

test('expired authentication returns to access and never schedules more support reads',async()=>{
 const f=fixture(async()=>{throw Object.assign(new Error('Sessão expirada'),{status:401});});await f.open();assert.equal(f.unauthorized(),1);assert.equal(f.timers.size,0);assert.equal(f.text(),'');
});

test('member API adapter forwards CSRF, credentials, timeout and abort from the support controller',async()=>{
 const memberSource=readFileSync(new URL('../public/member.js',import.meta.url),'utf8'),start=memberSource.indexOf('async function api('),end=memberSource.indexOf('function authMode(',start),calls=[],timers=[],context={session:{csrf:'fixture-csrf'},AbortController,setTimeout:(fn,ms)=>{timers.push(ms);return 1;},clearTimeout(){},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>snapshot()};}};
 runInNewContext(memberSource.slice(start,end)+'globalThis.request=api;',context);const abort=new AbortController();await context.request('/support/messages','POST',{message:'Olá',requestId:'request-1'},false,{signal:abort.signal,timeoutMs:90000});
 assert.equal(calls[0].url,'/api/member/support/messages');assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.headers['X-CSRF-Token'],'fixture-csrf');assert.equal(timers[0],90000);
 const stopped=new AbortController();stopped.abort();await context.request('/support','GET',undefined,false,{signal:stopped.signal});assert.equal(calls[1].options.signal.aborted,true);
 assert.match(memberSource,/memberSupport\.setActive\(view==='services'\)/);assert.match(memberSource,/function showAccess\(\)\{memberSupport\.reset\(\)/);
});

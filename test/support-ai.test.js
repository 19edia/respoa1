import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createSupportService,parseSupportAnswer,supportEndpoint} from '../src/support-ai.js';

const guild='211111111111111111',attendant='1480009495915659494';
const config={secret:'test-private-server-secret',tryouts:{enabled:false},divisions:[{id:1,guild}],support:{enabled:true,baseUrl:'https://ollama.com',apiKey:'test-private-ollama-secret',model:'gpt-oss:20b',attendantId:attendant,timeoutMs:1000}};
let db,pool,sequence=0,leased=0;
const response=(answer='Seu cadastro pode ser consultado no painel de membros.',handoff=false,reason='')=>({ok:true,json:async()=>({message:{content:JSON.stringify({answer,handoff,reason}),thinking:'INTERNAL_THINKING_DO_NOT_EXPOSE'}})});
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const get=async(sql,args)=>(await pool.query(sql,args)).rows;
async function member(name='Membro de teste'){
 const n=++sequence;
 return (await get('INSERT INTO members(ifj,name,game_nick,roblox_username,discord_id,division,verified,member_rank) VALUES($1,$2,$3,$4,$5,1,true,$6) RETURNING *',[String(100000000000000+n),name,'Nick '+n,'Player'+n,String(311111111111111111n+BigInt(n)),'Veterano']))[0];
}
const service=(fetchImpl=async()=>response(),overrides={})=>createSupportService(pool,{...config,...overrides},{fetchImpl});
async function ticket(m,{status='aberto',channel=null}={}){return (await get('INSERT INTO tickets(guild_id,user_id,member_id,idrkc,card_version,status,channel_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[guild,m.discord_id,m.id,m.idrkc,m.identity_version,status,channel]))[0];}
async function jobsFor(m){return get('SELECT j.* FROM jobs j JOIN tickets t ON (j.payload->>\'ticketId\')::integer=t.id WHERE t.member_id=$1 ORDER BY j.id',[m.id]);}
before(async()=>{
 db=new PGlite();
 for(const f of ['schema.sql','district-schema.sql','sbi-schema.sql','member-portal-schema.sql','idrkc-schema.sql','verified-services-schema.sql','embed-publications-schema.sql','registration-invites-schema.sql','card-login-schema.sql','tryouts-schema.sql','support-ai-schema.sql'])await db.exec(await readFile(new URL('../src/'+f,import.meta.url),'utf8'));
 let tail=Promise.resolve();
 pool={query:async(sql,args)=>{if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};},connect:async()=>{const previous=tail;let release;tail=new Promise(r=>{release=r;});await previous;leased++;return {...pool,release:()=>{leased--;release();}};}};
});
after(async()=>db.close());

test('Ollama endpoint and output parser reject unsafe addresses, malformed JSON and hidden reasoning',()=>{
 assert.equal(supportEndpoint('https://ollama.com/api/'),'https://ollama.com/api/chat');
 for(const input of ['file:///secret','https://secret@ollama.com','https://ollama.com/api/chat','https://ollama.com?key=private'])assert.throws(()=>supportEndpoint(input),/API|serviço/);
 for(const content of ['answer','[]','{"answer":"ok","handoff":false}','{"answer":"ok","handoff":"false","reason":""}','{"answer":"ok","handoff":false,"reason":"","tools":[]}',JSON.stringify({answer:'<think>secret</think>',handoff:false,reason:''}),JSON.stringify({answer:'a'.repeat(2001),handoff:false,reason:''})])assert.equal(parseSupportAnswer({message:{content}}),null);
 assert.equal(parseSupportAnswer({message:{content:JSON.stringify({answer:'Não tenho certeza sobre isso.',handoff:false,reason:''})}}).handoff,true);
});

test('missing cloud key transfers without an anonymous HTTP request and nontext payloads are rejected',async()=>{
 const m=await member();let calls=0;
 const s=service(async()=>{calls++;throw Error('must not request without credentials');},{support:{...config.support,apiKey:''}});
 for(const value of [undefined,null,{},[],5])await assert.rejects(s.send(m,{message:value,requestId:'invalid-input'}),{status:400});
 const result=await s.send(m,{message:'Preciso de ajuda com minha carteira.',requestId:'cloud-without-key'});
 assert.equal(calls,0);assert.equal(result.enabled,false);assert.equal(result.conversation.status,'human');assert.ok(result.ticket);
});

test('native cloud request uses Bearer, configured model and no unsupported format; memory is private and durable',async()=>{
 const alice=await member('Alice Autêntica'),bob=await member('Bob Oculto');let calls=0,payload;
 const fetchImpl=async(url,options)=>{
  calls++;assert.equal(leased,0,'network call must not hold a transaction');assert.equal(url,'https://ollama.com/api/chat');
  assert.equal(options.headers.Authorization,'Bearer '+config.support.apiKey);assert.equal(options.redirect,'error');assert.ok(options.signal);
  payload=JSON.parse(options.body);assert.equal(payload.model,'gpt-oss:20b');assert.equal(payload.stream,false);assert.equal(payload.think,'low');assert.equal(payload.options.num_predict,2000);assert.equal(payload.format,undefined);assert.equal(payload.tools,undefined);
  return response('Olá, Alice! O prazo de cadastro é de 48 horas.');
 };
 await service().send(bob,{message:'Meu segredo é azul.',requestId:'bob-secret'});
 const input={...alice,name:'Nome falso injetado'};
 const first=await service(fetchImpl).send(input,{message:'Qual é o prazo de cadastro?',requestId:'alice-first'});
 assert.equal(first.conversation.member_name,'Alice Autêntica');assert.equal(first.conversation.status,'ai');assert.equal(first.messages.length,2);assert.equal(first.ticket,null);
 const prompt=JSON.stringify(payload);assert.match(prompt,/Alice Autêntica/);assert.match(prompt,/Veterano/);assert.doesNotMatch(prompt,/Bob Oculto|Meu segredo é azul|Nome falso injetado|card_secret|test-private-/);
 assert.doesNotMatch(JSON.stringify(first),/INTERNAL_THINKING/);
 await service(fetchImpl).send(alice,{message:'Você lembra da minha pergunta anterior?',requestId:'alice-second'});
 assert.equal(calls,2);assert.ok(payload.messages.some(m=>m.content==='Qual é o prazo de cadastro?'));assert.ok(payload.messages.some(m=>m.role==='assistant'&&m.content.includes('48 horas')));
 assert.equal((await service().state(alice)).messages.length,4);assert.equal((await jobsFor(alice)).length,0);
});

test('completed and concurrent duplicate sends infer once, reject conflicting IDs and serialize other messages',async()=>{
 const m=await member(),entered=defer(),finish=defer();let calls=0;
 const s=service(async()=>{calls++;entered.resolve();await finish.promise;return response();});
 const original=s.send(m,{message:'Como consultar minha carteira?',requestId:'same'});await entered.promise;
 const duplicate=await s.send(m,{message:'Como consultar minha carteira?',requestId:'same'});
 assert.equal(duplicate.conversation.processing,true);assert.equal(duplicate.messages.length,1);
 await assert.rejects(s.send(m,{message:'Outra pergunta',requestId:'another'}),{status:409});
 await assert.rejects(s.send(m,{message:'Outra pergunta',requestId:'same'}),{status:409});
 finish.resolve();await original;
 assert.equal((await s.send(m,{message:'Como consultar minha carteira?',requestId:'same'})).messages.length,2);assert.equal(calls,1);
});

test('an expired processing lease allows the same request to recover and rejects a late older answer',async()=>{
 const m=await member(),entered=defer(),finish=defer();
 const slow=service(async()=>{entered.resolve();await finish.promise;return response('Resposta antiga que deve sumir');});
 const original=slow.send(m,{message:'Como funciona o cadastro?',requestId:'recover'});await entered.promise;
 await pool.query("UPDATE support_conversations SET processing_until=now()-interval '1 second' WHERE member_id=$1",[m.id]);
 const recovered=await service(async()=>response('Resposta recuperada')).send(m,{message:'Como funciona o cadastro?',requestId:'recover'});
 finish.resolve();const final=await original;
 assert.equal(recovered.messages.length,2);assert.equal(final.messages.length,2);assert.equal(final.messages.at(-1).content,'Resposta recuperada');assert.equal(final.conversation.processing,false);
});

test('explicit human requests open one ticket with private context jobs and deduplicate retries',async()=>{
 const m=await member('Pessoa pedindo ajuda');let calls=0;const s=service(async()=>{calls++;throw Error('must not infer');});
 const first=await s.send(m,{message:'Quero falar com um atendente',requestId:'human'});
 assert.equal(first.conversation.status,'human');assert.equal(first.ticket.notification_status,'pending');assert.equal(first.ticket.channel_url,null);
 await s.send(m,{message:'Quero falar com um atendente',requestId:'human'});
 await s.handoff(m,{requestId:'button'});await s.handoff(m,{requestId:'button'});
 assert.equal(calls,0);assert.equal((await get('SELECT * FROM tickets WHERE member_id=$1',[m.id])).length,1);
 assert.deepEqual((await jobsFor(m)).map(j=>j.kind),['verified-ticket-open','support-handoff']);
 assert.equal((await s.state(m)).messages.filter(m=>m.role==='system').length,1);
 await assert.rejects(s.handoff(m,{requestId:'button',reason:'Outra mensagem'}),{status:409});
});

test('handoff cancels a pending model reply immediately and new site messages relay exactly once',async()=>{
 const m=await member(),entered=defer(),finish=defer();
 const s=service(async()=>{entered.resolve();await finish.promise;return response('NÃO PUBLICAR APÓS TRANSFERÊNCIA');});
 const pending=s.send(m,{message:'Preciso de informações',requestId:'waiting'});await entered.promise;
 const handoff=await s.handoff(m,{requestId:'takeover'});assert.equal(handoff.conversation.processing,false);
 finish.resolve();const done=await pending;assert.equal(done.conversation.status,'human');assert.ok(done.messages.every(m=>m.role!=='assistant'));
 await s.send(m,{message:'Aqui estão mais detalhes',requestId:'detail'});await s.send(m,{message:'Aqui estão mais detalhes',requestId:'detail'});
 await s.send(m,{message:'Mensagem já no Discord',requestId:'discord:1',source:'discord',ticketId:handoff.ticket.id});
 const jobs=await jobsFor(m);assert.equal(jobs.filter(j=>j.kind==='support-member-message').length,1);assert.equal(jobs.filter(j=>j.kind==='support-discord-reply').length,0);
});

test('uncertainty, invalid outputs, cloud errors, timeout, disabled model and privileged requests transfer safely',async()=>{
 const cases=[
  {fetch:async()=>response('Talvez consiga resolver dessa forma.')},
  {fetch:async()=>response('Precisa de análise',true,'  ')},
  {fetch:async()=>({ok:true,json:async()=>({message:{content:'<think>PRIVATE_SECRET</think>maybe'}})})},
  {fetch:async()=>({ok:false,status:401,json:async()=>{throw Error('PRIVATE_SECRET');}})},
  {fetch:async()=>{throw Error('PRIVATE_SECRET '+config.support.apiKey);}},
  {fetch:async(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))},
  {fetch:async()=>{throw Error('must not call');},config:{support:{...config.support,enabled:false}}},
  {fetch:async()=>{throw Error('must not call');},message:'Quero alterar minha patente'},
 ];
 for(const scenario of cases){
  const m=await member();const result=await service(scenario.fetch,scenario.config).send(m,{message:scenario.message||'Como resolve este problema?',requestId:'fallback'});
  assert.equal(result.conversation.status,'human');assert.equal(result.messages.filter(m=>m.role==='assistant').length,0);
  assert.doesNotMatch(JSON.stringify(result)+JSON.stringify(await jobsFor(m)),/PRIVATE_SECRET|test-private-|<think>/);
  assert.deepEqual((await jobsFor(m)).map(j=>j.kind),['verified-ticket-open','support-handoff']);
 }
});

test('existing ordinary Discord ticket is reused, AI reply is queued and staff takeover is mirrored in memory',async()=>{
 const m=await member(),t=await ticket(m,{channel:'411111111111111111'});const s=service();
 const result=await s.send(m,{message:'Onde vejo a carteira?',requestId:'discord:10',source:'discord',ticketId:t.id});
 assert.equal(result.ticket.id,t.id);assert.equal(result.ticket.channel_url,`https://discord.com/channels/${guild}/411111111111111111`);
 await s.send(m,{message:'Onde vejo a carteira?',requestId:'discord:10',source:'discord',ticketId:t.id});
 assert.deepEqual((await jobsFor(m)).map(j=>j.kind),['support-discord-reply']);
 await assert.rejects(s.recordStaffReply(t.id,{content:'forged',authorId:'wrong',externalId:'forged'}),{status:403});
 const staff=await s.recordStaffReply(t.id,{content:'Vou verificar seu acesso.',authorId:attendant,authorName:'Dono da guilda',externalId:'discord:11'});
 assert.equal(staff.conversation.status,'human');assert.equal(staff.messages.at(-1).role,'staff');
 await s.recordStaffReply(t.id,{content:'Vou verificar seu acesso.',authorId:attendant,authorName:'Dono da guilda',externalId:'discord:11'});
 assert.equal((await s.state(m)).messages.filter(m=>m.role==='staff').length,1);
 assert.equal((await s.ticketContext(t.id)).member.nome,m.name);
});

test('handoff reuses an existing ticket and retries a previously failed channel creation job',async()=>{
 const m=await member(),t=await ticket(m);const job=(await get("INSERT INTO jobs(kind,payload,status,attempts,error) VALUES('verified-ticket-open',$1,'failed',5,'temporary') RETURNING *",[JSON.stringify({ticketId:t.id,division:1})]))[0];
 await pool.query('UPDATE tickets SET notification_job_id=$1 WHERE id=$2',[job.id,t.id]);
 await service().handoff(m,{requestId:'retry-channel'});
 const again=(await get('SELECT * FROM jobs WHERE id=$1',[job.id]))[0];assert.equal(again.status,'pending');assert.equal(again.attempts,0);assert.equal(again.error,null);
 assert.deepEqual((await jobsFor(m)).map(j=>j.kind),['verified-ticket-open','support-handoff']);
});

test('ticket closure returns to AI while keeping memory; an old button retry never reopens a closed ticket',async()=>{
 const m=await member(),s=service();const human=await s.handoff(m,{requestId:'close-once'});
 await pool.query("UPDATE tickets SET status='resolvido' WHERE id=$1",[human.ticket.id]);
 const state=await s.state(m);assert.equal(state.conversation.status,'ai');assert.equal(state.ticket,null);assert.ok(state.messages.length>0);
 const duplicate=await s.handoff(m,{requestId:'close-once'});assert.equal(duplicate.ticket,null);
 let memory;const next=await service(async(_url,options)=>{memory=JSON.parse(options.body);return response('Bem-vindo novamente.');}).send(m,{message:'Uma nova dúvida',requestId:'new-after-close'});
 assert.equal(next.conversation.status,'ai');assert.ok(memory.messages.some(m=>m.content==='O membro pediu um atendente.'));
 const second=await s.handoff(m,{requestId:'new-human'});assert.notEqual(second.ticket.id,human.ticket.id);
 await pool.query('DELETE FROM tickets WHERE id=$1',[second.ticket.id]);assert.equal((await s.state(m)).conversation.status,'ai');
});

test('closing tickets never accept messages destined to be silently lost',async()=>{
 const m=await member(),s=service();const human=await s.handoff(m,{requestId:'begin-closing'});
 await pool.query("UPDATE tickets SET status='fechando' WHERE id=$1",[human.ticket.id]);
 await assert.rejects(s.send(m,{message:'new',requestId:'while-closing'}),{status:409});
 await assert.rejects(s.handoff(m,{requestId:'while-closing-button'}),{status:409});
 assert.equal((await s.state(m)).ticket.status,'fechando');
});

test('identity, verified status, revocation, active guild and ticket ownership cannot be forged',async()=>{
 const alice=await member(),bob=await member(),s=service(),t=await ticket(bob);
 await assert.rejects(s.state(null),{status:401});await assert.rejects(s.state({...alice,discord_id:bob.discord_id}),{status:403});
 await assert.rejects(s.attachTicket(alice,t.id),{status:403});
 await pool.query('UPDATE members SET verified=false WHERE id=$1',[alice.id]);await assert.rejects(s.state(alice),{status:403});
 await pool.query('UPDATE members SET verified=true,card_revoked_at=now() WHERE id=$1',[alice.id]);await assert.rejects(s.state(alice),{status:403});
 await pool.query('UPDATE members SET card_revoked_at=NULL WHERE id=$1',[alice.id]);await assert.rejects(service(undefined,{divisions:[]}).state(alice),{status:403});
 await assert.rejects(service(undefined,{tryouts:{enabled:true}}).state(alice),{status:403});
});

test('revoking access during inference prevents reply persistence or Discord delivery',async()=>{
 const m=await member(),entered=defer(),finish=defer();const s=service(async()=>{entered.resolve();await finish.promise;return response('stale answer');});
 const pending=s.send(m,{message:'Minha pergunta',requestId:'revoked'});await entered.promise;
 await pool.query('UPDATE members SET card_revoked_at=now() WHERE id=$1',[m.id]);finish.resolve();await assert.rejects(pending,{status:403});
 const messages=await get("SELECT sm.* FROM support_messages sm JOIN support_conversations c ON c.id=sm.conversation_id WHERE c.member_id=$1 AND sm.role='assistant'",[m.id]);assert.equal(messages.length,0);assert.equal((await jobsFor(m)).length,0);
});

test('input limits, source validation and known credentials are enforced before persistence and output',async()=>{
 const m=await member();let requestBody;const s=service(async(_url,options)=>{requestBody=options.body;return response('Chave: '+config.support.apiKey+' Bearer private-value');});
 for(const message of ['', 'x'.repeat(2001)])await assert.rejects(s.send(m,{message,requestId:'invalid'}),{status:400});
 for(const requestId of ['', '<script>', 'x'.repeat(151)])await assert.rejects(s.send(m,{message:'olá',requestId}),{status:400});
 await assert.rejects(s.send(m,{message:'olá',requestId:'bad-source',source:'anonymous'}),{status:400});
 await assert.rejects(s.handoff(m,{requestId:'bad-source',source:'anonymous'}),{status:400});
 const result=await s.send(m,{message:'A chave é '+config.support.apiKey+' Bearer my-secret-value',requestId:'redact'});
 assert.doesNotMatch(requestBody,/test-private-ollama-secret|my-secret-value/);assert.doesNotMatch(JSON.stringify(result),/test-private-ollama-secret|private-value|my-secret-value/);
});

test('model context is bounded to recent messages while persisted history remains available',async()=>{
 const m=await member(),s=service(),state=await s.state(m);
 for(let i=0;i<30;i++)await pool.query('INSERT INTO support_messages(conversation_id,role,content,author_name,external_id) VALUES($1,$2,$3,$4,$5)',[state.conversation.id,i%2?'assistant':'user','history-'+i,m.name,'history-'+i]);
 let payload;const result=await service(async(_url,options)=>{payload=JSON.parse(options.body);return response();}).send(m,{message:'Pergunta atual',requestId:'latest'});
 assert.equal(payload.messages.length,25);assert.equal(payload.messages.at(-1).content,'Pergunta atual');assert.ok(payload.messages.every(m=>m.content!=='history-0'));assert.equal(result.messages.length,32);
});

test('schema is safe to reapply and memory uniqueness survives migration retries',async()=>{
 await db.exec(await readFile(new URL('../src/support-ai-schema.sql',import.meta.url),'utf8'));
 const m=await member(),s=service();const states=await Promise.all([s.state(m),s.state(m)]);assert.equal(states[0].conversation.id,states[1].conversation.id);
 assert.equal((await get('SELECT * FROM support_conversations WHERE member_id=$1',[m.id])).length,1);
});

test('a typed attendant request interrupts pending inference instead of requiring the button',async()=>{
 const m=await member(),entered=defer(),finish=defer();const s=service(async()=>{entered.resolve();await finish.promise;return response('discard');});
 const pending=s.send(m,{message:'Gostaria de uma orientação',requestId:'question-pending'});await entered.promise;
 const human=await s.send(m,{message:'Quero falar com atendente',requestId:'typed-human'});assert.equal(human.conversation.status,'human');
 finish.resolve();assert.ok((await pending).messages.every(m=>m.role!=='assistant'));assert.equal((await jobsFor(m)).filter(j=>j.kind==='support-handoff').length,1);
});

test('native fetch response bodies accept valid completion and reject truncation or oversized thinking envelopes',async()=>{
 const contents={message:{content:JSON.stringify({answer:'Olá! Posso explicar o cadastro.',handoff:false,reason:''}),thinking:'Private reasoning'},done:true,done_reason:'stop'};
 const m=await member();const result=await service(async()=>new Response(JSON.stringify(contents))).send(m,{message:'O que é o cadastro?',requestId:'native-body'});
 assert.equal(result.conversation.status,'ai');assert.doesNotMatch(JSON.stringify(result),/Private reasoning/);
 for(const payload of [{...contents,done:false},{...contents,done_reason:'length'},{...contents,message:{...contents.message,thinking:'x'.repeat(65537)}}]){
  const who=await member();const rejected=await service(async()=>new Response(JSON.stringify(payload))).send(who,{message:'Preciso de ajuda',requestId:'bad-native-body'});
  assert.equal(rejected.conversation.status,'human');assert.ok(rejected.messages.every(m=>m.role!=='assistant'));
 }
});

test('persistent per-identity cloud budget spans service instances and permits human transfer at the limit',async()=>{
 const m=await member();let calls=0;const fetchImpl=async()=>{calls++;return response();};
 for(let i=0;i<12;i++)await service(fetchImpl).send(m,{message:'Pergunta '+i,requestId:'limit-'+i,source:i%2?'discord':'site'});
 assert.equal(calls,12);
 await service(fetchImpl).send(m,{message:'Pergunta 0',requestId:'limit-0'});assert.equal(calls,12,'completed retries consume no inference');
 await assert.rejects(service(fetchImpl).send(m,{message:'Pergunta excedente',requestId:'limit-13'}),{status:429});
 assert.equal((await service().state(m)).messages.length,24,'rate-limited messages are not committed or lost silently');
 const other=await member();await service(fetchImpl).send(other,{message:'Minha pergunta',requestId:'separate-budget'});assert.equal(calls,13);
 await pool.query("UPDATE support_conversations SET inference_window_at=now()-interval '2 minutes' WHERE member_id=$1",[m.id]);
 await service(fetchImpl).send(m,{message:'Posso perguntar agora?',requestId:'after-window'});assert.equal(calls,14);
 await pool.query('UPDATE support_conversations SET inference_count=12 WHERE member_id=$1',[m.id]);
 const human=await service(fetchImpl).send(m,{message:'Quero um atendente',requestId:'human-over-limit'});assert.equal(human.conversation.status,'human');assert.equal(calls,14);
});

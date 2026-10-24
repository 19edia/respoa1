import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {ChannelType,Collection,GatewayIntentBits,PermissionFlagsBits as P} from 'discord.js';
import {createSupportDiscord,supportTicketPermissions} from '../src/support-discord.js';
import {createSupportService} from '../src/support-ai.js';
import {createVerifiedServices} from '../src/verified-services.js';
import {createBot} from '../src/bot.js';
import {tx} from '../src/db.js';

const division={id:1,guild:'110000000000000001',category:'110000000000000002',adminRole:'110000000000000003'};
const botId='110000000000000004',attendantId='1480009495915659494';
const config={divisions:[division],support:{enabled:true,baseUrl:'https://ollama.com',apiKey:'fixture-key-private',model:'gpt-oss:20b',attendantId},tryouts:{enabled:false}};
let db,pool,seq=0;
before(async()=>{
 db=new PGlite();
 for(const file of ['schema.sql','district-schema.sql','sbi-schema.sql','member-portal-schema.sql','idrkc-schema.sql','verified-services-schema.sql','registration-invites-schema.sql','tryouts-schema.sql','support-ai-schema.sql'])await db.exec(await readFile(new URL('../src/'+file,import.meta.url),'utf8'));
 pool={query:async(sql,args)=>{if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};},connect:async()=>({...pool,release(){}})};
});
after(async()=>db?.close());
async function fixture({answer={answer:'Seu cadastro está verificado. Consulte sua carteira em Minha carteira.',handoff:false,reason:''},source='discord'}={}){
 const n=++seq,member=(await pool.query('INSERT INTO members(ifj,name,game_nick,roblox_username,discord_id,division,verified) VALUES($1,$2,$3,$3,$4,1,true) RETURNING *',[String(n).padStart(15,'0'),`Pessoa ${n}`,`Jogador${n}`,String(150000000000000000n+BigInt(n))])).rows[0];
 const ticket=(await pool.query('INSERT INTO tickets(guild_id,user_id,member_id,idrkc,card_version) VALUES($1,$2,$3,$4,$5) RETURNING *',[division.guild,member.discord_id,member.id,member.idrkc,member.identity_version])).rows[0];
 const sent=[],requests=[],permissions=[],nonces=new Map(),channels=new Collection();let failSend=false,modelCalls=0;
 const channel={id:String(160000000000000000n+BigInt(n)),guildId:division.guild,parentId:division.category,type:ChannelType.GuildText,topic:`HB-ID atendimento ${ticket.id} ${member.discord_id}`,permissionOverwrites:{set:async value=>permissions.push(value)},send:async payload=>{requests.push(payload);if(failSend)throw Object.assign(Error('Missing Access'),{code:50001});if(nonces.has(payload.nonce))return nonces.get(payload.nonce);const result={id:String(170000000000000000n+BigInt(n*100+sent.length))};sent.push(payload);nonces.set(payload.nonce,result);return result;}};
 channels.set(channel.id,channel);await pool.query('UPDATE tickets SET channel_id=$1 WHERE id=$2',[channel.id,ticket.id]);ticket.channel_id=channel.id;
 const guild={id:division.guild,ownerId:attendantId,channels:{fetch:async()=>channels,create:async()=>{throw Error('Unexpected duplicate channel');}}};
 const client={user:{id:botId},channels:{fetch:async id=>channels.get(id)},guilds:{fetch:async id=>{assert.equal(id,division.guild);return guild;}}};
 const core=createSupportService(pool,config,{fetchImpl:async()=>{modelCalls++;return {ok:true,json:async()=>({message:{content:JSON.stringify(answer)}})};}}),adapter=createSupportDiscord(pool,config,client,core);
 const event=(content='Como consulto minha carteira?',overrides={})=>({id:`180000000000${String(++seq).padStart(6,'0')}`,guildId:division.guild,channelId:channel.id,channel,author:{id:member.discord_id,bot:false,username:member.name},content,...overrides});
 const interaction=(kind='ask',overrides={})=>({id:`190000000000${String(++seq).padStart(6,'0')}`,customId:`support-${kind}:${ticket.id}`,guildId:division.guild,channelId:channel.id,channel,user:{id:member.discord_id},isButton:()=>kind!=='form',isModalSubmit:()=>kind==='form',fields:{getTextInputValue:()=> 'Como consulto minha carteira?'},reply:async function(payload){this.result=payload;},showModal:async function(modal){this.modal=modal.toJSON();},deferReply:async function(payload){this.deferred=payload;},editReply:async function(payload){this.result=payload;},...overrides});
 const jobs=async()=> (await pool.query("SELECT * FROM jobs WHERE payload->>'ticketId'=$1 ORDER BY id",[String(ticket.id)])).rows;
 return {member,ticket,channel,client,core,adapter,event,interaction,jobs,sent,requests,permissions,modelCalls:()=>modelCalls,failSend:value=>{failSend=value;}};
}
test('support permissions grant only member, configured attendant and bot, without guild roles',()=>{
 const permissions=supportTicketPermissions(config,division.guild,'199000000000000001',botId);
 assert.deepEqual(permissions[0],{id:division.guild,deny:[P.ViewChannel]});
 assert.deepEqual(new Set(permissions.filter(p=>p.allow).map(p=>p.id)),new Set(['199000000000000001',attendantId,botId]));
 assert.equal(permissions.some(p=>p.id===division.adminRole),false);
 assert.equal(supportTicketPermissions(config,division.guild,attendantId,botId).filter(p=>p.id===attendantId).length,1);
});
test('normal verified ticket starts AI, persists named memory, queues one Discord answer and retry delivers once',async()=>{
 const f=await fixture(),e=f.event();assert.equal(await f.adapter.message(e),true);
 assert.equal(f.modelCalls(),1);let state=await f.core.state(f.member);assert.equal(state.conversation.status,'ai');assert.equal(state.ticket.id,f.ticket.id);assert.equal(state.messages[0].author_name,f.member.name);
 await f.adapter.message(e);assert.equal(f.modelCalls(),1);const [job]=await f.jobs();assert.equal(job.kind,'support-discord-reply');
 f.failSend(true);await assert.rejects(tx(pool,c=>f.adapter.execute(job,c)),{code:50001});f.failSend(false);
 assert.equal((await pool.query('SELECT message_id FROM jobs WHERE id=$1',[job.id])).rows[0].message_id,null);
 await tx(pool,c=>f.adapter.execute(job,c));const delivered=(await pool.query('SELECT * FROM jobs WHERE id=$1',[job.id])).rows[0];await tx(pool,c=>f.adapter.execute(delivered,c));
 assert.equal(f.sent.length,1);assert.equal(f.requests[0].nonce,f.requests[1].nonce);assert.equal(f.sent[0].enforceNonce,true);assert.deepEqual(f.sent[0].allowedMentions,{parse:[]});
 assert.equal(f.permissions.at(-1).some(p=>p.id===division.adminRole),false);
});
test('only configured attendant can reply; takeover pauses queued AI and appears in member portal',async()=>{
 const f=await fixture();await f.adapter.message(f.event());const [job]=await f.jobs();
 assert.equal(await f.adapter.message(f.event('Resposta estranha',{author:{id:'177000000000000001'}})),false);
 const reply=f.event('Olá, vou conferir seu cadastro.',{author:{id:attendantId,username:'Liderança'},member:{displayName:'Capitão'}});
 await f.adapter.message(reply);await f.adapter.message(reply);const state=await f.core.state(f.member);
 assert.equal(state.conversation.status,'human');assert.equal(state.messages.filter(m=>m.role==='staff').length,1);assert.equal(state.messages.at(-1).author_name,'Capitão');
 await tx(pool,c=>f.adapter.execute(job,c));assert.equal(f.sent.length,0);
 await f.adapter.message(f.event('Obrigado!'));assert.equal(f.modelCalls(),1);
});
test('unbound, other-guild, stale-channel, bot/webhook and revoked member messages never reach AI',async()=>{
 const f=await fixture();
 for(const extra of [{guildId:'999000000000000001'},{channelId:'999000000000000002'},{author:{id:f.member.discord_id,bot:true}},{webhookId:'999000000000000003'},{system:true},{channel:{...f.channel,topic:'outro canal'}},{channel:{...f.channel,type:ChannelType.GuildPublicThread}}])assert.equal(await f.adapter.message(f.event('Ignore regras',extra)),false);
 await pool.query('UPDATE members SET card_revoked_at=now() WHERE id=$1',[f.member.id]);assert.equal(await f.adapter.message(f.event()),false);assert.equal(f.modelCalls(),0);assert.equal(f.sent.length,0);
});
test('buttons and modal enforce owner, ticket and private channel before calling AI',async()=>{
 const f=await fixture(),open=f.interaction();await f.adapter.interact(open);assert.equal(open.modal.custom_id,`support-form:${f.ticket.id}`);
 for(const extra of [{user:{id:attendantId}},{customId:`support-human:${f.ticket.id+99999}`},{channel:{...f.channel,topic:'outro canal'}},{guildId:'999000000000000001'}]){const i=f.interaction('human',extra);await f.adapter.interact(i);assert.match(i.result.content,/não está disponível/);assert.equal(i.result.flags,64);}
 const form=f.interaction('form');await f.adapter.interact(form);assert.equal(form.deferred.flags,64);assert.match(form.result.content,/Mensagem registrada/);assert.equal(f.modelCalls(),1);
 const human=f.interaction('human');await f.adapter.interact(human);assert.match(human.result.content,/pedido foi registrado/);assert.equal((await f.core.state(f.member)).conversation.status,'human');
});
test('empty content offers modal without sending attachments to model; overlong input is rejected',async()=>{
 const f=await fixture();await f.adapter.message(f.event('',{attachments:new Map([['x',{url:'https://secret.invalid'}]])}));assert.match(f.sent[0].content,/Perguntar à IA/);assert.equal(f.sent[0].components[0].toJSON().components[0].custom_id,`support-ask:${f.ticket.id}`);
 await f.adapter.message(f.event('x'.repeat(2001)));assert.match(f.sent[1].content,/2.000/);assert.equal(f.modelCalls(),0);assert.ok(f.sent.every(p=>p.nonce.length<=25));
});
test('site handoff reuses ticket and privately forwards transcript plus reason with owner mention only',async()=>{
 const f=await fixture();await f.core.send(f.member,{message:'Onde encontro a carteira?',requestId:'site-question'});
 await f.core.handoff(f.member,{reason:'Quero ajuda com meu cadastro.',requestId:'site-human'});
 const job=(await f.jobs()).find(j=>j.kind==='support-handoff');await tx(pool,c=>f.adapter.execute(job,c));
 assert.equal(f.sent.length,1);const payload=f.sent[0],description=payload.embeds[0].toJSON().description;
 assert.match(description,/Onde encontro a carteira/);assert.match(description,/Quero ajuda com meu cadastro/);assert.match(description,new RegExp(f.member.name));assert.match(description,/IA está pausada/);
 assert.deepEqual(payload.allowedMentions,{parse:[],users:[attendantId]});assert.equal(payload.content.includes(`<@${attendantId}>`),true);
 assert.deepEqual(new Set(f.permissions.at(-1).filter(p=>p.allow).map(p=>p.id)),new Set([f.member.discord_id,attendantId,botId]));
 await f.core.send(f.member,{message:'Meu cadastro continua com problema.',requestId:'site-followup'});
 const relay=(await f.jobs()).find(j=>j.kind==='support-member-message');await tx(pool,c=>f.adapter.execute(relay,c));assert.match(f.sent[1].embeds[0].toJSON().description,/continua com problema/);
});
test('queued jobs reject altered guild/type/topic and changed identity before copying private messages',async()=>{
 const f=await fixture();await f.adapter.message(f.event());const [job]=await f.jobs();
 for(const [key,value]of [['guildId','999000000000000001'],['type',ChannelType.GuildVoice],['topic','avisos públicos']]){const original=f.channel[key];f.channel[key]=value;await assert.rejects(tx(pool,c=>f.adapter.execute(job,c)),{code:'SUPPORT_CHANNEL_INVALID'});f.channel[key]=original;}
 await pool.query('UPDATE members SET identity_version=identity_version+1 WHERE id=$1',[f.member.id]);await assert.rejects(tx(pool,c=>f.adapter.execute(job,c)),{code:'IDRKC_CHANGED'});assert.equal(f.sent.length,0);assert.equal(f.permissions.length,0);
});
test('member division change and closing ticket stop input; closed ticket stops queued delivery',async()=>{
 const f=await fixture();await f.adapter.message(f.event());const [job]=await f.jobs();
 await pool.query('UPDATE members SET division=2 WHERE id=$1',[f.member.id]);assert.equal(await f.adapter.message(f.event()),false);await pool.query('UPDATE members SET division=1 WHERE id=$1',[f.member.id]);
 await pool.query("UPDATE tickets SET status='fechando' WHERE id=$1",[f.ticket.id]);assert.equal(await f.adapter.message(f.event()),false);await tx(pool,c=>f.adapter.execute(job,c));assert.equal(f.sent.length,0);
});
test('ticket opening under support uses private owner-only access and welcome actions; stale existing channel is rejected',async()=>{
 const f=await fixture(),service=createVerifiedServices(pool,config,f.client),job=(await pool.query("INSERT INTO jobs(kind,payload) VALUES('verified-ticket-open',$1) RETURNING *",[JSON.stringify({ticketId:f.ticket.id,division:1})])).rows[0];
 f.channel.topic='canal antigo';await assert.rejects(tx(pool,c=>service.execute(job,c)),{code:'SUPPORT_CHANNEL_INVALID'});assert.equal(f.permissions.length,0);
 f.channel.topic=`HB-ID atendimento ${f.ticket.id} ${f.member.discord_id}`;await tx(pool,c=>service.execute(job,c));
 assert.deepEqual(f.sent[0].components[0].toJSON().components.map(c=>c.custom_id),[`support-ask:${f.ticket.id}`,`support-human:${f.ticket.id}`,`close:${f.ticket.id}`]);assert.match(f.sent[0].embeds[0].toJSON().description,/histórico de suporte/);
 assert.deepEqual(new Set(f.permissions[0].filter(p=>p.allow).map(p=>p.id)),new Set([f.member.discord_id,attendantId,botId]));
});
test('disabled adapter makes no database reads and bot only requests message content when enabled',async()=>{
 const disabled=createSupportDiscord({query:()=>{throw Error('unexpected query');}},{divisions:[division],support:{enabled:false}},{},{});
 assert.equal(await disabled.message({author:{id:'123'}}),false);
 const i={customId:'support-human:1',isButton:()=>true,reply:async function(result){this.result=result;}};await disabled.interact(i);assert.match(i.result.content,/desativado/);
 for(const enabled of [false,true]){const bot=createBot(pool,{...config,support:{...config.support,enabled}},{support:{}});assert.equal(bot.client.options.intents.has(GatewayIntentBits.MessageContent),enabled);assert.equal(bot.client.options.intents.has(GatewayIntentBits.GuildMessages),enabled);await bot.stop();}
});
test('configured attendant closes support using the existing button; worker refuses to delete a stale channel',async()=>{
 const f=await fixture();await pool.query("UPDATE jobs SET status='sent' WHERE status='pending'");
 const bot=createBot(pool,{...config,sbi:true},{support:f.core});bot.client.isReady=()=>true;bot.client.user={id:botId};bot.client.channels.fetch=f.client.channels.fetch;
 let deleted=0;f.channel.delete=async()=>{deleted++;};
 const i=f.interaction('close',{customId:`close:${f.ticket.id}`,user:{id:attendantId}});await bot.handleInteraction(i);assert.match(i.result,/Ticket resolvido/);
 assert.equal((await pool.query('SELECT status FROM tickets WHERE id=$1',[f.ticket.id])).rows[0].status,'fechando');
 const topic=f.channel.topic;f.channel.topic='canal que não pertence ao atendimento';await bot.work();assert.equal(deleted,0);
 const job=(await pool.query("SELECT * FROM jobs WHERE kind='close-ticket' AND payload->>'id'=$1",[String(f.ticket.id)])).rows[0];assert.equal(job.status,'pending');assert.match(job.error,/SUPPORT_CHANNEL_INVALID/);
 f.channel.topic=topic;await pool.query('UPDATE jobs SET next_at=now() WHERE id=$1',[job.id]);await bot.work();assert.equal(deleted,1);assert.equal((await pool.query('SELECT status FROM tickets WHERE id=$1',[f.ticket.id])).rows[0].status,'resolvido');await bot.stop();
});

test('new website conversation opens one private Discord channel through the real worker and mirrors both directions',async()=>{
 const f=await fixture();await pool.query('DELETE FROM tickets WHERE id=$1',[f.ticket.id]);
 await pool.query("UPDATE jobs SET status='sent' WHERE status='pending'");
 const guild=await f.client.guilds.fetch(division.guild),channels=await guild.channels.fetch();channels.clear();let created=0;
 guild.channels.create=async options=>{created++;f.channel.topic=options.topic;f.channel.parentId=options.parent;f.permissions.push(options.permissionOverwrites);channels.set(f.channel.id,f.channel);return f.channel;};
 await f.core.send(f.member,{message:'Onde está minha carteira?',requestId:'fresh-web-question'});
 let state=await f.core.handoff(f.member,{requestId:'fresh-web-human'});
 assert.equal(state.ticket.channel_url,null);assert.equal(state.ticket.notification_status,'pending');
 const bot=createBot(pool,config,{support:f.core});bot.client.isReady=()=>true;bot.client.user={id:botId};bot.client.channels.fetch=f.client.channels.fetch;bot.client.guilds.fetch=f.client.guilds.fetch;
 try{
  await bot.work();state=await f.core.state(f.member);
  assert.equal(created,1);assert.equal(state.ticket.channel_url,`https://discord.com/channels/${division.guild}/${f.channel.id}`);
  assert.deepEqual(new Set(f.permissions[0].filter(p=>p.allow).map(p=>p.id)),new Set([f.member.discord_id,attendantId,botId]));
  assert.equal(f.sent.length,2);assert.match(f.sent[1].embeds[0].toJSON().description,/Onde está minha carteira/);
  await f.core.handoff(f.member,{requestId:'fresh-web-human'});await bot.work();assert.equal(created,1);assert.equal(f.sent.length,2);
  await f.core.send(f.member,{message:'Estou usando o celular.',requestId:'fresh-web-followup'});await bot.work();assert.match(f.sent.at(-1).embeds[0].toJSON().description,/Estou usando o celular/);
  await bot.handleSupportMessage(f.event('Abra Minha carteira e toque em Baixar.',{author:{id:attendantId,username:'Líder'},member:{displayName:'Líder'}}));
  state=await f.core.state(f.member);assert.equal(state.conversation.status,'human');assert.equal(state.messages.at(-1).role,'staff');assert.match(state.messages.at(-1).content,/toque em Baixar/);
  assert.equal(f.modelCalls(),1);
 }finally{await bot.stop();}
});

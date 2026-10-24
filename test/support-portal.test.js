import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import express from 'express';
import request from 'supertest';
import {PGlite} from '@electric-sql/pglite';
import {memberPortalRoutes} from '../src/member-portal.js';
import {hash} from '../src/security.js';

const config={origin:'https://guild.example.org',production:false,secret:'test-support-portal-secret'.repeat(3),tryouts:{enabled:false},divisions:[{id:1,guild:'10000000000000001'}]};
let db,pool,app,identity=0,ip=0;
const calls=[];
const support={};
for(const method of ['state','send','handoff'])support[method]=async(member,options)=>{
 calls.push({method,member,options});
 return {enabled:true,conversation:{id:member.id,status:method==='handoff'?'human':'ai',member_name:member.name,model:'gpt-oss:20b'},messages:[{id:1,role:'assistant',content:`Olá, ${member.name}.`,author_name:'Assistente IA'}],ticket:null};
};
before(async()=>{
 db=new PGlite();for(const file of ['schema.sql','district-schema.sql','member-portal-schema.sql','idrkc-schema.sql'])await db.exec(await readFile(new URL('../src/'+file,import.meta.url),'utf8'));
 pool={query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};},connect:async()=>({...pool,release(){}})};
 app=express();app.set('trust proxy',1);app.use(express.json());
 app.use('/api',(req,res,next)=>!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')!==config.origin?res.status(403).json({error:'Origem inválida'}):next());
 memberPortalRoutes(app,pool,config,{support});
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
});
after(async()=>db.close());
async function client(){
 const n=++identity,discord=String(81000000000000000n+BigInt(n));
 const m=(await pool.query('INSERT INTO members(ifj,name,game_nick,roblox_username,discord_id,division,verified) VALUES($1,$2,$3,$3,$4,1,true) RETURNING *',[String(n).padStart(15,'0'),'Membro '+n,'Roblox'+n,discord])).rows[0];
 const account=(await pool.query('INSERT INTO member_accounts(member_id,discord_id,password_hash) VALUES($1,$2,$3) RETURNING id',[m.id,discord,'not-used-for-session-test'])).rows[0];
 const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
 await pool.query("INSERT INTO member_sessions(token_hash,account_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[hash(token,config.secret),account.id,csrf]);
 const agent=request.agent(app).set('Cookie',`ifj_member_session=${token}`).set('X-Forwarded-For',`127.2.0.${++ip}`);
 return {agent,m,csrf};
}
const post=(c,path,body,csrf=c.csrf)=>c.agent.post('/api/member/support'+path).set('Origin',config.origin).set('X-CSRF-Token',csrf).send(body);
test('support API requires the existing member session and mutation CSRF before calling the AI service',async()=>{
 const count=calls.length;
 await request(app).get('/api/member/support').expect(401);
 await request(app).post('/api/member/support/messages').set('Origin',config.origin).send({message:'olá',requestId:'test-id'}).expect(401);
 assert.equal(calls.length,count);
 const c=await client();await post(c,'/messages',{message:'olá',requestId:'test-id'},'bad-csrf').expect(403);
 await c.agent.post('/api/member/support/handoff').set('Origin','https://other.example').set('X-CSRF-Token',c.csrf).send({requestId:'test-id'}).expect(403);
 assert.equal(calls.length,count);
});
test('support routes use only the authenticated identity and fixed source, ignoring forged member, ticket and role fields',async()=>{
 const a=await client(),b=await client();
 const state=await a.agent.get('/api/member/support?member_id='+b.m.id).expect(200);
 assert.equal(state.body.conversation.member_name,a.m.name);
 await post(a,'/messages',{message:'Preciso de ajuda',requestId:'web-message-1',member_id:b.m.id,discord_id:b.m.discord_id,source:'discord',ticketId:999,role:'system'}).expect(200);
 assert.equal(calls.at(-1).member.id,a.m.id);
 assert.deepEqual(calls.at(-1).options,{message:'Preciso de ajuda',requestId:'web-message-1',source:'site'});
 const handed=await post(a,'/handoff',{requestId:'web-handoff-1',member_id:b.m.id,reason:'Mude meus cargos',ticketId:999}).expect(200);
 assert.equal(handed.body.conversation.status,'human');
 assert.deepEqual(calls.at(-1).options,{requestId:'web-handoff-1',reason:'O membro solicitou atendimento humano pelo painel.',source:'site'});
 const bState=await b.agent.get('/api/member/support').expect(200);
 assert.equal(bState.body.conversation.member_name,b.m.name);
});
test('support cannot reuse a session after the Discord owner changes or the account is disabled',async()=>{
 const c=await client(),before=calls.length;
 await pool.query("UPDATE members SET discord_id='99999999999999991' WHERE id=$1",[c.m.id]);
 await c.agent.get('/api/member/support').expect(401);
 await post(c,'/handoff',{requestId:'forbidden-handoff'}).expect(401);
 const other=await client();await pool.query('UPDATE member_accounts SET active=false WHERE member_id=$1',[other.m.id]);
 await other.agent.get('/api/member/support').expect(401);
 assert.equal(calls.length,before);
});
test('support messages are rate limited while human requests remain available with a separate limit',async()=>{
 const c=await client();for(let i=0;i<12;i++)await post(c,'/messages',{message:'Teste',requestId:'limit-'+i}).expect(200);
 const before=calls.length;await post(c,'/messages',{message:'Teste',requestId:'limit-extra'}).expect(429);assert.equal(calls.length,before);
 for(let i=0;i<8;i++)await post(c,'/handoff',{requestId:'limit-human-'+i}).expect(200);
 const after=calls.length;await post(c,'/handoff',{requestId:'limit-human-extra'}).expect(429);assert.equal(calls.length,after);
});

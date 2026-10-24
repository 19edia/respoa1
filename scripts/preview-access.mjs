// Visual preview of the real access pages. No database, Discord or authentication.
// API fixtures are read-only and this server binds only to this computer.
import express from 'express';
import helmet from 'helmet';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const app=express(),directory=fileURLToPath(new URL('../public/',import.meta.url));
const token='0'.repeat(64),port=Number(process.env.ACCESS_PREVIEW_PORT||4183);
app.use(helmet({contentSecurityPolicy:{directives:{'script-src':["'self'"],'style-src':["'self'"],'img-src':["'self'",'data:','blob:','https:'],'connect-src':["'self'"],'form-action':["'self'"],'upgrade-insecure-requests':null}}}));
app.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.get('/api/member/me',(_req,res)=>res.status(401).json({error:'Prévia visual sem conta real.'}));
app.get('/api/registration/'+token,(_req,res)=>res.json({csrf:'preview-only',invite:{member_rank:'Membro',account_kind:'membro',expires_at:new Date(Date.now()+48*3600000).toISOString()},details:null,discord:null}));
app.use('/api',(_req,res)=>res.status(400).json({error:'Esta prévia mostra as telas reais. Para simular o cadastro e os tryouts, abra TESTE-HRISTE-BOZE.html.'}));
app.get('/membros',(_req,res)=>res.sendFile(path.join(directory,'member.html')));
app.get('/cadastro/'+token,(_req,res)=>res.sendFile(path.join(directory,'registration.html')));
app.use(express.static(directory));
const server=app.listen(port,'127.0.0.1',()=>{
 console.log(`Prévia visual local, dados fictícios: http://127.0.0.1:${port}/`);
 console.log(`Login dos membros: http://127.0.0.1:${port}/membros`);
 console.log(`Cadastro: http://127.0.0.1:${port}/cadastro/${token}`);
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));

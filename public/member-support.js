/* Authenticated member support. Conversation text is never interpreted as HTML. */
(() => {
 'use strict';
 function create({request,getMember,onUnauthorized}) {
  const $=id=>document.getElementById(id);
  const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
  let active=false,epoch=0,controller=null,timer=null,busy=false,operationPath=null,snapshot=null,pendingMessage=null,pendingHandoff=null,lastSignature='';
  const id=()=>globalThis.crypto?.randomUUID?.()||`hb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const visible=()=>active&&!document.hidden&&Boolean(getMember());
  const feedback=text=>{$('support-feedback').textContent=text;};
  function controls(){
   const processing=snapshot?.conversation?.processing===true;
   $('support-input').disabled=busy||!snapshot;
   $('support-send').disabled=busy||processing||!snapshot;
   $('support-handoff').disabled=(busy&&operationPath==='/support/handoff')||!snapshot||snapshot?.conversation?.status==='human';
   $('support-refresh').disabled=busy;
   $('support-form').setAttribute('aria-busy',String(busy||processing));
   $('support-send').textContent=busy?'Enviando…':processing?'Preparando resposta…':snapshot?.conversation?.status==='human'?'Enviar à equipe ↗':'Enviar mensagem ↗';
   $('support-handoff').textContent=snapshot?.conversation?.status==='human'?'Conversa encaminhada ✓':'Falar com atendente ↗';
  }
  function schedule(){
   clearTimeout(timer);timer=null;
   if(visible()&&!busy)timer=setTimeout(()=>refresh(true),snapshot?.conversation?.processing?2500:9000);
  }
  function render(data){
   snapshot=data;
   const conversation=data.conversation||{},ticket=data.ticket,memberName=conversation.member_name||getMember()?.name||'Membro';
   $('support-model').textContent=conversation.model||'gpt-oss:20b';
   $('support-status').textContent=conversation.status==='human'?'Com a equipe':conversation.processing?'IA respondendo…':data.enabled?'IA disponível':'Equipe disponível';
   const messages=Array.isArray(data.messages)?data.messages:[],signature=JSON.stringify([memberName,messages]);
   if(signature!==lastSignature){
    lastSignature=signature;const list=$('support-messages'),nearEnd=list.scrollHeight-list.scrollTop-list.clientHeight<80;
    const fragment=document.createDocumentFragment();
    if(!messages.length){const empty=node('div','hb-support-empty');empty.append(node('strong',null,`Olá, ${memberName}.`),node('p',null,data.enabled?'Sou o assistente de IA da HRISTE BOZE. Como posso ajudar com a guilda hoje?':'Você pode escrever sua dúvida ou chamar um atendente. A equipe recebe o contexto por aqui.'));fragment.append(empty);}
    for(const message of messages){
     const role=['user','assistant','staff','system'].includes(message.role)?message.role:'system';
     const article=node('article','hb-support-message '+role),meta=node('div','hb-support-message-meta');
     const author=role==='assistant'?'Assistente HB · IA':role==='user'?(message.author_name||memberName):role==='staff'?(message.author_name||'Equipe HRISTE BOZE'):'Atendimento';
     meta.append(node('strong',null,author));
     const stamp=new Date(message.created_at);if(Number.isFinite(stamp.getTime())){const time=node('time',null,stamp.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));time.dateTime=stamp.toISOString();meta.append(time);}
     article.append(meta,node('p','hb-support-message-body',String(message.content||'')));fragment.append(article);
    }
    list.replaceChildren(fragment);if(nearEnd||messages.length<3)list.scrollTop=list.scrollHeight;
   }
   const handed=conversation.status==='human';$('support-ticket').hidden=!handed;
   const link=$('support-ticket-link');link.hidden=true;link.removeAttribute('href');
   if(handed){
    const closed=['resolvido','resolvida','closed'].includes(ticket?.status),failed=ticket?.notification_status==='failed';
    $('support-ticket-status').textContent=closed?'Atendimento concluído':failed?'Ticket registrado · entrega pendente':ticket?.channel_url?'Seu ticket está aberto':'Preparando seu ticket no Discord';
    $('support-ticket-description').textContent=closed?'O histórico continua disponível. Uma nova mensagem será encaminhada à equipe.':failed?'A equipe precisa revisar a entrega do ticket. Seu pedido e suas mensagens estão salvos.':'Seu histórico acompanha o pedido. Continue escrevendo aqui; as respostas da equipe aparecem nesta conversa.';
    try{const url=new URL(ticket?.channel_url);if(url.protocol==='https:'&&url.hostname==='discord.com'&&/^\/channels\/\d+\/\d+\/?$/.test(url.pathname)&&!url.username&&!url.password){link.href=url.href;link.hidden=false;}}catch{}
   }
   controls();
  }
  async function perform(path,body,{quiet=false}={}){
   if(!visible()||controller||busy)return;
   clearTimeout(timer);const ownEpoch=epoch,owner=String(getMember()?.discord_id),current=new AbortController();controller=current;operationPath=path;
   if(body){busy=true;feedback('');}else if(!quiet)feedback('Atualizando conversa…');
   controls();
   try{
    const result=await request(path,body?'POST':'GET',body,false,{signal:current.signal,timeoutMs:body?90000:20000});
    if(ownEpoch!==epoch||String(getMember()?.discord_id)!==owner)return;
    render(result);feedback('');
    if(path==='/support/messages'){if($('support-input').value.trim()===body.message){$('support-input').value='';updateLength();}pendingMessage=null;}
    if(path==='/support/handoff')pendingHandoff=null;
   }catch(error){
    if(ownEpoch!==epoch)return;
    if(error.status===401){onUnauthorized();return;}
    if(error.status===409&&snapshot){snapshot={...snapshot,conversation:{...snapshot.conversation,processing:true}};render(snapshot);feedback('A resposta está sendo preparada. A conversa será atualizada automaticamente.');return;}
    if(!quiet)feedback(body?'Não foi possível confirmar o envio. Sua mensagem foi mantida; tente novamente. '+error.message:error.message);
   }finally{if(ownEpoch===epoch){controller=null;operationPath=null;busy=false;controls();schedule();}}
  }
  function refresh(quiet=false){return perform('/support',undefined,{quiet});}
  function updateLength(){$('support-length').textContent=`${$('support-input').value.length} / 2.000`;}
  function pause(){epoch++;controller?.abort();controller=null;operationPath=null;busy=false;clearTimeout(timer);timer=null;controls();}
  function setActive(value){active=Boolean(value);if(!visible()){pause();return;}refresh();}
  function reset(){active=false;pause();snapshot=null;pendingMessage=null;pendingHandoff=null;lastSignature='';$('support-input').value='';$('support-messages').replaceChildren();$('support-ticket').hidden=true;$('support-ticket-link').hidden=true;$('support-ticket-link').removeAttribute('href');$('support-status').textContent='Conectando…';feedback('');updateLength();controls();}
  $('support-input').addEventListener('input',updateLength);
  $('support-form').addEventListener('submit',event=>{
   event.preventDefault();const message=$('support-input').value.trim();
   if(!message||message.length>2000||busy||snapshot?.conversation?.processing)return;
   if(!pendingMessage||pendingMessage.message!==message)pendingMessage={message,requestId:id()};
   perform('/support/messages',pendingMessage);
  });
  $('support-handoff').addEventListener('click',()=>{if(snapshot?.conversation?.status==='human'||operationPath==='/support/handoff')return;if(controller)pause();pendingHandoff??={requestId:id()};perform('/support/handoff',pendingHandoff);});
  $('support-refresh').addEventListener('click',()=>refresh());
  document.addEventListener('visibilitychange',()=>{if(!visible())pause();else refresh(true);});
  controls();return {setActive,reset,refresh};
 }
 window.MemberSupport={create};
})();

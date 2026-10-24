import {createHash} from 'node:crypto';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,MessageFlags,ModalBuilder,PermissionFlagsBits,TextInputBuilder,TextInputStyle,escapeMarkdown} from 'discord.js';
import {RokuharaEmbed} from './embed-theme.js';
import {tryoutMemberAccess} from './tryouts.js';

export const supportDiscordJobs=new Set(['support-handoff','support-member-message','support-discord-reply']);
export const supportAttendantId=config=>config.support?.attendantId||config.tryouts?.evaluatorId||'1480009495915659494';
const ephemeral={flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}};
const text=value=>String(value??'').replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi,'').replace(/\u0000/g,'').replace(/@(everyone|here)/gi,'＠$1').replace(/<@([!&]?\d+)>/g,'＠$1').trim();
const safe=value=>escapeMarkdown(text(value));
const failure=(message,code)=>Object.assign(new Error(message),{code});
const nonceFor=value=>createHash('sha256').update(value).digest('hex').slice(0,24);

export function supportButtons(ticketId,{close=true}={}){
 const buttons=[new ButtonBuilder().setCustomId(`support-ask:${ticketId}`).setLabel('Perguntar à IA').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`support-human:${ticketId}`).setLabel('Falar com atendente').setStyle(ButtonStyle.Secondary)];
 if(close)buttons.push(new ButtonBuilder().setCustomId(`close:${ticketId}`).setLabel('Encerrar atendimento').setStyle(ButtonStyle.Danger));
 return new ActionRowBuilder().addComponents(buttons);
}

export function supportTicketPermissions(config,guildId,memberId,botId){
 const access=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles];
 return [{id:guildId,deny:[PermissionFlagsBits.ViewChannel]},...[...new Set([memberId,supportAttendantId(config)])].filter(id=>id!==botId).map(id=>({id,type:1,allow:access})),{id:botId,type:1,allow:[...access,PermissionFlagsBits.ManageChannels]}];
}

/** All Discord data is bound to an authenticated, currently admitted ticket owner. */
export function createSupportDiscord(pool,config,client,support){
 const enabled=()=>Boolean(config.support?.enabled&&support);
 const validChannel=(channel,guildId,ticket)=>channel?.guildId===guildId&&channel.type===ChannelType.GuildText&&channel.topic===`HB-ID atendimento ${ticket.id} ${ticket.user_id}`;
 async function context(guildId,channelId,ticketId=null,c=pool){
  if(!config.divisions.some(d=>d.guild===guildId)||!channelId)return null;
  const ticket=(await c.query("SELECT * FROM tickets WHERE guild_id=$1 AND channel_id=$2 AND status='aberto'",[guildId,channelId])).rows[0];
  if(!ticket||ticketId!==null&&Number(ticket.id)!==Number(ticketId)||!ticket.member_id)return null;
  const member=(await c.query('SELECT * FROM members WHERE id=$1',[ticket.member_id])).rows[0];
  if(!member?.verified||member.card_revoked_at||member.discord_id!==ticket.user_id||member.idrkc!==ticket.idrkc||member.identity_version!==ticket.card_version||!config.divisions.some(d=>Number(d.id)===Number(member.division)&&d.guild===guildId)||!await tryoutMemberAccess(c,config,member))return null;
  return {ticket,member};
 }
 async function replyError(target,error,{interaction=false}={}){
  const content=[409,429].includes(error?.status)?'Uma resposta já está sendo preparada. Aguarde alguns instantes e tente novamente, ou use Falar com atendente.':'Não consegui registrar sua mensagem agora. Tente novamente ou use Falar com atendente.';
  if(interaction)return target.editReply({content,allowedMentions:{parse:[]}});
  return target.channel.send({content,allowedMentions:{parse:[]},nonce:nonceFor(`support-error:${target.id}`),enforceNonce:true});
 }
 async function message(event){
  if(!enabled()||event.author?.bot||event.webhookId||event.system||!event.guildId||!event.author?.id||event.channel?.type!==ChannelType.GuildText)return false;
  const bound=await context(event.guildId,event.channelId);if(!bound||!validChannel(event.channel,event.guildId,bound.ticket))return false;
  const {ticket,member}=bound,owner=event.author.id===member.discord_id,attendant=event.author.id===supportAttendantId(config);
  if(!owner&&!attendant)return false;
  const content=String(event.content||'').trim();
  // The form remains usable if Discord does not expose message content. Attachments
  // are never downloaded or silently sent to the model.
  if(!content){if(owner)await event.channel.send({content:'Para registrar sua dúvida, use **Perguntar à IA** e descreva o problema. Anexos ficam disponíveis ao atendente neste canal.',components:[supportButtons(ticket.id,{close:false})],allowedMentions:{parse:[]},nonce:nonceFor(`support-empty:${event.id}`),enforceNonce:true});return true;}
  if(content.length>2000){if(owner)await event.channel.send({content:'Divida sua dúvida em mensagens de até 2.000 caracteres ou use Falar com atendente.',allowedMentions:{parse:[]},nonce:nonceFor(`support-long:${event.id}`),enforceNonce:true});return true;}
  try{
   if(attendant&&!owner){await support.attachTicket(member,ticket.id);await support.recordStaffReply(ticket.id,{content,authorId:event.author.id,authorName:event.member?.displayName||event.author.globalName||event.author.username||'Atendente',externalId:`discord:${event.id}`});}
   else await support.send(member,{message:content,requestId:`discord:${event.id}`,source:'discord',ticketId:ticket.id});
  }catch(error){await replyError(event,error);}
  return true;
 }
 async function interact(i){
  const match=/^support-(ask|human|form):(\d+)$/.exec(i.customId||'');
  if(!match||!i.isButton?.()&&!i.isModalSubmit?.())return false;
  if(!enabled()){await i.reply({...ephemeral,content:'O suporte com IA está desativado. Procure a administração neste atendimento.'});return true;}
  const bound=await context(i.guildId,i.channelId,Number(match[2]));
  if(!bound||!validChannel(i.channel,i.guildId,bound.ticket)||i.user.id!==bound.member.discord_id){await i.reply({...ephemeral,content:'Este atendimento não está disponível para sua conta neste canal.'});return true;}
  if(match[1]==='ask'&&i.isButton()){
   const field=new TextInputBuilder().setCustomId('question').setLabel('Como podemos ajudar?').setStyle(TextInputStyle.Paragraph).setMinLength(1).setMaxLength(2000).setRequired(true);
   await i.showModal(new ModalBuilder().setCustomId(`support-form:${bound.ticket.id}`).setTitle('Suporte HRISTE BOZE').addComponents(new ActionRowBuilder().addComponents(field)));return true;
  }
  if(match[1]==='form'&&!i.isModalSubmit()||match[1]==='human'&&!i.isButton())return false;
  await i.deferReply(ephemeral);
  try{
   if(match[1]==='human')await support.handoff(bound.member,{reason:'O membro solicitou atendimento humano pelo Discord.',requestId:`discord:${i.id}`,source:'discord',ticketId:bound.ticket.id});
   else await support.send(bound.member,{message:i.fields.getTextInputValue('question'),requestId:`discord:${i.id}`,source:'discord',ticketId:bound.ticket.id});
   await i.editReply({content:match[1]==='human'?'Seu pedido foi registrado. O atendente receberá o contexto neste canal privado.':'Mensagem registrada. A resposta aparecerá neste canal; se precisar, você pode chamar o atendente.',allowedMentions:{parse:[]}});
  }catch(error){await replyError(i,error,{interaction:true});}
  return true;
 }
 async function execute(job,c){
  if(!supportDiscordJobs.has(job.kind))throw failure('Operação de suporte desconhecida','SUPPORT_JOB_INVALID');
  if(job.message_id)return;
  const d=config.divisions.find(item=>item.id===job.payload.division);if(!d)throw failure('Guilda de suporte indisponível','SUPPORT_GUILD_UNAVAILABLE');
  // Serialize delivery with handoff/staff replies so a queued AI answer cannot
  // overtake the switch to human support.
  const conversation=(await c.query('SELECT * FROM support_conversations WHERE id=$1 AND ticket_id=$2 FOR UPDATE',[job.payload.conversationId,job.payload.ticketId])).rows[0];
  if(!conversation)return;
  const ticket=(await c.query('SELECT * FROM tickets WHERE id=$1 FOR UPDATE',[job.payload.ticketId])).rows[0];
  if(!ticket||ticket.status!=='aberto')return;
  if(ticket.guild_id!==d.guild)throw failure('Ticket de outra guilda','SUPPORT_SCOPE_INVALID');
  if(!ticket.channel_id)throw failure('Canal privado aguardando abertura','SUPPORT_CHANNEL_PENDING');
  const bound=await context(d.guild,ticket.channel_id,ticket.id,c);if(!bound)throw failure('Cadastro alterado','IDRKC_CHANGED');
  if(conversation.member_id!==bound.member.id||conversation.discord_id!==ticket.user_id||conversation.guild_id!==d.guild)throw failure('Conversa fora do atendimento','SUPPORT_SCOPE_INVALID');
  if(job.kind==='support-discord-reply'&&(!enabled()||conversation.status!=='ai'))return;
  if(job.kind==='support-handoff'&&conversation.status!=='human')return;
  const channel=await client.channels.fetch(ticket.channel_id);
  if(!validChannel(channel,d.guild,ticket)||typeof channel.send!=='function'||typeof channel.permissionOverwrites?.set!=='function')throw failure('Canal privado de suporte inválido','SUPPORT_CHANNEL_INVALID');
  // Reapply private permissions before copying a conversation from the website.
  await channel.permissionOverwrites.set(supportTicketPermissions(config,d.guild,ticket.user_id,client.user.id));
  let payload;
  if(job.kind==='support-handoff'){
   const messages=(await c.query("SELECT * FROM support_messages WHERE conversation_id=$1 AND role IN ('user','assistant','staff') ORDER BY id DESC LIMIT 16",[conversation.id])).rows.reverse();
   const transcript=messages.map(m=>`**${safe(m.author_name||({user:bound.member.name,assistant:'IA HRISTE BOZE',staff:'Atendente'}[m.role]))}:** ${safe(m.content).slice(0,500)}`).join('\n\n').slice(-3300);
   payload={content:`<@${supportAttendantId(config)}> • atendimento humano solicitado.`,embeds:[new RokuharaEmbed().setTitle(`Atendimento #${ticket.id} • transferência para o atendente`).setDescription(`**Membro:** ${safe(bound.member.name).slice(0,120)}\n**Motivo:** ${safe(conversation.handoff_reason||job.payload.reason||'O caso precisa de ajuda humana.').slice(0,350)}\n\nA IA está pausada. As respostas do atendente neste canal também aparecerão no painel do membro.\n\n${transcript||'O membro solicitou ajuda diretamente.'}`.slice(0,4096))],components:[supportButtons(ticket.id)],allowedMentions:{parse:[],users:[supportAttendantId(config)]}};
  }else{
   const expectedRole=job.kind==='support-member-message'?'user':'assistant';
   const entry=(await c.query('SELECT * FROM support_messages WHERE id=$1 AND conversation_id=$2 AND role=$3',[job.payload.messageId,conversation.id,expectedRole])).rows[0];
   if(!entry)return;
   payload={embeds:[new RokuharaEmbed().setTitle(expectedRole==='user'?`${safe(bound.member.name).slice(0,90)} • mensagem pelo painel`:'IA HRISTE BOZE').setDescription(text(entry.content).slice(0,4000)||'Mensagem registrada no histórico.')],allowedMentions:{parse:[]}};
  }
  const nonce=nonceFor(`support:${job.id}`);
  const sent=await channel.send({...payload,nonce,enforceNonce:true});
  await c.query('UPDATE jobs SET message_id=$1 WHERE id=$2',[sent.id,job.id]);
 }
 return {message,interact,execute};
}

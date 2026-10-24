// Opt-in diagnostic: sends only a synthetic question, never member data.
import {readConfig} from '../src/config.js';
import {supportEndpoint,parseSupportAnswer} from '../src/support-ai.js';

try {
 const config=readConfig(process.env),settings=config.support;
 if(!settings.enabled)throw Object.assign(new Error(),{code:'SUPPORT_DISABLED'});
 if(new URL(settings.baseUrl).hostname==='ollama.com'&&!settings.apiKey)throw Object.assign(new Error(),{code:'API_KEY_MISSING'});
 const response=await fetch(supportEndpoint(settings.baseUrl),{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(settings.timeoutMs),
  headers:{'Content-Type':'application/json',...(settings.apiKey?{Authorization:`Bearer ${settings.apiKey}`}:{})},
  body:JSON.stringify({model:settings.model,stream:false,think:'low',messages:[{role:'system',content:'Responda SOMENTE JSON válido com as propriedades answer (string), handoff (boolean) e reason (string). Exemplo: {"answer":"Olá!","handoff":false,"reason":""}.'},{role:'user',content:'Teste sintético de conexão. Responda uma saudação curta em português.'}]})
 });
 if(!response.ok)throw Object.assign(new Error(),{code:`HTTP_${response.status}`});
 if(!parseSupportAnswer(await response.json()))throw Object.assign(new Error(),{code:'RESPONSE_FORMAT'});
 console.log('Ollama conectado: resposta recebida no formato esperado. Nenhum dado de membro foi enviado.');
}catch(error){
 const hints={SUPPORT_DISABLED:'Defina SUPPORT_AI_ENABLED=true.',API_KEY_MISSING:'Defina OLLAMA_API_KEY no ambiente do servidor.',HTTP_401:'Revise a chave da API Ollama.',HTTP_403:'Confira as permissões da conta Ollama.',HTTP_404:'Confira OLLAMA_BASE_URL e OLLAMA_MODEL.',HTTP_429:'A conta Ollama atingiu um limite. Aguarde ou consulte seu plano.',RESPONSE_FORMAT:'A API respondeu, mas o formato não passou na validação do suporte.',TimeoutError:'O tempo limite foi atingido. Confira o serviço e OLLAMA_TIMEOUT_MS.',AbortError:'A conexão foi interrompida.'};
 const code=String(error.code||error.name||'UNAVAILABLE');
 console.error(hints[code]||'Não foi possível validar o Ollama. Confira as variáveis de ambiente e a conexão do servidor.');
 process.exitCode=1;
}

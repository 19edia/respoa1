import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readConfig} from '../src/config.js';
import {validateEnvironment} from '../src/config-rules.js';

const base=()=>({NODE_ENV:'production',BOT_ENABLED:'false',APP_ORIGIN:'https://guild.example.org',DATABASE_URL:'postgresql://guild:test-password@db.example.org/guild?sslmode=verify-full',SESSION_SECRET:'test-session-secret-'.repeat(4)});
test('Ollama support uses the requested model, cloud endpoint and owner without requiring existing installations to enable it',()=>{
 const config=readConfig(base());
 assert.equal(config.support.enabled,false);
 assert.equal(config.support.model,'gpt-oss:20b');
 assert.equal(config.support.baseUrl,'https://ollama.com');
 assert.equal(config.support.attendantId,'1480009495915659494');
 const withKey=readConfig({...base(),OLLAMA_API_KEY:'test-private-ollama-key'});
 assert.equal(withKey.support.enabled,true);
 assert.equal(readConfig({...base(),OLLAMA_API_KEY:'test-private-ollama-key',SUPPORT_AI_ENABLED:'false'}).support.enabled,false);
 const own=readConfig({...base(),SUPPORT_AI_ENABLED:'true',OLLAMA_BASE_URL:'https://ollama.example.org/api/',OLLAMA_TIMEOUT_MS:'90000',SUPPORT_ATTENDANT_DISCORD_ID:'10000000000000001'});
 assert.equal(own.support.baseUrl,'https://ollama.example.org/api');
 assert.equal(own.support.timeoutMs,90000);
 assert.equal(own.support.attendantId,'10000000000000001');
});
test('support environment rejects malformed values without printing private data',()=>{
 const checks=validateEnvironment({...base(),SUPPORT_AI_ENABLED:'yes',SUPPORT_ATTENDANT_DISCORD_ID:'owner',OLLAMA_BASE_URL:'https://user:PRIVATE_SECRET@example.org/api/chat?key=PRIVATE_SECRET',OLLAMA_API_KEY:'PRIVATE_KEY\nheader',OLLAMA_TIMEOUT_MS:'1',OLLAMA_MODEL:'model\nPRIVATE_MODEL'}).filter(c=>!c.ok);
 for(const key of ['SUPPORT_AI_ENABLED','SUPPORT_ATTENDANT_DISCORD_ID','OLLAMA_BASE_URL','OLLAMA_API_KEY','OLLAMA_TIMEOUT_MS','OLLAMA_MODEL'])assert.ok(checks.some(c=>c.key===key));
 assert.doesNotMatch(JSON.stringify(checks),/PRIVATE_SECRET|PRIVATE_KEY|PRIVATE_MODEL/);
 assert.ok(validateEnvironment({...base(),OLLAMA_BASE_URL:'http://localhost:11434'}).some(c=>c.key==='OLLAMA_BASE_URL'&&!c.ok));
 assert.equal(validateEnvironment({...base(),NODE_ENV:'development',OLLAMA_BASE_URL:'http://localhost:11434',OLLAMA_MODEL:'gpt-oss:20b'}).every(c=>c.ok),true);
});

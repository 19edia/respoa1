import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');

test('rebranded access pages preserve every form binding and unique accessible input identifiers',()=>{
 for(const [htmlFile,script] of [['index.html','login.js'],['member.html','member.js'],['registration.html','registration.js']]){
  const html=read(htmlFile),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]),existing=new Set(ids);
  assert.equal(ids.length,existing.size,htmlFile+' has duplicate IDs');
  for(const match of read(script).matchAll(/(?:\$|document\.getElementById)\('([^']+)'\)/g))assert.ok(existing.has(match[1]),script+' requires #'+match[1]);
  for(const match of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g))assert.ok(existing.has(match[1]),htmlFile+' label requires #'+match[1]);
  assert.doesNotMatch(html,/<script[^>]+src="https?:\/\//,'access must work without third-party JavaScript');
 }
});

function loginFixture(response){
 const nodes=new Map([...read('index.html').matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)].map(match=>[match[1],{type:match[0].match(/\btype="([^"]+)"/)?.[1],value:'',disabled:false,textContent:'',attrs:{},addEventListener(event,handler){this[event]=handler;},setAttribute(key,value){this.attrs[key]=value;}}]));
 nodes.get('login-form').elements={username:nodes.get('username')};
 const calls=[],redirects=[];
 runInNewContext(read('login.js'),{document:{getElementById:id=>nodes.get(id)||null},window:{location:{assign:url=>redirects.push(url)}},AbortController,setTimeout:()=>1,clearTimeout(){},fetch:async(url,options)=>{calls.push({url,options});return response;}});
 return {nodes,calls,redirects,submit:()=>nodes.get('login-form').submit({preventDefault(){}})};
}

test('staff access still submits credentials to the authenticated API and clears the password only after confirmed success',async()=>{
 const f=loginFixture({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({authenticated:true})});
 f.nodes.get('username').value='  comandante  ';f.nodes.get('password').value='test-only-password';
 f.nodes.get('toggle').click();assert.equal(f.nodes.get('password').type,'text');assert.equal(f.nodes.get('toggle').attrs['aria-pressed'],'true');
 f.nodes.get('toggle').click();assert.equal(f.nodes.get('password').type,'password');
 await f.submit();assert.equal(f.calls[0].url,'/api/auth/login');
 assert.deepEqual(JSON.parse(f.calls[0].options.body),{username:'comandante',password:'test-only-password'});
 assert.equal(f.calls[0].options.credentials,'same-origin');assert.deepEqual(f.redirects,['/painel']);
 assert.equal(f.nodes.get('password').value,'');assert.equal(f.nodes.get('submit').disabled,false);
});

test('staff login errors remain visible and never turn the production page into the permissive demo',async()=>{
 for(const status of [401,403,429]){
  const f=loginFixture({ok:false,status,headers:{get:()=> 'application/json'}});
  f.nodes.get('username').value='teste';f.nodes.get('password').value='invalid-test-password';
  await f.submit();assert.equal(f.redirects.length,0);assert.ok(f.nodes.get('feedback').textContent);
  assert.equal(f.nodes.get('submit').disabled,false);
 }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/auth-scene.js',import.meta.url),'utf8');
function scene({supported=true,reduced=false,width=400,height=350}={}){
 const callbacks=new Map(),hostEvents=new Map(),canvasEvents=new Map(),documentEvents=new Map(),motionEvents=new Map();
 let frameId=0,draws=0,buffer,resize,intersection,mutation,deleted=0;
 const gl={COMPILE_STATUS:1,LINK_STATUS:2,createShader:()=>({}),getShaderParameter:()=>true,createProgram:()=>({}),getProgramParameter:()=>true,createBuffer:()=>({}),getAttribLocation:()=>0,getUniformLocation:()=>({}),bufferData:(_target,data)=>{buffer=data;},drawArrays:()=>draws++,deleteBuffer:()=>deleted++,deleteProgram:()=>deleted++};
 for(const key of ['shaderSource','compileShader','deleteShader','attachShader','linkProgram','bindBuffer','useProgram','enableVertexAttribArray','vertexAttribPointer','enable','clearColor','viewport','clear','uniform2f','uniform1f'])gl[key]=()=>{};
 const canvas={width:0,height:0,getContext:()=>supported?gl:null,addEventListener:(key,fn)=>canvasEvents.set(key,fn),removeEventListener:key=>canvasEvents.delete(key)};
 const host={isConnected:true,dataset:{},querySelector:()=>canvas,getBoundingClientRect:()=>({width,height,left:0,top:0}),addEventListener:(key,fn)=>hostEvents.set(key,fn),removeEventListener:key=>hostEvents.delete(key)};
 const document={hidden:false,readyState:'complete',documentElement:{},querySelectorAll:()=>host.isConnected?[host]:[],addEventListener:(key,fn)=>documentEvents.set(key,fn),removeEventListener:key=>documentEvents.delete(key)};
 const motion={matches:reduced,addEventListener:(key,fn)=>motionEvents.set(key,fn),removeEventListener:key=>motionEvents.delete(key)};
 runInNewContext(source,{window:{matchMedia:()=>motion,devicePixelRatio:2},document,Float32Array,requestAnimationFrame:fn=>{callbacks.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>callbacks.delete(id),IntersectionObserver:class{constructor(fn){intersection=fn;}observe(){}disconnect(){}},ResizeObserver:class{constructor(fn){resize=fn;}observe(){}disconnect(){}},MutationObserver:class{constructor(fn){mutation=fn;}observe(){}}});
 return {host,canvas,document,motion,canvasEvents,documentEvents,frame(){const next=callbacks.entries().next().value;if(next){callbacks.delete(next[0]);next[1](1000);}},pending:()=>callbacks.size,draws:()=>draws,vertices:()=>buffer,deleted:()=>deleted,resize:(w,h)=>{width=w;height=h;resize();},visible:value=>intersection([{isIntersecting:value}]),detach(){host.isConnected=false;mutation();}};
}

test('the decorative scene renders finite 3D geometry once with reduced motion and keeps the static fallback without WebGL',()=>{
 const fallback=scene({supported:false});assert.equal(fallback.host.dataset.sceneState,'fallback');assert.equal(fallback.pending(),0);
 const f=scene({reduced:true});f.frame();assert.equal(f.host.dataset.sceneState,'ready');assert.equal(f.draws(),1);assert.equal(f.pending(),0);
 assert.ok(f.vertices().length>1000);assert.ok([...f.vertices()].every(Number.isFinite));assert.equal(f.vertices().length%27,0);
 assert.equal(f.canvas.width,660);assert.ok([...f.vertices()].some((n,i)=>i%9===2&&n>0));
});

test('hidden member access can reveal and resize the model; offscreen or removed scenes stop rendering',()=>{
 const f=scene({width:0,height:0});f.frame();assert.equal(f.draws(),0);assert.equal(f.pending(),0);
 f.resize(300,250);f.frame();assert.equal(f.draws(),1);assert.equal(f.pending(),1);
 f.visible(false);assert.equal(f.pending(),0);f.visible(true);f.frame();assert.equal(f.draws(),2);
 f.detach();assert.equal(f.pending(),0);assert.equal(f.deleted(),2);
});

test('context loss keeps the fallback visible until restoration even after visibility changes',()=>{
 const f=scene();f.frame();f.canvasEvents.get('webglcontextlost')({preventDefault(){}});
 assert.equal(f.host.dataset.sceneState,'fallback');assert.equal(f.pending(),0);
 f.documentEvents.get('visibilitychange')();assert.equal(f.pending(),0);assert.equal(f.draws(),1);
 f.canvasEvents.get('webglcontextrestored')();f.frame();assert.equal(f.host.dataset.sceneState,'ready');assert.equal(f.draws(),2);
});

/* HRISTE BOZE: an original, local WebGL guild insignia. No network or dependencies. */
(() => {
  'use strict';
  const mounted = new Map();
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const vertexSource = `attribute vec3 position; attribute vec3 normal; attribute vec3 color;
    uniform vec2 rotation; uniform float aspect;
    varying vec3 vNormal; varying vec3 vColor; varying vec3 vPosition;
    void main(){
      float sx=sin(rotation.x),cx=cos(rotation.x),sy=sin(rotation.y),cy=cos(rotation.y);
      mat3 ry=mat3(cy,0.,-sy,0.,1.,0.,sy,0.,cy);
      mat3 rx=mat3(1.,0.,0.,0.,cx,sx,0.,-sx,cx);
      vec3 p=rx*ry*(position-vec3(0.,.25,0.)); vNormal=rx*ry*normal; vColor=color; vPosition=p;
      float depth=4.7-p.z;
      float fit=min(1.,aspect/.95);
      gl_Position=vec4(p.x*2.8*fit/aspect,p.y*2.8*fit,depth-2.,depth);
    }`;
  const fragmentSource = `precision mediump float;
    varying vec3 vNormal; varying vec3 vColor; varying vec3 vPosition;
    void main(){
      vec3 n=normalize(vNormal),eye=normalize(vec3(0.,0.,4.7)-vPosition);
      vec3 light=normalize(vec3(-1.3,2.6,3.));
      float diffuse=max(dot(n,light),0.);
      float rim=pow(1.-max(dot(n,eye),0.),3.);
      float shine=pow(max(dot(n,normalize(light+eye)),0.),48.);
      float side=max(dot(n,normalize(vec3(2.,-.1,.6))),0.);
      vec3 shade=vColor*(.23+.85*diffuse+.3*side)+vec3(1.,.9,.57)*(shine*.75+rim*.15);
      gl_FragColor=vec4(shade,1.);
    }`;
  function mesh(){
    const data=[];
    const gold=[.9,.61,.13],light=[1.,.83,.37],dark=[.075,.073,.058],edge=[.42,.24,.045];
    const tri=(a,b,c,color)=>{
      const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1;
      for(const p of [a,b,c])data.push(...p,...n.map(x=>x/l),...color);
    };
    const prism=(points,z,depth,front=gold,sides=edge)=>{
      // Every face is real geometry; flat normals preserve the polished facets.
      const center=points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]);
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length];
        tri([...center,z],[...a,z],[...b,z],front);
        tri([...a,z],[...a,z-depth],[...b,z-depth],sides);
        tri([...a,z],[...b,z-depth],[...b,z],sides);
        tri([...center,z-depth],[...b,z-depth],[...a,z-depth],sides);
      }
    };
    const shield=[[-.82,.8],[-.7,-.41],[0,-1.04],[.7,-.41],[.82,.8],[0,1.02]];
    prism(shield,.1,.24,gold,edge);
    prism(shield.map(([x,y])=>[x*.9,y*.9]),.14,.05,light,gold);
    prism(shield.map(([x,y])=>[x*.82,y*.82]),.17,.03,dark,edge);
    // Two raised chevrons make the guild's central heraldic monogram.
    prism([[-.49,.41],[-.35,.41],[-.35,.03],[-.07,.2],[-.07,.41],[.07,.41],[.07,-.32],[-.07,-.42],[-.07,.02],[-.35,-.15],[-.35,-.42],[-.49,-.31]],.27,.1,light,gold);
    prism([[.22,.41],[.37,.41],[.5,.27],[.5,.08],[.4,-.02],[.53,-.12],[.53,-.3],[.36,-.44],[.22,-.44],[.22,-.27],[.35,-.25],[.35,-.13],[.22,-.1],[.22,.06],[.35,.1],[.35,.24],[.22,.25]],.27,.1,gold,edge);
    // A five-point crown and its bevelled band float above the shield.
    prism([[-.67,1.1],[-.76,1.5],[-.38,1.3],[-.21,1.64],[0,1.38],[.21,1.64],[.38,1.3],[.76,1.5],[.67,1.1]],.06,.16,gold,edge);
    prism([[-.65,1.06],[-.65,1.16],[.65,1.16],[.65,1.06]],.14,.08,light,gold);
    // Separate lozenge facets around the emblem.
    for(const x of [-1.04,1.04])prism([[x,.25],[x-.075,.07],[x,-.11],[x+.075,.07]],-.06,.07,light,gold);
    // Fine three-dimensional orbital ring behind the crest.
    for(let i=0;i<80;i++){
      const a=i*Math.PI*2/80,b=(i+1)*Math.PI*2/80,r=1.38,t=.012;
      const p=(angle,rad)=>[Math.cos(angle)*rad,Math.sin(angle)*rad*.9+.18,-.43];
      tri(p(a,r),p(b,r),p(a,r+t),edge);tri(p(b,r),p(b,r+t),p(a,r+t),edge);
    }
    return new Float32Array(data);
  }
  function mount(host){
    if(mounted.has(host))return;
    const canvas=host.querySelector('canvas');
    if(!canvas)return;
    let gl;try{gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'});}catch{}
    if(!gl){host.dataset.sceneState='fallback';mounted.set(host,()=>{});return;}
    let program,buffer,frame=0,disposed=false,visible=true,contextLost=false,rotateX=.06,rotateY=-.25,px=0,py=0;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);throw new Error('Shader unavailable');}return s;};
    try{
      const vertex=shader(gl.VERTEX_SHADER,vertexSource),fragment=shader(gl.FRAGMENT_SHADER,fragmentSource);
      program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Renderer unavailable');
      const vertices=mesh();buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);gl.useProgram(program);
      ['position','normal','color'].forEach((name,i)=>{const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,36,i*12);});
      const rotation=gl.getUniformLocation(program,'rotation'),aspect=gl.getUniformLocation(program,'aspect');
      gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
      const draw=(time=0)=>{
        frame=0;if(disposed||contextLost||!visible||document.hidden)return;
        const bounds=host.getBoundingClientRect();if(bounds.width<1||bounds.height<1)return;
        const ratio=Math.min(window.devicePixelRatio||1,1.65),w=Math.round(bounds.width*ratio),h=Math.round(bounds.height*ratio);
        if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
        const still=motion?.matches;
        rotateX+=(.07+py*.13-rotateX)*.06;rotateY+=(-.24+px*.32+(still?0:Math.sin(time*.00038)*.09)-rotateY)*.06;
        gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform2f(rotation,rotateX,rotateY);gl.uniform1f(aspect,w/h);gl.drawArrays(gl.TRIANGLES,0,vertices.length/9);
        host.dataset.sceneState='ready';
        if(!still)frame=requestAnimationFrame(draw);
      };
      const start=()=>{if(!frame&&!disposed&&!contextLost)frame=requestAnimationFrame(draw);};
      const point=event=>{if(motion?.matches)return;const r=host.getBoundingClientRect();px=(event.clientX-r.left)/r.width-.5;py=(event.clientY-r.top)/r.height-.5;start();};
      const leave=()=>{px=0;py=0;};
      const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else start();};
      const lost=event=>{event.preventDefault();contextLost=true;host.dataset.sceneState='fallback';cancelAnimationFrame(frame);frame=0;};
      const restored=()=>{dispose();mounted.delete(host);mount(host);};
      const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)start();else{cancelAnimationFrame(frame);frame=0;}}):null;
      const resize=typeof ResizeObserver==='function'?new ResizeObserver(start):null;
      function dispose(){disposed=true;cancelAnimationFrame(frame);observer?.disconnect();resize?.disconnect();host.removeEventListener('pointermove',point);host.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',visibility);motion?.removeEventListener?.('change',start);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);gl.deleteBuffer(buffer);gl.deleteProgram(program);}
      mounted.set(host,dispose);observer?.observe(host);resize?.observe(host);host.addEventListener('pointermove',point,{passive:true});host.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',visibility);motion?.addEventListener?.('change',start);canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);start();
    }catch{if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);host.dataset.sceneState='fallback';mounted.set(host,()=>{});}
  }
  const scan=()=>{for(const [host,dispose]of mounted)if(!host.isConnected){dispose();mounted.delete(host);}document.querySelectorAll('[data-hb-scene]').forEach(mount);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
  if(typeof MutationObserver==='function')new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
})();

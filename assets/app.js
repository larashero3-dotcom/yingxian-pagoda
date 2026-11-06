/* =====================================================================
   應縣木塔 · 營造 — SAKYAMUNI PAGODA CONSTRUCTION STUDY
   The Liao-dynasty timber pagoda of Fogong Temple (1056), generated from a
   millimetre survey table and assembling bottom-up behind a rising cut
   plane. Five chapters: fabric, contents, frame, lean, repair.

   Derived from ThreeUI Country Towers (MIT, (c) 2026 Meng To).
   Geometry builders, the cut-plane build, the material system and the
   landscape/weather systems come from there; the Liao structure, the survey
   table, the lean chronology and the repair schemes are this project's.
   See THIRD-PARTY-NOTICES.md.
   ===================================================================== */
(function(){
"use strict";
const T=THREE;

/* ------------------------------------------------------------------ *
 * 0.  deterministic noise
 * ------------------------------------------------------------------ */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeNoise(seed){
  const rnd=mulberry32(seed),p=new Float32Array(65536);
  for(let i=0;i<65536;i++)p[i]=rnd();
  const at=(x,y)=>p[((y&255)<<8)+(x&255)];
  const sm=t=>t*t*(3-2*t);
  return function(x,y){
    const xi=Math.floor(x),yi=Math.floor(y),xf=sm(x-xi),yf=sm(y-yi);
    const a=at(xi,yi),b=at(xi+1,yi),c=at(xi,yi+1),d=at(xi+1,yi+1);
    return (a+(b-a)*xf)*(1-yf)+(c+(d-c)*xf)*yf;
  };
}
function fbm(n,x,y,oct,gain){let s=0,a=.5,f=1,tot=0;for(let i=0;i<oct;i++){s+=a*n(x*f,y*f);tot+=a;a*=(gain||.5);f*=2;}return s/tot;}

/* ------------------------------------------------------------------ *
 * 1.  canvas textures — everything in earth pigment
 * ------------------------------------------------------------------ */
function cv(w,h){const c=document.createElement('canvas');c.width=w;c.height=h||w;return c;}
function toTex(c,rx,ry){
  const t=new T.CanvasTexture(c);
  t.wrapS=t.wrapT=T.RepeatWrapping;
  t.repeat.set(rx||1,ry||1);
  t.anisotropy=8;
  if(t.encoding!==undefined&&T.sRGBEncoding!==undefined)t.encoding=T.sRGBEncoding;
  if('colorSpace' in t&&T.SRGBColorSpace!==undefined)t.colorSpace=T.SRGBColorSpace;
  return t;
}
function toLin(c,rx,ry){
  const t=new T.CanvasTexture(c);
  t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rx||1,ry||1);t.anisotropy=4;
  return t;
}

/* GPT Image 2 texture set — made seamless and compressed at build time */
const _img={},_wait={};
function loadImg(name,cb){
  if(_img[name])return cb(_img[name]);
  (_wait[name]=_wait[name]||[]).push(cb);
  if(_wait[name].length>1)return;
  const im=new Image();
  im.onload=()=>{_img[name]=im;(_wait[name]||[]).forEach(f=>f(im));_wait[name]=[];};
  /* data: URI, from assets/tex.js — see the note at the top of that file for
     why these are not .webp files on disk. Short version: on file:// a local
     image file taints the canvas AND WebGL refuses to upload it, so the tower
     comes out with no maps at all. base64 is same-origin and costs a third
     more bytes, which this package can afford. */
  im.src=window.TEX[name];
}
function srgb(t){
  if(t.encoding!==undefined&&T.sRGBEncoding!==undefined)t.encoding=T.sRGBEncoding;
  if('colorSpace' in t&&T.SRGBColorSpace!==undefined)t.colorSpace=T.SRGBColorSpace;
  return t;
}
function drawTo(img,size){
  const c=cv(size,size);c.getContext('2d').drawImage(img,0,0,size,size);return c;
}
/* ------------------------------------------------------------------ *
 * reading pixels back out of a texture
 *
 * bumpCanvas / roughCanvas / weatherWood all derive a second map from the
 * first by reading its pixels. That works when the image and the page share
 * an origin — over http, and for the data: URIs v5 used.
 *
 * It does NOT work on file://. Chrome treats every local file as its own
 * origin, so drawing ./assets/tex/timber.webp into a canvas taints it and
 * getImageData throws SecurityError. Turning the textures into real files to
 * save 145 KB is what introduced that: fourteen throws, one per texture, and
 * a tower with no grain and no relief.
 *
 * The container serves the package over a real origin so it never sees this.
 * But double-clicking index.html is how anyone checks the thing on a laptop,
 * and it should degrade to a plainer tower rather than a broken one. Probed
 * once, because the answer is a property of the page, not of the image.
 * ------------------------------------------------------------------ */
let _canRead=null;
function canReadPixels(img){
  if(_canRead!==null)return _canRead;
  try{
    const c=cv(2,2);const g=c.getContext('2d');
    g.drawImage(img,0,0,2,2);g.getImageData(0,0,1,1);
    _canRead=true;
  }catch(e){
    _canRead=false;
    console.warn('应县木塔：贴图不能读回像素（多半是用 file:// 打开的），'+
                 '木纹与凹凸这一层跳过。用本地服务器打开可恢复。');
  }
  return _canRead;
}
/* height field from luminance, for bumpMap */
function bumpCanvas(img,strength){
  const S=Math.min(512,img.width),c=drawTo(img,S),g=c.getContext('2d');
  /* a flat mid-grey height field is no relief, which is the right answer when
     the pixels cannot be read — better than throwing out of the callback and
     losing the colour map too */
  if(!canReadPixels(img)){g.fillStyle='#808080';g.fillRect(0,0,S,S);return c;}
  const d=g.getImageData(0,0,S,S),a=d.data;
  let mean=0;
  for(let i=0;i<a.length;i+=4)mean+=a[i]*.3+a[i+1]*.59+a[i+2]*.11;
  mean/=(a.length/4);
  for(let i=0;i<a.length;i+=4){
    const v=a[i]*.3+a[i+1]*.59+a[i+2]*.11;
    const m=Math.max(0,Math.min(255,128+(v-mean)*strength));
    a[i]=a[i+1]=a[i+2]=m;a[i+3]=255;
  }
  g.putImageData(d,0,0);return c;
}
/* rougher where the surface reads darker and more porous */
function roughCanvas(img,lo,hi){
  const S=Math.min(256,img.width),c=drawTo(img,S),g=c.getContext('2d');
  if(!canReadPixels(img)){
    const m=Math.round(255*(lo+hi)/2);
    g.fillStyle='rgb('+m+','+m+','+m+')';g.fillRect(0,0,S,S);return c;
  }
  const d=g.getImageData(0,0,S,S),a=d.data;
  for(let i=0;i<a.length;i+=4){
    const v=(a[i]*.3+a[i+1]*.59+a[i+2]*.11)/255;
    const r=Math.max(0,Math.min(255,255*(hi-(hi-lo)*v)));
    a[i]=a[i+1]=a[i+2]=r;a[i+3]=255;
  }
  g.putImageData(d,0,0);return c;
}

/* 木構本色 — the timber map ships as a dark wet brown, and a material tint
   can only ever multiply it darker. Weathered larch needs the map itself
   lifted and desaturated first: raise the level, pull it towards its own
   luminance, and let the tint do the final colouring. */
function weatherWood(img,lift,desat){
  const S=Math.min(256,img.width),c=drawTo(img,S),g=c.getContext('2d');
  /* unweathered timber is darker and browner than it should be, but it is
     still timber with grain in it */
  if(!canReadPixels(img))return c;
  const d=g.getImageData(0,0,S,S),a=d.data;
  for(let i=0;i<a.length;i+=4){
    const l=(a[i]*.3+a[i+1]*.59+a[i+2]*.11);
    for(let k=0;k<3;k++){
      let v=a[i+k]+(l-a[i+k])*desat;      /* towards grey */
      v=255-(255-v)*(1-lift);             /* lift the level */
      a[i+k]=Math.max(0,Math.min(255,v));
    }
  }
  g.putImageData(d,0,0);return c;
}

/* 鯱 — antique bronze */
function texBronze(seed){
  const S=256,c=cv(S),g=c.getContext('2d'),n=makeNoise(seed);
  const img=g.createImageData(S,S),d=img.data;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const i=(y*S+x)*4;
    const v=fbm(n,x/40,y/40,3,.55),f=fbm(n,x/8,y/8,2,.5);
    const l=.74+v*.44+f*.20;
    d[i]=Math.min(255,168*l);d[i+1]=Math.min(255,130*l);d[i+2]=Math.min(255,74*l);d[i+3]=255;
  }
  g.putImageData(img,0,0);
  return c;
}

/* 匾額 — the boards as they actually hang.
 *
 * Three things about the real ones. They are not gold on black lacquer: the
 * ground has weathered to pale grey-white and the characters are ink, so a
 * board reads as a light rectangle against dark timber, not a dark one.
 * 釋迦塔 hangs VERTICALLY — one column of three characters on a tall board —
 * while 天下奇觀 and 峻極神工 are horizontal. And the hand is 楷書, brushed,
 * not the printed Songti a browser reaches for by default.
 *
 * `vert` picks the orientation. Aspect follows from it, so a vertical board
 * is tall and narrow and a horizontal one is wide and short.
 */
function texPlaque(text,seed,vert,aspect){
  const n=text.length;
  /* Long side is 640; 256 was fine on a 60-pixel board and mush once the board
     is a fifth of a storey wide.

     `aspect` is the long/short ratio of the MESH the texture goes on. It has to
     be passed in: buildPlaques sizes the board off the face width, and if the
     canvas invents its own ratio from the character count the glyphs get scaled
     by a different factor in each axis — which is why 釋迦塔 came out as a
     stretched 迦/塔 with the first character pushed off the top. */
  const along=Math.max(1.05,aspect||Math.max(1.30,n*0.90+0.28));
  const W=vert?Math.round(640/along):640,
        H=vert?640:Math.round(640/along);
  const c=cv(W,H),g=c.getContext('2d'),nz=makeNoise(seed||11);
  /* 灰白底 — lime-washed board gone grey with nine centuries of weather */
  const img=g.createImageData(W,H),d=img.data;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=(y*W+x)*4;
    const v=fbm(nz,x/30,y/30,3,.55),f=fbm(nz,x/7,y/7,2,.5);
    const l=0.80+v*0.30+f*0.14;
    /* streaked downwards, the way rain leaves a hanging board */
    const streak=1-Math.max(0,fbm(nz,x/3.5,y/70,2,.6)-0.42)*0.42;
    d[i]  =Math.min(255,214*l*streak);
    d[i+1]=Math.min(255,208*l*streak);
    d[i+2]=Math.min(255,193*l*streak);
    d[i+3]=255;
  }
  g.putImageData(img,0,0);
  /* 邊框 — a plain dark moulding, thin. The real boards have almost no frame
     left to speak of, just a rim gone the colour of the timber behind them. */
  g.strokeStyle='rgba(72,58,42,.62)';g.lineWidth=Math.min(W,H)*0.055;
  g.strokeRect(W*0.028,H*0.028,W*0.944,H*0.944);
  g.strokeStyle='rgba(96,80,58,.34)';g.lineWidth=Math.min(W,H)*0.020;
  g.strokeRect(W*0.085,H*0.085,W*0.830,H*0.830);
  /* 楷書 in ink. Kaiti is on every mac; the fallbacks cover the rest. */
  g.textAlign='center';g.textBaseline='middle';
  const box=vert?H:W;
  const fs=Math.min(vert?W*0.70:H*0.66,box/n*0.84);
  g.font='400 '+fs+'px "Kaiti SC",STKaiti,BiauKai,"Kaiti TC","Yu Mincho",serif';
  /* centre the run and step by the glyph pitch, so two characters sit next to
     each other instead of being flung to opposite ends of the board */
  const pitch=fs*1.04, run=pitch*(n-1), start=box*0.5-run/2;
  for(let i=0;i<n;i++){
    /* 橫匾自右至左. i walks the board left to right, so a horizontal board takes
       its characters off the END of the string: 天下奇觀 puts 天 at the right
       edge and 觀 at the left. A vertical board is read top to bottom, which is
       the order i already walks, so it is left alone. */
    const gi=vert?i:(n-1-i);
    const alongPos=start+pitch*i;
    const x=vert?W*0.50:alongPos;
    const y=vert?alongPos:H*0.52;
    /* the ink has faded unevenly, so each glyph gets its own weight — keyed to
       the character, not the slot, so a glyph keeps its weight either way */
    const ink=0.62+fbm(nz,gi*9.1,3.3,2,.5)*0.30;
    g.fillStyle='rgba('+Math.round(46*ink)+','+Math.round(40*ink)+','
                       +Math.round(33*ink)+',0.93)';
    g.fillText(text[gi],x,y);
  }
  return c;
}

/* 鐵 — the 塔剎 is cast iron, and iron is not warm. Same fbm as the bronze,
   but a neutral blue-grey ramp with the pitting a nine-century casting has;
   tinting the bronze canvas cannot get here because its hue is baked in. */
function texIron(seed){
  const S=256,c=cv(S),g=c.getContext('2d'),n=makeNoise(seed);
  const img=g.createImageData(S,S),d=img.data;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const i=(y*S+x)*4;
    const v=fbm(n,x/34,y/34,3,.55),f=fbm(n,x/7,y/7,3,.5);
    const l=.70+v*.40+f*.26;
    /* a touch of rust bloom where the fbm peaks, else cold grey */
    const rust=Math.max(0,v-0.34)*1.5;
    d[i]  =Math.min(255,(104+rust*70)*l);
    d[i+1]=Math.min(255,(102+rust*28)*l);
    d[i+2]=Math.min(255,(101-rust*18)*l);
    d[i+3]=255;
  }
  g.putImageData(img,0,0);
  return c;
}

function bumpFrom(canvas,strength){
  const w=canvas.width,h=canvas.height;
  let src;
  try{src=canvas.getContext('2d').getImageData(0,0,w,h).data;}
  catch(e){
    const c0=cv(w,h),g0=c0.getContext('2d');
    g0.fillStyle='#808080';g0.fillRect(0,0,w,h);return c0;
  }
  const c2=cv(w,h),g2=c2.getContext('2d'),out=g2.createImageData(w,h),o=out.data;
  for(let i=0;i<src.length;i+=4){
    const v=src[i]*.3+src[i+1]*.59+src[i+2]*.11;
    const m=128+(v-128)*(strength||1);
    o[i]=o[i+1]=o[i+2]=Math.max(0,Math.min(255,m));o[i+3]=255;
  }
  g2.putImageData(out,0,0);return c2;
}

/* ------------------------------------------------------------------ *
 * 2.  geometry builder — octagonal on plan, presented face-on
 *
 * 應縣木塔 is eight-sided, so NS is 8 rather than the 4 a keep would use.
 * Everything downstream — prism, buildRoof, the railings — reads NS, so the
 * plan changes in one place. The one thing that does not survive is a true
 * ridge: an octagon has no ridge line, it closes to a point. Roofs here are
 * therefore always truncated (o.trunc), which is what 攢尖 means anyway.
 * ------------------------------------------------------------------ */
const NS=8;
const STEP=Math.PI*2/NS;
const AP=Math.cos(Math.PI/NS);    /* apothem / circumradius */
const SW=2*Math.sin(Math.PI/NS);  /* face width / circumradius */
const faceRot=k=>Math.PI/2-(k+0.5)*STEP;
const cornRot=k=>Math.PI/2-k*STEP;
const cornPt=(k,R)=>[Math.cos(k*STEP)*R,Math.sin(k*STEP)*R];

function Bld(){this.p=[];this.n=[];this.u=[];this.i=[];}
Bld.prototype.vert=function(x,y,z,nx,ny,nz,u,v){
  this.p.push(x,y,z);this.n.push(nx,ny,nz);this.u.push(u,v);
  return this.p.length/3-1;
};
Bld.prototype.quad=function(a,b,c,d){this.i.push(a,b,c,a,c,d);};
Bld.prototype.face=function(P,uv){
  const ax=P[1][0]-P[0][0],ay=P[1][1]-P[0][1],az=P[1][2]-P[0][2];
  const bx=P[2][0]-P[0][0],by=P[2][1]-P[0][1],bz=P[2][2]-P[0][2];
  let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
  const Ln=Math.hypot(nx,ny,nz);
  if(Ln<1e-9){nx=0;ny=1;nz=0;}else{nx/=Ln;ny/=Ln;nz/=Ln;}
  const t=uv||[[0,0],[1,0],[1,1],[0,1]];
  const a=this.vert(P[0][0],P[0][1],P[0][2],nx,ny,nz,t[0][0],t[0][1]);
  const b=this.vert(P[1][0],P[1][1],P[1][2],nx,ny,nz,t[1][0],t[1][1]);
  const c=this.vert(P[2][0],P[2][1],P[2][2],nx,ny,nz,t[2][0],t[2][1]);
  const d=this.vert(P[3][0],P[3][1],P[3][2],nx,ny,nz,t[3][0],t[3][1]);
  this.quad(a,b,c,d);
};
Bld.prototype.geo=function(){
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(this.p,3));
  g.setAttribute('normal',new T.Float32BufferAttribute(this.n,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(this.u,2));
  g.setIndex(this.i);
  return g;
};

/* box, rotated first about its own Z then about Y */
Bld.prototype.box=function(cx,cy,cz,sx,sy,sz,ry,uvs,rz){
  const hx=sx/2,hy=sy/2,hz=sz/2,S=uvs||1;
  const cz2=Math.cos(rz||0),sz2=Math.sin(rz||0);
  const co=Math.cos(ry||0),si=Math.sin(ry||0);
  const V=[[-hx,-hy,-hz],[hx,-hy,-hz],[hx,hy,-hz],[-hx,hy,-hz],
           [-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz]];
  const W=V.map(v=>{
    const x=v[0]*cz2-v[1]*sz2,y=v[0]*sz2+v[1]*cz2,z=v[2];
    return [cx+x*co+z*si,cy+y,cz-x*si+z*co];
  });
  const uv=(w,h)=>[[0,0],[w*S,0],[w*S,h*S],[0,h*S]];
  this.face([W[4],W[5],W[6],W[7]],uv(sx,sy));
  this.face([W[1],W[0],W[3],W[2]],uv(sx,sy));
  this.face([W[5],W[1],W[2],W[6]],uv(sz,sy));
  this.face([W[0],W[4],W[7],W[3]],uv(sz,sy));
  this.face([W[7],W[6],W[2],W[3]],uv(sx,sz));
  this.face([W[0],W[1],W[5],W[4]],uv(sx,sz));
};

/* octagonal prism / frustum by circumradius */
Bld.prototype.prism=function(y0,y1,R0,R1,uvS,capTop,capBot,vOff){
  const S=uvS||1,v0=(vOff||0)*S;
  for(let k=0;k<NS;k++){
    const a=cornPt(k,R0),b=cornPt(k+1,R0),c=cornPt(k+1,R1),d=cornPt(k,R1);
    const P=[[b[0],y0,b[1]],[a[0],y0,a[1]],[d[0],y1,d[1]],[c[0],y1,c[1]]];
    const w=Math.hypot(P[1][0]-P[0][0],P[1][2]-P[0][2]),h=Math.abs(y1-y0);
    this.face(P,[[0,v0],[w*S,v0],[w*S,v0+h*S],[0,v0+h*S]]);
  }
  if(capTop)for(let k=1;k<NS-1;k++){
    const a=cornPt(0,R1),b=cornPt(k,R1),c=cornPt(k+1,R1);
    this.face([[a[0],y1,a[1]],[b[0],y1,b[1]],[c[0],y1,c[1]],[c[0],y1,c[1]]],
      [[0,0],[b[0]*S,b[1]*S],[c[0]*S,c[1]*S],[c[0]*S,c[1]*S]]);
  }
  if(capBot)for(let k=1;k<NS-1;k++){
    const a=cornPt(0,R0),b=cornPt(k+1,R0),c=cornPt(k,R0);
    this.face([[a[0],y0,a[1]],[b[0],y0,b[1]],[c[0],y0,c[1]],[c[0],y0,c[1]]],
      [[0,0],[b[0]*S,b[1]*S],[c[0]*S,c[1]*S],[c[0]*S,c[1]*S]]);
  }
};

/* n-gon prism for styles that are not square on plan */
const cPtN=(k,R,n)=>[Math.cos(k*Math.PI*2/n)*R,Math.sin(k*Math.PI*2/n)*R];
Bld.prototype.prismN=function(y0,y1,R0,R1,n,uvS,capTop,capBot){
  const S=uvS||1;
  for(let k=0;k<n;k++){
    const a=cPtN(k,R0,n),b=cPtN(k+1,R0,n),c=cPtN(k+1,R1,n),d=cPtN(k,R1,n);
    const P=[[b[0],y0,b[1]],[a[0],y0,a[1]],[d[0],y1,d[1]],[c[0],y1,c[1]]];
    const w=Math.hypot(P[1][0]-P[0][0],P[1][2]-P[0][2]),h=Math.abs(y1-y0);
    this.face(P,[[0,0],[w*S,0],[w*S,h*S],[0,h*S]]);
  }
  if(capTop)for(let k=1;k<n-1;k++){
    const a=cPtN(0,R1,n),b=cPtN(k,R1,n),c=cPtN(k+1,R1,n);
    this.face([[a[0],y1,a[1]],[b[0],y1,b[1]],[c[0],y1,c[1]],[c[0],y1,c[1]]],
      [[0,0],[1,0],[1,1],[1,1]]);
  }
  if(capBot)for(let k=1;k<n-1;k++){
    const a=cPtN(0,R0,n),b=cPtN(k+1,R0,n),c=cPtN(k,R0,n);
    this.face([[a[0],y0,a[1]],[b[0],y0,b[1]],[c[0],y0,c[1]],[c[0],y0,c[1]]],
      [[0,0],[1,0],[1,1],[1,1]]);
  }
};
/* sweep a fixed plan outline upward, scaling it by a profile — the shikhara */
Bld.prototype.sweepPlan=function(plan,y0,y1,steps,prof,uvS){
  const S=uvS||1,N=plan.length,rings=[];
  for(let i=0;i<=steps;i++){
    const t=i/steps,y=y0+(y1-y0)*t,k=prof(t),ring=[];
    for(let j=0;j<N;j++)ring.push([plan[j][0]*k,y,plan[j][1]*k]);
    rings.push(ring);
  }
  for(let i=0;i<steps;i++)for(let j=0;j<N;j++){
    const j2=(j+1)%N;
    this.face([rings[i][j2],rings[i][j],rings[i+1][j],rings[i+1][j2]],
      [[0,i/steps*S*6],[1,i/steps*S*6],[1,(i+1)/steps*S*6],[0,(i+1)/steps*S*6]]);
  }
  return rings[steps];
};
/* surface of revolution — onion cupolas, amalaka discs, pots */
Bld.prototype.lathe=function(cx,cy,cz,y0,y1,prof,steps,seg,uvS,rib){
  const S=uvS||1,rings=[];
  for(let i=0;i<=steps;i++){
    const t=i/steps,y=cy+y0+(y1-y0)*t,r=prof(t),ring=[];
    for(let j=0;j<seg;j++){
      const a=j/seg*Math.PI*2;
      const rr=r*(rib?1+rib*Math.cos(a*seg/2):1);
      ring.push([cx+Math.cos(a)*rr,y,cz+Math.sin(a)*rr]);
    }
    rings.push(ring);
  }
  for(let i=0;i<steps;i++)for(let j=0;j<seg;j++){
    const j2=(j+1)%seg;
    this.face([rings[i][j2],rings[i][j],rings[i+1][j],rings[i+1][j2]],
      [[0,i/steps*S*4],[1,i/steps*S*4],[1,(i+1)/steps*S*4],[0,(i+1)/steps*S*4]]);
  }
};

/* keyframe surface of revolution. kf is [[t,r],...] with t and r both given
   as fractions of the figure's own total height, so one profile serves every
   size. Rings land exactly on the keyframes, which is what keeps a ledge
   crisp without spending steps on it — two keyframes a hair apart is a ledge,
   two at the same t is a flat cap. sq squashes the section along the facing
   axis, fa turns that axis. */
Bld.prototype.revolve=function(cx,cy,cz,h,kf,seg,uvS,sq,fa){
  const S=uvS||1,N=seg||13,q=(sq===undefined)?1:sq,
        co=Math.cos(fa||0),si=Math.sin(fa||0),rings=[];
  for(let i=0;i<kf.length;i++){
    const y=cy+kf[i][0]*h,r=kf[i][1]*h,ring=[];
    for(let j=0;j<N;j++){
      const a=j/N*Math.PI*2,lx=Math.cos(a)*r,lz=Math.sin(a)*r*q;
      ring.push([cx+lx*co+lz*si,y,cz-lx*si+lz*co]);
    }
    rings.push(ring);
  }
  for(let i=0;i<kf.length-1;i++)for(let j=0;j<N;j++){
    const j2=(j+1)%N,v0=i/(kf.length-1)*S*3,v1=(i+1)/(kf.length-1)*S*3;
    this.face([rings[i][j2],rings[i][j],rings[i+1][j],rings[i+1][j2]],
      [[0,v0],[S,v0],[S,v1],[0,v1]]);
  }
};

/* annulus standing on a face plane (outward normal +Z before ry) */
Bld.prototype.ring=function(cx,cy,cz,rIn,rOut,depth,ry,segs,uvS){
  const N=segs||36,S=uvS||1,co=Math.cos(ry||0),si=Math.sin(ry||0);
  const M=(x,y,z)=>[cx+x*co+z*si,cy+y,cz-x*si+z*co];
  for(let i=0;i<N;i++){
    const a0=i/N*Math.PI*2,a1=(i+1)/N*Math.PI*2;
    const p=(r,a,z)=>M(Math.cos(a)*r,Math.sin(a)*r,z);
    this.face([p(rIn,a0,depth/2),p(rOut,a0,depth/2),p(rOut,a1,depth/2),p(rIn,a1,depth/2)],
      [[0,i/N*S*6],[1,i/N*S*6],[1,(i+1)/N*S*6],[0,(i+1)/N*S*6]]);
    this.face([p(rIn,a1,depth/2),p(rIn,a1,-depth/2),p(rIn,a0,-depth/2),p(rIn,a0,depth/2)],
      [[0,i/N*S*6],[1,i/N*S*6],[1,(i+1)/N*S*6],[0,(i+1)/N*S*6]]);
    this.face([p(rOut,a0,depth/2),p(rOut,a0,-depth/2),p(rOut,a1,-depth/2),p(rOut,a1,depth/2)],
      [[0,i/N*S*6],[1,i/N*S*6],[1,(i+1)/N*S*6],[0,(i+1)/N*S*6]]);
  }
};

/* partial annulus band standing on a face plane */
Bld.prototype.arc=function(cx,cy,cz,rIn,rOut,depth,ry,a0,a1,segs,uvS){
  const N=segs||24,S=uvS||1,co=Math.cos(ry||0),si=Math.sin(ry||0);
  const M=(x,y,z)=>[cx+x*co+z*si,cy+y,cz-x*si+z*co];
  for(let i=0;i<N;i++){
    const t0=a0+(a1-a0)*i/N,t1=a0+(a1-a0)*(i+1)/N;
    const p=(r,a,z)=>M(Math.cos(a)*r,Math.sin(a)*r,z);
    const uv=[[0,i/N*S*10],[1,i/N*S*10],[1,(i+1)/N*S*10],[0,(i+1)/N*S*10]];
    this.face([p(rIn,t0,depth/2),p(rOut,t0,depth/2),p(rOut,t1,depth/2),p(rIn,t1,depth/2)],uv);
    this.face([p(rIn,t1,depth/2),p(rIn,t1,-depth/2),p(rIn,t0,-depth/2),p(rIn,t0,depth/2)],uv);
    this.face([p(rOut,t0,depth/2),p(rOut,t0,-depth/2),p(rOut,t1,-depth/2),p(rOut,t1,depth/2)],uv);
  }
};

/* filled polygon on a face plane */
Bld.prototype.fan=function(pts,zz,ry,cx,cy){
  const co=Math.cos(ry||0),si=Math.sin(ry||0);
  const M=(x,y)=>[x*co+zz*si,y,-x*si+zz*co];
  let mx=0,my=0;
  if(cx===undefined){for(const q of pts){mx+=q[0];my+=q[1];}mx/=pts.length;my/=pts.length;}
  else{mx=cx;my=cy;}
  const C=M(mx,my);
  for(let i=0;i<pts.length-1;i++){
    const A=M(pts[i][0],pts[i][1]),B=M(pts[i+1][0],pts[i+1][1]);
    this.face([C,A,B,B],[[0.5,0.5],[0,0],[1,0],[1,0]]);
  }
};

/* swept tube */
Bld.prototype.tube=function(pts,r,sides,uvS){
  const N=sides||6,S=uvS||1,rings=[];
  if(pts.length<2)return;
  for(let k=0;k<pts.length;k++){
    const p=pts[k];
    let t;
    if(k===0)t=[pts[1][0]-p[0],pts[1][1]-p[1],pts[1][2]-p[2]];
    else if(k===pts.length-1)t=[p[0]-pts[k-1][0],p[1]-pts[k-1][1],p[2]-pts[k-1][2]];
    else t=[pts[k+1][0]-pts[k-1][0],pts[k+1][1]-pts[k-1][1],pts[k+1][2]-pts[k-1][2]];
    let tl=Math.hypot(t[0],t[1],t[2]);
    if(tl<1e-9){t=[0,1,0];tl=1;}
    t=[t[0]/tl,t[1]/tl,t[2]/tl];
    const up=Math.abs(t[1])>.95?[1,0,0]:[0,1,0];
    let n1=[t[1]*up[2]-t[2]*up[1],t[2]*up[0]-t[0]*up[2],t[0]*up[1]-t[1]*up[0]];
    let l1=Math.hypot(n1[0],n1[1],n1[2]);
    if(l1<1e-9){n1=[1,0,0];l1=1;}
    n1=[n1[0]/l1,n1[1]/l1,n1[2]/l1];
    const n2=[t[1]*n1[2]-t[2]*n1[1],t[2]*n1[0]-t[0]*n1[2],t[0]*n1[1]-t[1]*n1[0]];
    const ring=[],rr=(typeof r==='function')?r(k/(pts.length-1)):r;
    for(let sI=0;sI<N;sI++){
      const a=sI/N*Math.PI*2,dx=Math.cos(a),dy=Math.sin(a);
      const nx=n1[0]*dx+n2[0]*dy,ny=n1[1]*dx+n2[1]*dy,nz=n1[2]*dx+n2[2]*dy;
      ring.push(this.vert(p[0]+nx*rr,p[1]+ny*rr,p[2]+nz*rr,nx,ny,nz,sI/N*S,k/(pts.length-1)*S*3));
    }
    rings.push(ring);
  }
  for(let k=0;k<rings.length-1;k++)for(let sI=0;sI<N;sI++){
    const s2=(sI+1)%N;
    this.quad(rings[k][sI],rings[k][s2],rings[k+1][s2],rings[k+1][sI]);
  }
};

function mergeGeos(list){
  list=list.filter(g=>g&&g.attributes.position.count);
  if(!list.length)return null;
  let total=0;list.forEach(g=>total+=g.attributes.position.count);
  const pos=new Float32Array(total*3),nor=new Float32Array(total*3),uvv=new Float32Array(total*2);
  const idx=[];let off=0,po=0,uo=0;
  list.forEach(g=>{
    pos.set(g.attributes.position.array,po);
    nor.set(g.attributes.normal.array,po);
    uvv.set(g.attributes.uv.array,uo);
    const ia=g.index.array;
    for(let i=0;i<ia.length;i++)idx.push(ia[i]+off);
    off+=g.attributes.position.count;po+=g.attributes.position.array.length;uo+=g.attributes.uv.array.length;
  });
  const G=new T.BufferGeometry();
  G.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  G.setAttribute('normal',new T.Float32BufferAttribute(nor,3));
  G.setAttribute('uv',new T.Float32BufferAttribute(uvv,2));
  G.setIndex(idx);
  return G;
}

/* ------------------------------------------------------------------ *
 * 3.  materials
 * ------------------------------------------------------------------ */
const canBronze=texBronze(53);
const canIron=texIron(71);

const CLIP=new T.Plane(new T.Vector3(0,-1,0),0);
const MAT={};
function imgMat(name,o){
  o=o||{};
  const m=new T.MeshStandardMaterial({
    color:new T.Color(o.tint!==undefined?o.tint:0xffffff),
    roughness:o.rough!==undefined?o.rough:.88,
    metalness:o.metal||0,
    side:o.side||T.FrontSide
  });
  m.shadowSide=T.DoubleSide;
  const rx=o.rx||1,ry=o.ry||1;
  loadImg(name,img=>{
    const src=o.wood?weatherWood(img,o.wood[0],o.wood[1]):img;
    const t=srgb(src instanceof HTMLCanvasElement?new T.CanvasTexture(src)
                                                 :new T.Texture(src));
    t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rx,ry);
    t.anisotropy=8;t.needsUpdate=true;
    m.map=t;
    if(o.bump){
      const bt=new T.CanvasTexture(bumpCanvas(img,o.bumpC||1.0));
      bt.wrapS=bt.wrapT=T.RepeatWrapping;bt.repeat.set(rx,ry);bt.anisotropy=4;
      m.bumpMap=bt;m.bumpScale=o.bump;
    }
    if(o.rmap){
      const rt=new T.CanvasTexture(roughCanvas(img,o.rmap[0],o.rmap[1]));
      rt.wrapS=rt.wrapT=T.RepeatWrapping;rt.repeat.set(rx,ry);
      m.roughnessMap=rt;
    }
    m.needsUpdate=true;
  });
  return m;
}
function canvasMat(canvas,o){
  o=o||{};
  const t=srgb(new T.CanvasTexture(canvas));
  t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(o.rx||1,o.ry||1);t.anisotropy=8;
  const m=new T.MeshStandardMaterial({map:t,roughness:o.rough!==undefined?o.rough:.88,
    metalness:o.metal||0,color:new T.Color(o.tint!==undefined?o.tint:0xffffff),
    side:o.side||T.FrontSide});
  m.shadowSide=T.DoubleSide;
  return m;
}
const MATBASE={},SNOWY=new T.Color(0xf2f6fa);
function captureMatBase(){
  ['tile','ridge','ridgeTile','jade','jadeDim','claytile','stone','stonePale','plaster','plasterD','soffit',
   'laterite','sandstone','sandDim','sandCarve','ashlar','ashlarD','lead','iznik','ochre','ochreD','vntile','vntrim']
    .forEach(k=>{if(MAT[k])MATBASE[k]=MAT[k].color.clone();});
}
function buildMaterials(){
  MAT.stone   = imgMat('ishigaki',{rx:0.52,ry:0.52,rough:.97,bump:.085,bumpC:1.6,rmap:[.80,1.0],tint:0xf0e8dc});
  MAT.plaster = imgMat('shikkui' ,{rx:1.05,ry:1.05,rough:.94,bump:.016,bumpC:1.0,rmap:[.84,.99],tint:0xe8e0cd});
  MAT.plasterD= imgMat('shikkui' ,{rx:1.05,ry:1.05,rough:.93,bump:.016,bumpC:1.0,tint:0xc9baa0});
  MAT.ridge   = imgMat('shikkui' ,{rx:2.4,ry:2.4,rough:.90,bump:.010,tint:0xd2c4a8});
  /* 布瓦 — Liao roofed this in plain grey clay tile, not glaze. Warm grey,
     fairly matt; the jade-green glaze belongs to later dynasties. */
  MAT.tile    = imgMat('kawara'  ,{rx:1.6,ry:1.6,rough:.74,bump:.014,bumpC:1.1,rmap:[.60,.86],tint:0x9a978f});
  /* 脊 — the hip ridges are tile too, only a shade darker. Left as pale
     plaster they read as white piping and the roof looks Ming. */
  MAT.ridgeTile=imgMat('kawara' ,{rx:2.2,ry:2.2,rough:.76,bump:.012,bumpC:1.0,tint:0x84817a});
  /* 木構本色 — nine centuries of weather leaves larch a dry grey-brown, not
     the wet chocolate a fresh timber map gives. 斗栱 and 柱 sit a shade
     lighter than the joinery so the frame reads against the infill. */
  /* 木構本色 — larch that has stood in Shanxi wind since 1056 is a pale
     silvery grey-brown, nowhere near the wet red-chocolate the timber map
     comes as. These tints have to LIFT the map, not deepen it, or the whole
     tower reads as a dark lacquered Qing building. */
  MAT.timber  = imgMat('timber'  ,{rx:0.9,ry:0.9,rough:.88,bump:.022,bumpC:1.3,rmap:[.74,.96],
                                   wood:[0.40,0.26],tint:0xcfbb9c});
  MAT.timberD = imgMat('timber'  ,{rx:1.2,ry:1.2,rough:.90,bump:.020,bumpC:1.3,
                                   wood:[0.32,0.24],tint:0xb59b7b});
  /* the soffit sits in permanent shade, so it stays a shade deeper */
  MAT.soffit  = imgMat('timber'  ,{rx:1.6,ry:1.6,rough:.92,bump:.014,
                                   wood:[0.24,0.22],tint:0x9c8564});
  MAT.scaffold= imgMat('pine'    ,{rx:1.0,ry:1.0,rough:.84,bump:.034,bumpC:1.5,rmap:[.62,.92]});
  MAT.core    = imgMat('ishigaki',{rx:0.5,ry:0.5,rough:.97,tint:0xb2a48c,side:T.DoubleSide});
  MAT.redwall = imgMat('redwall'  ,{rx:1.2,ry:1.2,rough:.92,bump:.012,bumpC:.9});
  MAT.redDeep = imgMat('redwall'  ,{rx:1.2,ry:1.2,rough:.90,bump:.012,tint:0xb4705e});
  MAT.jade    = imgMat('greenglaze',{rx:1.8,ry:1.8,rough:.44,bump:.008,bumpC:.8});
  MAT.jadeDim = imgMat('greenglaze',{rx:1.8,ry:1.8,rough:.50,bump:.008,tint:0xbcd0be});
  MAT.claytile= imgMat('orangetile',{rx:1.4,ry:1.4,rough:.52,bump:.020,bumpC:1.2});
  MAT.gold    = imgMat('goldleaf' ,{rx:1.6,ry:1.6,rough:.34,metal:.55,bump:.008});
  MAT.goldDim = imgMat('goldleaf' ,{rx:1.6,ry:1.6,rough:.42,metal:.45,bump:.008,tint:0xbfa268});
  /* 貼金彩塑 — the statues are gilded clay over a timber armature, not
     goldsmith's work. Rougher and less metallic than the 匾額 gold, or they
     read as brass ornaments instead of figures in a dark room. */
  MAT.gilt    = imgMat('goldleaf' ,{rx:1.5,ry:1.5,rough:.68,metal:.16,bump:.010,bumpC:1.0,tint:0xae9977});
  MAT.stonePale=imgMat('ishigaki',{rx:0.62,ry:0.62,rough:.95,bump:.070,bumpC:1.5,rmap:[.80,1.0],tint:0xded3c2});
  /* 塔剎 is cast iron, not gilt bronze — dark, matt, barely metallic. The
     gold finial that ships with the pagoda style is a Ming/Qing idea. */
  MAT.bronze  = canvasMat(canIron  ,{rx:2.0,ry:2.0,rough:.58,metal:.50,tint:0x8e8b86});
  /* ខ្មែរ — laterite is nearly brick red in the sun, sandstone silver-ochre */
  MAT.laterite= imgMat('laterite' ,{rx:0.62,ry:0.62,rough:.98,bump:.075,bumpC:1.5,rmap:[.82,1.0],tint:0xb49c8c});
  MAT.sandstone=imgMat('sandstone',{rx:0.30,ry:0.30,rough:.95,bump:.038,bumpC:1.3,rmap:[.78,.99],tint:0xeee3cc});
  MAT.sandDim = imgMat('sandstone',{rx:0.30,ry:0.30,rough:.96,bump:.034,bumpC:1.3,tint:0xc9bda4});
  MAT.sandCarve=imgMat('sandstone',{rx:1.30,ry:1.30,rough:.94,bump:.030,bumpC:1.3,tint:0xded1b6});
  /* Osmanlı — dressed limestone, lead the colour of a wet sky, İznik blue */
  MAT.ashlar  = imgMat('ashlar'   ,{rx:0.72,ry:0.72,rough:.93,bump:.030,bumpC:1.3,rmap:[.80,.99],tint:0xf2ead9});
  MAT.ashlarD = imgMat('ashlar'   ,{rx:0.72,ry:0.72,rough:.94,bump:.026,bumpC:1.3,tint:0xd2c7b2});
  MAT.lead    = imgMat('leadroof' ,{rx:1.70,ry:1.70,rough:.66,metal:.18,bump:.014,bumpC:1.1,rmap:[.40,.66],tint:0xbcc4cf});
  MAT.iznik   = imgMat('iznik'    ,{rx:1.05,ry:1.05,rough:.30,bump:.006,bumpC:.8});
  /* Việt — Huế lime wash over brick, with grey-green ridge tile */
  MAT.ochre   = imgMat('shikkui'  ,{rx:1.00,ry:1.00,rough:.94,bump:.018,bumpC:1.1,rmap:[.84,.99],tint:0xd9b077});
  MAT.ochreD  = imgMat('shikkui'  ,{rx:1.00,ry:1.00,rough:.95,bump:.016,bumpC:1.1,tint:0xb98f5e});
  MAT.vntile  = imgMat('kawara'    ,{rx:1.45,ry:1.45,rough:.58,bump:.016,bumpC:1.1,rmap:[.46,.74],tint:0xa8b09c,side:T.DoubleSide});
  MAT.vntrim  = imgMat('timber'   ,{rx:1.20,ry:1.20,rough:.82,bump:.018,bumpC:1.2,tint:0x8a5f43});
  MAT.dark    = new T.MeshStandardMaterial({color:0x1d1712,roughness:.99,metalness:0,side:T.DoubleSide});
  MAT.hollow  = new T.MeshStandardMaterial({color:0x171310,roughness:.99,metalness:0,side:T.DoubleSide});
  ['stone','plaster','plasterD','ridge','ridgeTile','tile','timber','timberD','soffit','bronze','dark','hollow','core',
   'redwall','redDeep','jade','jadeDim','claytile','gold','goldDim','gilt',
   'laterite','sandstone','sandDim','sandCarve','ashlar','ashlarD','lead','iznik',
   'ochre','ochreD','vntile','vntrim']
    .forEach(k=>{MAT[k].clippingPlanes=[CLIP];MAT[k].clipShadows=true;});
}

/* ------------------------------------------------------------------ *
 * 4.  roof — 攢尖 on an octagon; R is the circumradius
 * ------------------------------------------------------------------ */

/* ---- 攢尖頂 — an octagonal roof gathers to a point, so there is no ridge
   line to interpolate towards; every roof closes on a small ring instead.
   o.trunc is that ring: the next storey's wall for the lower eaves, a token
   radius for the top roof where the finial takes over. ----------------- */
function ridgePt(k,Lh){const r=(Lh||0.18)*0.5;return cornPt(k,r);}
function roofPoint(o,p,u,t){
  const tc=Math.min(1,t),over=Math.max(0,t-1);
  const g=1-Math.pow(1-tc,o.pow||1.3);
  const f=(u+1)/2;
  const oa=cornPt(p+1,1),ob=cornPt(p,1);
  const ox=oa[0]+(ob[0]-oa[0])*f,oz=oa[1]+(ob[1]-oa[1])*f;
  const ia=o.trunc?cornPt(p+1,o.trunc):ridgePt(p+1,o.ridge),
        ib=o.trunc?cornPt(p,o.trunc):ridgePt(p,o.ridge);
  const ix=ia[0]+(ib[0]-ia[0])*f,iz=ia[1]+(ib[1]-ia[1])*f;
  const corner=Math.pow(Math.abs(u),2.0);
  const flare=1+(o.flare!==undefined?o.flare:0.028)*corner*Math.pow(tc,3.2);
  const RE=o.RE*flare;
  const y=o.yT-(o.yT-o.yE)*g+o.lift*corner*Math.pow(tc,2.6)-over*(o.yT-o.yE)*0.45;
  return [ix+(ox*RE-ix)*t,y,iz+(oz*RE-iz)*t];
}
function buildRoof(o){
  o=o||{};
  const surf=new Bld(),soff=new Bld(),ribs=new Bld(),ridge=new Bld(),
        fascia=new Bld(),cap=new Bld();
  const NU=20,NT=13,TH=0.10,DROP=0.032;
  for(let p=0;p<NS;p++){
    const top=[],bot=[];
    for(let it=0;it<=NT;it++){
      const rT=[],rB=[],t=it/NT;
      for(let iu=0;iu<=NU;iu++){
        const u=-1+2*iu/NU,s=roofPoint(o,p,u,t);
        rT.push([s[0],s[1]-DROP,s[2]]);
        rB.push([s[0],s[1]-DROP-TH,s[2]]);
      }
      top.push(rT);bot.push(rB);
    }
    for(let it=0;it<NT;it++)for(let iu=0;iu<NU;iu++){
      surf.face([top[it+1][iu],top[it+1][iu+1],top[it][iu+1],top[it][iu]],
        [[0,it/NT*2.0],[1,it/NT*2.0],[1,(it+1)/NT*2.0],[0,(it+1)/NT*2.0]]);
      soff.face([bot[it][iu],bot[it][iu+1],bot[it+1][iu+1],bot[it+1][iu]],
        [[0,it/NT],[1,it/NT],[1,(it+1)/NT],[0,(it+1)/NT]]);
    }
    for(let iu=0;iu<NU;iu++)
      fascia.face([top[NT][iu],top[NT][iu+1],bot[NT][iu+1],bot[NT][iu]],
        [[iu/NU*3,0],[(iu+1)/NU*3,0],[(iu+1)/NU*3,1],[iu/NU*3,1]]);
    /* 丸瓦 — round barrel tiles running down the slope */
    const NR=Math.max(14,Math.round(o.RE*8.0));
    for(let ir=1;ir<NR;ir++){
      const u=-1+2*ir/NR,pts=[];
      for(let it=1;it<=NT+1;it++){
        const t=Math.min(1.04,it/NT),s=roofPoint(o,p,u,t);
        pts.push([s[0],s[1]-DROP+0.010,s[2]]);
      }
      const rr=0.024+0.010*(o.RE/3.3);
      ribs.tube(pts,rr,6,1);
      const e=pts[pts.length-1],e2=pts[pts.length-2];
      const dx=e[0]-e2[0],dy=e[1]-e2[1],dz=e[2]-e2[2],dl=Math.hypot(dx,dy,dz)||1;
      ribs.tube([[e[0],e[1],e[2]],[e[0]+dx/dl*0.045,e[1]+dy/dl*0.045,e[2]+dz/dl*0.045]],rr*1.8,8,1);
    }
    /* 降棟 — plastered hip ridge along u = +1 */
    const hip=[];
    for(let it=0;it<=NT+1;it++){
      const t=Math.min(1.05,it/NT),s=roofPoint(o,p,1,t);
      hip.push([s[0],s[1]-DROP+0.052,s[2]]);
    }
    cap.tube(hip,0.062,6,1);
    const tip=hip[hip.length-1],tp=hip[hip.length-2];
    const vx=tip[0]-tp[0],vz=tip[2]-tp[2],vl=Math.hypot(vx,vz)||1;
    const tr=o.tip!==undefined?o.tip:0.10;
    cap.tube([[tip[0],tip[1],tip[2]],
              [tip[0]-vx/vl*0.06,tip[1]+tr*0.6,tip[2]-vz/vl*0.06],
              [tip[0]-vx/vl*0.09,tip[1]+tr,tip[2]-vz/vl*0.09]],0.046,6,1);
  }
  /* a truncated roof needs its inner opening decked, or lamplight from the
     storey below shows straight through it */
  if(o.trunc){
    const yc=o.yT-DROP,c=[];
    for(let k=0;k<NS;k++)c.push(cornPt(k,o.trunc*1.02));
    for(let k=1;k<NS-1;k++)
      surf.face([[c[0][0],yc,c[0][1]],[c[k+1][0],yc,c[k+1][1]],
                 [c[k][0],yc,c[k][1]],[c[k][0],yc,c[k][1]]],
                [[0,0],[1,0],[1,1],[1,1]]);
  }
  /* 大棟 — main ridge with 鬼瓦, only where the roof actually has one */
  if(!o.trunc){
    const m0=ridgePt(0,o.ridge),m2=ridgePt(2,o.ridge),yR=o.yT-DROP+0.10;
    cap.tube([[m0[0],yR,m0[1]],[0,yR+0.015,0],[m2[0],yR,m2[1]]],0.085,6,1);
    for(const m of [m0,m2]){
      ridge.box(m[0],yR+0.075,m[1],0.30,0.24,0.20,Math.atan2(m[0],m[1]),4);
    }
  }
  return {surf:surf.geo(),soffit:soff.geo(),ribs:ribs.geo(),
          ridge:ridge.geo(),fascia:fascia.geo(),cap:cap.geo()};
}

/* ------------------------------------------------------------------ *
 * 5.  應縣木塔 — 佛宮寺釋迦塔, Yingxian, Shanxi, 1056 (Liao)
 *
 * Measured figures below are marked [實測] where a survey backs them and
 * [推定] where they are proportioned from the ones that do. Confirmed:
 * total 67.31 m (Liang Sicheng, storey by storey; a 2006 satellite pass got
 * 65.86 m), platform ~4 m in two tiers — a square lower one ~40 m a side and
 * an octagonal upper one 35.47 m across — body 30.27 m across at the ground,
 * inner ring (內槽) 10.25 m, first storey 11.5 m to the second floor, iron
 * finial 10 m with five 相輪 rings. Per-storey heights and the taper are not
 * published outside Chen Mingda's monograph, so they are proportioned here.
 *
 * The model is 14 units tall to match the scaffold and camera rig, so the
 * scale is 14/67.31 ≈ 0.208 units per metre.
 * ------------------------------------------------------------------ */
const M=14/65.77;                       /* metres → scene units */
/* The table below is written in METRES so it can be read against the
   surveys, then scaled once. Heights are absolute from the foot of the
   platform; R is a circumradius, so 30.27 m "diameter" is taken as the
   across-corners of the 副階 ring and halves to 15.14. */
const LYm={
  /* MEASURED. Every figure below is Chen Mingda's survey as tabulated in
     Buildings 2024, 14, 1472 (mdpi.com/2075-5309/14/5/1472), Tables 1 and 2 —
     actual measured values in millimetres, not reconstructions. The vertical
     segments sum to 65,770 mm, which is the paper's stated total height, so the
     table closes on itself. R is the OUTER column ring's circumradius, taken as
     half the across-corners plan dimension.

     Note this makes the total 65.77 m, not the 67.31 m usually quoted. Both are
     real: 67.31 is Liang Sicheng's 1930s storey-by-storey sum, 65.77/65.86 are
     later instrument surveys. The tower has settled and leaned in between. The
     measured table is used here because it is internally consistent. */
  base:{y0:0.0,y1:1.9,Rsq:20.0,y2:3.635,R:14.983},
  /* 副階周匝 — the bottom porch, and the sixth of the six eaves.
     Plan 29,965 mm across corners; segments 4377 + 1023 + 3365. */
  fujie:{y0:3.635,y1:8.012,R:14.983,dg:1.023,yE:8.520,yT:11.377,RE:16.90},
  /* five 明層. y0/y1 are the 柱 (column and lintel) part; dg is the 斗栱 part;
     yE/yT bracket the roof frame part. mez is the 暗層 above the storey. */
  st:[
    {y0:3.635 ,y1:12.361,R:11.537,Ri:5.13,dg:1.463,yE:13.824,yT:16.720,RE:15.60,
     pz:{y0:16.720,y1:18.195,R:11.20}},
    {y0:18.195,y1:21.102,R:11.037,Ri:4.85,dg:1.468,yE:22.570,yT:25.500,RE:14.30,
     pz:{y0:25.500,y1:26.973,R:10.75}},
    {y0:26.973,y1:29.864,R:10.659,Ri:4.58,dg:1.457,yE:31.321,yT:34.210,RE:13.10,
     pz:{y0:34.210,y1:35.699,R:10.35}},
    {y0:35.699,y1:38.575,R:10.226,Ri:4.33,dg:1.028,yE:39.603,yT:42.375,RE:12.00,
     pz:{y0:42.375,y1:43.550,R: 9.90}},
    {y0:43.550,y1:46.313,R: 9.638,Ri:4.09,dg:0.892,yE:47.205,yT:53.170,RE:10.90,
     pz:null}
  ],
  /* 塔剎 — 屋脊 1170 + 剎座 1910 + 塔剎 9520, apex at 56.25 m [實測] */
  fin:{y0:56.250,y1:65.770}
};
/* scale the table into scene units: every key is a length, so one pass over
   the leaves does it. 65.77 m lands exactly on 14. */
const LY=(function(o){
  const walk=v=>{
    if(v===null||v===undefined)return v;
    if(typeof v==='number')return v*M;
    if(Array.isArray(v))return v.map(walk);
    const r={};for(const k in v)r[k]=walk(v[k]);return r;
  };
  return walk(o);
})(LYm);
/* 辽 roofs are the flat ones. A Ming or Qing eave whips up at the corner;
   a Liao eave barely lifts, reaches much further out, and runs a nearly
   straight slope. These three numbers are the whole difference, so they are
   named once and shared by all six eaves. */
const LIAO={lift:0.12,tip:0.05,pow:1.05,flare:0.026};
/* 勾欄 height. A Liao 平坐 railing is about waist high — 1.1 m. v2 passed 0.46
   SCENE units here, which is 2.16 m, so the railing came out taller than the
   storey it fronted and stood as a lattice wall across the windows behind it.
   Written as metres and scaled, like everything else in the table. */
const RAIL_H=1.10*M;
/* An 明層 wall divides into three bands, as fractions of the storey's column
   height: the 障水板 below the sill, the 直棂窗, and above the window head the
   run of 闌額 timber a 匾額 is hung on. buildBay and buildPlaques BOTH read
   these, which is the point — in v2 the window band and the board position were
   two independent magic numbers, so they drifted into each other.

   WIN_LO also has to clear the 平坐 railing standing in front of the wall. The
   railing is 1.10 m on a storey of 2.7–2.9 m, so anything below about a third
   of the storey height is hidden behind it. */
/* Measured off the elevation photographs, as fractions of the storey's column
   height. The 格子窗 sit LOW — the 平坐 railing standing in front of them crosses
   their bottom edge, which is what the photographs show. The door runs from the
   floor up to DOOR_HEAD, and DOOR_HEAD is also where a 匾額 stops, because on the
   building the board hangs immediately over the doorway. */
/* Measured on m_sk2: floor to 闌額 is the column height; the window runs 0.27 to
   0.86 of it and the 平坐 railing top crosses at about 0.47, so the railing eats
   the window's lower third and no more. The door head shares the window head's
   lintel line. An earlier pass put the window at 0.155-0.560, which the railing
   then covered more than half of, leaving a sliver that read as nothing. */
const WIN_LO=0.270, WIN_HI=0.780;
const DOOR_HEAD=0.780;
/* A board is not confined to the column band: it hangs off the eave purlin and
   crosses the 斗栱 band. BIAN_RISE is how far up into that band the top edge
   goes, as a fraction of the band's depth. */
const BIAN_RISE=0.42;
function liaoRoof(o){
  return Object.assign({ridge:0.18},LIAO,o);
}

/* ---- 平坐勾欄 — the balcony railing that rings every 平坐 -----------
   Liao railings are 單勾欄: a 尋杖 handrail over one mid-rail, carried on
   短柱 with a 斗子 block at the head. Plain, and much heavier than the
   fretted Ming version. ---------------------------------------------- */
function buildRail(y0,h,R,seg){
  const b=new Bld(),W=R*SW,z=R*AP;
  for(let k=0;k<NS;k++){
    const rot=faceRot(k),co=Math.cos(rot),si=Math.sin(rot);
    const P=(x,y,zz,sx,sy,sz)=>b.box(x*co+zz*si,y,-x*si+zz*co,sx,sy,sz,rot,4.0);
    P(0,y0+h*0.94,z,W*1.02,0.070,0.100);   /* 尋杖 */
    P(0,y0+h*0.50,z,W*0.99,0.048,0.072);   /* 中枋 */
    P(0,y0+h*0.06,z,W*0.99,0.060,0.088);   /* 地栿 */
    const n=seg||7;
    for(let i=0;i<=n;i++){
      const x=(-1+2*i/n)*W*0.46;
      P(x,y0+h*0.48,z,0.050,h*0.84,0.050);
      P(x,y0+h*0.86,z,0.086,h*0.10,0.086);  /* 斗子 at the head */
    }
  }
  for(let c=0;c<NS;c++){
    const q=cornPt(c,R);
    b.box(q[0],y0+h*0.50,q[1],0.105,h*1.02,0.105,cornRot(c),4.0);
  }
  return b.geo();
}

/* ---- 斗栱 — the bracket band, 54 kinds of them in the real thing ----
   Not modelled cornice by cornice; what has to read at this scale is that
   Liao brackets are enormous. On a Qing building the band is a decorative
   strip. Here it is nearly a storey deep, stepping out on 華栱 and 下昂 far
   enough to carry the eave, and that depth is the tell. ---------------- */
function dougong(tim,timD,y0,h,R,Rout,n){
  timD.prism(y0,y0+h*0.26,R*1.005,R*1.02,2.2);        /* 闌額 */
  tim .prism(y0+h*0.24,y0+h*0.46,R*1.04,R*1.11,3.0);  /* first 跳 */
  tim .prism(y0+h*0.44,y0+h*0.98,R*1.15,Rout,3.0);    /* out to the eave */
  const W=R*SW;
  for(let k=0;k<NS;k++){
    const rot=faceRot(k),co=Math.cos(rot),si=Math.sin(rot);
    const P=(b,x,y,z,sx,sy,sz,rz)=>b.box(x*co+z*si,y,-x*si+z*co,sx,sy,sz,rot,4.5,rz);
    /* 柱頭鋪作 at the bay divisions, 補間鋪作 between — Liao puts one
       intercolumnar set per bay, so n is the bay count and sets are 2n+1 */
    for(let i=0;i<=n*2;i++){
      const x=(-1+2*i/(n*2))*W*0.47;
      const head=(i%2)===0;                 /* even index sits on a column */
      P(timD,x,y0+h*0.40,R*1.06*AP,head?0.17:0.13,h*0.30,0.16);
      P(tim ,x,y0+h*0.64,R*1.13*AP,head?0.34:0.26,h*0.15,0.24);
      P(timD,x,y0+h*0.84,R*1.22*AP,head?0.19:0.15,h*0.13,0.16);
      /* 下昂 — the slanting arm, tilted so it reads as a cantilever */
      if(head)P(tim,x,y0+h*0.74,R*1.28*AP,0.11,h*0.44,0.11,-0.62);
    }
    P(timD,0,y0+h*0.13,R*1.02*AP,W*0.99,h*0.22,0.05);
  }
  for(let c=0;c<NS;c++){
    const rot=cornRot(c),co=Math.cos(rot),si=Math.sin(rot);
    const P=(b,x,y,z,sx,sy,sz)=>b.box(x*co+z*si,y,-x*si+z*co,sx,sy,sz,rot,4.5);
    P(tim ,0,y0+h*0.64,R*1.17,0.36,h*0.17,0.32);
    P(timD,0,y0+h*0.40,R*1.11,0.18,h*0.32,0.20);
  }
}

/* ---- 一間之內：板門 · 格子窗 -------------------------------------
 *
 * Read off the elevation photographs. Every 明層 face is 三間, and the three
 * bays are NOT the same thing:
 *
 *   [格子窗]  [板門]  [格子窗]
 *
 * The CENTRE bay is an open door — a dark void running the full height of the
 * bay, with a narrow lattice leaf on each cheek. The 匾額 hangs directly over
 * it, which is the whole reason the boards are where they are. The two SIDE
 * bays are 格子窗: square-lattice panels, wider than they are tall, sitting low
 * enough that the 平坐 railing crosses their bottom edge.
 *
 * v3 had one continuous band of vertical 櫺條 running the whole face width on
 * every storey. Two things were wrong with that. There was no door anywhere
 * above the ground floor, so the boards hung over blank joinery; and 直棂窗 is
 * a comb of vertical bars, whereas what is actually on the building is a SQUARE
 * mesh. At a distance the comb read as a curtain wall.
 *
 * Ground floor is its own case: 板門 north and south, blind 白灰牆 elsewhere.
 * ------------------------------------------------------------------ */

/* one square-lattice panel, centred on (x) within the face.
   Everything this function makes is infill rather than frame, so it all goes
   into `inf` and the cutaway can take the whole window away in one go. */
function latticePanel(inf,dk,P,x,cy,hh,w,z){
  const timD=inf;
  P(dk,x,cy,z-0.014,w,hh*2,0.05);
  /* 桯 — the frame */
  P(timD,x-w/2,cy,z+0.020,0.062,hh*2+0.05,0.05);
  P(timD,x+w/2,cy,z+0.020,0.062,hh*2+0.05,0.05);
  P(timD,x,cy+hh,z+0.022,w+0.07,0.070,0.055);
  P(timD,x,cy-hh,z+0.022,w+0.07,0.070,0.055);
  /* 方格眼 — the square mesh. Cell size is fixed, so a wide panel simply gets
     more cells; that is what keeps every window on the tower the same grain. */
  /* Cell pitch is a real length — about 14 cm on the building — so a wide panel
     simply gets more cells and every window on the tower keeps the same grain.
     At 0.108 units the pitch was half a metre and a window came out as three
     coarse blocks rather than a mesh. */
  const cell=0.0315, bar=0.0125;
  const nx=Math.max(4,Math.round(w/cell)), ny=Math.max(3,Math.round(hh*2/cell));
  for(let i=1;i<nx;i++)P(timD,x+(-0.5+i/nx)*w,cy,z+0.013,bar,hh*1.94,0.030);
  for(let j=1;j<ny;j++)P(timD,x,cy+(-1+2*j/ny)*hh,z+0.011,w*0.96,bar,0.026);
}

/* timD carries the frame — the 檐柱, the 闌額 and the 地栿, which are structure
   and stay in every cutaway mode. inf carries the infill: door leaves, lattice,
   障水板. Splitting the two is what lets FRAME be a frame. */
function buildBay(tim,timD,dk,wall,inf,k,y0,h,R,kind){
  const rot=faceRot(k),co=Math.cos(rot),si=Math.sin(rot);
  const W=R*SW,z=R*AP;
  const P=(b,x,y,zz,sx,sy,sz)=>b.box(x*co+zz*si,y,-x*si+zz*co,sx,sy,sz,rot,3.2);
  /* 檐柱 — 三間 means four columns across the face, two of them shared with the
     neighbouring faces at the corners */
  for(let i=-1;i<=1;i+=2){
    P(timD,i*W*0.47 ,(y0+y0+h)/2,z+0.010,0.150,h*0.99,0.075);
    P(timD,i*W*0.157,(y0+y0+h)/2,z+0.010,0.130,h*0.99,0.070);
  }
  /* 闌額 over, 地栿 under */
  P(timD,0,y0+h-0.07,z+0.014,W*1.00,0.150,0.085);
  P(timD,0,y0+0.08  ,z+0.014,W*1.00,0.130,0.085);
  if(kind==='wall'){
    P(wall,0,y0+h*0.52,z-0.010,W*0.94,h*0.86,0.055);
    return;
  }

  const bay=W*0.313;               /* one of the three bays */

  if(kind==='gate'){
    /* ground floor 板門 — planked leaves, full height, no lattice */
    const span=W*0.86,cy=y0+h*0.50,hh=h*0.40,lw=span/4;
    P(dk,0,cy,z-0.014,span,hh*2,0.05);
    for(let i=0;i<=4;i++)P(inf,(-1+2*i/4)*span/2,cy,z+0.020,0.070,hh*2+0.05,0.05);
    P(inf,0,cy+hh,z+0.022,span+0.08,0.075,0.055);
    P(inf,0,cy-hh,z+0.022,span+0.08,0.075,0.055);
    for(let l=0;l<4;l++){
      const lx=(-1+(2*l+1)/4)*span/2;
      for(let j=0;j<3;j++)P(inf,lx+(-1+2*j/2)*lw*0.30,cy,z+0.012,0.030,hh*1.9,0.04);
      for(let j=0;j<5;j++)P(inf,lx,cy+(-1+2*j/4)*hh*0.80,z+0.012,lw*0.86,0.030,0.04);
    }
    return;
  }

  /* ---- 明層 ---- */
  /* centre bay: the door. Its head is the line the 匾額 hangs off, so it is
     named once here and read again by buildPlaques. */
  const dw=bay*0.62, dCy=y0+h*DOOR_HEAD*0.5, dHh=h*DOOR_HEAD*0.5;
  P(dk,0,dCy,z-0.016,dw,dHh*2,0.06);
  /* 立頰 and 門額 framing the opening */
  P(inf,-dw/2,dCy,z+0.022,0.085,dHh*2+0.06,0.058);
  P(inf, dw/2,dCy,z+0.022,0.085,dHh*2+0.06,0.058);
  P(inf,0,y0+h*DOOR_HEAD,z+0.026,dw+0.14,0.105,0.062);
  /* the narrow lattice leaf on each cheek of the door */
  for(let sg=-1;sg<=1;sg+=2)
    latticePanel(inf,dk,P,sg*(dw/2+bay*0.135),
      y0+h*(WIN_LO+WIN_HI)/2,h*(WIN_HI-WIN_LO)/2,bay*0.20,z);
  /* the two side bays: one 格子窗 each */
  for(let sg=-1;sg<=1;sg+=2)
    latticePanel(inf,dk,P,sg*bay,
      y0+h*(WIN_LO+WIN_HI)/2,h*(WIN_HI-WIN_LO)/2,bay*0.60,z);
  /* 障水板 under the window sills, left open under the door */
  for(let sg=-1;sg<=1;sg+=2)
    P(inf,sg*bay,y0+h*WIN_LO*0.5,z+0.006,bay*0.66,h*WIN_LO*0.92,0.052);
}

/* ---- 匾額 — the boards, hung where the record puts them -------------
   Faces are numbered from faceRot(k); k=1 and k=2 flank the front, so the
   boards that the sources put on the south elevation go there where they can
   actually be read, and 金城 / 雁塔 go out to the east and west cheeks. */
const BIAN=[
  /* These two were the wrong way round: 萬古觀瞻 is the ground-storey board,
     康熙六十一年, and 天宮高聳 hangs on the second. The character is 聳 —
     high and steep — not 擎. */
  {st:0,k:1,text:'萬古觀瞻',note:'康熙六十一年 1722'},
  {st:1,k:1,text:'天宮高聳',note:'二层'},
  /* 釋迦塔 is the one that hangs on end — a tall board, three characters in a
     single column, and the oldest thing of its kind on the building */
  /* Which face each takes matters, and the last pass fixed it the wrong way.
     Every other board on the building hangs in ONE column on the south face,
     which is k=1 here — 萬古觀瞻, 天宮高聳, 天下奇觀, 峻極神工 are all on it.
     釋迦塔 belongs in that column and must not leave it. 峻極于天 is the odd one
     out: on the reference elevation it hangs one face round to the right of the
     column, so it goes to k=0. faceRot runs +67.5, +22.5, -22.5 for k=0,1,2 and
     the plaque sits at x=zz*sin(rot), so at azimuth 0 increasing k moves LEFT
     across the frame — right of k=1 is k=0, not k=2. Swapping the pair, as the
     previous pass did, moved 釋迦塔 off the south face to get the order right. */
  {st:2,k:1,text:'釋迦塔'  ,note:'塔内最古匾额',vert:true},
  {st:2,k:0,text:'峻極于天',note:'宣统三年 1911'},
  {st:3,k:1,text:'天下奇觀',note:'明武宗 正德'},
  {st:3,k:7,text:'金城'    ,note:'唐 金城县'},
  {st:3,k:3,text:'雁塔'    ,note:'汉 雁门郡'},
  {st:4,k:1,text:'峻極神工',note:'明成祖 永乐'}
];
let _plaqueMats=null;
function plaqueMaterials(){
  if(_plaqueMats)return _plaqueMats;
  _plaqueMats=BIAN.map((b,i)=>{
    /* the boards are weathered board, not lacquer: rough and non-metallic */
    /* the same size rule buildPlaques uses, so the canvas matches the mesh */
    const asp=b.vert?1.12:1/((0.62*b.text.length+0.62));
    const m=canvasMat(texPlaque(b.text,17+i*7,b.vert,b.vert?asp:1/asp),
                      {rx:1,ry:1,rough:.86,metal:0});
    m.clippingPlanes=[CLIP];m.clipShadows=true;
    return m;
  });
  return _plaqueMats;
}
/* each board is its own little mesh because each carries its own texture */
function buildPlaques(grp){
  const mats=plaqueMaterials();
  BIAN.forEach((b,i)=>{
    const st=LY.st[b.st];
    const rot=faceRot(b.k),si=Math.sin(rot),co=Math.cos(rot);
    const R=st.R,z=R*AP,n=b.text.length;
    const H=st.y1-st.y0, faceW=R*SW;
    /* Sizes measured against the face width on the elevation photographs, which
       is the one dimension a photograph gives reliably:
         釋迦塔    3 chars, vertical   — 0.21 of the face, about 1.3x taller than wide
         天下奇觀  4 chars, horizontal — 0.40 of the face, about 3.1x wider than tall
       Earlier passes derived the board from the character count alone and then
       capped it against a narrow slot under the 闌額, so every board came out
       around a third of its real size and the vertical one came out a ribbon. */
    /* The slot between the door head and the top of the board. The model's
       storey is proportionally shorter over the door than the building's, so a
       board at the full measured width cannot also keep the photographed 1.35
       aspect; width is kept and the aspect is allowed to flatten to 1.12, which
       is the visible compromise. */
    const slot=(st.y1+st.dg*BIAN_RISE)-(st.y0+H*DOOR_HEAD);
    let w,h;
    if(b.vert){
      h=slot/0.88;                       /* the fringe laps over the door head */
      w=Math.min(faceW*0.190,h/1.12);
    }else{
      w=faceW*Math.min(0.42,0.128+0.070*n); h=w/(0.62*n+0.62);
    }
    /* Hung over the doorway, top edge up in the bracket band.
       The board's plane is pushed out past the first 跳 (see zz below), which is
       what lets the top rise into the band at all — the 斗栱 prisms step out to
       R*1.26, so a board left on the wall plane gets buried behind them. That was
       eating the first glyph of 釋迦塔.
       The bottom lands on the door head, overlapping it by the depth of the
       board's fringe, exactly as the photographs show. */
    const top=st.y1+st.dg*BIAN_RISE;
    const y=top-h/2;
    /* Out past the 闌額 and the first 斗栱 跳, which reach R*1.11 at the face
       midpoint. Anything closer than this gets clipped by the bracket band. */
    const zz=R*1.135*AP;
    const me=new T.Mesh(new T.PlaneGeometry(w,h),mats[i]);
    me.position.set(zz*si,y,zz*co);
    me.rotation.y=rot;
    me.castShadow=false;me.receiveShadow=true;me.name='bian';
    grp.add(me);
  });
}

/* ---- 暗層斜撐 — the bracing in the hidden structural levels ----------
 *
 * WHAT IS DOCUMENTED. The four 暗層 are structural levels carrying vertical,
 * horizontal AND diagonal bracing members, and those members exist ONLY in
 * these levels — the visible storeys have none. The bracing is deliberately
 * hidden behind each roof's eaves, which is why the tower reads as light and
 * elegant from outside while being densely braced within. Confirmed by the
 * parametric study built on Chen Mingda's 1980 measured survey:
 *   "the structural levels comprise columns [...] diagonal bracing members
 *    for lateral stability [...] and dougongs"
 *   "the dense bracing and lateral structural members in the structural level
 *    are hidden by the roof's eaves on each floor"
 *   — Buildings 2024, 14, 2464 §2.1 (mdpi.com/2075-5309/14/8/2464)
 *
 * WHAT IS NOT. No source I could reach gives the bracing's geometry: whether
 * it is X-crossed or single-diagonal, whether it spans radially between the
 * inner and outer rings or circumferentially between adjacent columns, whether
 * all eight bays carry it, or whether the four levels differ. The layout below
 * is therefore SCHEMATIC — an X between the rings in every bay — chosen to be
 * legible in the cutaway, not because a source supports that arrangement.
 *
 * Three different things, not to be confused:
 *   1. this Liao bracing, in the 暗層
 *   2. the 夾泥牆 shear walls added in 1722 and demolished in 1935 "for the sake
 *      of Feng Shui", which caused irreversible damage and sped the distortion
 *      — those were walls on the visible storeys, not this bracing
 *   3. the modern steel and timber props standing on the second floor today
 * The tower stood 666 years before 1722, so the 1722 work cannot be why it is
 * still up. That credit belongs to the original design.
 * ------------------------------------------------------------------ */
function buildBracing(tim,timD,y0,y1,Ro,Ri){
  const h=y1-y0;
  for(let k=0;k<NS;k++){
    const rot=faceRot(k),co=Math.cos(rot),si=Math.sin(rot);
    const zo=Ro*AP,zi=Ri*AP,W=Ro*SW*0.44;
    const P=(b,x,y,zz,sx,sy,sz,rz)=>b.box(x*co+zz*si,y,-x*si+zz*co,sx,sy,sz,rot,3.0,rz);
    /* the pair of 斜戧 crossing between the rings */
    const run=zo-zi,rise=h*0.80,len=Math.hypot(run,rise),ang=Math.atan2(run,rise);
    for(let s=-1;s<=1;s+=2)
      P(tim,s*W,y0+h*0.50,(zo+zi)/2,0.10,len,0.10,s*ang*0.92);
    /* 井栿 — the tie beams the braces work against */
    P(timD,0,y0+0.07,(zo+zi)/2,Ro*SW*0.96,0.115,run*0.96);
    P(timD,0,y1-0.07,(zo+zi)/2,Ro*SW*0.96,0.115,run*0.96);
  }
  /* both column rings continue through the mezzanine */
  for(let k=0;k<NS;k++){
    const q=cornPt(k,Ro),r=cornPt(k,Ri);
    timD.box(q[0],y0+h*0.5,q[1],0.145,h,0.145,cornRot(k),3.0);
    timD.box(r[0],y0+h*0.5,r[1],0.130,h,0.130,cornRot(k),3.0);
  }
}

/* ---- 塔剎 — 9.5 m of iron ------------------------------------------
 *
 * Order from the bottom, read off photographs of the actual finial:
 *
 *   磚砌剎座 → 仰蓮 → 覆缽 → 相輪五重 → 圓光 → 仰月 → 寶珠三重 → 寶瓶
 *
 * v2 had this stack out of order and out of proportion. Two things were wrong
 * and both were structural rather than cosmetic:
 *
 *   1. the 圓光 sat at 0.73 H, ABOVE the 相輪 and directly under the apex, so
 *      the openwork halo became the topmost silhouette and the whole finial
 *      read as a ring on a stick. On the building the halo sits BELOW the
 *      crescent, and what crowns the mast is a stack of three 寶珠 under a
 *      small 寶瓶.
 *   2. the 相輪 were given radii of 0.20–0.145 H against a 覆缽 of 0.21 H, so
 *      the rings were as wide as the bowl they stand on and the taper vanished.
 *      Photographs show the opposite: a broad banded 覆缽 carrying a distinctly
 *      NARROWER ringed drum.
 *
 * There was also no crescent in the geometry at all — the comment claimed one
 * and the code drew two plain discs.
 * ------------------------------------------------------------------ */
function buildFinial(fe,bz,tl){
  const F=LY.fin,H=F.y1-F.y0;
  /* every radius is a fraction of H rather than an absolute, so the ironwork
     keeps its proportions whatever the scene scale is */
  const R=k=>H*k;
  const Y=k=>F.y0+H*k;
  const SEG=NS*3;
  /* Radii. Scaled off the wide elevation, where the 覆缽 measures about 2.5 m
     across against a top eave of 21.8 m — call it 0.13 H for the radius. v2 ran
     the bowl at 0.21 H and the rings at 0.20 H, i.e. roughly twice as fat as the
     real casting, which is most of why the old finial read as a lamp rather than
     as ironwork. */
  /* 屋脊 1.17 m + 剎座 1.91 m — the masonry between the roof apex and the iron.
     THE TABLE ALREADY ACCOUNTS FOR IT: LYm.fin.y0 is 56.25 m, which is the top
     roof's 53.17 m plus 1.17 plus 1.91. Nothing was built in that 3.08 m, so the
     ironwork floated three metres clear of the roof it stands on and the finial
     read as a separate object hovering over the tower. What belongs there is one
     continuous mass — tiles gathering at the apex, then brick flaring up to meet
     the iron 仰蓮. */
  {
    const apex=LY.st[4].yT, seat=F.y0;
    const ridge=apex+(seat-apex)*0.46;
    /* 覆瓦 gathering on the apex. Wide at the bottom so the join reads as the
       roof continuing up, not as a drum set down on top of it. */
    tl.prism(apex-0.050,ridge,R(0.315),R(0.196),2.6,false,false);
    tl.prism(ridge,ridge+0.026,R(0.218),R(0.194),2.0,true);
    /* 磚砌剎座 — plastered brick, tapering IN as it rises, the way the
       photographs show it, then flaring at the very top to carry the 仰蓮 */
    fe.prism(ridge+0.018,seat-H*0.030,R(0.186),R(0.150),2.6,false);
    fe.prism(seat-H*0.030,seat+H*0.030,R(0.152),R(0.186),2.2,true);
  }
  /* 仰蓮 — the iron lotus collar bedded on the brick, petals lapping over it */
  bz.lathe(0,Y(0.028),0,0,H*0.064,t=>R(0.218)*(1-t*0.42),5,SEG,1.9);
  /* 覆缽 — the inverted bowl, and the mass of the lower quarter */
  const BOWL_Y0=0.086,BOWL_H=0.140;
  const bowl=t=>R(0.140)*Math.pow(Math.cos(t*0.92),0.40);
  bz.lathe(0,Y(BOWL_Y0),0,0,H*BOWL_H,bowl,12,SEG,1.5);
  /* the hoops that band the casting */
  for(let i=0;i<3;i++){
    const f=0.16+i*0.30, rr=bowl(f)*1.06;
    bz.lathe(0,Y(BOWL_Y0+BOWL_H*f),0,0,H*0.010,()=>rr,1,SEG,1.6);
  }
  /* 剎杆 — the mast, behind everything, running the whole height */
  bz.box(0,Y(0.490),0,R(0.022),H*0.920,R(0.022),Math.PI/NS,3);
  /* the drum the 相輪 are threaded on. Nearly cylindrical: it is the RINGS that
     step in, not the drum, or the whole stack reads as a cone. */
  bz.lathe(0,Y(0.226),0,0,H*0.300,t=>R(0.058)*(1-t*0.10),8,SEG,1.4);
  /* 五重相輪 — five rings, the count every survey agrees on. Each stands proud
     of the drum so it reads as its own hoop. */
  for(let i=0;i<5;i++){
    const t=i/4, y=Y(0.246+t*0.258), rr=R(0.096-t*0.020);
    bz.lathe(0,y,0,0,H*0.019,()=>rr,1,SEG,1.6);
    bz.lathe(0,y+H*0.019,0,0,H*0.013,u=>rr*(1-u*0.34),2,SEG,1.6);
  }
  /* 圓光 — the openwork halo. A single thin annulus on edge, BELOW the crescent.
     v2 put it at 0.73 H, above everything but the apex, and crossed two fat
     annuli, which came out as a solid ring swallowing the crescent behind it. */
  bz.ring(0,Y(0.580),0,R(0.058),R(0.106),H*0.010,0,28,1.6);
  /* 仰月 — the crescent: a shallow upturned bowl with two horns, so it keeps a
     crescent silhouette from any bearing */
  bz.lathe(0,Y(0.614),0,0,H*0.028,t=>R(0.068)*(0.52+t*0.48),3,SEG,1.5);
  for(let s=0;s<2;s++){
    const a=s?Math.PI:0;
    bz.lathe(Math.cos(a)*R(0.062),Y(0.640),Math.sin(a)*R(0.062),0,H*0.050,
      t=>R(0.021)*(1-t*0.86),4,12,1.5);
  }
  /* 寶珠三重 — three beads, each on its own collar, stacked without overlapping */
  [[0.694,0.050],[0.794,0.041],[0.876,0.032]].forEach(function(b){
    const y=b[0],r=b[1];
    bz.lathe(0,Y(y-0.016),0,0,H*0.016,t=>R(r)*(0.56+t*0.44),2,NS*2,1.5);
    bz.lathe(0,Y(y),0,0,H*r*2.0,
      t=>R(r)*Math.sin(Math.PI*(0.06+t*0.88)),9,NS*2,1.4);
  });
  /* 寶瓶 at the apex */
  bz.lathe(0,Y(0.940),0,0,H*0.032,t=>R(0.028)*(1-t*0.46),4,NS*2,1.5);
  bz.lathe(0,Y(0.970),0,0,H*0.030,
    t=>R(0.024)*Math.sin(Math.PI*(0.14+t*0.80)),8,NS*2,1.4);
}

/* ------------------------------------------------------------------ *
 * 5a.  assemble
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 4c.  塑像 — what is actually inside
 *
 * Each 明層 carries a 佛壇 in its 內槽, and twenty-six statues survive on
 * them: 1 + 5 + 4 + 7 + 9 from the bottom up. Liang Sicheng counted eleven
 * on the fourth storey in 1933, so the tower held thirty then. Liang and
 * 傅熹年 both read what is left as Liao work in form, repainted since; the
 * Liao and Northern Song objects found inside two of the main images in the
 * 1960s and 70s date part of the group to the end of Liao.
 *
 * The first storey is the only one with a published measurement per part,
 * from 王南 / 王卓男 / 鄭虹玉's 2021 survey (建築史學刊 2021:2):
 * 通高 10.32 m, 淨高 8.478 m, 膝距 5.537 m, 基座最寬 6.955 m, 頭高 2.625 m.
 * Two ratios come out of that survey and both are worth knowing:
 * 14.56 / 10.32 = 1.411 and 10.32 / 7.28 = 1.418, so the storey height is
 * √2 times the Buddha and the Buddha is √2 times the six Buddhas painted on
 * the wall behind. The room was sized from the figure, not the other way
 * round. Upper storeys use Liang's 1936 report — 二層「像並座高約四公尺強」,
 * 四層「約四.八五公尺」 — and 三層's four Buddhas are about 2.8 m each.
 * The fifth storey has no published figure and is proportioned from its group.
 *
 * These are volumes, not portraits: a profile of revolution squashed along
 * the facing axis, no face and no hands. At the scale a cutaway shows, a
 * modelled hand is a blob that claims to be a hand.
 * ------------------------------------------------------------------ */
const P_SIT=[[0,.004],[0,.310],
  [.038,.310],[.043,.246],   /* 須弥座 束腰 */
  [.088,.246],[.093,.318],   /* 上枋 */
  [.112,.330],[.117,.232],
  [.130,.284],[.135,.240],   /* 仰蓮 三重，一重一圈 */
  [.150,.310],[.155,.252],
  [.170,.337],[.175,.196],   /* 基座最寬 6.955 m，然後掐進去 */
  [.186,.188],
  [.206,.262],               /* 膝距 5.537 m，一步就出來 */
  [.290,.268],[.316,.258],
  [.322,.176],               /* 膝上一道硬檻，坐姿全靠它 */
  [.360,.164],[.430,.132],
  [.500,.122],[.590,.126],
  [.660,.137],[.706,.146],   /* 肩 */
  [.726,.124],[.740,.048],   /* 頸 */
  [.756,.050],[.772,.080],
  [.812,.090],[.868,.091],   /* 頭高 2.625 m，寬約 1.9 m */
  [.906,.082],[.928,.060],
  [.946,.050],[.968,.040],   /* 肉髻 */
  [.988,.024],[1,.008],[1,.002]];
const P_STAND=[[0,.004],[0,.112],
  [.036,.112],[.041,.150],[.070,.158],[.075,.092],
  [.096,.082],[.290,.104],[.460,.098],
  [.548,.090],[.648,.118],[.712,.130],   /* 肩 */
  [.744,.104],[.758,.042],[.778,.045],   /* 頸 */
  [.800,.068],[.856,.074],[.900,.068],
  [.926,.048],[.952,.040],[.978,.026],[1,.008],[1,.002]];
/* the 匾額 hang on one face and that is the face this model treats as south,
   so it is the face the figures look out of. */
const FRONT=faceRot(1);
/* u runs across that face, v out through it, both in metres from the axis.
   h is 通高; k:1 is a standing figure; b is the height of a mount under a
   seated one; fo:1 turns the figure to face away from the axis. */
const ICON=[
  /* 首層 — one figure, and it takes the room */
  {f:[{u:0,v:0,h:10.32}]},
  /* 二層 — 方壇：一佛二菩薩趺坐，二脅侍立於佛後 */
  {d:{sq:2.75,h:0.95},
   f:[{u:0,v:0.15,h:4.10},
      {u:2.45,v:0.05,h:3.15},{u:-2.45,v:0.05,h:3.15},
      {u:1.85,v:-1.60,h:3.30,k:1},{u:-1.85,v:-1.60,h:3.30,k:1}]},
  /* 三層 — 八角壇：四方佛，各朝一方 */
  {d:{oct:3.30,h:0.90},
   f:[{u:0,v:2.10,h:3.40,fo:1},{u:2.10,v:0,h:3.40,fo:1},
      {u:0,v:-2.10,h:3.40,fo:1},{u:-2.10,v:0,h:3.40,fo:1}]},
  /* 四層 — 華嚴三聖：釋迦、二弟子、文殊普賢騎獸、二崑崙奴牽獸 */
  {d:{sq:2.70,h:0.95},
   f:[{u:0,v:0.10,h:4.85},
      {u:2.00,v:-1.30,h:3.40,k:1},{u:-2.00,v:-1.30,h:3.40,k:1},
      {u:2.05,v:0.55,h:1.75,b:1.15},{u:-2.05,v:0.55,h:1.75,b:1.15},
      /* the 崑崙奴 stands at his animal's head, so he goes forward of it */
      {u:2.05,v:1.85,h:2.05,k:1},{u:-2.05,v:1.85,h:2.05,k:1}]},
  /* 五層 — 毗盧遮那居中，八大菩薩坐八方，合起來是一個九宮 */
  {d:{sq:2.45,h:1.00},
   f:[{u:0,v:0,h:3.80},
      {u:0,v:1.75,h:2.20,fo:1},{u:1.75,v:1.75,h:2.20,fo:1},
      {u:1.75,v:0,h:2.20,fo:1},{u:1.75,v:-1.75,h:2.20,fo:1},
      {u:0,v:-1.75,h:2.20,fo:1},{u:-1.75,v:-1.75,h:2.20,fo:1},
      {u:-1.75,v:0,h:2.20,fo:1},{u:-1.75,v:1.75,h:2.20,fo:1}]}
];
/* 坐騎 — 文殊's lion and 普賢's elephant, as a walking block. Four legs and
   a head is all that survives at 1.15 m in a 65 m tower. */
function beast(b,x,y,z,h,fa){
  const L=h*1.52,W=h*0.74,BH=h*0.56,LG=h*0.30;
  const co=Math.cos(fa),si=Math.sin(fa);
  const at=(lu,lv)=>[x+lu*co+lv*si,z-lu*si+lv*co];
  b.box(x,y+LG+BH/2,z,W,BH,L,fa,2.2);
  for(const lu of [-W*0.29,W*0.29])for(const lv of [-L*0.30,L*0.30]){
    const p=at(lu,lv);
    b.box(p[0],y+LG/2,p[1],W*0.40,LG,W*0.40,fa,2.2);
  }
  const hd=at(0,L*0.50);
  b.box(hd[0],y+LG+BH*0.90,hd[1],W*0.60,BH*0.76,L*0.28,fa,2.2);
}
function buildIcons(ic,wd,s,i){
  const C=ICON[i];if(!C)return;
  const co=Math.cos(FRONT),si=Math.sin(FRONT);
  const dh=C.d?C.d.h*M:0, yd=s.y0+dh;
  if(C.d){
    if(C.d.sq) wd.box(0,s.y0+dh/2,0,C.d.sq*M*2,dh,C.d.sq*M*2,FRONT,2.2);
    else       wd.prism(s.y0,yd,C.d.oct*M,C.d.oct*M*0.985,2.0,true,false);
  }
  C.f.forEach(g=>{
    const u=g.u*M,v=g.v*M,h=g.h*M,bh=(g.b||0)*M;
    const x=u*co+v*si, z=-u*si+v*co;
    const fa=FRONT+(g.fo?Math.atan2(g.u,g.v):0);
    if(bh)beast(ic,x,yd,z,bh,fa);
    if(g.k===1)ic.revolve(x,yd+bh,z,h,P_STAND,12,1.5,0.86,fa);
    else       ic.revolve(x,yd+bh,z,h,P_SIT,g.h>8?18:13,1.5,0.80,fa);
  });
}

function buildYingxian(){
  const grp=new T.Group();
  const stone=new Bld(),stoneP=new Bld(),tim=new Bld(),timD=new Bld(),
        wall=new Bld(),dk=new Bld(),hollow=new Bld(),fe=new Bld(),bz=new Bld(),
        inf=new Bld(),pzA=new Bld(),pzB=new Bld(),icon=new Bld();
  const gTile=[],gSoffit=[],gCap=[],gRidge=[],gRail=[];

  /* -------- 臺基 — a square course carrying an octagonal one -------- */
  {
    const B=LY.base;
    /* the lower tier is square on plan even though the tower is not, and it
       is the one thing here that is not eight-sided */
    stone.box(0,(B.y0+B.y1)/2,0,B.Rsq*2,B.y1-B.y0,B.Rsq*2,Math.PI/4,1.1);
    stone.prism(B.y1,B.y2-0.06,B.R,B.R*0.988,0.9);
    stoneP.prism(B.y2-0.06,B.y2,B.R*1.015,B.R*0.995,2.0,true);
    /* 月台 on the east, west and south, and 角石 with Liao lion heads */
    for(const a of [0,Math.PI/2,Math.PI]){
      const r=B.R*0.99;
      stone.box(Math.cos(a)*r,(B.y0+B.y2*0.72)/2,Math.sin(a)*r,
                B.R*0.52,B.y2*0.72,B.R*0.34,Math.PI/2-a,1.2);
    }
    for(let c=0;c<NS;c++){
      const q=cornPt(c,B.R*0.965);
      stoneP.box(q[0],B.y2+0.10,q[1],0.42,0.34,0.42,cornRot(c),2.4);
    }
  }

  /* -------- 副階周匝 — the veranda ring, and the sixth eave ---------
     Five storeys, six eaves: this ring is the extra one. Getting it wrong
     is the single most common way a reconstruction stops looking right. */
  {
    const F=LY.fujie;
    for(let k=0;k<NS;k++){
      const q=cornPt(k,F.R);
      timD.box(q[0],(F.y0+F.y1)/2,q[1],0.165,F.y1-F.y0,0.165,cornRot(k),3.0);
      const rot=faceRot(k),co=Math.cos(rot),si=Math.sin(rot),z=F.R*AP;
      /* two intermediate 副階柱 per face — 每面三間 */
      for(let i=-1;i<=1;i+=2){
        const x=i*F.R*SW*0.167;
        timD.box(x*co+z*si,(F.y0+F.y1)/2,-x*si+z*co,0.150,F.y1-F.y0,0.150,rot,3.0);
      }
      timD.box(z*si,F.y1-0.09,z*co,F.R*SW*1.00,0.160,0.090,rot,3.0);
    }
    dougong(tim,timD,F.y1,0.44,F.R,F.R*1.20,3);
    const r=buildRoof(liaoRoof({yE:F.yE,yT:F.yT,RE:F.RE,trunc:LY.st[0].R*0.985}));
    gTile.push(r.surf,r.ribs);gSoffit.push(r.soffit,r.fascia);gCap.push(r.cap,r.ridge);
  }

  /* -------- 五明四暗 — five storeys with a braced mezzanine between -- */
  LY.st.forEach((s,i)=>{
    const nxt=LY.st[i+1],h=s.y1-s.y0;
    /* 內槽 and 外槽: two concentric rings of columns per storey */
    for(let k=0;k<NS;k++){
      const q=cornPt(k,s.Ri);
      timD.box(q[0],(s.y0+s.y1)/2,q[1],0.150,h,0.150,cornRot(k),3.0);
    }
    /* the 內槽 is a room, not a band of wall. The real 塔心室 runs from the
       floor clear up to the 暗層 over it, which is how the first storey finds
       14.5 m of headroom for a 10.3 m Buddha. Closing this shell at the top of
       the columns left a see-through gap at the bracket band, and the big
       Buddha's head showed through it from outside. The radius is a shade
       inside the bracing so the brace ends do not land coplanar with it. */
    const iTop=s.pz?s.pz.y0:s.yE+(s.yT-s.yE)*0.34;
    hollow.prism(s.y0,iTop,s.Ri*0.925,s.Ri*0.925,1,true,false);
    buildIcons(icon,timD,s,i);
    /* the 八面 of joinery. Ground floor is 板門 north and south and blind
       wall elsewhere; every storey above is glazed all the way round. */
    for(let k=0;k<NS;k++){
      let kind;
      /* 板門 north and south. South is the face the 匾額 hang on and the
         face the 大佛 looks out of, so the door belongs under them. */
      if(i===0) kind=(k===1||k===5)?'gate':'wall';
      else      kind='upper';
      buildBay(tim,timD,dk,wall,inf,k,s.y0,h,s.R,kind);
    }
    /* the bracket band, then the eave it carries */
    dougong(tim,timD,s.y1,s.dg,s.R,s.R*1.26,3);
    const isTop=!nxt;
    const r=buildRoof(liaoRoof({yE:s.yE,yT:s.yT,RE:s.RE,
      /* lower eaves die against the next storey's wall; the top roof
         gathers to a small ring for the finial to stand on */
      /* the top roof closes onto the 剎座 tile collar, not onto a token ring */
      trunc:isTop?(LY.fin.y1-LY.fin.y0)*0.250:s.pz.R*0.965,
      /* the top roof is the one steep-ish surface — 攢尖 needs the rise */
      pow:isTop?1.26:LIAO.pow, lift:isTop?0.26:LIAO.lift}));
    gTile.push(r.surf,r.ribs);gSoffit.push(r.soffit,r.fascia);gCap.push(r.cap,r.ridge);
    /* 平坐 — the mezzanine, its bracing, and the railing that shows it */
    if(s.pz){
      const P=s.pz;
      buildBracing(tim,timD,P.y0,P.y1,P.R,s.Ri*0.94);
      /* the 平坐 bracket band carries the balcony deck, so it belongs to the
         outside of the mezzanine and not to the frame. It also happens to stand
         exactly in front of the bracing, 0.26 units of a 0.31-unit mezzanine, so
         leaving it in the frame pile made the 暗層 impossible to look at. */
      dougong(pzA,pzB,P.y1-0.26,0.26,P.R,P.R*1.10,3);
      gRail.push(buildRail(P.y1,RAIL_H,P.R*1.08,7));
    }
  });

  buildPlaques(grp);
  /* the 剎座 tile collar joins the roof, so it goes into the tile pile */
  const shaTile=new Bld();
  buildFinial(fe,bz,shaTile);
  gTile.push(shaTile.geo());
  /* 八條鐵鏈 — chains from under the 仰月 out to the eight hip ends */
  {
    const F=LY.fin,top=LY.st[4];
    for(let k=0;k<NS;k++){
      const q=cornPt(k,top.RE*1.02);
      /* the chains land just under the 圓光, not above it */
      const a=[0,F.y0+(F.y1-F.y0)*0.60,0],b=[q[0],top.yE-0.10,q[1]];
      const pts=[];
      for(let j=0;j<=8;j++){
        const t=j/8;
        pts.push([a[0]+(b[0]-a[0])*t,
                  a[1]+(b[1]-a[1])*t-Math.sin(Math.PI*t)*0.42,
                  a[2]+(b[2]-a[2])*t]);
      }
      /* 0.020 scene units is 9 cm of radius at M — an 18 cm hawser. The real
         chains are bar iron a few centimetres thick and read as drawn lines
         against the sky, so this is the thinnest radius that still survives
         antialiasing at full frame. */
      bz.tube(pts,0.0065,4,1);
    }
  }

  const add=(g,m,n)=>{if(g&&g.attributes.position.count){const me=new T.Mesh(g,m);
    me.castShadow=true;me.receiveShadow=true;me.name=n;grp.add(me);}};
  add(hollow.geo(),MAT.hollow,'hollow');
  add(dk.geo(),MAT.dark,'dark');
  add(stone.geo(),MAT.stone,'stone');
  add(stoneP.geo(),MAT.stonePale,'stoneP');
  add(wall.geo(),MAT.plaster,'walls');
  /* same material as the frame, its own mesh, so it can be taken off */
  add(inf.geo(),MAT.timberD,'infill');
  add(pzA.geo(),MAT.timber ,'pzdg');
  add(pzB.geo(),MAT.timberD,'pzdgD');
  add(tim.geo(),MAT.timber,'timber');
  add(timD.geo(),MAT.timberD,'timberD');
  add(mergeGeos(gRail),MAT.timberD,'rails');
  add(mergeGeos(gTile),MAT.tile,'tiles');
  add(mergeGeos(gSoffit),MAT.soffit,'soffits');
  add(mergeGeos(gCap),MAT.ridgeTile,'ridgecaps');
  add(mergeGeos(gRidge),MAT.ridge,'ridge');
  /* 剎座 is plastered brick, and in the photographs it is grey — close to the
     ridge tiles, not the cream of the wall plaster. On the big-block stone map it
     read as a castle chimney; on warm plaster it became the brightest thing on
     the tower. The ridge-tile grey is the value that actually matches. */
  add(fe.geo(),MAT.ridgeTile,'shazuo');
  /* the statues are their own mesh and belong to none of the skins: hidden
     behind the walls when the tower is closed, visible the moment it opens */
  add(icon.geo(),MAT.gilt,'icons');
  add(bz.geo(),MAT.bronze,'finial');
  return grp;
}

/* ------------------------------------------------------------------ *
 * 5b.  傾斜 — the tower as it actually stands
 *
 * 應縣木塔 leans, and it did not do it all at once. It was pushed, by a list of
 * things that can be named and dated, and the shape of the lean changed each
 * time the list grew. In 1902 伊東忠太 recorded the mud-infill walls still in
 * place, the second storey not obviously out of true, and the THIRD storey's
 * north-west column leaning badly inward; 梁思成 read it the same way in 1933.
 * The famous fault is on the second storey, and in 1902 it was not there yet.
 *
 * What put it there: artillery in 1926, then the repair that followed. The four
 * upper 明層 carried mud-infill walls with diagonal 斜戧 inside them between the
 * outer columns — a second line of defence against sideways load, there to stop
 * any one storey racking on its own. In the mid 1930s the local gentry took all
 * of it out and fitted lattice doors, on the reasoning that a see-through
 * pagoda is more auspicious. 梁思成 called it the worst thing to happen to the
 * tower in eight hundred years and asked for the walls back. Fifteen years
 * later 莫宗江 came back and found the tower visibly leaning north-east.
 *
 * The lean is applied to the finished geometry rather than built a second time,
 * so one set of builders serves both states. It is a height-dependent shear:
 * the drift accumulates ONLY across the 明層 column bands and stays flat through
 * the 鋪作 and 暗層 above each of them, because that is where the racking
 * actually happens. That distinction is the whole point. Spread over the whole
 * storey the lean reads as a gentle bend; put in the column band where it
 * belongs, 576 mm over a 2.9 m column is 11°, and the tower gets the visible
 * elbow the photographs show.
 *
 * The shear runs in the vertex shader. Rewriting a million vertices on the CPU
 * for every frame of an animated step is not affordable; twenty-four floats of
 * uniform is. The shadow pass keeps the upright geometry, which puts the ground
 * shadow of the apex under a metre out of place on a 65 m tower.
 * ------------------------------------------------------------------ */
/* the 明層 column bands, in metres, read straight off LYm. Drift accumulates
   between the pairs and holds constant in the gaps. */
const LN_Ym=[LYm.base.y2,LYm.st[0].y1,
             LYm.st[1].y0,LYm.st[1].y1,
             LYm.st[2].y0,LYm.st[2].y1,
             LYm.st[3].y0,LYm.st[3].y1,
             LYm.st[4].y0,LYm.st[4].y1];
/* 整體向東北 — cumulative direction of the lean, 45° east of north, per the
   2004 provincial report. North is -Z and east is +X. The 10.8° figure that
   also gets quoted is the direction of ONE year's increment at the apex
   (2010-09 to 2011-10), not of the accumulated offset. */
const LN_BEAR=45*Math.PI/180;
/* how the settlement and the twist are distributed up the tower. Neither has a
   published per-storey breakdown, so both are one measured total spread on a
   fixed shape; only the drift series is storey-by-storey evidence. */
const LN_CPSHAPE=[0.156,0.343,0.204,0.148,0.149];
const LN_TWSHAPE=[0.07,0.48,0.21,0.14,0.10];
const LN_EXAG=[1,2,3];
/* Where the mode puts the camera. The lean lives on the second storey and the
   second storey is 4 % of the tower's height, so the whole-tower framing that
   the front page uses turns 576 mm into five pixels of eave. 傾斜 pulls in to
   the bottom four storeys, which is where every event on the timeline landed. */
/* 1.42 / 4.95 framed the second storey inside a 1512×856 window with room to
   spare. In portrait the tower already fills the frame at zoom 1, so walking in
   that far cropped the finial off the top and the platform off the bottom — and
   the platform is where the 88 cm of accumulated compression shows. Enough of a
   push to favour the lower storeys, not enough to lose the building. */
let LN_ZOOM=1.10,LN_CAMY=5.85;
/* and it does not start there. 1056 is the whole tower standing straight; by
   1926 the camera has come down onto the storey the damage is on. Nothing about
   the second storey is legible at whole-tower framing, and nothing about the
   tower is legible if you never see all of it. */
let lnUser=false;

const LNU={
  uLnY:{value:new Float32Array(10)},
  uLnD:{value:new Float32Array(10)},
  uLnS:{value:new Float32Array(10)},
  uLnT:{value:new Float32Array(10)},
  uLnB:{value:new T.Vector2(Math.sin(LN_BEAR),-Math.cos(LN_BEAR))}
};
for(let i=0;i<10;i++)LNU.uLnY.value[i]=LN_Ym[i]*M;

const LN_HEAD=[
'uniform float uLnY[10];','uniform float uLnD[10];','uniform float uLnS[10];',
'uniform float uLnT[10];','uniform vec2 uLnB;',
'vec3 lnProf(float y){',
'  if(y<=uLnY[0])return vec3(0.0);',
'  for(int i=0;i<9;i++){',
'    if(y<=uLnY[i+1]){',
'      float f=(y-uLnY[i])/max(1e-4,uLnY[i+1]-uLnY[i]);',
'      return vec3(mix(uLnD[i],uLnD[i+1],f),mix(uLnS[i],uLnS[i+1],f),mix(uLnT[i],uLnT[i+1],f));',
'    }',
'  }',
/* above the top 明層 the 塔剎 rides the frame rigidly. Continuing the top
   band's slope through 19 m of iron mast would double the apex figure, and the
   published apex offset already has the mast in it. */
'  return vec3(uLnD[9],uLnS[9],uLnT[9]);',
'}',''].join('\n');

/* one patch per material, idempotent, and it has to be re-applied to the ghost
   clones 剖切 makes: Material.copy does not carry onBeforeCompile across. */
function leanPatch(m){
  if(!m||m.userData.lnPatched)return m;
  m.userData.lnPatched=true;
  m.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,LNU);
    let v=LN_HEAD+sh.vertexShader;
    v=v.replace('#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\n{ float la=lnProf(position.y).z; float lc=cos(la),ls=sin(la);\n'+
      '  objectNormal=vec3(objectNormal.x*lc+objectNormal.z*ls,objectNormal.y,'+
      '-objectNormal.x*ls+objectNormal.z*lc); }');
    v=v.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n{ vec3 lp=lnProf(transformed.y); float lc=cos(lp.z),ls=sin(lp.z);\n'+
      '  transformed=vec3(transformed.x*lc+transformed.z*ls+uLnB.x*lp.x,transformed.y-lp.y,'+
      '-transformed.x*ls+transformed.z*lc+uLnB.y*lp.x); }');
    sh.vertexShader=v;
  };
  m.customProgramCacheKey=()=>'lean1';
  m.needsUpdate=true;
  return m;
}

/* five per-storey increments become ten cumulative breakpoints: the value
   climbs across each column band and holds through the 鋪作 and 暗層 over it */
function lnCum(inc,out){
  let a=0;
  for(let k=0;k<5;k++){
    out[k*2]=a; a+=inc[k]; out[k*2+1]=a;
  }
  return out;
}
/* drift and settlement arrive in millimetres, twist in degrees */
function lnWrite(driftMM,cpMM,twDeg,exag){
  const D=LNU.uLnD.value,S=LNU.uLnS.value,Tw=LNU.uLnT.value;
  const k=M*0.001*exag;
  const dI=[],cI=[],tI=[];
  for(let i=0;i<5;i++){
    dI[i]=driftMM[i]*k;
    cI[i]=cpMM*LN_CPSHAPE[i]*k;
    tI[i]=twDeg*LN_TWSHAPE[i]*Math.PI/180*exag;
  }
  lnCum(dI,D);lnCum(cI,S);lnCum(tI,Tw);
  /* 其五 的抬升那一格直接改写沉降通道 —— 沉降的负值就是顶升。这个通道本来
     画的是「累计压缩 88 厘米」，反过来用不需要新的 uniform。 */
  if(typeof fixSink==='function')fixSink();
}
/* ------------------------------------------------------------------ *
 * 5d.  style registry
 * ------------------------------------------------------------------ */
const STYLES=[
 /* aud 只剩琴曲。build / bell / bg / bv 四个字段是给 ping 用的，ping 拆了 */
 {id:'LIAO',aud:{music:'music_xiao'},
  build:buildYingxian,
  t1:'营造',sub:'SAKYAMUNI PAGODA GROWTH STUDY',t2:'释迦',t3:'木塔',
  gloss:'（应县&nbsp;·&nbsp;辽&nbsp;1056）',
  /* the cut cap needs the solid half-diagonal at each height, and an eight
     sided disc to draw it with */
  caps:[[LY.base.y0,LY.base.y1,LY.base.Rsq*1.414,4],
        [LY.base.y1,LY.base.y2,LY.base.R,8],
        [LY.st[0].y0,LY.st[0].y1,LY.fujie.R,8],
        [LY.st[0].pz.y0,LY.st[0].pz.y1,LY.st[0].pz.R,8],
        [LY.st[1].y0,LY.st[1].y1,LY.st[1].R,8],
        [LY.st[1].pz.y0,LY.st[1].pz.y1,LY.st[1].pz.R,8],
        [LY.st[2].y0,LY.st[2].y1,LY.st[2].R,8],
        [LY.st[2].pz.y0,LY.st[2].pz.y1,LY.st[2].pz.R,8],
        [LY.st[3].y0,LY.st[3].y1,LY.st[3].R,8],
        [LY.st[3].pz.y0,LY.st[3].pz.y1,LY.st[3].pz.R,8],
        [LY.st[4].y0,LY.st[4].y1,LY.st[4].R,8],
        [LY.fin.y0,LY.fin.y1,0.46,8]],
  scaf:[{top:3.20,base:0.10,w:7.40,d:4.10,bays:8},{top:5.60,base:2.90,w:6.60,d:3.70,bays:7},
        {top:7.90,base:5.30,w:5.80,d:3.25,bays:6},{top:10.20,base:7.60,w:5.00,d:2.80,bays:6},
        {top:13.40,base:9.90,w:4.20,d:2.40,bays:5}],
  stages:[['准备','READY',0.00],['夯土砌基','PLATFORM',2.10],['副阶周匝','VERANDA',4.20],
          ['平坐暗层','MEZZANINE',7.60],['层层斗栱','BRACKETS',10.60],['覆瓦装刹','ROOF & FINIAL',14.30],
          ['完成','COMPLETE',14.30]]}
];

/* ------------------------------------------------------------------ *
 * 6.  scaffolding
 * ------------------------------------------------------------------ */
/* BoxGeometry gives every face a 0..1 UV, so a 3-unit pole and a 0.15-unit
   one show the same stretched patch. Rescale by world size, and run the
   longer dimension along v so the grain follows the length of the timber. */
function worldUV(geo,sx,sy,sz,dens,ou,ov){
  const uv=geo.attributes.uv;
  const dims=[[sz,sy],[sz,sy],[sx,sz],[sx,sz],[sx,sy],[sx,sy]];
  for(let f=0;f<6;f++){
    const du=dims[f][0],dv=dims[f][1],swap=dv>du;
    for(let i=0;i<4;i++){
      const k=f*4+i;
      let u=uv.getX(k),v=uv.getY(k);
      if(swap){const t=u;u=v;v=t;}
      uv.setXY(k,u*(swap?dv:du)*dens+ou,v*(swap?du:dv)*dens+ov);
    }
  }
  uv.needsUpdate=true;
}
function buildScaffoldGroup(yTop,yBase,width,depth,bays){
  const grp=new T.Group(),th=0.145,H=yTop-yBase;
  const nRail=Math.max(2,Math.min(5,Math.round(H/0.78)));
  const mk=(x,y,z,sx,sy,sz,rz,rotY,kind)=>{
    const geo=new T.BoxGeometry(sx,sy,sz);
    worldUV(geo,sx,sy,sz,1.15,Math.random()*4,Math.random()*4);
    const m=new T.Mesh(geo,MAT.scaffold);
    const co=Math.cos(rotY),si=Math.sin(rotY);
    m.position.set(x*co+z*si,y,-x*si+z*co);
    m.rotation.set(0,rotY,rz||0);
    m.castShadow=true;m.userData.kind=kind;
    grp.add(m);return m;
  };
  function frame(halfW,zOff,rotY,nb,brace){
    for(let i=0;i<=nb;i++)mk((-1+2*i/nb)*halfW,yBase+H/2,zOff,th,H,th,0,rotY,'v');
    for(let r=1;r<=nRail;r++)mk(0,yBase+H*(r/nRail)-H*0.09,zOff,halfW*2.1,th*0.9,th*0.9,0,rotY,'h');
    if(brace){
      const bw=halfW*2/nb,cl=Math.hypot(bw*1.05,H*0.62),ang=Math.atan2(bw*1.05,H*0.62);
      mk(0,yBase+H*0.44,zOff,th*0.78,cl,th*0.78, ang,rotY,'v');
      mk(0,yBase+H*0.44,zOff,th*0.78,cl,th*0.78,-ang,rotY,'v');
      for(const sx of [-1,1])
        mk(sx*(halfW+0.22),yBase+H*0.44,zOff,th*0.78,H*0.96,th*0.78,-sx*0.24,rotY,'v');
    }
  }
  const sideBays=Math.max(3,Math.round(bays*depth/(width*0.5)));
  frame(width*0.5, depth,0,bays,true);
  frame(width*0.5,-depth,0,bays,true);
  frame(depth, width*0.5,Math.PI/2,sideBays,false);
  frame(depth,-width*0.5,Math.PI/2,sideBays,false);
  return grp;
}

/* ------------------------------------------------------------------ *
 * 7.  scene
 * ------------------------------------------------------------------ */
const cvs=document.getElementById('stage');
const renderer=new T.WebGLRenderer({canvas:cvs,antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.setClearColor(0x000000,0);
renderer.localClippingEnabled=true;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T.PCFSoftShadowMap;
if('outputColorSpace' in renderer&&T.SRGBColorSpace!==undefined)renderer.outputColorSpace=T.SRGBColorSpace;
else if(renderer.outputEncoding!==undefined&&T.sRGBEncoding!==undefined)renderer.outputEncoding=T.sRGBEncoding;

const scene=new T.Scene();
const camera=new T.PerspectiveCamera(11,1,15,2200);

buildMaterials();
captureMatBase();
let modelGroup=null,styleIdx=0;
let leanOn=false;    /* is the 傾斜 timeline running the tower */
/* 其五 借 傾斜 的塔当底，所以 leanOn 为真时还要分清是哪一章。声明提到这里，
   是因为 applyLeanMode 在初始化阶段就会读它，比 FIX 那一节早得多。 */
var fixOn=false;
let eraIdx=0;        /* index into ERA */
let exagIdx=0;       /* index into LN_EXAG — 0 is life size */
/* the animated step between two eras. from/to are per-storey increments, so
   the tween is over five numbers rather than over a vertex buffer. */
let lnFrom=null,lnTo=null,lnMix=1,lnDur=1,lnJolt=false;
/* set while a finger is dragging the timeline: lnPush then reads lnMix
   linearly instead of easing it, because the hand is doing the easing */
let lnRaw=false;

/* ------------------------------------------------------------------ *
 * 7a.  world — sky dome, star field, distant ridges, ground
 * ------------------------------------------------------------------ */
scene.fog=new T.Fog(0x141c30,100,340);

/* 雲 — ink clouds on paper, for the 素絹 skin. Bands of soft-edged wash
   stacked with the darkest at the top, the way a hanging scroll carries its
   sky. Painted into a wide canvas because a 8px-wide gradient strip cannot
   hold a cloud; the dome samples it all the way round. */
function paintInkSky(paper,ink){
  const W=1024,H=512,c=cv(W,H),g=c.getContext('2d'),n=makeNoise(4021);
  g.fillStyle=paper;g.fillRect(0,0,W,H);
  /* a faint warm gradient down to the horizon, as the silk itself would have */
  const gr=g.createLinearGradient(0,0,0,H);
  gr.addColorStop(0,'rgba(150,140,118,.20)');
  gr.addColorStop(0.55,'rgba(150,140,118,.04)');
  gr.addColorStop(1,'rgba(190,178,152,.16)');
  g.fillStyle=gr;g.fillRect(0,0,W,H);
  /* cloud bands. Each is a run of overlapping soft ellipses along a baseline,
     which is close to how a wash behaves and costs nothing. */
  const bands=[{y:0.10,h:0.055,a:0.26,n:44},{y:0.19,h:0.045,a:0.20,n:52},
               {y:0.28,h:0.038,a:0.15,n:58},{y:0.37,h:0.030,a:0.10,n:46}];
  g.fillStyle=ink;
  bands.forEach(b=>{
    for(let i=0;i<b.n;i++){
      const t=i/b.n;
      const x=t*W*1.06-W*0.03;
      /* the baseline wanders, and the band thins towards its ends */
      const yy=H*(b.y+fbm(n,t*7.2,b.y*30,3,.6)*0.055);
      const env=Math.sin(Math.PI*Math.min(1,Math.max(0,t)))**0.7;
      const rw=W*(0.030+fbm(n,t*11,b.y*9,2,.5)*0.055);
      const rh=H*b.h*(0.45+fbm(n,t*5,b.y*17,2,.5)*0.9);
      g.globalAlpha=b.a*env*(0.45+fbm(n,t*13,b.y*23,2,.5)*0.8);
      g.beginPath();
      g.ellipse(x,yy,rw,rh,0,0,Math.PI*2);
      g.fill();
    }
  });
  g.globalAlpha=1;
  return c;
}
const inkSkyCan=paintInkSky('#efe8d6','#6d6a5c');
const inkSkyTex=srgb(new T.CanvasTexture(inkSkyCan));
inkSkyTex.wrapS=T.RepeatWrapping;inkSkyTex.repeat.set(3,1);

const skyCan=cv(8,512);
const SKY_STOPS=[0,0.28,0.46,0.60,0.74,1.0];
function paintSky(cols){
  const g=skyCan.getContext('2d');
  const grd=g.createLinearGradient(0,0,0,512);
  cols.forEach((c,i)=>grd.addColorStop(SKY_STOPS[i],
    '#'+('000000'+c.getHexString()).slice(-6)));
  g.fillStyle=grd;g.fillRect(0,0,8,512);
  if(skyMat.map)skyMat.map.needsUpdate=true;
}
const skyMat=new T.MeshBasicMaterial({side:T.BackSide,fog:false,depthWrite:false});
const gradSkyTex=srgb(new T.CanvasTexture(skyCan));
skyMat.map=gradSkyTex;
/* 素絹 paints its own sky; every other skin uses the time-of-day gradient */
function setSkyMode(ink){
  skyMat.map=ink?inkSkyTex:gradSkyTex;
  skyMat.color.setHex(0xffffff);
  skyMat.needsUpdate=true;
}
const sky=new T.Mesh(new T.SphereGeometry(900,32,24),skyMat);
sky.renderOrder=-20;scene.add(sky);

/* star field — three size classes so brightness varies, additive on the dome */
function starSprite(){
  const S=64,c=cv(S,S),g=c.getContext('2d');
  const gr=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
  gr.addColorStop(0,'rgba(255,255,255,1)');
  gr.addColorStop(0.25,'rgba(255,255,255,.85)');
  gr.addColorStop(0.55,'rgba(255,255,255,.18)');
  gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(0,0,S,S);
  return c;
}
const starTex=new T.CanvasTexture(starSprite());
const starLayers=[];
(function buildStars(){
  let seed=20260809;
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const DPR=Math.min(window.devicePixelRatio||1,2);
  const CLASSES=[[30000,1.8*DPR],[7500,2.9*DPR],[1700,5.0*DPR]];
  CLASSES.forEach(([N,px],ci)=>{
    const pos=new Float32Array(N*3),col=new Float32Array(N*3);
    for(let i=0;i<N;i++){
      let u,th=rnd()*Math.PI*2;
      /* confine to the elevation band the camera can actually reach */
      if(i%4===0){                       /* loose galactic band */
        u=Math.sin(th*0.5+0.9)*0.34+0.26+(rnd()-0.5)*0.20;
      }else{
        u=-0.09+rnd()*0.91;
      }
      u=Math.max(-0.09,Math.min(0.86,u));
      const R=760,s=Math.sqrt(Math.max(0,1-u*u));
      pos[i*3]=Math.cos(th)*s*R;pos[i*3+1]=u*R;pos[i*3+2]=Math.sin(th)*s*R;
      const w=rnd();
      const c=w>0.88?[1,0.87,0.70]:w<0.13?[0.74,0.84,1]:[0.97,0.97,0.93];
      const b=0.46+Math.pow(rnd(),1.7)*0.54;
      col[i*3]=c[0]*b;col[i*3+1]=c[1]*b;col[i*3+2]=c[2]*b;
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    g.setAttribute('color',new T.Float32BufferAttribute(col,3));
    const m=new T.PointsMaterial({size:px,map:starTex,vertexColors:true,transparent:true,
      opacity:0,depthWrite:false,fog:false,sizeAttenuation:false,blending:T.AdditiveBlending});
    const pts=new T.Points(g,m);pts.renderOrder=-15;pts.frustumCulled=false;
    scene.add(pts);starLayers.push(m);
  });
})();

/* ------------------------------------------------------------------ *
 *  landscape — adapted from the Terrane hero: a simplex heightfield
 *  coloured by slope and moisture, instanced field stones, and GPU grass.
 * ------------------------------------------------------------------ */
const NZ=(()=>{
  const g3=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  const perm=new Uint8Array(512),pp=new Uint8Array(256);
  let sd=1337;
  for(let i=0;i<256;i++)pp[i]=i;
  for(let i=255;i>0;i--){sd=(sd*1664525+1013904223)&0xffffffff;
    const j=(sd>>>16)%(i+1),t=pp[i];pp[i]=pp[j];pp[j]=t;}
  for(let i=0;i<512;i++)perm[i]=pp[i&255];
  const F2=.5*(Math.sqrt(3)-1),G2=(3-Math.sqrt(3))/6;
  function sn(xin,yin){
    const sk=(xin+yin)*F2,i=Math.floor(xin+sk),j=Math.floor(yin+sk);
    const t=(i+j)*G2,x0=xin-(i-t),y0=yin-(j-t);
    let i1,j1;if(x0>y0){i1=1;j1=0;}else{i1=0;j1=1;}
    const x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1+2*G2,y2=y0-1+2*G2;
    const ii=i&255,jj=j&255;
    let n0=0,n1=0,n2=0,t0=.5-x0*x0-y0*y0;
    if(t0>0){const g=g3[perm[ii+perm[jj]]&7];t0*=t0;n0=t0*t0*(g[0]*x0+g[1]*y0);}
    let t1=.5-x1*x1-y1*y1;
    if(t1>0){const g=g3[perm[ii+i1+perm[jj+j1]]&7];t1*=t1;n1=t1*t1*(g[0]*x1+g[1]*y1);}
    let t2=.5-x2*x2-y2*y2;
    if(t2>0){const g=g3[perm[ii+1+perm[jj+1]]&7];t2*=t2;n2=t2*t2*(g[0]*x2+g[1]*y2);}
    return 70*(n0+n1+n2);
  }
  function fbm(x,y,o){let s=0,a=.5,f=1;for(let i=0;i<o;i++){s+=sn(x*f,y*f)*a;a*=.5;f*=2.02;}return s;}
  function ridged(x,y,o){
    let s=0,a=.5,f=1,pv=1;
    for(let i=0;i<o;i++){let n=1-Math.abs(sn(x*f,y*f));n*=n;n*=pv;pv=n;s+=n*a;a*=.5;f*=2.03;}
    return s;
  }
  return {sn,fbm,ridged};
})();
const sm01=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};

/* height is analytic so the scatter can sample it exactly, with no lookup grid.
   Flat out to the bailey wall, then a swell, then hills that grow with distance */
const FLAT_R=104, HILL_R=224;
function landH(x,z){
  const r=Math.hypot(x,z),s=0.0042;
  const mid=NZ.fbm(x*s*3.2+4,z*s*3.2+9,4);
  const fine=NZ.fbm(x*s*11+21,z*s*11+3,3);
  const soft=sm01((r-20)/78)*2.4*(mid*0.62+fine*0.38);
  const k=sm01((r-FLAT_R)/(HILL_R-FLAT_R));
  const grow=0.30+Math.min(1,r/620)*2.35;
  const big=NZ.ridged(x*s+11,z*s+7,5);
  const hill=(big*20+mid*4.6+fine*1.2-5.6)*k*grow;
  return soft+hill;
}
function landN(x,z,e){
  e=e||1.2;
  const hx=landH(x+e,z)-landH(x-e,z), hz=landH(x,z+e)-landH(x,z-e);
  return [-hx/(2*e),1,-hz/(2*e)];
}
const landSlope=(x,z)=>{const n=landN(x,z);const l=Math.hypot(n[0],n[1],n[2]);return Math.acos(n[1]/l);};

/* ------------------------------------------------------------------ *
 * 7b2.  麻燕 — the swifts
 *
 * Thousands of them nest in the bracket joints each summer and hunt the
 * insects that would otherwise be in the timber. They are part of how the
 * tower looks, so they are part of the model.
 * ------------------------------------------------------------------ */
const SWIFT_N=260;
const swiftGeo=(()=>{
  /* a swift from below is a dart with two scythes. Three triangles. */
  const g=new T.BufferGeometry();
  /* A swift is 40 cm across, which at 0.208 units/m is 0.083 — and at the
     distance this camera sits that is a third of a pixel, i.e. nothing. Birds
     have to be drawn well over life size to read at all, the same bargain the
     lean makes. About 3x here: present, but not gliders. */
  const v=new Float32Array([
    /* body */      0.000,0,-0.165,  0.000,0, 0.126,  0.017,0,0.030,
    /* left wing */ 0.006,0, 0.006, -0.186,0, 0.150, -0.030,0,-0.060,
    /* right wing */0.006,0, 0.006,  0.030,0,-0.060,  0.186,0, 0.150
  ]);
  g.setAttribute('position',new T.Float32BufferAttribute(v,3));
  g.computeVertexNormals();
  return g;
})();
/* a swift against the sky is a near-black flick. fog:false matters — with
   fog on, the far birds turn the colour of the haze and stop reading as birds. */
const swiftMat=new T.MeshBasicMaterial({color:0x241f1b,side:T.DoubleSide,
  transparent:true,opacity:0.88,fog:false});
const swiftMesh=new T.InstancedMesh(swiftGeo,swiftMat,SWIFT_N);
swiftMesh.frustumCulled=false;
swiftMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
swiftMesh.renderOrder=6;
scene.add(swiftMesh);

/* per-bird orbit parameters, fixed at startup */
const SW_P=[];
for(let i=0;i<SWIFT_N;i++){
  const band=Math.random();
  SW_P.push({
    /* they nest in the bracket joints, so the flock hugs the eaves and only a
       few range out over the field */
    r:1.9+band*band*4.2,
    /* biased to the storey heights rather than spread evenly up the sky */
    y:2.2+Math.pow(Math.random(),0.72)*9.4,
    /* the slower birds are the far ones, which reads as perspective */
    w:(0.30+Math.random()*0.55)*(Math.random()<0.5?-1:1),
    ph:Math.random()*Math.PI*2,
    /* vertical wander, and how fast they bob through it */
    bob:0.25+Math.random()*0.85, bw:0.5+Math.random()*1.6,
    /* radial breathing, so the flock is not a set of rings */
    br:0.35+Math.random()*1.30, bwr:0.2+Math.random()*0.7,
    beat:6+Math.random()*7, sc:0.80+Math.random()*0.70
  });
}
const _sm=new T.Matrix4(),_sq=new T.Quaternion(),_se=new T.Euler(),
      _sp=new T.Vector3(),_ss=new T.Vector3();
let swiftK=0;        /* 0..1 how many are out, driven by time of day */
function updateSwifts(t){
  const live=Math.round(SWIFT_N*swiftK);
  for(let i=0;i<SWIFT_N;i++){
    const P=SW_P[i];
    if(i>=live){                     /* parked out of sight */
      _sm.makeScale(0,0,0);
      swiftMesh.setMatrixAt(i,_sm);
      continue;
    }
    const a=P.ph+t*P.w;
    const r=P.r+Math.sin(t*P.bwr+P.ph)*P.br;
    const y=P.y+Math.sin(t*P.bw+P.ph*1.7)*P.bob;
    _sp.set(Math.cos(a)*r,y,Math.sin(a)*r);
    /* face along the tangent of travel, bank into the turn */
    const bank=(P.w>0?-1:1)*0.55;
    _se.set(bank*0.5,-a+(P.w>0?-Math.PI/2:Math.PI/2),bank);
    _sq.setFromEuler(_se);
    /* wingbeat by squashing across the span — cheap, and reads correctly */
    const f=0.55+0.45*Math.sin(t*P.beat+P.ph*3.1);
    _ss.set(P.sc*(0.45+0.55*f),P.sc,P.sc*0.92);
    _sm.compose(_sp,_sq,_ss);
    swiftMesh.setMatrixAt(i,_sm);
  }
  swiftMesh.instanceMatrix.needsUpdate=true;
}

/* ------------------------------------------------------------------ *
 * 7c.  weather — rain and snow volumes that ride with the camera
 * ------------------------------------------------------------------ */
function streakSprite(){
  const c=cv(64,128),g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,0,128);
  gr.addColorStop(0,'rgba(255,255,255,0)');
  gr.addColorStop(0.28,'rgba(255,255,255,.90)');
  gr.addColorStop(0.74,'rgba(255,255,255,.90)');
  gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(31,0,2.6,128);
  return c;
}
function flakeSprite(){
  const c=cv(64,64),g=c.getContext('2d');
  const gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,1)');
  gr.addColorStop(0.42,'rgba(255,255,255,.72)');
  gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(0,0,64,64);
  return c;
}
const WX_W=17,WX_D=50,WX_TOP=40;
function makeField(n,tex,size,opacity){
  const pos=new Float32Array(n*3),dat=new Float32Array(n*3);
  for(let i=0;i<n;i++){
    pos[i*3]=(Math.random()-0.5)*2*WX_W;
    pos[i*3+1]=Math.random()*WX_TOP;
    pos[i*3+2]=(Math.random()-0.5)*2*WX_D;
    dat[i*3]=Math.random();
    dat[i*3+1]=Math.random()*6.283;
    dat[i*3+2]=0.6+Math.random()*0.8;
  }
  const g=new T.BufferGeometry();
  /* Float32BufferAttribute copies its input, so keep the attribute's own
     array — writing to the source array would never reach the GPU */
  const attr=new T.Float32BufferAttribute(pos,3);
  attr.setUsage(T.DynamicDrawUsage);
  g.setAttribute('position',attr);
  const m=new T.PointsMaterial({map:new T.CanvasTexture(tex),size:size,
    transparent:true,opacity:opacity,depthWrite:false,sizeAttenuation:true,color:0xffffff});
  const pts=new T.Points(g,m);
  pts.frustumCulled=false;pts.visible=false;pts.renderOrder=6;
  scene.add(pts);
  return {pts,geo:g,pos:attr.array,dat,n};
}
/* both pools are sized for their worst case — a full storm and a full
   blizzard — and thinned with a draw range the rest of the time */
const RAIN=makeField(4400,streakSprite(),1.9,0.50);
const SNOW=makeField(5200,flakeSprite(),0.40,0.88);
let wxTime=0,wxRain=0,rainFall=1;
/* blizzard: snow does not fall at one rate forever, it comes in weather.
   One slow cycle of calm, build, blow and ease, offset so a fresh page does
   not open in the middle of a whiteout. */
let blizK=0,blizT=0;
const BLIZ=[12,6,15,8];   /* calm, build, blow, ease — seconds */
const BLIZ_CYC=BLIZ[0]+BLIZ[1]+BLIZ[2]+BLIZ[3];
const smoothstep=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
function blizzardAt(tt){
  let u=tt%BLIZ_CYC; if(u<0)u+=BLIZ_CYC;
  if(u<BLIZ[0])return 0;
  u-=BLIZ[0]; if(u<BLIZ[1])return smoothstep(u/BLIZ[1]);
  u-=BLIZ[1]; if(u<BLIZ[2])return 1;
  return 1-smoothstep((u-BLIZ[2])/BLIZ[3]);
}
/* snow that has already landed, 0..1 — it banks up while snow falls and
   melts back off once the weather turns */
let snowPack=0;
/* the lens is ~10 deg, so the volume has to sit inside the frustum or the
   drops all fall out of shot — anchor it ahead of the camera and face it */
function wxAnchor(o){
  const fx=-Math.sin(curAz),fz=-Math.cos(curAz);
  o.position.set(camera.position.x+fx*46,0,camera.position.z+fz*46);
  o.rotation.y=curAz;
}
let _lastLook=0;
function stepWeather(dt){
  wxTime+=dt;
  const snowing=wxFrom?wxN('snow'):0;
  /* the blizzard clock only runs while there is snow to blow about */
  if(snowing>0.02){blizT+=dt;blizK=blizzardAt(blizT);}
  /* leaving the snow rewinds the clock to the start of the calm, so arriving
     in snow always means still air first and the blizzard blowing up later */
  else{blizK=Math.max(0,blizK-dt*0.6);blizT=0;}
  const packT=snowing>0.5?1:0;
  snowPack+=(packT-snowPack)*(packT>snowPack?dt/24:dt/13);
  /* re-lighting is not free, so only redo it when the slow values have
     actually moved — a few times a second rather than every frame */
  const look=blizK*(snowing>0.02?1:0)+snowPack;
  if(Math.abs(look-_lastLook)>0.006){_lastLook=look;refreshLook();}
  stepBolt(dt);
  if(RAIN.pts.visible){
    wxAnchor(RAIN.pts);
    const p=RAIN.pos,d=RAIN.dat,v=rainFall;
    /* a storm drives the rain over harder, not just faster */
    const slant=2.4*v*v;
    for(let i=0;i<RAIN.n;i++){
      p[i*3+1]-=(34+d[i*3]*26)*v*dt;
      p[i*3]-=slant*dt;
      if(p[i*3+1]<-2){p[i*3+1]=WX_TOP;
        p[i*3]=(Math.random()-0.5)*2*WX_W;p[i*3+2]=(Math.random()-0.5)*2*WX_D;}
    }
    RAIN.pts.geometry.attributes.position.needsUpdate=true;
  }
  if(SNOW.pts.visible){
    wxAnchor(SNOW.pts);
    const p=SNOW.pos,d=SNOW.dat;
    /* in a blizzard the flakes stop drifting and start travelling */
    const fall=1+1.9*blizK,drift=1.1+7.2*blizK,gust=1+2.4*blizK;
    for(let i=0;i<SNOW.n;i++){
      p[i*3+1]-=(1.5+d[i*3]*2.2)*fall*dt;
      p[i*3]+=(Math.sin(wxTime*0.7+d[i*3+1])*drift-6.4*blizK*d[i*3+2])*dt;
      p[i*3+2]+=Math.cos(wxTime*0.5+d[i*3+1])*0.8*gust*dt;
      if(p[i*3+1]<-2||p[i*3]<-WX_W*1.6){p[i*3+1]=WX_TOP;
        p[i*3]=(Math.random()-0.5)*2*WX_W;p[i*3+2]=(Math.random()-0.5)*2*WX_D;}
    }
    SNOW.pts.geometry.attributes.position.needsUpdate=true;
  }
}

/* ---- lightning: a light that is not in the theme, so it can flash over
   whatever the sky happens to be doing without disturbing it ---------- */
const bolt=new T.DirectionalLight(0xe8eeff,0);
bolt.position.set(-46,72,-30);bolt.target.position.set(0,6,0);
scene.add(bolt);scene.add(bolt.target);
const flashEl=document.getElementById('flash');
let boltK=0,boltNext=5.5,boltAge=0,pulses=[];
function strike(){
  /* one strike is several flashes: the leader, then the return strokes */
  const near=Math.random();
  const s=0.42+near*0.58;
  pulses=[{t:0,a:s}];
  const n=1+(Math.random()*2.6|0);
  let tt=0;
  for(let i=0;i<n;i++){
    tt+=0.05+Math.random()*0.14;
    pulses.push({t:tt,a:s*(0.30+Math.random()*0.65)});
  }
  boltAge=0;
  const az=Math.random()*6.283;
  bolt.position.set(Math.sin(az)*74,58+Math.random()*34,Math.cos(az)*74);
  /* and the thunder arrives late, quieter the further off the strike was */
  const delay=0.32+(1-near)*2.7;
  setTimeout(()=>{
    if(!wxFrom||wxN('bolt')<0.4)return;
    sfx(near>0.5?'thunder_near':'thunder_far',
        {gain:0.30+near*0.60,rate:0.90+Math.random()*0.18});
  },delay*1000);
}
function stepBolt(dt){
  const en=wxFrom?wxN('bolt'):0;
  if(en>0.55){
    boltNext-=dt;
    if(boltNext<=0){strike();boltNext=3.4+Math.random()*7.8;}
  }else if(!pulses.length){boltNext=2.2+Math.random()*4;}
  if(pulses.length){
    boltAge+=dt;
    let v=0;
    for(let i=0;i<pulses.length;i++){
      const p=pulses[i];
      if(boltAge>=p.t)v+=p.a*Math.exp(-(boltAge-p.t)/0.085);
    }
    boltK=Math.min(1.4,v);
    if(boltAge>2.4){pulses.length=0;boltK=0;}
  }else if(boltK>0.0005)boltK*=Math.max(0,1-dt*7);
  else boltK=0;
  const k=boltK*en;
  bolt.intensity=k*3.2;
  /* 闪一下是在当前那张天上加亮，不是把天设成白。原来写的是 setScalar(1+k*0.80)
     —— k 为 0 的时候等于每帧把 skyMat.color 抹成白，素絹 那张纸的时辰乘色
     （CUR.skyTint，见 applyState）就永远上不去，夜里的天照旧是白天那张绢。 */
  skyMat.color.copy(CUR.skyTint).multiplyScalar(1+k*0.80);
  if(flashEl)flashEl.style.opacity=k>0.002?(k*0.15).toFixed(3):'0';
}

/* ---- terrain mesh: a polar grid so resolution follows the long lens ---- */
const AN=900, RN=52, R0=2.0, R1=700;
const terrainMesh=(()=>{
  const pos=new Float32Array(AN*RN*3),col=new Float32Array(AN*RN*3),
        nor=new Float32Array(AN*RN*3),idx=[];
  const cGrass=new T.Color(0x5f6d3e),cScrub=new T.Color(0x4e5c36),
        cDry=new T.Color(0x938b5c),cSoil=new T.Color(0x8b7a5b),
        cSand=new T.Color(0xb0a483),cRock=new T.Color(0x6f6a5e),
        cRockD=new T.Color(0x453f38);
  const t1=new T.Color(),t2=new T.Color();
  const rAt=k=>R0*Math.pow(R1/R0,k/(RN-1));
  for(let ri=0;ri<RN;ri++){
    const r=rAt(ri);
    for(let ai=0;ai<AN;ai++){
      const th=ai/AN*Math.PI*2, x=Math.cos(th)*r, z=Math.sin(th)*r;
      const h=landH(x,z), i=(ri*AN+ai);
      pos[i*3]=x;pos[i*3+1]=h;pos[i*3+2]=z;
      const n=landN(x,z,Math.max(1.0,r*0.03));
      const l=Math.hypot(n[0],n[1],n[2]);
      nor[i*3]=n[0]/l;nor[i*3+1]=n[1]/l;nor[i*3+2]=n[2]/l;
      /* slope drives rock, height drives dryness, the flat ground stays sward */
      const sl=Math.acos(n[1]/l);
      const rocky=sm01((sl-0.30)/0.42);
      const dry=sm01((h-6)/26);
      const band=Math.sin(h*0.9)*.5+.5;
      const patch=NZ.fbm(x*0.021+3,z*0.021+8,3)*.5+.5;
      t1.copy(cGrass).lerp(cScrub,patch);
      t1.lerp(cDry,Math.max(0,NZ.fbm(x*0.055,z*0.055,2))*0.34);
      t1.lerp(cDry,dry*0.62);
      t1.lerp(cSand,sm01((h-22)/24)*0.6);
      t1.lerp(cSoil,sm01((0.16-sl)/0.16)*0.16);
      t2.copy(cRock).lerp(cRockD,band);
      t1.lerp(t2,rocky*0.86);
      const shade=0.88+0.12*band;
      col[i*3]=t1.r*shade;col[i*3+1]=t1.g*shade;col[i*3+2]=t1.b*shade;
    }
  }
  for(let ri=0;ri<RN-1;ri++)for(let ai=0;ai<AN;ai++){
    const a0=ri*AN+ai,a1=ri*AN+((ai+1)%AN),b0=a0+AN,b1=a1+AN;
    idx.push(a0,b1,b0, a0,a1,b1);
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));
  g.setAttribute('color',new T.Float32BufferAttribute(col,3));
  g.setIndex(idx);
  const m=new T.MeshStandardMaterial({vertexColors:true,roughness:.97,metalness:0});
  const mesh=new T.Mesh(g,m);
  mesh.receiveShadow=true;
  scene.add(mesh);
  return mesh;
})();
const terrainMat=terrainMesh.material;
/* the sward is baked into the vertex buffer, so a skin cannot tint it — it has
   to rewrite it. Keep the original, and keep a washed copy for 素絹: luminance
   only, compressed into the top of the range and tipped towards the paper, so
   the land reads as a wash with the tower drawn over it. */
const _terrPristine=terrainMesh.geometry.attributes.color.array.slice();
function washTerrain(on,paperHex,strength){
  const a=terrainMesh.geometry.attributes.color;
  const src=_terrPristine;
  if(!on){a.array.set(src);a.needsUpdate=true;return;}
  const p=new T.Color(paperHex),k=strength===undefined?0.82:strength;
  for(let i=0;i<src.length;i+=3){
    const l=src[i]*0.30+src[i+1]*0.59+src[i+2]*0.11;
    /* ink sits in a narrow value band; full black and full white both read
       as printing errors on paper */
    const v=0.30+l*0.62;
    a.array[i]  =v*(1-k)+p.r*k*(0.72+v*0.34);
    a.array[i+1]=v*(1-k)+p.g*k*(0.72+v*0.34);
    a.array[i+2]=v*(1-k)+p.b*k*(0.72+v*0.34);
  }
  a.needsUpdate=true;
}

/* ---- field stones ---- */
const stoneMesh=(()=>{
  const geo=new T.IcosahedronGeometry(0.5,1);
  geo.scale(1,0.62,1);geo.translate(0,0.3,0);
  const mat=new T.MeshStandardMaterial({roughness:.94,metalness:0,color:0xffffff});
  const N=2400,im=new T.InstancedMesh(geo,mat,N);
  im.castShadow=true;im.receiveShadow=true;
  const m4=new T.Matrix4(),qq=new T.Quaternion(),vp=new T.Vector3(),vs=new T.Vector3(),
        ax=new T.Vector3(0,1,0),cc=new T.Color();
  let n=0,guard=0;
  while(n<N&&guard<N*24){
    guard++;
    const th=Math.random()*Math.PI*2;
    const r=6+Math.pow(Math.random(),0.55)*210;
    const x=Math.cos(th)*r,z=Math.sin(th)*r;
    if(landSlope(x,z)>0.52)continue;
    if(Math.random()>0.26+sm01((r-60)/190)*0.5)continue;
    const sc=0.13+Math.pow(Math.random(),1.9)*0.52;
    vp.set(x,landH(x,z)-0.06,z);
    qq.setFromAxisAngle(ax,Math.random()*6.283);
    vs.set(sc*(1+Math.random()*.6),sc*(.6+Math.random()*.6),sc*(1+Math.random()*.6));
    m4.compose(vp,qq,vs);im.setMatrixAt(n,m4);
    cc.setHSL(0.09+Math.random()*0.07,0.07+Math.random()*0.11,0.34+Math.random()*0.20);
    im.setColorAt(n,cc);
    n++;
  }
  im.count=n;im.instanceMatrix.needsUpdate=true;
  if(im.instanceColor)im.instanceColor.needsUpdate=true;
  scene.add(im);
  return im;
})();

/* ---- standing water and splash rings, for the rain preset ---- */
const puddleMesh=(()=>{
  const g=new T.CircleGeometry(1,18);
  g.rotateX(-Math.PI/2);
  const m=new T.MeshStandardMaterial({color:0x2b2f2c,roughness:0.10,metalness:0.34,
    transparent:true,opacity:0});
  const N=90,im=new T.InstancedMesh(g,m,N),m4=new T.Matrix4(),
        vp=new T.Vector3(),qq=new T.Quaternion(),vs=new T.Vector3();
  let n=0,guard=0;
  while(n<N&&guard<N*20){
    guard++;
    const th=Math.random()*Math.PI*2,r=7+Math.pow(Math.random(),0.7)*74;
    const x=Math.cos(th)*r,z=Math.sin(th)*r;
    if(landSlope(x,z)>0.12)continue;
    const sc=0.7+Math.pow(Math.random(),1.6)*2.6;
    vp.set(x,landH(x,z)+0.035,z);
    vs.set(sc*(1+Math.random()*0.5),1,sc*(0.7+Math.random()*0.6));
    qq.setFromAxisAngle(new T.Vector3(0,1,0),Math.random()*6.283);
    m4.compose(vp,qq,vs);im.setMatrixAt(n,m4);n++;
  }
  im.count=n;im.instanceMatrix.needsUpdate=true;im.visible=false;
  im.receiveShadow=true;scene.add(im);
  return im;
})();
const SPLASH=(()=>{
  const S=64,c=cv(S,S),g=c.getContext('2d');
  g.clearRect(0,0,S,S);
  g.strokeStyle='rgba(255,255,255,0.95)';g.lineWidth=5;
  g.beginPath();g.arc(S/2,S/2,S*0.34,0,6.283);g.stroke();
  g.strokeStyle='rgba(255,255,255,0.35)';g.lineWidth=9;
  g.beginPath();g.arc(S/2,S/2,S*0.34,0,6.283);g.stroke();
  const geo=new T.PlaneGeometry(1,1);geo.rotateX(-Math.PI/2);
  const mat=new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,
    depthWrite:false,blending:T.AdditiveBlending,color:0xffffff});
  const N=150,im=new T.InstancedMesh(geo,mat,N);
  im.frustumCulled=false;im.visible=false;scene.add(im);
  const age=new Float32Array(N),life=new Float32Array(N),
        px=new Float32Array(N),pz=new Float32Array(N);
  for(let i=0;i<N;i++){age[i]=Math.random();life[i]=0.42+Math.random()*0.34;}
  return {im,age,life,px,pz,N,m4:new T.Matrix4(),c:new T.Color()};
})();
function stepSplash(dt,amount){
  if(!SPLASH.im.visible)return;
  const S=SPLASH,fx=-Math.sin(curAz),fz=-Math.cos(curAz);
  const ax=camera.position.x+fx*40,az2=camera.position.z+fz*40;
  for(let i=0;i<S.N;i++){
    S.age[i]+=dt;
    if(S.age[i]>=S.life[i]){
      S.age[i]=0;S.life[i]=0.42+Math.random()*0.34;
      const lx=(Math.random()-0.5)*44,lz=(Math.random()-0.5)*90;
      S.px[i]=ax+lx*Math.cos(curAz)+lz*Math.sin(curAz);
      S.pz[i]=az2-lx*Math.sin(curAz)+lz*Math.cos(curAz);
    }
    const t=S.age[i]/S.life[i],sc=0.16+t*1.15;
    S.m4.makeScale(sc,1,sc);
    S.m4.setPosition(S.px[i],landH(S.px[i],S.pz[i])+0.06,S.pz[i]);
    S.im.setMatrixAt(i,S.m4);
    const f=Math.pow(1-t,1.9)*amount*0.42;
    S.c.setRGB(f,f*1.02,f*1.05);
    S.im.setColorAt(i,S.c);
  }
  S.im.instanceMatrix.needsUpdate=true;
  if(S.im.instanceColor)S.im.instanceColor.needsUpdate=true;
}

/* ---- grass: instanced ribbons shaped entirely in the vertex shader ---- */
const grassUni={
  uTime:{value:0},uWind:{value:new T.Vector2(0.84,0.54)},
  uWindAmp:{value:0.30},uThickness:{value:0.042},uRestBend:{value:0.26},
  /* the blade colour is mixed in the shader, so settled snow has to reach it
     there — the material colour is multiplied by it and cannot lighten it */
  uSnow:{value:0}
};
const grassMesh=(()=>{
  const BSEG=5,pos=[],idx=[];
  for(let sI=0;sI<BSEG;sI++){const t=sI/BSEG;pos.push(-0.5,t,0, 0.5,t,0);}
  pos.push(0,1,0);
  for(let sI=0;sI<BSEG-1;sI++){const a=sI*2;idx.push(a,a+1,a+2, a+1,a+3,a+2);}
  idx.push((BSEG-1)*2,(BSEG-1)*2+1,BSEG*2);
  const bg=new T.BufferGeometry();
  bg.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  bg.setIndex(idx);

  const mat=new T.MeshLambertMaterial({color:0xffffff,side:T.DoubleSide});
  mat.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,grassUni);
    sh.vertexShader=`
      uniform float uTime,uWindAmp,uThickness,uRestBend;
      uniform vec2 uWind;
      attribute vec4 aParams;
      varying float vT; varying float vTint;
    `+sh.vertexShader
      .replace('#include <beginnormal_vertex>',`
        float gT=position.y, gH=aParams.x, gPh=aParams.y, gAng=aParams.z;
        float gCa=cos(gAng), gSa=sin(gAng);
        vT=gT; vTint=aParams.w;
        vec3 gRoot=vec3(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2]);
        float gWave=0.5+0.5*sin(gPh*1.73);
        float gRest=uRestBend*(0.58+gWave*0.42)*pow(gT,1.42)*gH;
        float gRa=gAng+sin(gPh*0.71)*0.52;
        float w1=sin(uTime*1.7+gPh+gRoot.x*0.14+gRoot.z*0.11);
        float w2=sin(uTime*0.4+gRoot.x*0.02+gRoot.z*0.017);
        vec2 gForce=uWind*uWindAmp*(0.55+0.45*w2)*(0.55+0.45*w1);
        float gShape=pow(gT,1.55)*(0.42+gH*0.62);
        vec2 gBend=gForce*gShape+vec2(cos(gRa),sin(gRa))*gRest;
        vec3 objectNormal=normalize(
          vec3(-gSa,0.0,gCa)+vec3(gCa,0.0,gSa)*position.x*2.2
          +vec3(0.0,0.62*gT,0.0)+vec3(gBend.x,0.0,gBend.y)*0.42);
      `)
      .replace('#include <begin_vertex>',`
        float gTaper=max(0.02,1.0-gT*0.92);
        vec2 gRib=vec2(position.x*gCa-position.z*gSa,
                       position.x*gSa+position.z*gCa)*uThickness*gTaper;
        vec3 transformed=vec3(gRib.x,gT*gH,gRib.y);
        transformed.xz+=gBend;
        transformed.y-=abs(gRest)*pow(gT,1.7)*(0.24+gWave*0.08);
      `);
    sh.fragmentShader=`
      uniform float uSnow;
      varying float vT; varying float vTint;
    `+sh.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec3 gBase=vec3(0.042,0.062,0.030)*(0.74+vTint*0.54);
      vec3 gTip =vec3(0.225,0.290,0.132)*(0.76+vTint*0.56);
      /* snow lies on the tips first and works down, so the base keeps a
         little of the grass showing through even when it is deep */
      gBase=mix(gBase,vec3(0.60,0.65,0.72),uSnow*0.86);
      gTip =mix(gTip ,vec3(0.90,0.94,1.00),uSnow);
      diffuseColor.rgb*=mix(gBase,gTip,pow(vT,0.82))*1.18;
    `);
  };
  mat.customProgramCacheKey=()=>'tenshu-grass';

  const N=104000,im=new T.InstancedMesh(bg,mat,N);
  im.frustumCulled=false;im.receiveShadow=true;
  const aP=new Float32Array(N*4),m4=new T.Matrix4();
  let n=0,guard=0;
  while(n<N&&guard<N*12){
    guard++;
    const th=Math.random()*Math.PI*2;
    const r=3+Math.pow(Math.random(),0.55)*112;
    const x=Math.cos(th)*r,z=Math.sin(th)*r;
    if(landSlope(x,z)>0.60)continue;
    const edge=1-sm01((r-34)/74);
    if(Math.random()>0.10+edge*0.86)continue;
    m4.makeTranslation(x,landH(x,z)-0.02,z);
    im.setMatrixAt(n,m4);
    aP[n*4]=(0.085+Math.pow(Math.random(),1.5)*0.20)*(0.42+edge*0.58);
    aP[n*4+1]=Math.random()*6.283;
    aP[n*4+2]=Math.random()*6.283;
    aP[n*4+3]=Math.random();
    n++;
  }
  im.count=n;im.instanceMatrix.needsUpdate=true;
  bg.setAttribute('aParams',new T.InstancedBufferAttribute(aP,4));
  scene.add(im);
  return im;
})();

function contactShadowTex(){
  const S=256,c=cv(S),g=c.getContext('2d');
  const grd=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
  grd.addColorStop(0,'rgba(64,52,34,0.40)');
  grd.addColorStop(0.34,'rgba(64,52,34,0.28)');
  grd.addColorStop(0.62,'rgba(64,52,34,0.09)');
  grd.addColorStop(1,'rgba(64,52,34,0)');
  g.fillStyle=grd;g.fillRect(0,0,S,S);
  return c;
}
const shadowTex=new T.CanvasTexture(contactShadowTex());
const ground=new T.Mesh(new T.PlaneGeometry(11.0,7.0),
  new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,opacity:0}));
ground.rotation.x=-Math.PI/2;ground.position.set(0,0.012,0);
scene.add(ground);


const capMesh=new T.Mesh(new T.CircleGeometry(1,4),MAT.core.clone());
capMesh.material.clippingPlanes=null;
capMesh.rotation.x=-Math.PI/2;capMesh.rotation.z=0;
capMesh.receiveShadow=true;scene.add(capMesh);
let capSegs=4;

let scafGroups=[];
/* 其五 的钢材质，给保护棚钢笼、钢支承塔架、塔内格构钢柱用。营造那套脚手架是松木的，
   照旧不动 —— 那是搭塔用的架子，亮黄是对的。这里代表的是现代钢结构。 */
let _steelMat=null;
function steelMat(){
  if(_steelMat)return _steelMat;
  /* 半透 + depthWrite:false 试过一轮：架子确实透了，但被顶光打成浅米色，
     跟素絹的底混在一起，而且几十根杆件互相穿插排序糊成一片。改成深灰钢、
     不透明、照常写深度 —— 靠明度压过塔身的木色来分层，不靠透明度。

     色值要比想象的深得多：这个渲染器的色彩管理是旧口径，setHex 的值当线性
     用，再被四盏灯（key 1.12 + hemi 0.33 + fill + rim）抬亮一遍编码回 sRGB。
     0x55534c 这种中灰出来是浅米色，跟纸底糊在一起；0x17171a 才落在钢灰上。
     调色时别信十六进制，截图看。 */
  _steelMat=new T.MeshStandardMaterial({
    color:0x17171a,roughness:0.66,metalness:0.10});
  return _steelMat;
}
function disposeGroup(g){
  g.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
  scene.remove(g);
}
function buildScaffolds(spec){
  scafGroups.forEach(disposeGroup);
  scafGroups=spec.map(sp=>{
    const g=buildScaffoldGroup(sp.top,sp.base,sp.w,sp.d,sp.bays);
    g.visible=false;scene.add(g);return g;
  });
}

/* lights — driven by the time-of-day preset */
const hemi=new T.HemisphereLight(0xfdf8ec,0xd9cbb0,0.33);scene.add(hemi);
const amb=new T.AmbientLight(0xfff2df,0.07);scene.add(amb);
const key=new T.DirectionalLight(0xfff1dc,1.12);
key.castShadow=true;
key.shadow.mapSize.set(3072,3072);
key.shadow.camera.near=8;key.shadow.camera.far=110;
key.shadow.bias=-0.0009;key.shadow.normalBias=0.024;
key.target.position.set(0,4.2,0);
scene.add(key);scene.add(key.target);
const fill=new T.DirectionalLight(0xe6e2d6,0.17);fill.position.set(26,9,15);scene.add(fill);
const rim=new T.DirectionalLight(0xfff6ea,0.09);rim.position.set(4,12,-26);scene.add(rim);

/* ------------------------------------------------------------------ *
 * 7b.  time of day
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * 裝幀 — background and typographic skins
 *
 * The page was already fully tokenised, so a skin is a data-attribute plus
 * a nudge to the scene palette. THEMES drives the sky and terrain, and if
 * the 3D and the 2D disagree the whole frame falls apart, so each skin
 * carries a multiplier for the scene's own colours.
 * ------------------------------------------------------------------ */
/* v3 keeps one 裝幀 only. 壁畫 and 法式 are gone and the bare 研究 look with
   them: this build is the 素絹 hanging-scroll reading of the tower. */
const SKINS=[
  /* 素絹 — a Song hanging scroll. The land is drawn in ink wash rather than
     painted: sky and ground both pull towards the silk, and the distant
     ridges go pale so they read as brushed, not modelled. */
  {id:'silk',cn:'素绢',label:'SILK',
   ink:true,paperHex:0xefe8d6,
   css:{paper:'#e6ddc7',w0:'#f4eeda',w1:'#ece5cf',w2:'#e0d7bf',
        ink:'#2f2c24',ink2:'#857f6c',ink3:'#403c31',accent:'#9c3226',
        line:'#d8d0b6',rule2:'#bdb49c',divider:'rgba(50,46,32,.22)',
        hairline:'rgba(48,44,30,.28)',grid:'rgba(80,74,50,.03)',
        'pl-a':'#f6f1df','pl-b':'#e9e2ca','pl-br':'#cdc4a8','pl-fg':'#35322a',
        track:'#d5ccb2',fillc:'#9c3226',btn:'#2f2c24','btn-fg':'#f2ecd8'},
   scene:{tint:0xefe8d6,sky:0.90,fog:0.86,ground:0.80,grass:0.86,ridge:0.92,
          sat:0.16,fogNear:0.44}}
];
let skinIdx=0;
/* desaturate towards, and blend towards, the skin's paper colour. k is how
   far to go: 0 leaves the time of day alone, 1 replaces it with the paper. */
const _sk=new T.Color();
function skinShift(col,sc,k){
  if(!sc||!k)return col;
  _sk.setHex(sc.tint);
  const l=col.r*0.3+col.g*0.59+col.b*0.11;
  /* pull saturation first so a mural skin can push it back up past 1 */
  col.r=l+(col.r-l)*sc.sat; col.g=l+(col.g-l)*sc.sat; col.b=l+(col.b-l)*sc.sat;
  return col.lerp(_sk,k);
}
/* the study skin's copy is bilingual and technical; 素絹 wants four lines of
   Chinese about this tower and nothing else. Swapped rather than restyled,
   because the words themselves are the problem. */
const COPY={
  study:{quote:['\u201cFive storeys that read as five,','four more hidden in between,',
                'cross-braced against nine centuries','of wind and earthquake.\u201d'],
         title:['釋迦','木塔']},
  /* no title here: on an ink skin the vertical mark down the right edge is the
     chapter number, and it comes from CHAP rather than being typed in. This is
     the line that used to say 其一 forever. */
  silk:{quote:['塔五層六檐，八角攢尖。','明層之間藏暗層四道，','斜戧交撐，如環似箍。',
               '曆九百七十年，風雨地震，未傾。']},
  mural:{quote:['遼清寧二年立，','木構全塔，無釘無鐵。','斗栱五十四種，','舉折平緩，出檐深遠。'],
         title:['釋迦','木塔']},
  fashi:{quote:['通高六十七米三一，底徑三十米二七。','內槽十米二五，外槽逐層收分。',
                '五明四暗，平坐四道。','舉折三分，斜戧八面。'],
         title:['釋迦','木塔']}
};
function applyCopy(id){
  const c=COPY[id||'study']||COPY.study;
  const q=document.querySelector('.quote');
  if(q)q.innerHTML=c.quote.map(l=>'<div><i>'+l+'</i></div>').join('');
  setChapTitle();
}
/* The mark down the right edge. On paper it is the chapter — 其一 · 塔 set
   vertically, the way a scroll numbers its sheets — and it changes with the
   register. On a non-ink skin the title is the tower's name and stays put. */
function setChapTitle(){
  const t=document.querySelector('.title-cn');
  if(!t)return;
  const sk=SKINS[skinIdx];
  if(sk&&sk.ink){
    const c=CHAP[chapIdx]||CHAP[0];
    t.innerHTML=[c.n[0],c.n[1],'·',c.cn].map(x=>'<b>'+x+'</b>').join('');
  }else{
    const cp=COPY[(sk&&sk.id)||'study']||COPY.study;
    t.innerHTML=(cp.title||COPY.study.title).map(x=>'<b>'+x+'</b>').join('');
  }
}
function applySkin(i){
  skinIdx=((i%SKINS.length)+SKINS.length)%SKINS.length;
  const sk=SKINS[skinIdx];
  const r=document.documentElement;
  if(sk.id)r.setAttribute('data-skin',sk.id);else r.removeAttribute('data-skin');
  applyCopy(sk.id||'study');
  localiseButtons(!!sk.ink);
  setBtn(document.getElementById('skinBtn'),sk.cn);
  /* the two things a stylesheet cannot reach: the sky dome and the terrain's
     baked vertex colours. Without these a skin is only a recolour. */
  setSkyMode(!!sk.ink);
  setBtn(document.getElementById('timeBtn'),THEMES[themeIdx].id);
  setBtn(document.getElementById('wxBtn'),WEATHER[wxIdx].id);
  setBtn(document.getElementById('soundBtn'),soundOn?'ON':'OFF');
  /* every on-screen value gets re-written here, after data-skin is set, because
     applyStyle(0) writes some of them before it exists and setBtn translates
     against that attribute. 傾斜 was the one button missing from this list and
     it spent the whole session reading PLUMB. */
  setBtn(document.getElementById('pinBtn'),pinsOn?'ON':'OFF');
  washTerrain(!!sk.ink,sk.paperHex||0xefe8d6,0.84);
  /* grass is a wash too — it cannot stay a field of green blades on paper */
  if(grassMesh){
    grassMesh.visible=!sk.ink;
  }
  if(stoneMesh)stoneMesh.visible=!sk.ink;
  /* the birds are ink on silk too — 0x241f1b against a wash is a hole, not a
     brush mark. Set here rather than in refreshLook, which runs every frame. */
  if(swiftMat){
    swiftMat.color.setHex(sk.ink?0x453f33:0x241f1b);
    swiftMat.opacity=sk.ink?0.60:0.88;
  }
  /* re-run the theme so the scene rebuilds from THEMES, then let the skin
     have the last word on both the variables and the 3D palette */
  applyTheme(themeIdx,true);
}

const THEMES=[
 {id:'MORNING',
  css:{paper:'#ecdcbc',w0:'#fdf1d6',w1:'#f6e5c6',w2:'#ebd9b6',
       ink:'#2e2515',ink2:'#8b7c5c',ink3:'#3f3520',accent:'#a8621f',
       line:'#d6c39c',rule2:'#c0ac82',divider:'rgba(62,44,18,.30)',hairline:'rgba(58,40,14,.40)',grid:'rgba(96,74,32,.07)',
       'pl-a':'#fdf8e8','pl-b':'#f0e6cc','pl-br':'#ddceac','pl-fg':'#3f3520',
       track:'#dcc9a2',fillc:'#96551b',btn:'#332a17','btn-fg':'#f6eed8'},
  stars:0,
  sky:[0x7ba4d6,0xa9c3de,0xd8c9a8,0xf2d3a2,0xffd79a,0xe0b27c],
  fog:0xf0d6a8,fogN:60,fogF:560,ground:0xf0dcb8,grass:0xfff0d2,
  ridge:[0x9d8f6e,0xbcab86,0xdcc79f],
  sun:{az:-0.80,el:0.235,color:0xffb245,int:1.46},
  hemiC:[0xffe0a2,0xd6bc82,0.24],ambC:[0xffdca0,0.06],
  fillC:[0xf6e4bc,0.14],rimC:[0xffd89a,0.12],
  shadow:0.42,blob:0.62,glow:0.00},
 {id:'NOON',
  css:{paper:'#dfe3e2',w0:'#f6f8f8',w1:'#e9eeef',w2:'#dde3e4',
       ink:'#232a2c',ink2:'#7f8788',ink3:'#333c3e',accent:'#9a5a2c',
       line:'#c8cfd0',rule2:'#b2babb',divider:'rgba(28,40,48,.26)',hairline:'rgba(24,34,42,.36)',grid:'rgba(40,58,66,.055)',
       'pl-a':'#fbfcfc','pl-b':'#eaeeef','pl-br':'#d3d9da','pl-fg':'#333c3e',
       track:'#ccd3d4',fillc:'#8d4f26',btn:'#28302f','btn-fg':'#f0f4f4'},
  stars:0,
  sky:[0x2f76c8,0x5f9cdb,0x95c0e6,0xbcd8ee,0xd8e7f0,0xcdcfc6],
  fog:0xdde7ec,fogN:60,fogF:560,ground:0xe6e2d6,grass:0xffffff,
  ridge:[0x8a9483,0xa6b0a2,0xc6cfc6],
  sun:{az:-0.40,el:0.80,color:0xfff4e4,int:1.06},
  hemiC:[0xdcecff,0xcfc6ae,0.32],ambC:[0xeef4ff,0.06],
  fillC:[0xdce8f4,0.17],rimC:[0xfff6ea,0.09],
  shadow:0.40,blob:0.70,glow:0.00},
 {id:'SUNSET',
  css:{paper:'#e2a468',w0:'#ffd7a0',w1:'#f3b478',w2:'#dd9455',
       ink:'#2c1608',ink2:'#8a5730',ink3:'#3d2010',accent:'#8d2f0c',
       line:'#c98e55',rule2:'#b87c46',divider:'rgba(70,28,8,.34)',hairline:'rgba(66,24,6,.42)',grid:'rgba(84,36,8,.09)',
       'pl-a':'#ffe6c4','pl-b':'#f4cb9c','pl-br':'#d29c62','pl-fg':'#3d2010',
       track:'#cf9459',fillc:'#8d2f0c',btn:'#3a1d0b','btn-fg':'#ffe8cd'},
  stars:0.10,
  sky:[0x3c3a72,0x7e4f74,0xc96450,0xff9a3d,0xffc169,0xc8722f],
  fog:0xef9a52,fogN:60,fogF:560,ground:0xd69c66,grass:0xffdcb2,
  ridge:[0x6c4630,0x9a6540,0xd08a4e],
  sun:{az:0.92,el:0.135,color:0xff8a34,int:1.62},
  hemiC:[0xffb877,0x6a3a22,0.30],ambC:[0xffb27a,0.09],
  fillC:[0xd9a074,0.10],rimC:[0xffa050,0.20],
  shadow:0.36,blob:0.60,glow:0.30},
 {id:'NIGHT',
  css:{paper:'#0e1016',w0:'#1b2029',w1:'#13171f',w2:'#0b0d12',
       ink:'#e9e2d2',ink2:'#847e72',ink3:'#cdc6b6',accent:'#d08a4a',
       line:'#2a2d36',rule2:'#3f434e',divider:'rgba(233,226,210,.24)',hairline:'rgba(233,226,210,.20)',grid:'rgba(226,224,208,.045)',
       'pl-a':'#1c2028','pl-b':'#14171d','pl-br':'#343943','pl-fg':'#e4ddcd',
       track:'#252932',fillc:'#c07437',btn:'#e9e2d2','btn-fg':'#0e1016'},
  stars:1.0,
  sky:[0x05070e,0x080d18,0x0e1728,0x141f36,0x1a2740,0x0b111c],
  fog:0x131c2e,fogN:60,fogF:560,ground:0x353c4c,grass:0x8ea0c4,
  ridge:[0x141924,0x1c2230,0x262d3c],
  sun:{az:0.50,el:0.72,color:0x9fb6de,int:0.50},
  hemiC:[0x2e3a54,0x0d0f14,0.22],ambC:[0x5c6a8c,0.05],
  fillC:[0x7286ac,0.07],rimC:[0x9fb6d8,0.06],
  shadow:0.52,blob:0.42,glow:0.95}
];
const WEATHER=[
 {id:'CLEAR',fogK:1.00,fogC:null,fogM:0,   sunK:1.00,hemiK:1.00,ambK:1.00,
  skyC:null,skyM:0,   groundC:null,groundM:0, starK:1.00,
  rain:0,rainN:0,rainV:1,snow:0,snowN:0,wet:0,dust:0,
  amb:null,ambV:0,bolt:0},
 {id:'RAIN' ,fogK:0.52,fogC:0x6a7480,fogM:0.55,sunK:0.30,hemiK:1.15,ambK:1.55,
  skyC:0x717c88,skyM:0.52,groundC:0x59594e,groundM:0.52,starK:0,
  rain:1,rainN:0.60,rainV:1.00,snow:0,snowN:0,wet:1,dust:0,
  amb:'rain_bed',ambV:0.46,bolt:0},
 /* the storm is the rain pushed past comfort: sun almost gone, fog pulled in
    close, the whole pool of drops in the air and falling harder */
 {id:'STORM',fogK:0.38,fogC:0x515a67,fogM:0.72,sunK:0.14,hemiK:1.00,ambK:1.30,
  skyC:0x4b535f,skyM:0.74,groundC:0x43443e,groundM:0.62,starK:0,
  rain:1,rainN:1.00,rainV:1.42,snow:0,snowN:0,wet:1,dust:0,
  amb:'storm_bed',ambV:0.66,bolt:1},
 {id:'SNOW' ,fogK:0.58,fogC:0xdfe4ea,fogM:0.60,sunK:0.52,hemiK:1.30,ambK:1.45,
  skyC:0xc9d2dc,skyM:0.46,groundC:0xf4f8fc,groundM:0.40,starK:0.30,
  rain:0,rainN:0,rainV:1,snow:1,snowN:0.52,wet:0,dust:1,
  amb:'snow_wind',ambV:0.44,bolt:0}
];
let wxIdx=0,wxMix=1,wxFrom=null,wxTo=null;
const _wc=new T.Color();
const wxN=k=>wxFrom[k]+(wxTo[k]-wxFrom[k])*wxMix;
function wxBlend(target,kf,kc){
  const a=wxFrom[kc]===null?0:wxFrom[kf], b=wxTo[kc]===null?0:wxTo[kf];
  const m=a+(b-a)*wxMix;
  if(m<=0.001)return;
  _wc.setHex(wxTo[kc]!==null?wxTo[kc]:wxFrom[kc]);
  target.lerp(_wc,m);
}
function wxApply(){
  if(!wxFrom)return;
  /* a blizzard is the snow state leaned on hard: it pulls the fog in and
     takes another bite out of the sun on top of whatever the state asked for */
  const bz=blizK*wxN('snow');
  scene.fog.near*=wxN('fogK')*(1-0.34*bz);scene.fog.far*=wxN('fogK')*(1-0.52*bz);
  key.intensity*=wxN('sunK')*(1-0.45*bz);hemi.intensity*=wxN('hemiK');amb.intensity*=wxN('ambK');
  wxBlend(scene.fog.color,'fogM','fogC');
  wxBlend(terrainMat.color,'groundM','groundC');
  wxBlend(grassMesh.material.color,'groundM','groundC');
  wxBlend(stoneMesh.material.color,'groundM','groundC');
  for(let i=0;i<6;i++)wxBlend(CUR.sky[i],'skyM','skyC');
  paintSky(CUR.sky);
  const stk=wxN('starK');
  starLayers.forEach(m=>{m.opacity*=stk;m.visible=m.opacity>0.005;});
  const rn=wxN('rain'),sn=wxN('snow'),wet=wxN('wet'),dust=wxN('dust');
  RAIN.pts.visible=rn>0.01;RAIN.pts.material.opacity=0.50*rn;
  SNOW.pts.visible=sn>0.01;SNOW.pts.material.opacity=0.88*sn;
  /* density is a draw range over one fixed pool, so a storm costs no more
     memory than drizzle — it just stops hiding most of the drops */
  RAIN.geo.setDrawRange(0,Math.round(RAIN.n*Math.min(1,wxN('rainN'))));
  SNOW.geo.setDrawRange(0,Math.round(SNOW.n*Math.min(1,wxN('snowN')+0.62*bz)));
  /* in a blizzard the flakes read as streaks rather than dots, so they grow
     and thicken as the wind gets up */
  SNOW.pts.material.size=0.40*(1+0.60*bz);
  SNOW.pts.material.opacity=Math.min(1,0.88*sn*(1+0.18*bz));
  rainFall=wxN('rainV');
  /* wet ground: darker, and glossy enough to catch the sky */
  terrainMat.roughness=0.97-0.44*wet;
  terrainMat.metalness=0.16*wet;
  puddleMesh.visible=wet>0.02;puddleMesh.material.opacity=0.72*wet;
  SPLASH.im.visible=wet>0.02;
  wxRain=rn;
  /* they do not fly in weather, which is itself a thing people notice */
  swiftK*=(1-Math.min(1,rn*1.4));
  /* snow settles on tile and plaster, not on timber or gilt */
  const pk=snowPack;
  grassUni.uSnow.value=pk*sn;
  for(const k in MATBASE){
    const roof=(k==='tile'||k==='ridge'||k==='ridgeTile'||k==='jade'||k==='jadeDim'
              ||k==='claytile'||k==='lead'||k==='vntile'||k==='sandCarve');
    MAT[k].color.copy(MATBASE[k]);
    if(dust>0.001)MAT[k].color.lerp(SNOWY,dust*(0.40+0.60*pk)*(roof?0.80:0.42));
  }
  /* and it keeps settling: the ground goes on whitening for as long as the
     snow falls, so arriving in snow and staying in it look different */
  if(pk>0.002){
    const g=pk*sn;
    terrainMat.color.lerp(SNOWY,g*0.80);
    /* the blades are what still read green once the ground has gone white,
       so they take the heaviest hand */
    grassMesh.material.color.lerp(SNOWY,g*0.55);
    grassUni.uSnow.value=g;
    stoneMesh.material.color.lerp(SNOWY,g*0.74);
    terrainMat.roughness=Math.min(1,terrainMat.roughness+0.06*g);
  }
}
function applyWeather(i,instant){
  wxIdx=((i%WEATHER.length)+WEATHER.length)%WEATHER.length;
  wxFrom=(wxMix>=1&&wxTo)?wxTo:(wxFrom||WEATHER[0]);
  wxTo=WEATHER[wxIdx];
  wxMix=instant?1:0;
  const wb=document.getElementById('wxBtn');
  setBtn(wb,wxTo.id);
  if(themeFrom)applyState(themeFrom,themeTo,themeMix);
  syncWeatherAudio(instant?0.35:1.5);
}
let themeIdx=0, themeMix=1, themeDur=1.15;
let themeFrom=null, themeTo=null;
const CUR={sun:new T.Color(),hemiS:new T.Color(),hemiG:new T.Color(),amb:new T.Color(),
  fill:new T.Color(),rim:new T.Color(),fog:new T.Color(),ground:new T.Color(),
  grass:new T.Color(),sky:[0,0,0,0,0,0].map(()=>new T.Color()),
  /* 素絹 那张纸当前该乘的色。stepBolt 每帧要拿它当底再叠闪电，所以存在这儿 */
  skyTint:new T.Color(0xffffff)};
function themeState(th){
  return {sunAz:th.sun.az,sunEl:th.sun.el,sunC:new T.Color(th.sun.color),sunI:th.sun.int,
    hemiS:new T.Color(th.hemiC[0]),hemiG:new T.Color(th.hemiC[1]),hemiI:th.hemiC[2],
    ambC:new T.Color(th.ambC[0]),ambI:th.ambC[1],
    fillC:new T.Color(th.fillC[0]),fillI:th.fillC[1],
    rimC:new T.Color(th.rimC[0]),rimI:th.rimC[1],
    fog:new T.Color(th.fog),fogN:th.fogN,fogF:th.fogF,
    ground:new T.Color(th.ground),grass:new T.Color(th.grass||0xffffff),
    sky:th.sky.map(c=>new T.Color(c)),
    /* 素絹 的天是一张画好的纸，乘这个色才有时辰；别的裝幀用不着，留白 */
    skyTint:new T.Color(0xffffff),
    shadow:th.shadow,blob:th.blob,glow:th.glow,stars:th.stars};
}
const lerpN=(a,b,t)=>a+(b-a)*t;
const _WHITE=new T.Color(0xffffff);

/* 这个时辰有多亮 —— 拿它自己那六段天色的平均明度当尺子。0 是夜，1 是正午。 */
function themeLum(th){
  let s=0;
  for(let i=0;i<th.sky.length;i++){
    _sk.setHex(th.sky[i]);
    s+=_sk.r*0.30+_sk.g*0.59+_sk.b*0.11;
  }
  return s/th.sky.length;
}
/* 洗到纸色去的比例。白天不动（1），夜里几乎不洗。0.72 是正午那一档的明度，
   拿它当分母；0.8 次幂让暮色只掉一点，夜色掉到底。 */
function washK(th){
  const r=Math.min(1,themeLum(th)/0.72);
  return Math.max(0.12,Math.pow(r,0.8));
}
/* 素絹 那张纸要乘的色。取这个时辰天色的平均，先去掉大半饱和（绢托不住浓色），
   再把明度压到 washK 那一档 —— 于是夜是墨蓝的纸，暮是暖灰的纸，白天不变。

   这里要过一道 2.2 次幂。渲染器是 sRGBEncoding 输出，乘色是在线性空间里乘的，
   出屏前再开一次 gamma —— 所以直接乘 0.12 屏幕上看到的是 0.40，一片中灰，
   点了「夜」还像阴天的午后。要屏幕上暗到 k，线性里就得乘 k^2.2。 */
function inkSkyTint(th){
  const c=new T.Color(),acc=new T.Color(0,0,0);
  for(let i=0;i<th.sky.length;i++){c.setHex(th.sky[i]);acc.add(c);}
  acc.multiplyScalar(1/th.sky.length);
  const l=acc.r*0.30+acc.g*0.59+acc.b*0.11;
  /* 留三成本色的偏向，其余拉回中性 */
  acc.setRGB(l+(acc.r-l)*0.30,l+(acc.g-l)*0.30,l+(acc.b-l)*0.30);
  const k=Math.pow(washK(th),2.2);
  return l>0.001?acc.multiplyScalar(k/l):acc.setRGB(k,k,k);
}

function applyState(A,B,t){
  const az=lerpN(A.sunAz,B.sunAz,t), el=lerpN(A.sunEl,B.sunEl,t);
  const D=52,ce=Math.cos(el),se=Math.sin(el);
  key.position.set(D*ce*Math.sin(az),4.2+D*se,D*ce*Math.cos(az));
  CUR.sun.copy(A.sunC).lerp(B.sunC,t);key.color.copy(CUR.sun);
  key.intensity=lerpN(A.sunI,B.sunI,t);
  const ext=13+30*Math.cos(el),c=key.shadow.camera;
  c.left=-15;c.right=15;c.top=ext;c.bottom=-ext;c.updateProjectionMatrix();
  hemi.color.copy(CUR.hemiS.copy(A.hemiS).lerp(B.hemiS,t));
  hemi.groundColor.copy(CUR.hemiG.copy(A.hemiG).lerp(B.hemiG,t));
  hemi.intensity=lerpN(A.hemiI,B.hemiI,t);
  amb.color.copy(CUR.amb.copy(A.ambC).lerp(B.ambC,t));amb.intensity=lerpN(A.ambI,B.ambI,t);
  fill.color.copy(CUR.fill.copy(A.fillC).lerp(B.fillC,t));fill.intensity=lerpN(A.fillI,B.fillI,t);
  rim.color.copy(CUR.rim.copy(A.rimC).lerp(B.rimC,t));rim.intensity=lerpN(A.rimI,B.rimI,t);
  scene.fog.color.copy(CUR.fog.copy(A.fog).lerp(B.fog,t));
  scene.fog.near=lerpN(A.fogN,B.fogN,t);scene.fog.far=lerpN(A.fogF,B.fogF,t);
  terrainMat.color.copy(CUR.ground.copy(A.ground).lerp(B.ground,t));
  stoneMesh.material.color.copy(CUR.ground);
  grassMesh.material.color.copy(CUR.grass.copy(A.grass).lerp(B.grass,t));
  for(let i=0;i<6;i++)CUR.sky[i].copy(A.sky[i]).lerp(B.sky[i],t);
  paintSky(CUR.sky);
  /* 素絹 的天不吃 CUR.sky，吃这个乘色（见 inkSkyTint）。别的裝幀这里是白，
     等于没乘。写进 CUR 是因为 stepBolt 每帧要拿它当底叠闪电。 */
  CUR.skyTint.copy(A.skyTint||_WHITE).lerp(B.skyTint||_WHITE,t);
  skyMat.color.copy(CUR.skyTint);
  themeBlob=lerpN(A.blob,B.blob,t);
  const st=lerpN(A.stars,B.stars,t);
  starOn=st;starLayers.forEach(m=>{m.opacity=st;m.visible=st>0.005;});
  const gl=lerpN(A.glow,B.glow,t);
  const inkSkin=SKINS[skinIdx]&&SKINS[skinIdx].ink;
  /* 麻燕 — out by day, thickest at dusk, gone to roost after dark */
  const SWK={morning:0.72,noon:0.55,sunset:1.00,night:0.00};
  const swA=SWK[THEMES[themeIdx].id.toLowerCase()];
  /* On paper the flock stops reading as birds. 187 near-black darts over a pale
     wash is speckle, and the orbit radii start at 1.9 — inside the tower's own
     silhouette — so most of it lands ON the building rather than around it. A
     third of the birds and a lighter ink; the flight is unchanged. */
  swiftK=(swA===undefined?0.6:swA)*(inkSkin?0.34:1);
  MAT.dark.emissive.setHex(0xff9a3c);MAT.dark.emissiveIntensity=inkSkin?0:gl;
  if(inkSkin){
    /* No lamplight — a lit interior in a wash drawing is a photograph. But the
       mid greys this used to set came out LIGHTER than the rendered timber, so
       every door and window void turned into a pale blank and the joinery in
       front of it vanished for want of contrast. An opening in an ink drawing is
       a dark patch, so 夾 goes dark and the deep interior stays a shade above it. */
    /* These have to be very much darker than they look on paper, because the
       timber they sit behind carries a DARK texture map and these carry none:
       final colour is map x albedo, so a 0x39 void and a 0xb5 timber over a 0x35
       map land in the same tan band and the joinery disappears. Judge them
       against the rendered timber, not against each other. */
    MAT.hollow.color.setHex(0x211e18);MAT.dark.color.setHex(0x100e0a);
  }else{
    MAT.hollow.color.setHex(0x171310);MAT.dark.color.setHex(0x1d1712);
  }
  /* the 塔剎 is iron on an unlit roof — nothing up there is a lamp. Any
     emissive at all turns it into a beacon, which is what the gilt bronze
     finial of the original pagoda style wanted and this one does not. */
  MAT.bronze.emissive.setHex(0x000000);MAT.bronze.emissiveIntensity=0;
  wxApply();
}
function applyTheme(i,instant){
  const prev=themeTo;
  themeIdx=((i%THEMES.length)+THEMES.length)%THEMES.length;
  const th=THEMES[themeIdx],root=document.documentElement;
  for(const k in th.css)root.style.setProperty('--'+k,th.css[k]);
  root.setAttribute('data-time',th.id.toLowerCase());
  const tb=document.getElementById('timeBtn');
  setBtn(tb,th.id);
  themeTo=themeState(th);
  /* the skin gets the last word: CSS variables as inline styles so they beat
     the ones applyTheme just wrote, and a tint over the whole scene palette */
  const sk=SKINS[skinIdx];
  if(sk&&sk.css)for(const k in sk.css)root.style.setProperty('--'+k,sk.css[k]);
  if(sk&&sk.ink){
    /* the tower has to join the wash rather than sit on top of it: pull most
       of the colour out of its materials so it reads as drawn, not rendered.
       MATBASE holds the unskinned colours, so this is reversible. */
    /* Compress each material towards a mid ink value rather than towards the
       paper. Lerping to paper looked right on the dark timber and wrong on the
       pale plaster — it made the lime walls glow like lit windows, because
       blending a light colour towards a lighter one only brightens it. */
    /* The openings are the exception, and they have to be. Compressing EVERY
       material into 0.42-0.82 put the door and window voids in the same value
       band as the timber in front of them, so every 板門 and 格子窗 on the tower
       came out as a flat tan patch and the joinery over it disappeared for want
       of anything to read against. An ink drawing does the opposite: the openings
       are the darkest marks on the paper and the brushwork is legible because of
       them. So these two keep a low band of their own and skip the paper lerp. */
    const VOID_V={dark:0.045,hollow:0.088};
    for(const k in MATBASE){
      const c=MAT[k].color;
      const l=c.r*0.30+c.g*0.59+c.b*0.11;
      const vd=VOID_V[k];
      /* desaturate hard, then pull the VALUE towards the middle of the range
         so the whole tower occupies the narrow band a brush can hold */
      const v=vd!==undefined?vd:0.42+l*0.40;
      c.setRGB(l+(c.r-l)*0.30,l+(c.g-l)*0.30,l+(c.b-l)*0.30);
      c.multiplyScalar(l>0.001?v/l:1);
      if(vd===undefined)c.lerp(_sk.setHex(sk.paperHex||0xefe8d6),0.16);
    }
    /* a wash has no sun in it. Kill the directional key and the shadows, and
       light the tower almost entirely from the hemisphere, or it reads as a
       photograph pasted onto a painting. */
    themeTo.sunI*=0.34;themeTo.shadow*=0.30;
    themeTo.hemiI=Math.max(themeTo.hemiI,0.72);
    themeTo.ambI=Math.max(themeTo.ambI,0.34);
    themeTo.fillI*=0.5;themeTo.rimI*=0.4;
    themeTo.blob*=0.4;
    /* 这里原来写的是 themeTo.stars=0 —— 一张水墨的纸上撒白点确实像贴上去的。
       但那条判断把「夜」也一起判死了：lara 2026-08-27「夜晚的星空怎么没有了」。
       真正的毛病不在星，在天：素絹 的天空穹用的是 inkSkyTex 那张画好的纸
       （见 setSkyMode），根本不读 CUR.sky，所以四个时辰的天一模一样 —— 点「夜」
       只把光调暗，天还是白天那张素绢。星撒在一张亮纸上，看不见才是正常的。
       所以改成让这张纸跟着时辰暗：整体乘一个色（下面的 skyTint）。夜里纸暗成
       墨蓝，星就是纸上没被墨盖住的地方 —— 画里的星本来就是留白，不是画上去的
       白点。星不再掐掉。 */
    themeTo.skyTint=inkSkyTint(th);
  }
  if(sk&&sk.scene){
    const S=sk.scene,T2=themeTo;
    /* 洗到纸上去多少，跟着这个时辰本身的明暗走。原来是一个常数 0.80~0.90，
       白天没问题；夜里把一片近黑的地和雾也洗成了纸色，于是天暗下来之后地反而
       比天亮，整幅倒过来了。亮的时辰照旧洗，暗的时辰几乎不洗。 */
    const w=washK(th);
    T2.sky=T2.sky.map(c=>skinShift(c.clone(),S,S.sky*w));
    skinShift(T2.fog,S,S.fog*w);
    skinShift(T2.ground,S,S.ground*w);
    skinShift(T2.grass,S,S.grass*w);
    /* THEMES carries a ridge triplet but nothing reads it, so there is
       nothing to tint there — the distant hills take the fog colour. */
    /* bringing the fog in flattens the land into a wash, which is most of
       what makes the silk and fashi skins read as drawings */
    T2.fogN=T2.fogN*S.fogNear;T2.fogF=T2.fogF*(0.5+S.fogNear*0.5);
  }
  if(instant||!prev){themeFrom=themeTo;themeMix=1;}
  else{
    /* freeze the current interpolated look as the new starting point */
    themeFrom=Object.assign({},themeFrom);
    const t=themeMix, A=themeFrom, B=prev;
    A.sunAz=lerpN(A.sunAz,B.sunAz,t);A.sunEl=lerpN(A.sunEl,B.sunEl,t);
    A.sunC=A.sunC.clone().lerp(B.sunC,t);A.sunI=lerpN(A.sunI,B.sunI,t);
    A.hemiS=A.hemiS.clone().lerp(B.hemiS,t);A.hemiG=A.hemiG.clone().lerp(B.hemiG,t);
    A.hemiI=lerpN(A.hemiI,B.hemiI,t);
    A.ambC=A.ambC.clone().lerp(B.ambC,t);A.ambI=lerpN(A.ambI,B.ambI,t);
    A.fillC=A.fillC.clone().lerp(B.fillC,t);A.fillI=lerpN(A.fillI,B.fillI,t);
    A.rimC=A.rimC.clone().lerp(B.rimC,t);A.rimI=lerpN(A.rimI,B.rimI,t);
    A.fog=A.fog.clone().lerp(B.fog,t);A.fogN=lerpN(A.fogN,B.fogN,t);A.fogF=lerpN(A.fogF,B.fogF,t);
    A.ground=A.ground.clone().lerp(B.ground,t);A.grass=A.grass.clone().lerp(B.grass,t);
    A.sky=A.sky.map((c,i2)=>c.clone().lerp(B.sky[i2],t));
    A.skyTint=(A.skyTint||_WHITE).clone().lerp(B.skyTint||_WHITE,t);
    A.shadow=lerpN(A.shadow,B.shadow,t);A.blob=lerpN(A.blob,B.blob,t);
    A.glow=lerpN(A.glow,B.glow,t);A.stars=lerpN(A.stars,B.stars,t);
    themeMix=0;
  }
  themeE=themeMix;
  applyState(themeFrom,themeTo,themeMix);
  /* the ghost clones hold a copy of a material colour this function just
     rewrote, so they have to be told */
  if(typeof applyCutaway==='function')applyCutaway();
}
function stepShadow(){}
function stepTheme(dt){
  let live=false;
  if(themeMix<1){themeMix=Math.min(1,themeMix+dt/themeDur);live=true;}
  if(wxMix<1){wxMix=Math.min(1,wxMix+dt/1.35);live=true;}
  if(!live)return;
  const e=themeMix<.5?2*themeMix*themeMix:1-Math.pow(-2*themeMix+2,2)/2;
  themeE=e;
  applyState(themeFrom,themeTo,e);
}
/* re-run the current look without advancing any transition — used when a
   slow weather value (blizzard, settled snow) has drifted enough to show */
let themeE=1;
function refreshLook(){if(themeFrom)applyState(themeFrom,themeTo,themeE);}
let themeBlob=0.95,starOn=0;

/* ------------------------------------------------------------------ *
 * 8.  layout
 * ------------------------------------------------------------------ */
const DES_W=1512,DES_H=856,BAR_T=54,BAR_B=63;
const UNITS_TALL=14.56,CAM_H=7.065,CAM_D=80;
/* the widest the tower gets when it is turned corner-on, eaves included —
   on a phone the frame runs out sideways long before it runs out of height */
const UNITS_WIDE=10.4;
let mobile=false;
/* orbit state: drag sets the target, hover adds a little parallax on top */
let orbAz=0,orbEl=0,hovAz=0,hovEl=0,curAz=0,curEl=0;
let zoomT=1,zoom=1;
/* where the camera is pointed vertically. CAM_H is the whole-tower framing;
   focusing a pinned part walks it to that part's height and back. */
let camY=7.065,camYT=7.065;
/* the camera orbits at CAM_D, so elevation sets its height: CAM_H + CAM_D*sin(el).
   Floor it well above the ground swell or the terrain is seen from underneath. */
const CAM_FLOOR=3.4;
const EL_MIN=Math.asin((CAM_FLOOR-7.065)/80),EL_MAX=0.62;
let K=1,stageW=0,stageH=0,stageTop=0,canvasW=0,canvasH=0;
/* the separator between label and value is drawn by CSS so the two can be
   stacked on a phone — which leaves textContent unpunctuated, hence the
   explicit label for anything reading the button rather than looking at it */
/* 素絹 carries no English, and the control VALUES come out of THEMES[].id and
   WEATHER[].id rather than out of markup, so they need translating at the point
   of display. The aria-label keeps the English for screen readers. */
const CN_VAL={GHOST:'塔里',FRAME:'骨架',LEAN:'歪',PLUMB:'正',
              MORNING:'晨',NOON:'午',SUNSET:'暮',NIGHT:'夜',
              CLEAR:'晴',RAIN:'雨',STORM:'雷',SNOW:'雪',
              ON:'有',OFF:'无'};
const CN_LBL={WEATHER:'天候',TIME:'时',SOUND:'音','↻ REBUILD':'重营'};

/* ------------------------------------------------------------------ *
 * 9b.  图记 — 顶栏那三枚不写字的控件
 *
 * 标注、天候、时、音四个控件的态数是 2 / 4 / 4 / 2，写成字就是十二路字面，顶栏
 * 放不下。图记只画当前那一态，笔画跟塔上的签同一根细线（1.5，圆头圆角）。
 *
 * 标注两态：一个小方框加一条引线点在一处 —— 就是塔上那些签本身；关掉加一道斜杠。
 *
 * 天候四态：晴一轮日；雨云底下三道；雷云底下一折；雪画六出 —— 雪花六瓣，
 *   古人叫六出，《韩诗外传》「凡草木花多五出，雪花独六出」。
 * 时四态：前三态共用一具日晷 —— 一道地平、一道天弧，日在弧上从左移到右，
 *   晨在东坡、午在弧顶、暮在西坡。夜里日晷不走，所以夜不画晷，只画一弯月。
 *   这一处不对称是有意的：日晷停摆本身就是夜的意思。
 * 音两态：有音是喇叭带两道波，静是喇叭带一个叉。
 *
 * 前三个日晷共用底下这两笔，日的位置由 dial() 换。
 * ------------------------------------------------------------------ */
const IC_CLOUD='<path d="M19.6 16.2A4.6 4.6 0 0 0 17.8 7.4h-1.16A7.4 7.4 0 1 0 4.6 14.9"/>';
/* 地平一道，日行的路一道。路必须画成虚的 —— 第一稿是实线，一条实弧加一颗实心
   日，两个形接在一起就成了一只盖碗，四个态还长得一样。断开之后弧是路，日是日。 */
/* 地平压在 y=17 而不是贴着 24 的底：日晷这一套的墨都在地平以上，地平放到底
   整个图记就比旁边的天候低一截，两枚挨着排会看出来不齐。17 让墨的重心落回
   24 的中线。 */
const IC_GROUND='<path d="M3 17h18"/>';
const IC_PATH='<path d="M4.6 17a7.4 7.4 0 0 1 14.8 0" stroke-dasharray="1.5 2.4" opacity=".5"/>';
/* 弧心 (12,17)，半径 7.4；t 是从东边地平起算的角，日就落在这条弧上。
   晨在东坡，午在弧顶，暮在西坡。 */
const dial=t=>{const a=t*Math.PI/180;
  return IC_GROUND+IC_PATH+'<circle class="f" cx="'+(12-7.4*Math.cos(a)).toFixed(2)+
         '" cy="'+(17-7.4*Math.sin(a)).toFixed(2)+'" r="2.3"/>';};
const IC_SPK='<path d="M11.2 4.9 6.5 8.9H2.9v6.2h3.6l4.7 4V4.9z"/>';
/* 标注那枚画的是塔上那些签本身：一个小方框，一条引线拉出去点在一处。
   关掉是同一枚加一道斜杠 —— 跟静音那个叉是一套说法。
   引线必须是横的。第一稿是从方框左下角斜下去的，两个毛病：整枚读成一面小旗，
   而关掉那道斜杠跟引线差不多同一个方向，开和关看不出分别。横引线加斜杠，
   一横一斜，两态才隔得开。 */
const IC_TAG='<rect x="12.4" y="7.6" width="9.2" height="8.8" rx="1.4"/>'
            +'<path d="M12.4 12h-6"/><circle class="f" cx="4.4" cy="12" r="1.9"/>';
/* 按控件分组，不是按值。标注和音都用 ON/OFF 两个值，摊平在一层就会互相顶掉：
   点「标注」出来的会是喇叭。 */
const ICONS={
  wx:{
    CLEAR:'<circle cx="12" cy="12" r="4.4"/><path d="M12 2.3v2.2M12 19.5v2.2M2.3 12h2.2M19.5 12h2.2'
          +'M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6"/>',
    RAIN :IC_CLOUD+'<path d="M8 17.6v3.6M12 18.8v3.6M16 17.6v3.6"/>',
    STORM:IC_CLOUD+'<path d="M13.1 15.4 9.1 20.2h5.2l-3.3 3.4"/>',
    SNOW :'<path d="M12 2.4v19.2M3.7 7.2l16.6 9.6M20.3 7.2 3.7 16.8"/>'
          +'<path d="M8.9 4.3 12 6.1l3.1-1.8M8.9 19.7 12 17.9l3.1 1.8"/>'
          +'<path d="M4.6 11.2 5.1 7.7l3.4-.6M19.4 12.8l-.5 3.5-3.4.6"/>'
  },
  time:{
    MORNING:dial(32), NOON:dial(90), SUNSET:dial(148),
    /* 夜里日晷不走，所以夜不画那条路，只剩地平和一弯月 */
    NIGHT:IC_GROUND+'<path class="f" d="M17.6 10.1A5.6 5.6 0 1 1 11.5 4 4.35 4.35 0 0 0 17.6 10.1z"/>'
  },
  sound:{
    ON :IC_SPK+'<path d="M14.9 9.2a4 4 0 0 1 0 5.6M17.7 6.4a8 8 0 0 1 0 11.2"/>',
    OFF:IC_SPK+'<path d="M15.1 9.4l5.2 5.2M20.3 9.4l-5.2 5.2"/>'
  },
  pin:{
    ON :IC_TAG,
    /* 斜杠只压住这枚记本身（x 2.5~21.6 / y 7.6~16.4），不拉到 24 的两个角上 ——
       拉到角上它就比旁边三枚都大一圈 */
    OFF:IC_TAG+'<path d="M4.2 18.4 21 5.6"/>'
  }
};
/* 图记本身说不出这一态叫什么，所以点过之后名字在底下浮一下。屏幕阅读器读的
   仍是 aria-label 里的英文，跟 .tbtn 一致。同样按控件分组。 */
const IC_CN={
  wx:{CLEAR:'晴',RAIN:'雨',STORM:'雷',SNOW:'雪'},
  time:{MORNING:'晨',NOON:'午',SUNSET:'暮',NIGHT:'夜'},
  sound:{ON:'有音',OFF:'静'},
  pin:{ON:'标注',OFF:'无标注'}
};
const IC_EN={wx:'WEATHER',time:'TIME',sound:'SOUND',pin:'LABELS'};
const _icT={};
function setIcon(el,v){
  const kind=el.dataset.icon;
  const g=(ICONS[kind]||{})[v];if(g===undefined)return;
  el.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+g+'</svg><i></i>';
  el.lastElementChild.textContent=((IC_CN[kind]||{})[v])||v;
  el.classList.toggle('off',v==='OFF');
  el.setAttribute('aria-label',(IC_EN[kind]||'')+': '+v);
}
/* setIcon 是重画整个图记（innerHTML），名字那一枚也跟着重建 —— 所以浮字必须
   在换过图记之后才叫，顺序是 applyWeather → setBtn → setIcon → flashIcon。
   换皮和开场也会走 setBtn，那两处不该闪，所以浮字不写在 setIcon 里。 */
function flashIcon(el){
  if(!el)return;
  const tip=el.querySelector('i'),k=el.dataset.icon;
  if(!tip)return;
  if(_icT[k])clearTimeout(_icT[k]);
  tip.classList.add('on');
  _icT[k]=setTimeout(()=>tip.classList.remove('on'),1150);
}

function setBtn(el,v){
  if(!el)return;
  /* 图记不走文字那一路 */
  if(el.dataset.icon){setIcon(el,v);return;}
  const ink=document.documentElement.getAttribute('data-skin')==='silk';
  const s=el.lastElementChild,b=el.firstElementChild;
  if(s&&b){
    s.textContent=ink&&CN_VAL[v]?CN_VAL[v]:v;
    /* 关掉的时候值褪成淡墨 —— 顶栏没有边框了，状态全靠这一处颜色 */
    el.classList.toggle('off',v==='OFF');
    el.setAttribute('aria-label',b.textContent+': '+v);
  }
  else el.textContent=v;
}
/* the button LABELS are literal text in the markup, so they are swapped once
   per skin change and remembered so they can be put back */
function localiseButtons(ink){
  document.querySelectorAll('.tbtn').forEach(el=>{
    const b=el.firstElementChild;
    if(b){
      if(!b.dataset.en)b.dataset.en=b.textContent;
      b.textContent=ink&&CN_LBL[b.dataset.en]?CN_LBL[b.dataset.en]:b.dataset.en;
    }else{
      if(!el.dataset.en)el.dataset.en=el.textContent.trim();
      el.textContent=ink&&CN_LBL[el.dataset.en]?CN_LBL[el.dataset.en]:el.dataset.en;
    }
  });
}
const hdEl=document.querySelector('header'),ftEl=document.querySelector('footer'),
      tmEl=document.querySelector('.top-mid'),
      ctlEl=document.querySelector('.top-right'),
      tabEl=document.getElementById('chap'),
      eraEl=document.getElementById('era'),
      sheetEls=[document.getElementById('cutnote'),document.getElementById('leancard'),
                document.getElementById('fixcard')];
/* ------------------------------------------------------------------ *
 * v6 is portrait-only, so there is no desktop branch to fall back to and
 * --k stops being a scale factor. The chrome is measured rather than
 * computed: CSS owns the bar heights, layout() only asks how tall they
 * came out. stageTop/stageH are the clear band the tower is framed into,
 * and the band is measured against the sheet's PEEK height rather than its
 * open height — otherwise expanding the sheet would shove the tower up.
 * ------------------------------------------------------------------ */
function chromeBottom(){
  const tab=tabEl?tabEl.offsetHeight:0;
  /* The collapsed sheet, whichever of the two is showing — read off the same
     CSS variable the sheet sizes itself with, not a number duplicated here.
     offsetHeight would be wrong: when the sheet is open it reports the open
     height, and the framing must not follow it. */
  const cs=getComputedStyle(document.documentElement);
  let peek=0;
  sheetEls.forEach(el=>{
    if(!el||!el.classList.contains('on'))return;
    const v=parseFloat(cs.getPropertyValue(el.dataset.peekVar||''))||0;
    peek=Math.max(peek,v);
  });
  /* the strip above the sheet: build scrubber, or the era rail in 其四 */
  const strip=leanOn?(eraEl&&eraEl.classList.contains('on')?eraEl.offsetHeight:0)
                    :(ftEl?ftEl.offsetHeight:0);
  return tab+peek+strip;
}
function layout(){
  const vw=window.innerWidth,vh=window.innerHeight;
  mobile=true;
  K=1;
  document.documentElement.style.setProperty('--k',K);
  stageTop=hdEl?hdEl.offsetHeight:BAR_T;
  stageH=Math.max(120,vh-stageTop-chromeBottom());
  stageW=vw;
  canvasW=vw;canvasH=vh;
  cvs.style.top='0px';
  cvs.style.width=canvasW+'px';
  cvs.style.height=canvasH+'px';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(canvasW,canvasH,false);
  camera.aspect=canvasW/canvasH;
  if(typeof fitOvtVeil==='function')fitOvtVeil();
  /* 顶栏那行小字装得下才写，见 .top-mid.cut 那条的注 */
  if(tmEl){
    tmEl.classList.remove('cut');
    if(tmEl.scrollWidth>tmEl.clientWidth+1)tmEl.classList.add('cut');
  }
  placeCamera(1);
  placePlaque();
}

function placeCamera(k){
  const tAz=orbAz+hovAz;
  const tEl=Math.max(EL_MIN,Math.min(EL_MAX,orbEl+hovEl));
  curAz+=(tAz-curAz)*k;curEl+=(tEl-curEl)*k;zoom+=(zoomT-zoom)*k;
  const ce=Math.cos(curEl),se=Math.sin(curEl);
  /* the look-at height used to be nailed to CAM_H, which frames the whole tower
     and nothing else. Focusing a single 斗栱 band needs it to travel. */
  camY+=(camYT-camY)*k;
  camera.position.set(CAM_D*ce*Math.sin(curAz),CAM_H+CAM_D*se,CAM_D*ce*Math.cos(curAz));
  camera.lookAt(0,camY,0);
  /* fit height into the stage band, but never let a narrow frame slice the
     eaves off — whichever constraint needs the wider lens wins */
  const vNeed=UNITS_TALL*(canvasH/Math.max(1,stageH));
  const hNeed=UNITS_WIDE/Math.max(0.2,camera.aspect);
  camera.fov=2*Math.atan((Math.max(vNeed,hNeed)/2)/CAM_D/zoom)*180/Math.PI;
  /* The fov above sizes the tower to the clear band, but a perspective camera
     still centres it on the CANVAS. v5's chrome was roughly symmetric — 54 top,
     63 bottom — so that was the same thing. Here it is 46 above and a sheet
     plus a tab bar below, so the middle of the band sits ~90px above the middle
     of the frame and the tower's base was disappearing behind the sheet.
     setViewOffset renders an off-centre window of the same frustum, which
     shifts the tower without tilting it — a lookAt nudge would have swung the
     verticals, and on this building the verticals are the subject. */
  const dy=(stageTop+stageH*0.5)-canvasH*0.5;
  if(Math.abs(dy)>0.5)camera.setViewOffset(canvasW,canvasH,0,-dy,canvasW,canvasH);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------------ *
 * 9.  timeline
 * ------------------------------------------------------------------ */
const DUR=4.40;
const STAGE_T=[0.00,0.21,1.07,1.92,2.79,3.64,4.36];
let STAGES=[],CAPS=[];
const easeInOut=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
const easeOut=x=>1-Math.pow(1-x,2.6);

let t=0,playing=true,lastStage=-1;
const plaqueEl=document.getElementById('plaque'),
      fillEl=document.getElementById('fill'),
      timeEl=document.getElementById('time'),
      bigPctEl=document.getElementById('bigpct'),
      bigNumEl=document.getElementById('bigpctNum');

function stageIndexAt(tt){let i=0;for(let k=0;k<STAGES.length;k++)if(tt>=STAGES[k].t)i=k;return i;}
function buildHeightAt(tt){
  const i=stageIndexAt(tt);
  if(i===0)return 0;
  const s=STAGES[i],prev=STAGES[i-1],next=STAGES[i+1];
  const span=(next?next.t:DUR)-s.t;
  const f=span>0?Math.min(1,(tt-s.t)/(span*0.93)):1;
  return prev.to+(s.to-prev.to)*easeInOut(f);
}
/* half-diagonal of the solid mass at a given height, for the cut cap */
function capPlan(segs){
  if(segs===capSegs)return;
  capSegs=segs;
  capMesh.geometry.dispose();
  capMesh.geometry=new T.CircleGeometry(1,segs);
}
function capAt(y){
  for(const c of CAPS)if(y>=c[0]&&y<=c[1]){
    capPlan(c[3]||4);
    return c[2];
  }
  return 0;
}
function applyStyle(i){
  styleIdx=((i%STYLES.length)+STYLES.length)%STYLES.length;
  const st=STYLES[styleIdx];
  if(modelGroup)disposeGroup(modelGroup);
  modelGroup=st.build();
  /* the shear happens on the GPU, so the CPU bounding spheres are wrong the
     moment the tower leans and a mesh can be culled while still on screen.
     Every one of these is visible at every framing anyway. */
  modelGroup.children.forEach(m=>{m.frustumCulled=false;leanPatch(m.material);});
  scene.add(modelGroup);
  CAPS=st.caps;
  STAGES=st.stages.map((x,k)=>({t:STAGE_T[k],cn:x[0],en:x[1],to:x[2]}));
  buildScaffolds(st.scaf);
  const q=sel=>document.querySelector(sel);
  q('.big-cn').textContent=st.t1;
  q('.sub-cn').textContent=st.sub;
  q('.title-cn').innerHTML='<b>'+st.t2+'</b><b>'+st.t3+'</b>';
  if(typeof applyCopy==='function')applyCopy(SKINS[skinIdx].id||'study');
  q('.roman').innerHTML=st.gloss;
  document.documentElement.setAttribute('data-style',st.id.toLowerCase());
  if(started)playMusic(st.aud.music);
  applyCutaway();
  if(typeof applyLeanMode==='function')applyLeanMode();
  lastStage=-1;playing=true;applyTime(0);
}

/* ---- 剖切 — show the hidden bracing ---------------------------------
   The 暗層 bracing is the reason this thing has outlived every other Liao
   timber frame, and from outside you cannot see a stick of it. Two steps:
   fade the outer skin back, then drop the walls and joinery entirely. */
/* ENCLOSURE — everything that shuts the frame in. 'infill' is the joinery:
   windows, doors, 障水板. 'hollow' is the near-black shell inside the 內槽, which
   has to go or FRAME shows a frame wrapped round a black cylinder. 'pzdg' is the
   平坐 bracket band, which stands in front of the bracing. 'bian' goes with the
   wall it hangs on — a board left floating in mid air reads as a bug. */
const SKIN_IN=['walls','dark','infill','rails','hollow','bian','pzdg','pzdgD'];
/* ROOF — surfaces only, no frame behind them, so FRAME keeps them as a ghost
   rather than deleting them. Deleted, the tower reads as five plates floating
   one above another and the eaves that give it its shape are gone. */
const SKIN_RF=['tiles','soffits','ridgecaps','ridge'];
let cutMode=0;                       /* 0 off, 1 ghosted, 2 frame only */
/* A skin mesh cannot be faded by writing to its material: MAT.timberD is shared
   by the frame, the infill and the railings, so fading one faded all three. Each
   gets its own transparent clone, resynced to the theme's colour on every mode
   change (the theme is what mutates MAT.*, and it only moves on a keypress). */
function skinMat(m,op){
  const ud=m.userData;
  if(!ud.solidMat)ud.solidMat=m.material;
  if(!ud.ghostMat){
    const g=ud.solidMat.clone();
    g.transparent=true;g.depthWrite=false;
    g.clippingPlanes=[CLIP];g.clipShadows=true;
    g.userData.lnPatched=false;leanPatch(g);
    ud.ghostMat=g;
  }
  const g=ud.ghostMat,sm=ud.solidMat;
  if(g.color&&sm.color)g.color.copy(sm.color);
  g.opacity=op;g.needsUpdate=true;
  return g;
}
function applyCutaway(){
  if(!modelGroup)return;
  modelGroup.children.forEach(m=>{
    const inn=SKIN_IN.indexOf(m.name)>=0, rf=SKIN_RF.indexOf(m.name)>=0;
    if(m.userData.solidMat)m.material=m.userData.solidMat;
    m.visible=true;
    if(cutMode===1){
      /* 'hollow' and 'dark' are near-black fills and the eye reads two layers
         of a translucent shell, not one, so at 0.24 they veil the statues the
         mode exists to show. They fade further than the plaster does. */
      if(inn||rf)m.material=skinMat(m,(m.name==='hollow'||m.name==='dark')?0.10:0.24);
    }else if(cutMode===2){
      m.visible=!inn;
      if(rf)m.material=skinMat(m,0.13);
    }
    /* a ghost casting a solid shadow gives the game away */
    m.castShadow=(m.name==='bian'||m.name==='icons')?false:!(cutMode>0&&(inn||rf));
  });
  /* no 剖切 button to relabel: the cut is named by the chapter it belongs to */
  if(typeof refreshNote==='function')refreshNote();
}

const _v=new T.Vector3();
function placePlaque(){
  const d=4.30,sa=Math.sin(curAz),ca=Math.cos(curAz);
  _v.set(sa*d+ca*0.30,0.86,ca*d-sa*0.30).project(camera);
  plaqueEl.style.left=((_v.x*0.5+0.5)*canvasW)+'px';
  plaqueEl.style.top=((-_v.y*0.5+0.5)*canvasH)+'px';
}

function applyTime(tt){
  t=tt;
  const h=buildHeightAt(tt);
  CLIP.constant=h;

  const a=capAt(h);
  if(a>0.01&&h>0.03&&h<13.9){
    capMesh.visible=true;capMesh.scale.set(a,a,1);capMesh.position.y=h-0.003;
  }else capMesh.visible=false;

  ground.material.opacity=Math.min(1,h/1.4)*themeBlob;
  ground.visible=h>0.02;

  const si=stageIndexAt(tt);
  for(let k=0;k<scafGroups.length;k++){
    const stg=STAGES[k+1],g=scafGroups[k];
    const on=(si===k+1);
    g.visible=on;
    if(!on)continue;
    const nx=STAGES[k+2]?STAGES[k+2].t:DUR;
    const local=(tt-stg.t)/(nx-stg.t);
    const grow=Math.min(1,local/0.17);
    const out=local>0.90?1-(local-0.90)/0.10:1;
    g.children.forEach((m,idx)=>{
      const d=(idx%9)/9*0.3;
      const gg=Math.max(0,Math.min(1,(grow-d)/(1-d)))*Math.max(0,out);
      m.visible=gg>0.02;
      if(!m.visible)return;
      const s2=easeOut(gg);
      if(m.userData.kind==='v'){m.scale.set(1,s2,1);}
      else{m.scale.set(s2,1,1);}
    });
  }

  const st=STAGES[si];
  if(si!==lastStage){
    lastStage=si;
    plaqueEl.innerHTML=st.cn+'&nbsp;/&nbsp;<em>'+st.en+'</em>';
    plaqueEl.classList.toggle('gone',si>=STAGES.length-1);
    /* 这儿原来每跨一个阶段敲一声木工、最后一下换成收工的钟。
       lara 2026-08-26：「塔装起来和拆除的音效都很奇怪，都不要吧」——「装起来」
       指的就是其一这段建塔。整条链一起拆掉了（合成器、注册表、预热、风格里那
       四个字段），不是留着 return。琴曲和风雨燕子不走这儿，照旧。 */
  }
  const frac=Math.min(1,tt/DUR);
  fillEl.style.width=(frac*100)+'%';
  bigNumEl.textContent=Math.round(frac*100);
  bigPctEl.classList.toggle('done',tt>=DUR-0.001);
  /* The poem sits top-left, which on a 1512 frame was clear sky beside the
     tower and in portrait is the tower's own finial. It belongs to the
     營造 anyway — four lines of introduction while the frame goes up — so it
     reads against the sky for 4.4 seconds and then hands the frame over. */
  if(appEl)appEl.classList.toggle('built',tt>=DUR-0.001);
  /* 开篇第一拍的出口就在这儿：塔立定的那一帧交给第二拍。放在 applyTime 里
     而不是另起一个计时器 —— 「塔立定」有一个准确时刻，这里每帧都知道它到了
     没有，而计时器会跟 quietTime / __seek 这些跳时间的路子对不上。 */
  /* 开篇的两个节点。半程就让题签浮起来，不等塔立定：lara 2026-08-27 看了
     截图说「现在开头的下面很空」—— 塔要长 4.4 秒，这 4.4 秒里下缘那条带子
     一直空着。现在塔还在长，字已经在下面聚起来了。 */
  if(typeof ovtTo==='function'){
    if(tt>=DUR*0.5)ovtTo(2);
    if(tt>=DUR-0.001)ovtTo(3);
  }
  timeEl.textContent=tt.toFixed(2)+' / '+DUR.toFixed(2);
}

/* ------------------------------------------------------------------ *
 * 10.  sound
 * ------------------------------------------------------------------ */
let actx=null,soundOn=true,musicBus=null,sfxBus=null,wxBus=null,wdBus=null,birdBus=null,started=false;
const _buf={},_pend={};
function ensureCtx(){
  if(actx)return actx;
  actx=new (window.AudioContext||window.webkitAudioContext)();
  musicBus=actx.createGain();musicBus.gain.value=0.0001;musicBus.connect(actx.destination);
  sfxBus=actx.createGain();sfxBus.gain.value=0.9;sfxBus.connect(actx.destination);
  wxBus=actx.createGain();wxBus.gain.value=0.0001;wxBus.connect(actx.destination);
  /* 木头单独一条总线，不跟天候合用：那三张床的音量是每帧被动作速度驱动的
     （见第 10d 节），要是挂在 wxBus 上，读者把天候调成晴天就把营造声也关了。 */
  wdBus=actx.createGain();wdBus.gain.value=0.0001;wdBus.connect(actx.destination);
  /* the flock goes through a limiter of its own. A screech-party is a dozen
     calls landing on top of each other and the sum clips long before any one
     of them is loud. */
  birdBus=actx.createGain();birdBus.gain.value=0.0001;
  if(actx.createDynamicsCompressor){
    const cmp=actx.createDynamicsCompressor();
    cmp.threshold.value=-17;cmp.knee.value=14;cmp.ratio.value=6;
    cmp.attack.value=0.006;cmp.release.value=0.24;
    birdBus.connect(cmp);cmp.connect(actx.destination);
  }else birdBus.connect(actx.destination);
  return actx;
}
/* a looping layer that can be swapped for another and cross-faded, used for
   the weather beds: one for the state, one for the blizzard riding over it */
/* bus 是个名字而不是节点：这些 layer 在模块顶层就建好了，那时候 ensureCtx
   还没跑，总线全是 null。放音的时候再解析成节点。 */
function makeLayer(bus){return {key:null,src:null,gain:null,vol:0,bus:bus||'wx'};}
function layerBus(L){return L.bus==='wd'?wdBus:wxBus;}
function layerPlay(L,key,vol,fade){
  if(!actx)return;
  fade=fade||1.2;
  if(key===L.key){layerVol(L,vol,fade);return;}
  L.key=key;
  const t=actx.currentTime,oldS=L.src,oldG=L.gain;
  if(oldG){
    oldG.gain.cancelScheduledValues(t);
    oldG.gain.setValueAtTime(Math.max(0.0001,oldG.gain.value),t);
    oldG.gain.linearRampToValueAtTime(0.0001,t+fade);
    setTimeout(()=>{try{oldS.stop();}catch(e){}},(fade+0.35)*1000);
  }
  L.src=null;L.gain=null;L.vol=vol;
  if(!key)return;
  loadBuf(key).then(bb=>{
    if(!bb||L.key!==key)return;
    const t2=actx.currentTime;
    const g=actx.createGain();g.gain.setValueAtTime(0.0001,t2);g.connect(layerBus(L));
    const src=actx.createBufferSource();
    src.buffer=bb;src.loop=true;
    /* 一段编码过的音频两端带着编码器的补零，得在片内循环，不然每一圈都咔嗒
       一下；而合成出来的床是采样精确的，_loopify 已经把末尾折回开头了，
       循环点必须正好是 0 和 buffer 末尾 —— 从 0.05 起、到 dur-0.10 止的话，
       那道折口就被切在外面，等于亲手把无缝改成有缝。
       2026-08-27：这一行原来对两种都切 0.05。天候那四张床（rain/storm/
       snow_wind/snow_bliz）全是合成的，所以它们一直在每 8 秒接一次缝 ——
       雨是密的嘶声，缝被盖住了听不出来，木头那三张床里有真的静段，一接就
       露。playMusic 里同一天下午已经按这条规矩改过一遍，这里补上。 */
    const pad=AUD[key]?0.05:0;
    src.loopStart=pad;src.loopEnd=pad?Math.max(0.6,bb.duration-0.10):bb.duration;
    src.connect(g);src.start(t2,pad);
    g.gain.linearRampToValueAtTime(Math.max(0.0001,L.vol),t2+fade);
    L.src=src;L.gain=g;
  });
}
function layerVol(L,vol,ramp){
  L.vol=vol;
  if(!L.gain||!actx)return;
  const t=actx.currentTime;
  L.gain.gain.cancelScheduledValues(t);
  L.gain.gain.setValueAtTime(Math.max(0.0001,L.gain.gain.value),t);
  L.gain.gain.linearRampToValueAtTime(Math.max(0.0001,vol),t+(ramp||0.4));
}
function loadBuf(key){
  if(_buf[key])return Promise.resolve(_buf[key]);
  if(_pend[key])return _pend[key];
  const uri=AUD[key];
  /* not a recording? then it is one of the generated ones, and it is ready
     the moment it is asked for rather than after a decode */
  if(!uri){
    const sb=synthBuf(key);
    return Promise.resolve(sb?(_buf[key]=sb):null);
  }
  const bin=atob(uri.slice(uri.indexOf(',')+1));
  const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
  _pend[key]=new Promise(res=>{
    ensureCtx().decodeAudioData(arr.buffer,bb=>{_buf[key]=bb;res(bb);},()=>res(null));
  });
  return _pend[key];
}
/* music — one looping source per style, cross-faded when the style changes */
let musicKey=null,musicSrc=null,musicGain=null;
function playMusic(key){
  if(!key||key===musicKey||!actx)return;
  musicKey=key;
  loadBuf(key).then(bb=>{
    if(!bb||musicKey!==key)return;
    const t=actx.currentTime,oldS=musicSrc,oldG=musicGain;
    const g=actx.createGain();g.gain.setValueAtTime(0.0001,t);g.connect(musicBus);
    const src=actx.createBufferSource();
    /* an encoded bed carries the encoder's padding at both ends, so loop
       inside the clip rather than across the whole buffer; the beds that are
       built here are sample-exact and can start at zero */
    const pad=AUD[key]?0.05:0;
    src.buffer=bb;src.loop=true;
    src.loopStart=pad;src.loopEnd=Math.max(0.5,bb.duration-0.12);
    src.connect(g);src.start(t,pad);
    g.gain.linearRampToValueAtTime(1,t+1.4);
    if(oldS){
      oldG.gain.linearRampToValueAtTime(0.0001,t+1.1);
      setTimeout(()=>{try{oldS.stop();}catch(e){}},1500);
    }
    musicSrc=src;musicGain=g;
  });
}
/* 最近放过的十六记一次性音效，__audDbg().sfxLog 能读。
   加它的理由：光看 _buf 里有没有那段 buffer 证明不了它响过 —— wdWarm 会提前
   把整章要用的都合成好，缓存里有不等于放过。要验「1305 和 1926 那两格才敲
   开裂声、其余七格不敲」这种事，得有一份真的播放记录。 */
let _sfxLog=[];
/* one-shot, optionally a slice of a longer take, always enveloped */
function sfx(key,opt){
  opt=opt||{};
  if(!soundOn||!actx||actx.state!=='running')return;
  _sfxLog.push(key);if(_sfxLog.length>16)_sfxLog.shift();
  loadBuf(key).then(bb=>{
    if(!bb)return;
    const t=actx.currentTime+0.01,off=opt.off||0;
    const dur=Math.min(opt.dur||bb.duration,bb.duration-off);
    if(dur<=0.06)return;
    const src=actx.createBufferSource();
    src.buffer=bb;src.playbackRate.value=opt.rate||1;
    const g=actx.createGain(),v=opt.gain||1;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(v,t+0.03);
    g.gain.setValueAtTime(v,t+dur*0.70);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(g);g.connect(sfxBus);
    src.start(t,off,dur+0.05);
  });
}
/* ------------------------------------------------------------------ *
 * 10a.  the sounds that are built rather than recorded
 *
 * Two things in the piece are recordings and everything else is made
 * here: the swift calls (field recordings, credited at the head of the file).
 * The music is no longer one of them — the guqin pressing was replaced on
 * 2026-08-27 by a synthesised bed of the tower's own eave bells (_bellBed).
 * Rain, wind and
 * thunder are generated on demand out of noise and decaying partials.
 *
 * That is not a shortcut taken to save a download. Rain is filtered
 * noise with droplets scattered over it, thunder is a low bed under a
 * rolling envelope — these are things you can write down. Writing them
 * down costs a few hundred bytes each instead of tens of kilobytes of
 * MP3, and it means every one of them is ours.
 *
 * A struck bell and a workshop of carpentry used to live here too, for
 * the stage markers of the build. Both are gone: 2026-08-26 lara asked
 * for the tower going up and coming down to stop making a sound. The
 * _mode helper they shared went with them — the weather is all noise
 * through filters and never needed a single decaying partial.
 * ------------------------------------------------------------------ */

/* biquad, run over a plain array in place. Hand-rolled because these render
   into a buffer once, off the audio graph, where a BiquadFilterNode cannot go
   without an OfflineAudioContext and a round trip through a promise. */
function _biq(d,type,f0,Q,sr){
  const w=2*Math.PI*f0/sr,cs=Math.cos(w),sn=Math.sin(w),al=sn/(2*Q),a0=1+al;
  let b0,b1,b2;
  if(type==='bp'){b0=al;b1=0;b2=-al;}
  else if(type==='lp'){b0=(1-cs)/2;b1=1-cs;b2=b0;}
  else{b0=(1+cs)/2;b1=-(1+cs);b2=b0;}
  b0/=a0;b1/=a0;b2/=a0;
  const a1=-2*cs/a0,a2=(1-al)/a0;
  let x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<d.length;i++){
    const x=d[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;
    x2=x1;x1=x;y2=y1;y1=y;d[i]=y;
  }
}
/* one noise table, read from a random offset, instead of millions of
   Math.random calls inside the droplet loops */
let _nt=null;
function _ntab(){
  if(!_nt){_nt=new Float32Array(1<<15);for(let i=0;i<_nt.length;i++)_nt[i]=Math.random()*2-1;}
  return _nt;
}
function _noise(n){
  const d=new Float32Array(n),t=_ntab(),m=t.length-1;
  let j=(Math.random()*m)|0;
  for(let i=0;i<n;i++){d[i]=t[j];j=(j+1)&m;}
  return d;
}
function _band(n,type,f,Q,sr){const d=_noise(n);_biq(d,type,f,Q,sr);return d;}
function _add(dst,src,g){const n=Math.min(dst.length,src.length);for(let i=0;i<n;i++)dst[i]+=src[i]*g;}
function _norm(d,peak){
  let m=0;for(let i=0;i<d.length;i++){const a=d[i]<0?-d[i]:d[i];if(a>m)m=a;}
  if(m>0){const g=peak/m;for(let i=0;i<d.length;i++)d[i]*=g;}
}
/* 一次性的那几记（敲、磬、开裂）都是模态叠加，指数衰减永远到不了零，buffer
   一到头就是硬切 —— 切在还剩两成振幅的地方就是一记咔嗒。sfx() 自己会在后三成
   上淡出，但那只在经过 sfx 时才成立；把淡出做进 buffer 里，这段音频就跟谁播它
   无关了。床不用这个：床的末尾是 _loopify 折回开头的，不能淡。 */
function _tail(d,frac){
  const n=d.length,k=Math.round(n*(1-frac));
  for(let i=k;i<n;i++){const p=(i-k)/(n-k);d[i]*=(1-p)*(1-p);}
}
/* a bed has to loop with no tick in it, so it is rendered long and the tail is
   folded back over the head. Every modulation below uses a period that divides
   the loop length, or the fold would not line up either. */
function _loopify(d,n,xf){
  for(let i=0;i<xf;i++){const k=i/xf;d[i]=d[i]*k+d[n+i]*(1-k);}
  return d.subarray(0,n);
}
function _toBuf(d,sr){
  const b=actx.createBuffer(1,d.length,sr);
  b.getChannelData(0).set(d);
  return b;
}
/* 一个衰减的正弦分音，用复数旋转递推算：每步一次复乘，没有 Math.sin 调用。
   一枚铃是十个这种分音叠起来的，每个还要一对失谐，所以一记铃就是二十次
   ——三万多次采样的循环里省掉 Math.sin 是值得的。
   （2026-08-27 从 v6 找回来的：它本来跟 _templeBell 一起被拆掉了，
   现在 _bell 要用。） */
function _mode(d,at,n,f,amp,tauS,sr,ph){
  const w=2*Math.PI*f/sr,dc=Math.exp(-1/(tauS*sr)),
        cr=Math.cos(w)*dc,ci=Math.sin(w)*dc;
  let zr=amp*Math.cos(ph),zi=amp*Math.sin(ph);
  const end=Math.min(d.length,at+n);
  for(let i=at;i<end;i++){
    d[i]+=zi;
    const nr=zr*cr-zi*ci;zi=zr*ci+zi*cr;zr=nr;
  }
}
/* smooth random, for the roll in thunder */
function _wander(n,hz,sr){
  const d=new Float32Array(n),step=Math.max(1,Math.round(sr/hz));
  let a=Math.random(),b=Math.random();
  for(let i=0;i<n;i++){
    const p=(i%step)/step;
    if(i&&p===0){a=b;b=Math.random();}
    d[i]=a+(b-a)*p*p*(3-2*p);
  }
  return d;
}

/* ---- rain ---------------------------------------------------------
   Two bands of noise and a scatter of droplets. The bands on their own are
   a hiss; the droplets are what make it read as water landing on something. */
function _rainBed(sr,heavy){
  const sec=8,xf=Math.round(sr*0.9),n=Math.round(sec*sr),N=n+xf;
  const d=new Float32Array(N);
  _add(d,_band(N,'hp',heavy?300:460,0.7,sr),heavy?0.30:0.24);
  _biq(d,'lp',heavy?7600:9200,0.7,sr);
  _add(d,_band(N,'bp',heavy?1700:2300,0.7,sr),heavy?0.22:0.17);
  if(heavy)_add(d,_band(N,'lp',110,0.8,sr),0.34);      /* the rumble under a storm */
  const t=_ntab(),m=t.length-1,rate=heavy?300:170;
  for(let k=0,K=Math.round(rate*(sec+1));k<K;k++){
    const at=(Math.random()*N)|0,
          f=1200+Math.random()*4200,
          tau=0.004+Math.random()*0.007,
          amp=(0.05+Math.random()*0.16)*(heavy?1.3:1),
          len=Math.min(N-at,Math.round(tau*sr*5)),
          w=2*Math.PI*f/sr,dc=Math.exp(-1/(tau*sr)),
          cr=Math.cos(w)*dc,ci=Math.sin(w)*dc;
    let zr=0,zi=amp,j=(Math.random()*m)|0;
    for(let i=0;i<len;i++){
      d[at+i]+=t[j]*zi;j=(j+1)&m;
      const nr=zr*cr-zi*ci;zi=zr*ci+zi*cr;zr=nr;
    }
  }
  /* gusting. Periods of 8, 4 and 8/3 seconds all close over the loop. */
  for(let i=0;i<N;i++){
    const tt=i/sr;
    d[i]*=0.80+0.13*Math.sin(2*Math.PI*tt/8)+0.07*Math.sin(2*Math.PI*tt/4+1.1)
              +0.05*Math.sin(2*Math.PI*tt*3/8+2.3);
  }
  const out=_loopify(d,n,xf);_norm(out,heavy?0.82:0.70);
  return _toBuf(out,sr);
}

/* ---- wind ---------------------------------------------------------
   A body of lowpassed noise with three resonances riding over it. The
   resonances sit still and their levels wander; sweeping a filter would be
   more literal and a great deal harder to loop. */
function _windBed(sr,bliz){
  const sec=10,xf=Math.round(sr*1.1),n=Math.round(sec*sr),N=n+xf;
  const d=new Float32Array(N);
  _add(d,_band(N,'lp',bliz?1400:820,0.6,sr),bliz?0.42:0.34);
  const F=bliz?[700,1180,1900]:[300,540,830],Q=bliz?5.0:3.6,PER=[10,5,10/3];
  for(let k=0;k<3;k++){
    const b=_band(N,'bp',F[k],Q,sr),per=PER[k],g=bliz?0.30:0.22;
    for(let i=0;i<N;i++)
      d[i]+=b[i]*g*(0.5+0.5*Math.sin(2*Math.PI*(i/sr)/per+k*2.1));
  }
  _add(d,_band(N,'bp',bliz?5000:3600,0.9,sr),bliz?0.13:0.05);   /* grit, blown snow */
  for(let i=0;i<N;i++){
    const tt=i/sr;
    d[i]*=(bliz?0.72:0.80)+0.18*Math.sin(2*Math.PI*tt/10)
          +0.10*Math.sin(2*Math.PI*tt/5+0.7)
          +(bliz?0.09:0.05)*Math.sin(2*Math.PI*tt*3/10+1.9);
  }
  const out=_loopify(d,n,xf);_norm(out,bliz?0.86:0.72);
  return _toBuf(out,sr);
}

/* ---- thunder ------------------------------------------------------
   Distance is the whole difference between the two: the near one keeps its
   crack and its top end, the far one has lost both to the air on the way and
   arrives as roll. */
function _thunder(sr,near){
  const sec=near?3.6:5.0,n=Math.round(sec*sr);
  const d=new Float32Array(n),body=_noise(n);
  _biq(body,'lp',near?190:74,0.8,sr);
  _biq(body,'lp',near?260:110,0.7,sr);
  const roll=_wander(n,near?7:4,sr),tau=(near?1.05:2.2)*sr,onset=(near?0.02:0.28)*sr;
  for(let i=0;i<n;i++)
    d[i]=body[i]*(i<onset?i/onset:1)*Math.exp(-(i-onset)/tau)*(0.45+0.75*roll[i]);
  if(near){                                      /* the crack, only up close */
    const cl=Math.round(0.10*sr),c=_noise(cl);
    _biq(c,'hp',820,0.7,sr);_biq(c,'bp',1500,0.5,sr);
    const dc=Math.exp(-1/(0.016*sr));let g=1.5;
    for(let i=0;i<cl;i++){d[i]+=c[i]*g;g*=dc;}
  }else _biq(d,'lp',150,0.7,sr);                 /* far thunder has no edges left */
  _norm(d,near?0.95:0.72);
  return _toBuf(d,sr);
}

/* ---- 这里原来还有一段木工敲击（_woodWork，四秒的工地，ping 从里面随机切一小段
   出来）。只被 ping 用，ping 没了就拆了 —— 合成它要真的算一遍波形，留着是白算。
   lara 2026-08-26 要求去掉建塔和拆塔的音效。要找回来看 yingxian-v6-preview.html。

   同一批拆掉的还有 _templeBell（十组非谐模态各带一对失谐做出摆音）。它 2026-08-27
   回来了，因为下面那张风铎的床要用它 —— 一口钟的模态表就是一枚铃的模态表，
   差的只是基频和衰减快慢。 */

/* ---- 一枚铃 ------------------------------------------------------
   非谐模态叠加。铃跟弦不一样：分音不是基频的整数倍，而是一组固定比例
   （嗡音 0.5、基音 1、小三度 1.19、五度 1.5、名义音 2，再往上是几个高次
   非谐音），每一个自己衰减，低的拖得长、高的掉得快。所以它合成得出来，
   而古琴合成不出来 —— 拨弦的那一下是噪声和指甲的摩擦，模态叠加做不到，
   这也是原来那段古琴用录音的原因。

   每个模态拆成一对相差千分之三的失谐分音：真铃壁厚不均匀，同一个模态在
   两个方向上频率略不同，两者打拍就是铃声里那种缓慢的摆音（beating）。
   少了它，合成铃听起来是电子琴。

   f0 给 523（C5）当参照，实际音高在铺床的时候用重采样改 —— 变速同时改了
   衰减长短，而这正好是对的：小铃音高、余音短，大铃音低、余音长。 */
function _bell(sr,f0,tscale){
  const sec=2.6*tscale,n=Math.round(sec*sr),d=new Float32Array(n);
  /*        比例    振幅   衰减秒（乘 tscale） */
  /* 衰减比大钟短得多：风铎是巴掌大的铜铃，嗡音一秒多就没了。第一版照大钟给了
     2.3 秒，量出来的结果是谱子里写的四秒空白根本不存在 —— 余音把它填满了，
     整段糊成一片持续的 pad。缩到 1.4 才有真的空白。 */
  const P=[[0.500,0.42,1.40],[1.000,0.85,1.05],[1.190,0.46,0.78],[1.500,0.26,0.60],
           [2.000,0.44,0.50],[2.530,0.19,0.34],[3.040,0.14,0.25],[3.880,0.10,0.18],
           [5.420,0.06,0.12],[7.100,0.04,0.08]];
  for(let k=0;k<P.length;k++){
    const r=P[k][0],a=P[k][1]*0.5,T=P[k][2]*tscale;
    /* 一对失谐，相位各自随机 —— 相位对齐的话十个模态会在开头叠出一个爆音 */
    for(let sd=0;sd<2;sd++)
      _mode(d,0,n,f0*r*(sd?1.0031:0.9971),a,T,sr,Math.random()*6.28);
  }
  /* 舌头打在铃口上的那一下。风铎是被风吹动铃舌敲响的，不是槌击，
     所以只有清脆的一小声，没有大钟那种低频闷响。 */
  const cl=Math.round(0.028*sr),c=_noise(cl),cdc=Math.exp(-1/(0.0032*sr));
  _biq(c,'bp',3100,1.1,sr);
  let g=0.34;
  for(let i=0;i<cl;i++){d[i]+=c[i]*g;g*=cdc;}
  const ai=Math.round(0.002*sr);
  for(let i=0;i<ai;i++)d[i]*=i/ai;              /* 第 0 个采样上不留咔嗒 */
  _norm(d,0.92);
  return d;
}

/* ---- 风铎 —— 曾经的背景音乐，现在没有 style 指向它 ----------------
   2026-08-27 下午 lara 换成了 Pixabay 上的《空山箫语》(music_xiao)，
   见文件头那段声音说明。这张床留着：代码不占字节，__musicDbg() 还在量
   它。想换回来，把 STYLES[0].aud.music 改回 'music_feng' 就行。

   下面是它当初为什么在的理由，原样留着 ——

   lara 2026-08-27 上午：「背景音乐能不能不要古琴的，换一个音乐。」

   换成塔自己的声音：木塔每层屋角挂风铎（铜铃），风一过就响。这不是我从
   「古风」库里挑的音色 —— 它在这座塔上，而且已经在这个作品的文字里了：
   其四讲唐山地震那段，说的就是「所有屋角的风铎大响一分钟，木塔安然无恙」。
   古琴是「中国古代」这个抽象概念的音色；风铎是这一座建筑的音色。

   为什么不用录音：古琴那段是 1934 年的百代唱片，一段 285KB 的 base64，
   占这个文件将近六分之一。合成的床是 0 字节，而且能真正无缝循环 —— 录音
   剪的循环点总能听出来。铃又恰好是合成得最像的一类音色（见 _bell）。

   写成一段谱子而不是随机撒点：随机撒出来的是音效，不是音乐。十一记铃，
   G 五声（G-A-C-D-E，商调式的骨架），疏密不均，中间留两处真正的空白 ——
   空白是这段听起来宽的原因。低频那层是塔里的空气：两个很轻的正弦（G 的
   基音和五度）加一层低通噪声，音量压到几乎听不见，它只负责让铃有个落处，
   一旦听得出是个合成器的 pad 就错了。

   循环三十秒。所有调制周期都能整除 30，末尾一段折回开头（_loopify），
   所以最后几记铃的余音正好盖在接缝上，接不出缝来。 */
function _bellBed(sr){
  const sec=30,xf=Math.round(sr*2.2),n=Math.round(sec*sr),N=n+xf;
  const d=new Float32Array(N);

  /* 一 · 塔里的空气。低通噪声 + 两个正弦，全部很轻。 */
  /* 三个数都压到刚好听得见。第一版给的是 0.085 / 0.030 / 0.020，量出来最低的
     一成格子还有峰值的 11%，也就是说这一层一直在响，谱子里的空白听不出来。
     现在的目标是地板落到 5% 上下：在，但要静下来才听见。 */
  const air=_band(N,'lp',210,0.6,sr);
  _add(d,air,0.040);
  _mode(d,0,N,98.0,0.015,1e6,sr,0.7);          /* G2，衰减给到无限长就是持续音 */
  _mode(d,0,N,146.8,0.010,1e6,sr,2.3);         /* 上面那个五度 D3 */
  for(let i=0;i<N;i++){                        /* 让空气有呼吸，周期整除 30 */
    const tt=i/sr;
    d[i]*=0.80+0.14*Math.sin(2*Math.PI*tt/15)
              +0.06*Math.sin(2*Math.PI*tt/10+1.1);
  }

  /* 二 · 十一记铃。谱子写死，不随机 —— 随机是音效，写死才是音乐。
     [起拍秒, 音高Hz, 音量]。音高全在 G 五声里：G4 392 / A4 440 / C5 523 /
     D5 587 / E5 659 / G5 784 / A5 880。 */
  const REF=523.25;
  const base=_bell(sr,REF,1.0);
  const SCORE=[
    [ 0.60, 523, 0.95],
    [ 3.20, 392, 0.58],
    [ 5.90, 587, 0.82],
    [ 6.85, 659, 0.30],   /* 紧跟一记轻的：隔壁那个屋角的铃也被同一阵风带响了 */
    [10.40, 440, 0.68],
    [13.10, 784, 0.44],
                          /* —— 这里空四秒 —— */
    [17.30, 523, 0.86],
    [19.60, 392, 0.52],
    [20.45, 880, 0.24],
    [23.80, 587, 0.72],
                          /* —— 再空三秒半 —— */
    [27.40, 440, 0.62]
  ];
  for(let k=0;k<SCORE.length;k++){
    const at=Math.round(SCORE[k][0]*sr),
          rate=SCORE[k][1]/REF,               /* 重采样改音高，衰减跟着一起改 */
          g=SCORE[k][2];
    /* 尾巴允许长到 N（超出 n 的那截会被 _loopify 折回开头），但不能越界 */
    for(let j=0;at+j<N;j++){
      const sp=j*rate, i0=sp|0;
      if(i0+1>=base.length)break;
      const fr=sp-i0;
      d[at+j]+=(base[i0]*(1-fr)+base[i0+1]*fr)*g;
    }
  }

  const out=_loopify(d,n,xf);_norm(out,0.80);
  return _toBuf(out,sr);
}


/* ------------------------------------------------------------------ *
 * 10b-2.  木头的声音 —— 营造、落架、倾斜、点注
 *
 * lara 2026-08-27 傍晚要的五处：其一营造要有搭建声，其五落架大修要有拆和
 * 装的声，其一其三点注释要有声，其二珍藏每枚注释要木鱼或颂钵，其四倾斜
 * 要有木构倾斜的声。
 *
 * 得先说清楚一件事：2026-08-26 她说过「塔装起来和拆除的音效都很奇怪，都不要
 * 吧」，那一版整条链当天就拆了（见 applyTime 里留的注）。今天要回来的是同一
 * 个位置上的声音，所以先弄清上一版为什么怪，别照原样再做一遍。
 *
 * 上一版怪在哪：它是 ping() —— 每跨一个阶段敲一声木工，六个阶段六声，最后
 * 一声换成钟。四点四秒里六记大致等距的敲击，那不是工地，那是节拍器；而结尾
 * 那一记钟是游戏里的过关音。声音挂在「状态跨界」上，可塔不是一段一段跳着长
 * 的，它是连续长的。事件式的音效配连续的动作，永远对不上。
 *
 * 这一版反过来：声音是一张连续的床，音量跟着动作的速度走（wdSet 每帧被
 * 驱动方喂一次，没人喂就自己落回静音）。塔长得快就响，长得慢就轻，
 * buildHeightAt 每段尾部留的那 7% 停顿于是自己变成了呼吸 —— 一层一层往上，
 * 每层收一下。没有一记声音是钉在时间点上的，也没有过关音。
 *
 * 唯一保留的离散声音是其五那个「榫口不合」：那里确实发生了一件离散的事
 * （榫头进不去），而且它是整章的论据。一记干的、不带余音的木头闷响，然后
 * 什么都没有 —— 不是失败提示音，是一次没成功的安装。
 *
 * 全部合成，零字节。这个文件已经因为那段背景音乐涨到 3.9 MB，再往里塞采样
 * 就不用发了。木头恰好也是合成得起来的一类：吱嘎的本体是滑-粘（stick-slip），
 * 一次次咬住再放开，那是一串不规则的锯齿包络乘在窄带噪声上，能写下来。
 * 敲击是几个衰减很快的模态加一小撮噪声，也能写下来。
 * ------------------------------------------------------------------ */

/* 一记吱嘎。窄带噪声过两道 bp（第二道随机偏一点，等于给共振一个宽度），
   再乘一串不规则的滑-粘锯齿。rough 是每秒咬放几次：低了是一声长呻吟，
   高了是一串急促的咯吱。 */
function _creakInto(dst,at,sr,f0,dur,rough,amp){
  const n=Math.round(dur*sr);
  if(at+n>dst.length)return;
  const d=_noise(n);
  _biq(d,'bp',f0,7.0,sr);
  _biq(d,'bp',f0*(0.84+Math.random()*0.34),4.5,sr);
  /* 滑-粘。每一粒：陡起、二次曲线落下，粒长和粒间距都不规则 —— 规则了
     就成了颤音（tremolo），那是电子音而不是木头。 */
  let i=0;
  while(i<n){
    const gl=Math.max(4,Math.round(sr*(0.007+Math.random()*0.055))),
          a=(0.22+Math.random()*0.78)*amp;
    for(let k=0;k<gl&&i+k<n;k++){
      const p=k/gl;
      dst[at+i+k]+=d[i+k]*a*(1-p)*(1-p);
    }
    i+=gl+Math.round(sr*Math.random()*(1.4/rough));
  }
}
/* 一记敲击。木头被敲是几个衰减极快的模态（比例不成整数，木料是各向异性的）
   加一小撮宽带噪声当接触瞬间。tau 越短越干，bright 抬高噪声那一撮。 */
function _knockInto(dst,at,sr,f0,tau,amp,bright){
  const n=Math.round(Math.min(0.9,tau*7)*sr);
  if(at+n>dst.length)return;
  const P=[[1.000,1.00],[1.870,0.52],[2.630,0.30],[4.210,0.16],[6.080,0.09]];
  const tmp=new Float32Array(n);
  for(let k=0;k<P.length;k++)
    _mode(tmp,0,n,f0*P[k][0]*(0.995+Math.random()*0.01),
          P[k][1]*amp*0.5,tau/(1+k*0.55),sr,Math.random()*6.28);
  const cl=Math.round(0.006*sr),c=_noise(cl),cdc=Math.exp(-1/(0.0011*sr));
  _biq(c,'bp',f0*3.4,0.9,sr);
  let g=amp*(bright||0.5);
  for(let i=0;i<cl;i++){tmp[i]+=c[i]*g;g*=cdc;}
  const ai=Math.round(0.0015*sr);
  for(let i=0;i<ai;i++)tmp[i]*=i/ai;
  for(let i=0;i<n;i++)dst[at+i]+=tmp[i];
}

/* ---- 三张床 -------------------------------------------------------
   都是循环的，音量由 wdSet 每帧驱动。周期都能整除床长，末尾折回开头
   （_loopify），和风铎那张床同一套做法。

   为什么是三张而不是一张调音色：拆和装的差别不在亮度上，在事件的密度和
   低频的量上 —— 拆是往下落，有重物着地；装是往上抬，只有就位。用一张床
   加滤波器做不出这个差别，加两组事件反而更省事，代码也说得清。 */

/* 营造。工地：木料互相敲、榫头进位、脚手架吃力。低频那一层是场地的空气，
   压得很轻，只负责让敲击有个落处。 */
function _workBed(sr){
  const sec=6,xf=Math.round(sr*0.85),n=Math.round(sec*sr),N=n+xf;
  const d=new Float32Array(N);
  _add(d,_band(N,'lp',300,0.6,sr),0.030);            /* 场地的空气 */
  /* 敲击。每秒两三记，音高散在木料的尺寸范围里（越粗的料敲起来越低）。
     基音都落在 E♭ 上及其八度、五度 —— 敲击是宽带的，本来听不出调，但把
     主模态放在背景音乐的调上，成群响起来时不会和它顶。空山箫语量出来是
     E♭ 羽调五声（见文件头），E♭2 77.8 / E♭3 155.6 / B♭2 116.5。 */
  const K=Math.round(2.6*(sec+1));
  for(let k=0;k<K;k++){
    const at=(Math.random()*N)|0,
          f=[77.8,116.5,155.6,207.7][(Math.random()*4)|0]*(0.94+Math.random()*0.13);
    _knockInto(d,at,sr,f,0.030+Math.random()*0.055,
               0.30+Math.random()*0.42,0.42+Math.random()*0.3);
  }
  /* 吱嘎。榫头挤进去的时候木料在叫。 */
  const C=Math.round(1.3*(sec+1));
  for(let k=0;k<C;k++)
    _creakInto(d,(Math.random()*N)|0,sr,
               240+Math.random()*520,0.28+Math.random()*0.55,
               9+Math.random()*13,0.20+Math.random()*0.22);
  const out=_loopify(d,n,xf);_norm(out,0.86);
  return _toBuf(out,sr);
}

/* 落架。同样是工地，但方向相反：构件往下走，所以多一层低频的滚动，敲击
   换成落地的闷响（音高更低、衰减更长），吱嘎更密 —— 拆一个咬了九百年的
   榫头，木头是要叫的。 */
function _stripBed(sr){
  const sec=6,xf=Math.round(sr*0.85),n=Math.round(sec*sr),N=n+xf;
  const d=new Float32Array(N);
  _add(d,_band(N,'lp',180,0.7,sr),0.055);            /* 往下滚的那一层 */
  const K=Math.round(1.8*(sec+1));
  for(let k=0;k<K;k++){
    const at=(Math.random()*N)|0,
          f=[58.3,77.8,103.8,116.5][(Math.random()*4)|0]*(0.93+Math.random()*0.15);
    _knockInto(d,at,sr,f,0.075+Math.random()*0.13,
               0.34+Math.random()*0.48,0.26+Math.random()*0.22);
  }
  const C=Math.round(2.1*(sec+1));
  for(let k=0;k<C;k++)
    _creakInto(d,(Math.random()*N)|0,sr,
               170+Math.random()*430,0.40+Math.random()*0.85,
               6+Math.random()*10,0.24+Math.random()*0.26);
  const out=_loopify(d,n,xf);_norm(out,0.88);
  return _toBuf(out,sr);
}

/* 倾斜。这张床上没有工地 —— 没有人在动它，是它自己在受力。只有滑-粘：
   长、低、疏，一处咬住半秒才放开。八分之七的时间几乎是静的，音量由倾斜
   的速度驱动，手停了它就停。 */
function _leanBed(sr){
  const sec=7,xf=Math.round(sr*1.0),n=Math.round(sec*sr),N=n+xf;
  const d=new Float32Array(N);
  _add(d,_band(N,'lp',130,0.7,sr),0.022);
  const C=Math.round(1.05*(sec+1));
  for(let k=0;k<C;k++)
    _creakInto(d,(Math.random()*N)|0,sr,
               120+Math.random()*300,0.55+Math.random()*1.25,
               3.5+Math.random()*6,0.26+Math.random()*0.30);
  /* 两三记很低的、几乎听不出音高的呻吟，垫在下面 —— 六万吨木料换个姿势，
     响的不只是接头。 */
  for(let k=0;k<3;k++)
    _mode(d,(Math.random()*(N-sr*2))|0,Math.round(sr*1.8),
          38+Math.random()*26,0.055,0.75,sr,Math.random()*6.28);
  const out=_loopify(d,n,xf);_norm(out,0.80);
  return _toBuf(out,sr);
}

/* ---- 三记一次性的声音 ---------------------------------------------- */

/* 点注释：指节敲在木头上。干、短、轻。这是界面音，界面音的本分是几乎
   听不见 —— 听见了就成了提示音。 */
function _tapWood(sr){
  const n=Math.round(0.30*sr),d=new Float32Array(n);
  _knockInto(d,0,sr,311.1,0.026,0.9,0.55);
  _tail(d,0.35);_norm(d,0.85);
  return _toBuf(d,sr);
}
/* 其五「榫口不合」：一记进不去的安装。和上面那记敲的区别全在余音上 ——
   这一记的模态衰减压到极短，撞完就死，没有回响。木头咬住了不动，声音
   也就到此为止。这是全篇唯一一记钉在事件上的音效，因为那里确实有一件
   离散的事发生（而且没成功）。 */
function _jamKnock(sr){
  const n=Math.round(0.42*sr),d=new Float32Array(n);
  _knockInto(d,0,sr,103.8,0.019,0.95,0.30);
  _knockInto(d,Math.round(0.055*sr),sr,97.2,0.014,0.5,0.22);
  _tail(d,0.30);_norm(d,0.90);
  return _toBuf(d,sr);
}
/* 其四那两格（1305 怀仁地震、1926 军阀炮击）的一记。
   刻意不做地震的轰鸣，也不做炮声：这一页的主角是塔，不是那场地震或那场
   战斗。响的是塔的反应 —— 一道低频的开裂，加上木架被撞之后的余振。
   （lnPush 的 jolt 曲线本来就是 1-e^-4.5x·cos8x，塔在画面上也在振，
   声音和它是同一件事的两个通道。） */
function _crackLow(sr){
  const n=Math.round(1.5*sr),d=new Float32Array(n);
  const cl=Math.round(0.05*sr),c=_noise(cl),cdc=Math.exp(-1/(0.010*sr));
  _biq(c,'bp',150,0.8,sr);
  let g=0.85;
  for(let i=0;i<cl;i++){d[i]+=c[i]*g;g*=cdc;}
  /* 撞完之后的余振：三个低模态，衰减半秒到一秒 */
  _mode(d,0,n,46,0.22,0.95,sr,0.3);
  _mode(d,0,n,77.8,0.16,0.62,sr,1.9);
  _mode(d,0,n,131,0.09,0.38,sr,4.1);
  /* 一小段吱嘎跟在后面 —— 撞过之后接头在找新的位置 */
  _creakInto(d,Math.round(0.16*sr),sr,210,0.70,5,0.30);
  const ai=Math.round(0.0012*sr);
  for(let i=0;i<ai;i++)d[i]*=i/ai;
  _tail(d,0.30);_norm(d,0.92);
  return _toBuf(d,sr);
}
/* 其二珍藏：磬。
   lara 说「木鱼或者颂钵」。取磬 —— 颂钵那一路乐器在汉地佛寺里的本名就是
   磬（钵形，槌击，余音长），而这一章讲的是辽代的佛坛、塑像和《契丹藏》，
   用汉传的名字和汉传的器物对得上。木鱼是另一路：木鱼是打拍子的，短促、
   成串，适合念诵不适合看一件藏品。想换的话见下面 QING 那张表的注。

   合成上磬和铃是同一套（模态叠加，见 _bell），差别在三处：分音比例更疏
   （钵体的模态间距比铃宽）、衰减长四五倍、失谐给到能听出慢拍 —— 一只好磬
   敲下去会有每秒一次上下的涌动，那是两个相差千分之几的模态在打拍。 */
function _qing(sr,f0){
  /* 4.2 秒的 buffer 配 2.2 秒的基音衰减：sfx() 会在后三成（2.94 秒起）上自己
     淡出一遍，_tail 再淡一遍，两道叠起来，余音大约三秒收干净。第一版是 3.4 秒
     配 2.6 秒，量出来到 buffer 末尾还剩两成七 —— 那不是余音收了，那是被切了。 */
  const sec=4.2,n=Math.round(sec*sr),d=new Float32Array(n);
  /*        比例    振幅   衰减秒 */
  const P=[[1.000,1.00,2.20],[2.740,0.46,1.35],[5.120,0.24,0.85],
           [8.360,0.13,0.55],[12.10,0.07,0.34]];
  for(let k=0;k<P.length;k++){
    const r=P[k][0],a=P[k][1]*0.42,T=P[k][2];
    /* 失谐给到 ±0.13%：在 311 Hz 上是每秒零点八次的慢拍，正好是磬那种
       会呼吸的余音。给到 _bell 的 ±0.3% 就成了每秒两次，听着像走音。 */
    for(let sd=0;sd<2;sd++)
      _mode(d,0,n,f0*r*(sd?1.0013:0.9987),a,T,sr,Math.random()*6.28);
  }
  /* 槌头是包布的木槌，接触声很闷，只留一点点 */
  const cl=Math.round(0.014*sr),c=_noise(cl),cdc=Math.exp(-1/(0.0022*sr));
  _biq(c,'bp',f0*2.2,1.4,sr);
  let g=0.12;
  for(let i=0;i<cl;i++){d[i]+=c[i]*g;g*=cdc;}
  const ai=Math.round(0.003*sr);
  for(let i=0;i<ai;i++)d[i]*=i/ai;
  _tail(d,0.22);_norm(d,0.90);
  return _toBuf(d,sr);
}
/* 四枚磬的音高，按塔的层数从低到高。
   音阶取 E♭ 羽调五声（E♭-G♭-A♭-B♭-D♭）—— 这是量出来的，不是猜的：背景音乐
   《空山箫语》做过一遍 chroma，十二个音里 E♭ 最强，其余四个强音正好凑成
   E♭ 上的五声（见文件头那段声音说明）。磬和音乐同调，点注释的时候不会顶。
   顺序对着正文那句「从一层的七佛到五层的九位，顺着楼梯拜上去，是一条排好
   顺序的礼佛路线」：一层最低，五层最高，一路点上去就是那条路线。
   （编号不是这个顺序 —— 签上的数字按数组排，音高按层数排。数字是索引，
   音高是位置，两件事。）
   换木鱼的话：把 QING 整张表换成一个音，_qing 换成 _knockInto（f0 约
   420、tau 0.012、bright 0.25），木鱼是无音高的短促响板，不该有五声。 */
const QING=[311.13,369.99,415.30,466.16];      /* E♭4 G♭4 A♭4 B♭4 */

const SYNTH={
  rain_bed:    function(sr){return _rainBed(sr,false);},
  storm_bed:   function(sr){return _rainBed(sr,true);},
  snow_wind:   function(sr){return _windBed(sr,false);},
  snow_bliz:   function(sr){return _windBed(sr,true);},
  thunder_near:function(sr){return _thunder(sr,true);},
  thunder_far: function(sr){return _thunder(sr,false);},
  music_feng:  _bellBed,
  /* 第 10b-2 节。三张床 + 三记一次性的 + 四枚磬 */
  wood_work:   _workBed,
  wood_strip:  _stripBed,
  wood_lean:   _leanBed,
  tap_wood:    _tapWood,
  jam_knock:   _jamKnock,
  crack_low:   _crackLow,
  qing_0:      function(sr){return _qing(sr,QING[0]);},
  qing_1:      function(sr){return _qing(sr,QING[1]);},
  qing_2:      function(sr){return _qing(sr,QING[2]);},
  qing_3:      function(sr){return _qing(sr,QING[3]);}
};
const _SYN={};
function synthBuf(key){
  if(_SYN[key])return _SYN[key];
  const f=SYNTH[key];
  if(!f)return null;
  try{return _SYN[key]=f(ensureCtx().sampleRate);}catch(e){return null;}
}

/* ------------------------------------------------------------------ *
 * 10c.  麻燕 — the calls
 *
 * Seven single screams, cut out of two field recordings of Apus apus and
 * credited at the head of this file.
 *
 * An earlier pass built them instead, out of two detuned saws under a
 * bandpass, and that version measured right: a swift's scream really is
 * all shriek and no body, and the synthetic one put its energy in the
 * same 4–6 kHz band the recordings do. What it could not reach was the
 * grain — a real scream is ragged in a way two oscillators are not.
 *
 * They are placed, not just played. Every call picks a bird that is
 * actually on screen, projects it, and pans and attenuates to where that
 * bird is, so a scream off to the left has a bird off to the left making
 * it.
 * ------------------------------------------------------------------ */
const SWIFT_CLIPS=['swift_a','swift_b','swift_c','swift_d','swift_e','swift_f','swift_g'];
/* the clips are normalised to a common peak, which lands about a third above
   what the caller's vol was scaled for. Matched on RMS rather than on peak:
   a scream is short, and the ear hears its body rather than its spike. */
const SWIFT_TRIM=0.72;
function swiftCall(when,pan,vol,len,tone){
  if(!actx||!birdBus)return;
  /* only clips that are already decoded. A call is scheduled for a moment a
     fraction of a second away; there is nowhere here to wait on a promise. */
  const R=[];
  for(let i=0;i<SWIFT_CLIPS.length;i++){const b=_buf[SWIFT_CLIPS[i]];if(b)R.push(b);}
  if(!R.length)return;
  const bb=R[(Math.random()*R.length)|0],
        rate=Math.max(0.80,Math.min(1.45,tone)),
        v=Math.max(0.0004,vol*SWIFT_TRIM),
        full=bb.duration/rate,
        L=Math.min(full,Math.max(0.18,len));
  const g=actx.createGain();
  g.gain.setValueAtTime(v,when);
  /* the caller asks for a length and a bird really does cut a scream short, so
     when the clip outlasts the ask it gets closed down rather than left to run */
  if(L<full-0.02){
    g.gain.setValueAtTime(v,when+Math.max(0.02,L-0.06));
    g.gain.exponentialRampToValueAtTime(0.0004,when+L);
  }
  if(actx.createStereoPanner){
    const pn=actx.createStereoPanner();
    pn.pan.value=Math.max(-1,Math.min(1,pan));
    g.connect(pn);pn.connect(birdBus);
  }else g.connect(birdBus);
  const src=actx.createBufferSource();
  src.buffer=bb;src.playbackRate.value=rate;
  src.connect(g);
  src.start(when);src.stop(when+L+0.05);
}

/* pick a bird that is on screen and report where it is in the frame */
const _swV=new T.Vector3();
function swiftPick(){
  const live=Math.round(SWIFT_N*swiftK);
  if(live<1)return null;
  for(let k=0;k<8;k++){
    swiftMesh.getMatrixAt(Math.floor(Math.random()*live),_sm);
    _swV.setFromMatrixPosition(_sm);
    const d=_swV.distanceTo(camera.position);
    _swV.project(camera);
    if(_swV.z<-1||_swV.z>1||Math.abs(_swV.x)>1.2)continue;
    /* stretched past the true projection on purpose: at an 11-degree lens the
       whole flock lands inside the middle third of the frame, and a stereo
       image that narrow is not an image. Same bargain as drawing the birds
       three times life size. */
    return {pan:Math.max(-0.92,Math.min(0.92,_swV.x*1.45)),d:d};
  }
  return null;
}
/* Swifts do not call on a metronome. They go quiet, then a group comes round
   the eaves screaming over each other and it goes quiet again. So this
   schedules waves, and the gaps between them stretch as the flock thins out
   towards dusk. */
let _swNext=0;
function stepSwiftAudio(){
  if(!soundOn||!actx||actx.state!=='running'||swiftK<=0.01)return;
  const now=actx.currentTime;
  if(now<_swNext)return;
  const n=1+Math.floor(Math.random()*Math.max(1,Math.round(swiftK*6))),
        spread=0.22+Math.random()*1.15;
  for(let k=0;k<n;k++){
    const p=swiftPick();
    if(!p)continue;
    /* the camera sits 80 units out and the flock orbits within about 6, so
       there is only ~12 units of depth to work with — but that is exactly the
       near/far difference the flock already draws, now heard as well as seen */
    const near=Math.max(0,Math.min(1,(84-p.d)/11));
    swiftCall(now+0.05+Math.random()*spread, p.pan,
              (0.030+0.145*near)*(0.60+Math.random()*0.70),
              0.26+Math.random()*0.46,
              0.90+near*0.20+Math.random()*0.16);
  }
  _swNext=now+spread+(0.75+Math.random()*2.35)/Math.max(0.25,swiftK);
}

/* two weather beds: the state's own ambience, and the blizzard blowing over
   the top of it so the storm can rise and fall without a hard cut */
const ambBed=makeLayer(),ambBliz=makeLayer();
function syncWeatherAudio(fade){
  if(!actx)return;
  const w=WEATHER[wxIdx];
  layerPlay(ambBed,w.amb,w.ambV||0,fade);
  layerPlay(ambBliz,w.id==='SNOW'?'snow_bliz':null,0.0001,fade);
}
let _bzV=-1;
function stepWeatherAudio(){
  if(!actx||!ambBliz.gain)return;
  const v=blizK*0.62;
  if(Math.abs(v-_bzV)>0.02){_bzV=v;layerVol(ambBliz,Math.max(0.0001,v),0.9);}
}
function styleAud(){return STYLES[styleIdx].aud;}
/* ------------------------------------------------------------------ *
 * 10d.  木头那三张床怎么被驱动
 *
 * 一条规则：每帧由正在做动画的那一方喂一次 wdSet(kind,level)，帧末
 * stepWoodAudio 把它应用掉再清零。没人喂 → 目标是 0 → 自己淡出。
 *
 * 这么写是为了不用维护状态机。这个页面里「塔在动」有五个入口（营造自动播、
 * 拖时间轴、其五落架自动播、其四拖倾斜、其四按格跳），每个都有自己的暂停
 * 和复位路径；要是靠 start/stop 配对，漏掉任何一条就是一张床永远响着。
 * 清零式的驱动把「有没有在动」这件事变成每帧重新回答一次，漏不掉。
 *
 * 也正好解决了 quietTime 那个老需求（见它上面的注）：复位是跳时间，不是
 * 播动画，跳的那一帧根本没人喂，所以是静的 —— 不用为它写特例。
 * ------------------------------------------------------------------ */
const wdBed={work:makeLayer('wd'),strip:makeLayer('wd'),lean:makeLayer('wd')};
const WD_KEY={work:'wood_work',strip:'wood_strip',lean:'wood_lean'};
let wdTgt={work:0,strip:0,lean:0},wdLvl={work:0,strip:0,lean:0};
function wdSet(kind,lvl){
  if(wdTgt[kind]===undefined)return;
  if(lvl>wdTgt[kind])wdTgt[kind]=Math.min(1,lvl);
}
/* 立刻收掉一张床，不等它自己淡。
   自然衰减的时间常数是 0.38 秒左右，走完要将近两秒 —— 大部分时候这是对的
   （木头停止受力之后余音还在），但其五有两个地方需要真的静下来：
   「唯余台基」那一秒和「榫口不合」那一记之后。量过：不收的话，进「唯余台基」
   的那一刻拆的声音还有八成，0.75 秒的停顿走完还剩一成四，那一格从头到尾
   都在响 —— 而这一格的全部重量就在「空台基站在保护棚里」这件事上。 */
function wdCut(kind,ramp){
  wdLvl[kind]=0;wdTgt[kind]=0;
  const L=wdBed[kind];
  if(L&&L.key&&actx)layerVol(L,0.0001,ramp||0.30);
}
function stepWoodAudio(dt){
  if(!actx||!wdBus)return;
  const k=Math.min(1,dt*7);
  for(const kind in wdTgt){
    const tg=wdTgt[kind];
    wdTgt[kind]=0;                       /* 下一帧要重新被喂才算在动 */
    const cur=wdLvl[kind];
    /* 起来得快、落下得慢：木头停止受力之后余音还在，硬切听着像拔了插头 */
    const nv=cur+(tg-cur)*(tg>cur?k:Math.min(1,dt*2.6));
    if(Math.abs(nv-cur)<0.004&&nv<0.005){wdLvl[kind]=0;continue;}
    wdLvl[kind]=nv;
    const L=wdBed[kind];
    if(nv>0.006){
      if(L.key!==WD_KEY[kind])layerPlay(L,WD_KEY[kind],Math.max(0.0001,nv),0.25);
      else layerVol(L,Math.max(0.0001,nv),0.09);
    }else if(L.key){layerPlay(L,null,0,0.35);}
  }
}
/* 营造那一段的速度。CLIP.constant 是塔已经长到多高（单位不是米，是模型单位，
   满高 13.9），除以一个量出来的峰值速度当归一化。只在 playing 为真时喂 ——
   __seek 和 quietTime 都是 playing=false 的跳时间，不该出声。 */
let _bhPrev=-1;
const WD_BUILD_V=5.2;                    /* 量出来的峰值 dh/dt，见 __woodDbg */
function driveBuild(dt){
  const h=CLIP.constant;
  if(_bhPrev<0){_bhPrev=h;return;}
  const v=(h-_bhPrev)/Math.max(dt,1e-3);
  _bhPrev=h;
  if(v<=0.02)return;                     /* 段尾那 7% 的停顿：真的停 */
  /* 开方而不是线性：起手那一下和收尾那一下的速度差三倍，线性映射会让
     后面几层几乎听不见，可它们才是料最多的几层 */
  wdSet('work',Math.min(1,Math.sqrt(v/WD_BUILD_V))*0.92);
}
function resetBuildAudio(){_bhPrev=-1;}
/* 其五落架/归安。用的还是 dh/dt，理由和营造一样：落架那段动画就是营造的
   时间轴倒着放，buildHeightAt 每段尾部的 7% 停顿照样在里面，「一层一层拆、
   每层停一下」的节奏不用另写，声音跟着速度走就自动有了。
   归安（up）比拆（down）慢 0.62 倍，所以同一个映射下它自然更轻 —— 装比拆
   小心，这一点不用调参数，速度已经说了。 */
let _shPrev=-1;
function driveStrip(dt,kind){
  const h=CLIP.constant;
  if(_shPrev<0){_shPrev=h;return;}
  const v=Math.abs(h-_shPrev)/Math.max(dt,1e-3);
  _shPrev=h;
  if(v<=0.02)return;
  wdSet(kind,Math.min(1,Math.sqrt(v/WD_BUILD_V))*0.95);
}
function resetStripAudio(){_shPrev=-1;}
/* 其四的倾斜速度。用 lnPush 算出来的塔顶偏移（毫米）做差 —— 拖手指和按格
   跳走的是同一个量，所以一条路管两种驱动，不用分辨是谁在动它。 */
let _lnCp=0,_lnCpPrev=0;
function driveLean(dt){
  if(!leanOn){_lnCpPrev=_lnCp;return;}
  /* setEra(i,true) 那一路是瞬时的，塔顶偏移会在一帧里跳几百毫米 —— 那不是
     倾斜，那是换页，得躲掉。lnScrub 时 lnDur 也是 0.001，所以要一起判。 */
  const inst=!lnScrub&&lnDur<=0.01;
  const v=Math.abs(_lnCp-_lnCpPrev)/Math.max(dt,1e-3);
  _lnCpPrev=_lnCp;
  if(inst||v<=1.5)return;
  wdSet('lean',Math.min(1,Math.sqrt(v/150))*0.95);
}
/* 这儿原来是 ping()：营造每跨一个阶段敲一声木工，最后一下敲钟。整条链拆了，
   理由在 applyTime 里写着。留一个 quietTime 的壳，因为四处「把塔摆回建完」的
   复位都在调它，而且哪天再往时间轴上挂声音，静音复位这个需求还会回来。 */
function quietTime(tt){applyTime(tt);}
function setVolume(){
  if(!actx)return;
  const t=actx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(musicBus.gain.value,t);
  musicBus.gain.linearRampToValueAtTime(soundOn?0.5:0.0001,t+0.35);
  wxBus.gain.cancelScheduledValues(t);
  wxBus.gain.setValueAtTime(Math.max(0.0001,wxBus.gain.value),t);
  wxBus.gain.linearRampToValueAtTime(soundOn?0.85:0.0001,t+0.35);
  birdBus.gain.cancelScheduledValues(t);
  birdBus.gain.setValueAtTime(Math.max(0.0001,birdBus.gain.value),t);
  birdBus.gain.linearRampToValueAtTime(soundOn?0.62:0.0001,t+0.35);
  wdBus.gain.cancelScheduledValues(t);
  wdBus.gain.setValueAtTime(Math.max(0.0001,wdBus.gain.value),t);
  /* 0.55 而不是 0.85：这三张床是连续的，而连续的声音在同样的电平上比阵发的
     雨声更抢耳，也更容易压住旁白。量的时候是拿其一的营造对着卡片正文听的。 */
  wdBus.gain.linearRampToValueAtTime(soundOn?0.55:0.0001,t+0.35);
  sfxBus.gain.value=soundOn?0.9:0;
}
/* The swift calls have to be decoded before one can be scheduled, so that is
   done the moment sound comes on rather than in the middle of a frame later.
   The bell and the carpentry used to be pre-generated here too; both are gone
   with ping(). The weather beds are synthesised on demand by syncWeatherAudio,
   which already runs on the same turn as this. */
let _primed=false;
function primeAudio(){
  if(_primed||!actx)return;
  _primed=true;
  SWIFT_CLIPS.forEach(k=>loadBuf(k));
  /* 营造那张床在开声之后四点四秒内就要用，敲一下的那记随时会用，两个都先
     合成好。合成一张六秒的床要一两百毫秒，掉在动画中间就是一次可见的卡顿。
     其余四类（落架、倾斜、开裂、四枚磬）按章预热，见 wdWarm。 */
  synthBuf('wood_work');
  synthBuf('tap_wood');
}
/* 进某一章之前把这一章要用的声音合成好。挑在换章这一帧上是因为它本来就是
   全页最重的一帧（整座塔的几何要重建一遍），多两百毫秒看不出来；掉在动画
   中间就是一次卡顿。合成结果 _SYN 里有缓存，第二次进同一章不花钱。 */
function wdWarm(i){
  if(!actx)return;
  if(i===1){for(let k=0;k<4;k++)synthBuf('qing_'+k);}
  else if(i===3){synthBuf('wood_lean');synthBuf('crack_low');}
  else if(i===4){synthBuf('wood_strip');synthBuf('jam_knock');
                 synthBuf('wood_work');}
}
function resumeAudio(){
  try{
    ensureCtx();
    if(actx.state==='suspended')actx.resume();
    if(!started){started=true;primeAudio();playMusic(styleAud().music);syncWeatherAudio(1.2);}
    setVolume();
  }catch(e){}
}
/* Try to start straight away: browsers permit this once the origin has media
   engagement, so on a revisit the page is already scored. When it is refused
   the first gesture below unlocks it instead. */
function autoStartAudio(){
  try{
    ensureCtx();
    const go=()=>{
      if(actx.state!=='running')return false;
      if(!started){started=true;primeAudio();playMusic(styleAud().music);syncWeatherAudio(1.2);}
      setVolume();return true;
    };
    if(!go()){
      const r=actx.resume();
      if(r&&r.then)r.then(go).catch(()=>{});
    }
  }catch(e){}
}
/* the first gesture anywhere unlocks playback */
['pointerdown','keydown','touchstart','wheel'].forEach(ev=>
  window.addEventListener(ev,resumeAudio,{passive:true}));
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&soundOn)autoStartAudio();
});

/* ------------------------------------------------------------------ *
 * 11.  controls
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * 开篇。两拍，然后落地。
 *   ovtStep 1 — 建塔动画在走，四行引子读在天上，题签在下缘外面待着
 *   ovtStep 2 — 走到半程，引子退掉，题签从下缘浮起来
 *   ovtStep 3 — 塔立定，「入塔」亮起，等一下手
 *   ovtStep 0 — 落地了，章节栏浮上来，这一层再也不回来
 * 落地是单向的：没有「回到开篇」。引首只读一次，读第二次就成了拦路的东西；
 * 真想再看开篇，刷新页面。所以 重营（↻）只重放建塔动画，不把这一层叫回来。
 * ------------------------------------------------------------------ */
/* 1 引子 · 2 题签浮起 · 3 可入塔 · 0 已落地。只往前走，不回头。 */
let ovtStep=1;
function paintOvt(){
  const p=document.getElementById('ovtP');
  if(p)p.textContent=OVERTURE.p;
}
/* 帘子只比字块高出一道缓坡。字块的高度随屏幕和字号变，所以量出来写，
   别在 CSS 里写死一个百分比。layout() 和每次换拍都调一遍。 */
const OVT_FEATHER=76;
function fitOvtVeil(){
  const box=document.querySelector('.ovt-in'),veil=document.querySelector('.ovt-veil');
  if(!box||!veil)return;
  veil.style.height=(box.offsetHeight+OVT_FEATHER)+'px';
}
function applyOvt(){
  const ap=document.getElementById('app');
  if(!ap)return;
  /* 状态类一律带 is- 前缀。踩过一次：状态类原来直接叫 ovt，而开篇那一层
     本身也是 class="ovt"，于是 .ovt{opacity:0}（给层用的，等浮起来才亮）
     同时命中了 #app，整个应用被自己的开篇按成了一张白纸 —— 而且不报错，
     因为语法全对。组件类和状态类同名就是这个后果，前缀是为了永远分开。 */
  ap.classList.toggle('is-ovt',ovtStep>0);
  ap.classList.toggle('is-ovt-1',ovtStep===1);
  ap.classList.toggle('is-ovt-2',ovtStep===2);
  ap.classList.toggle('is-ovt-3',ovtStep===3);
  fitOvtVeil();
}
/* 往下走一拍。只进不退，而且落地之后（0）谁也叫不回来 —— 引首读一次就够，
   读第二次它就成了拦路的东西。
   两个触发点都在 applyTime 里：半程（题签浮起）和塔立定（入塔亮）。不另设
   计时器 —— 这两件事本来就各有一个准确的时刻，而 applyTime 每帧都知道到了
   没有；计时器会跟 quietTime / __seek 这些跳时间的路子对不上。 */
function ovtTo(n){
  if(ovtStep<=0||n<=ovtStep)return;
  ovtStep=n;applyOvt();
}
/* 落地。这里要把 setChapter(0) 真跑一遍而不是只摘掉那个 class：卡片、标注、
   剖切模式全是它摆的，开篇期间一律没摆过。 */
function ovtEnter(){
  if(ovtStep===0)return;
  ovtStep=0;applyOvt();
  resumeAudio();
  /* 塔可能还没走完（读得快，或者 prefers-reduced-motion 之类）：先钉到满高，
     不然一进去就撞上「其一的塔是半截的」。 */
  if(CLIP.constant<13.9){lastStage=-1;playing=false;quietTime(DUR);}
  setChapter(0,true);
  layout();
}
function restart(){
  /* 重營 is what 其一 is about, so it comes home to that chapter rather than
     replaying the build underneath a section card */
  if(chapIdx!==0)setChapter(0);
  else if(leanOn){leanOn=false;applyLeanMode();}
  /* 开篇还没落地就按了 ↻：那是在重放第一拍，回到 ovtStep 1。落地之后按它
     只是重放动画，开篇不回来（见上面那段）。 */
  if(ovtStep>0){ovtStep=1;applyOvt();}
  lastStage=-1;playing=true;applyTime(0);}
document.getElementById('rebuildBtn').addEventListener('click',()=>{resumeAudio();restart();});
/* v5 ships four chapters, the labels toggle and sound. Weather, time of day and
   裝幀 are off the page — the machinery is still there and still reachable from
   the __hooks at the bottom, it just has no control on screen. */
const on=(id,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener('click',fn);};
on('pinBtn',()=>{togglePins();flashIcon(document.getElementById('pinBtn'));});
/* 开篇落地。绑在装字的那一块上而不是整层帘子上：帘子铺满全屏，绑它就把顶栏
   那两枚开关吞掉了。「入塔」那颗是主目标，它周围整块字区也算 —— 拇指够到
   哪儿都能进，但不至于点在塔身上误触。 */
on('ovtGo',ovtEnter);
(function bindOvt(){
  const box=document.querySelector('.ovt-in');
  if(box)box.addEventListener('click',ovtEnter);
  /* 键盘：回车或空格也进。空格在别处是暂停建塔动画，开篇期间它先归这儿 ——
     开篇还没落地，「暂停」没有意义。 */
  /* 键盘：塔立定之后回车或空格进塔。没立定之前这两个键什么也不做 ——
     跟屏幕上一样，那时候还没有「入塔」可按。 */
  window.addEventListener('keydown',e=>{
    if(ovtStep<=0)return;
    if(e.code==='Enter'||e.code==='Space'){e.preventDefault();
      if(ovtStep>=3)ovtEnter();}
  });
})();

/* ------------------------------------------------------------------ *
 * the bottom sheet
 *
 * The cards were 300px-wide columns down the left of a 1512 frame. On a phone
 * that column is the whole screen, so they are sheets: a peek showing the
 * heading and the first paragraph, dragged or tapped up to read the rest. The
 * peek height is what layout() frames the tower against, so the tower does not
 * move when the sheet opens — it just gets covered.
 * ------------------------------------------------------------------ */
const appEl=document.getElementById('app');
function sheetOpen(){return appEl&&appEl.classList.contains('sheet-open');}
function setSheet(open){
  if(!appEl)return;
  appEl.classList.toggle('sheet-open',!!open);
}
function closeSheet(){setSheet(false);}
/* 一个 handler 管三张卡。收起时整张卡都是抓手，展开之后只认上缘那道 44px。
   原来两态都只认上缘 44px：一张 128px 的卡有 84px 是死的，读者点正文想展开，
   什么也不会发生（lara 2026-08-27「点下面的文字区域，它不能滑上去」）。
   收起时不需要滚（overflow:hidden），所以整张卡归手势；展开之后正文要滚，
   竖向手势得让回给滚动条，只留上缘那道抓手收卡。 */
sheetEls.forEach(el=>{
  if(!el)return;
  let y0=0,moved=0,grab=false;
  el.addEventListener('pointerdown',e=>{
    /* 卡里的按钮自己有事做（回到总览、其四那排工具、其五的方案键），
       整张卡变成抓手之后它们都落在抓手里了，按一下不能顺手把卡也收了。 */
    if(e.target&&e.target.closest&&e.target.closest('button')){grab=false;return;}
    const r=el.getBoundingClientRect();
    grab=!sheetOpen()||(e.clientY-r.top)<44;
    if(!grab)return;
    y0=e.clientY;moved=0;
    try{el.setPointerCapture(e.pointerId);}catch(_){}
  });
  el.addEventListener('pointermove',e=>{
    if(!grab)return;
    moved=e.clientY-y0;
    /* live: drag up past the threshold opens, drag down closes.
       阈值从 24 降到 12：24px 在手机上要滑掉小半个卡片高度才认，手感就是钝。 */
    if(moved<-12)setSheet(true);
    else if(moved>12)setSheet(false);
  });
  el.addEventListener('pointerup',e=>{
    if(!grab)return;
    grab=false;
    if(Math.abs(moved)<=12)setSheet(!sheetOpen());   /* a tap toggles */
  });
  el.addEventListener('pointercancel',()=>{grab=false;});
});
on('soundBtn',()=>{
  soundOn=!soundOn;
  setBtn(document.getElementById('soundBtn'),soundOn?'ON':'OFF');
  resumeAudio();setVolume();
  flashIcon(document.getElementById('soundBtn'));
});
/* 天候四态、时四态，一枚图记按序换。两个都会动到声音（天候有雨声雷声风声，
   夜里麻燕不叫），所以点了先把 audio context 唤起来 —— 手机上第一次出声必须
   挂在一次手势里。 */
on('wxBtn',()=>{
  resumeAudio();
  applyWeather(wxIdx+1);
  flashIcon(document.getElementById('wxBtn'));
});
on('timeBtn',()=>{
  resumeAudio();
  applyTheme(themeIdx+1);
  flashIcon(document.getElementById('timeBtn'));
});

/* drag to orbit, hover for parallax, two fingers to zoom */
const ZMIN=0.5,ZMAX=2.0;
let dragging=false,lastX=0,lastY=0;
const ptrs=new Map();
let pinchD=0,pinchZ=1,lastTap=0;
function pinchDist(){
  const a=[...ptrs.values()];
  return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
}
/* how far the thumb travels to cross one of the nine events. A fifth of the
   frame each: the whole 970 years is about two full swipes, which is enough
   travel to feel the tower move and few enough to get to 2020 without work. */
function scrubSpan(){return Math.max(90,canvasW*0.20);}
let scrubbing=false,scrubFrom=0,scrubX0=0;
/* 其五：横向一划换一个方案。相机锁死，所以横轴在这一章是空的，
   正好拿来翻页。一次一格，不连翻 —— 四个方案不是一条连续的量。 */
let fixSwipe=false,fixX0=0,fixMoved=0;
cvs.addEventListener('pointerdown',e=>{
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  try{cvs.setPointerCapture(e.pointerId);}catch(_){}
  if(ptrs.size===2){
    dragging=false;scrubbing=false;
    if(lnScrub)endScrub(scrubFrom);
    pinchD=pinchDist();pinchZ=zoomT;cvs.classList.remove('dragging');return;
  }
  if(ptrs.size===1){
    dragging=true;lastX=e.clientX;lastY=e.clientY;
    /* in 其四 the horizontal axis belongs to the timeline, so the drag does not
       count as the reader taking the camera over — lnUser would freeze the
       framing that walks in as the lean grows */
    /* 其五 的横向拖拽换方案，不擦洗时间 —— 见 fixSwipe */
    if(leanOn&&!fixOn){scrubbing=true;scrubFrom=eraIdx;scrubX0=e.clientX;}
    if(fixOn){fixSwipe=true;fixX0=e.clientX;fixMoved=0;}
    cvs.classList.add('dragging');
    /* touch has no hover, so a tap-tap has to stand in for a double click */
    if(e.pointerType!=='mouse'){
      const now=e.timeStamp||performance.now();
      if(now-lastTap<330){orbAz=0;orbEl=0;zoomT=1;}
      lastTap=now;
    }
  }
});
cvs.addEventListener('pointermove',e=>{
  if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size>=2){
    const d=pinchDist();
    if(pinchD>8)zoomT=Math.max(ZMIN,Math.min(ZMAX,pinchZ*(d/pinchD)));
    return;
  }
  const r=cvs.getBoundingClientRect();
  if(fixSwipe){
    fixMoved=e.clientX-fixX0;
    /* 竖向照旧转相机：一边翻方案一边抬头看二层，是这一章想要的一对动作 */
    orbEl=Math.max(EL_MIN,Math.min(EL_MAX,orbEl-(e.clientY-lastY)*0.0042));
    lastY=e.clientY;
    /* 过了半屏的五分之一就翻一格，翻完把起点挪过来，接着划就是下一格 */
    const span=Math.max(72,canvasW*0.22);
    if(Math.abs(fixMoved)>span){
      setFix(fixIdx+(fixMoved<0?1:-1));
      fixX0=e.clientX;fixMoved=0;
    }
    return;
  }
  if(scrubbing){
    /* right is forward in time, the same direction the strip reads */
    scrubEra(scrubFrom+(e.clientX-scrubX0)/scrubSpan());
    /* vertical still orbits: looking up at the second storey while dragging
       the century is the pair of moves this chapter wants */
    orbEl=Math.max(EL_MIN,Math.min(EL_MAX,orbEl-(e.clientY-lastY)*0.0042));
    if(Math.abs(e.clientY-lastY)>0.5)lnUser=true;
    lastY=e.clientY;
    return;
  }
  if(dragging){
    orbAz-=(e.clientX-lastX)*0.0062;
    orbEl-=(e.clientY-lastY)*0.0042;
    orbEl=Math.max(EL_MIN,Math.min(EL_MAX,orbEl));
    lastX=e.clientX;lastY=e.clientY;
  }else if(e.pointerType==='mouse'){
    hovAz=((e.clientX-r.left)/r.width-0.5)*0.20;
    hovEl=-((e.clientY-r.top)/r.height-0.5)*0.09;
  }
});
function endDrag(e){
  if(e&&ptrs.has(e.pointerId))ptrs.delete(e.pointerId);
  if(ptrs.size<2)pinchD=0;
  if(ptrs.size===0){
    dragging=false;cvs.classList.remove('dragging');
    scrubbing=false;fixSwipe=false;
    /* settle on the nearest event. A tap that never moved never called
       scrubEra, so lnScrub is still false and the reading is left alone. */
    if(lnScrub)endScrub(eraIdx);
  }
  else if(ptrs.size===1){
    /* one finger lifted out of a pinch — carry on orbiting from the other */
    const a=[...ptrs.values()][0];
    lastX=a.x;lastY=a.y;dragging=true;cvs.classList.add('dragging');
    if(leanOn&&!fixOn){scrubbing=true;scrubFrom=eraIdx;scrubX0=a.x;}
  }
}
cvs.addEventListener('pointerup',endDrag);
cvs.addEventListener('pointercancel',endDrag);
cvs.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){hovAz=0;hovEl=0;}});
cvs.addEventListener('dblclick',()=>{orbAz=0;orbEl=0;zoomT=1;});
cvs.addEventListener('wheel',e=>{
  e.preventDefault();
  if(leanOn)lnUser=true;
  const d=e.deltaMode===1?e.deltaY*16:e.deltaY;
  zoomT=Math.max(ZMIN,Math.min(ZMAX,zoomT*Math.exp(-d*0.0016)));
},{passive:false});

const track=document.getElementById('track');
function seekFrom(ev){
  const r=track.getBoundingClientRect();
  lastStage=-1;playing=false;
  applyTime(Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width))*DUR);
}
track.addEventListener('pointerdown',e=>{seekFrom(e);try{track.setPointerCapture(e.pointerId);}catch(_){}});
track.addEventListener('pointermove',e=>{if(e.buttons&1)seekFrom(e);});
window.addEventListener('keydown',e=>{
  /* 开篇期间 Space / Enter 归上面 bindOvt 那个 handler（往下走一拍），这里让开 ——
     开篇还没落地，「暂停建塔动画」没有意义，而两个 handler 都吃 Space 的话
     会一边暂停一边跳拍。 */
  if(ovtStep>0&&(e.code==='Space'||e.code==='Enter'))return;
  if(e.code==='Space'){e.preventDefault();playing=!playing;resumeAudio();}
  else if(e.code==='KeyR'){resumeAudio();restart();}
  else if(e.code==='KeyT'){applyTheme(themeIdx+1);}
  else if(e.code==='KeyX'){cycleCut();}
  else if(e.code==='KeyB'){togglePins();}
  else if(e.code==='Escape'){setFocus(-1);}
  else if(e.code==='KeyL'){toggleLean();}
  else if(e.code==='KeyK'){applySkin(skinIdx+1);}
  else if(e.code==='KeyE'&&leanOn){cycleExag();}
  /* 1-4 jump to a chapter; the arrows step through the register, except inside
     其四 where they belong to the timeline that chapter is made of */
  else if(e.code>='Digit1'&&e.code<='Digit4'){setChapter(+e.code.slice(5)-1);}
  else if((e.code==='BracketLeft'||e.code==='ArrowLeft')&&leanOn){e.preventDefault();setEra(eraIdx-1);}
  else if((e.code==='BracketRight'||e.code==='ArrowRight')&&leanOn){e.preventDefault();setEra(eraIdx+1);}
  else if(e.code==='ArrowLeft'){e.preventDefault();setChapter(chapIdx-1);}
  else if(e.code==='ArrowRight'){e.preventDefault();setChapter(chapIdx+1);}
  else if(e.code==='KeyW'){applyWeather(wxIdx+1);}
  else if(e.code==='KeyC'){orbAz=0;orbEl=0;zoomT=1;}
});

/* ------------------------------------------------------------------ *
 * 11b.  剖切註記 — saying what the cut exposed
 *
 * The cutaway worked and was unreadable: the walls came off and what was left
 * was a lot of timber with no names on it. Three things fix that, and they only
 * work together.
 *
 *   1. a card per cut, saying what this state IS and what to look for
 *   2. labels pinned to real points on the frame, so the parts have names
 *   3. clicking a label frames that part and replaces the card with its note
 *
 * In v3 all three stayed off until the reader pressed 剖切 or 標註, on the
 * argument that the opening frame is a hanging scroll and annotation would ruin
 * it. The scroll was preserved and the writing went unread. The card and the
 * labels now come up with the chapter; 標註 is still there for a clean view.
 * ------------------------------------------------------------------ */
/* 全篇的题记：这座塔叫什么、在哪、多老、凭什么值得看。
   2026-08-27 上午它是「其一 · 外观」卡的第一段，下午搬到开篇。lara：「现在
   外观里面的第一段不应该放在外观里面的啊。」对的 —— 外观那一章该讲的是
   八角五层、六道檐、副阶周匝，讲不到「国内现存最古的木塔」和吉尼斯。这一段
   是全篇的引首，不是第一章的第一段。
   口径用官方的 ——「现存体量最大、时代最古老的木结构楼阁式塔」（山西省人民
   政府 2026-03-12，引中国文化遗产研究院）。「楼阁式塔」这个限定不能省：
   佛光寺东大殿比它早两百年，但那是殿不是塔，笼统说「最古老的木构」会被行家
   挑出来。吉尼斯那一条标了年月。
   「国务院公布的第一批全国重点文物保护单位」删掉（lara 2026-08-27）—— 这是
   行政身份，不是这座塔本身的事，而引首上每一句都该说塔。
   同一天下午还撤了梁思成 1933 年那段引文（「绝对的 Overwhelming……」）。
   它是全篇最硬的一条一手文献，撤掉不是因为不好，是因为开篇要短：一段占了
   两百多像素，撑得整屏必须盖住半个塔。取证留在 题咏与匾额-取证.md，
   将来想用有现成的，出处也核到期号了。 */
const OVERTURE={
  p:'佛宫寺释迦塔，在山西朔州应县城内西北隅。辽清宁二年（1056）立，'+
    '金明昌六年（1195）增修完毕，俗呼应县木塔。现存体量最大、时代最古老的'+
    '木结构楼阁式塔；二十世纪以前，世上没有比它更高的木构。'+
    '如今，木塔已有较为严重的倾斜，面临倒塌危机，亟需保护措施落地。'
};
const CUTNOTE=[
 {cn:'外观',sub:'八角五层',
  p:['八角平面，通高六十五米七七。从地面往上六道屋檐、四圈平坐勾栏。最下面那道檐属于绕塔一周的副阶，所以檐有六道，能走人的层只有五层。',
     '从外面能数清的就这些。里面的层数不一样，五个明层之间还各夹着一层，从外面一道也看不出来。'],
  fig:[['65.77','通高　米'],['5','明层'],['6','出檐　道']],
  hint:'翻到「其二 · 藏」，看塔内珍藏'},
 /* v9（lara 2026-08-27 定稿的文案）把这两章的分工重划了一遍。v8 的「塔里」
    混着两件事讲：五层佛坛的塑像，和暗层、斜戗、井栿这套结构。结构是其三的活，
    所以其二收窄成「打开塔门之后能看见什么」—— 塑像加佛像肚子里的辽代秘藏，
    暗层那一段整段搬到其三，标注也跟着搬（见 PINS）。 */
 {cn:'塔内珍藏',sub:'五座佛坛',
  p:['五个明层各有一座佛坛，现存塑像二十六尊。一层正中是通高十米三二的释迦坐像，内槽六面墙上各画一尊如来，连中央这尊合成过去七佛。往上每层一组：二层一佛二菩萨，三层四方佛各朝一方，四层华严三圣加文殊普贤骑兽，五层毗卢遮那居中、八大菩萨坐八方，九尊合成一个九宫。',
     '1974 年维修时从四层主像胸背部取出一批辽代秘藏，其中十二卷《契丹藏》是这部辽代大藏经留下的唯一实物。二层和四层的主像腹中还各藏一枚七宝净土舍利佛牙。这些宝物在佛像里藏了九百年，却并不为人所知。'],
  fig:[['26','现存塑像'],['10.32','一层大佛通高　米'],['12','契丹藏　卷']],
  hint:'点标注看单件；翻到「其三 · 构」，看撑住这一切的骨架'},
 {cn:'骨架',sub:'九层桁架',
  p:['没有一根通天的柱子，也没有一堵整面的墙。这座塔矗立九百七十年，靠的是层层累积的木柱通过榫卯结构相连。木塔主要有外槽柱和内槽柱，两圈木柱层叠摞靠，外圈八根撑屋檐，内圈八根围佛堂，一个明层的结构就只靠这十六根立柱支撑。',
     '除了立柱，还有暗层。两圈柱之间，上下各一道水平的大梁把它们箍成圈，中间再打斜撑，交叉成 X。一个明层加上面一个暗层合在一起，就是一节完整的八边形桁架。四节桁架叠起来，顶上再盖一顶帽子。上层的柱底开十字口，插进下层柱头的斗栱里面，同时往里退半个柱径。所以塔越往上越收，重心一直在往中间走。',
     '整座塔的接合没有一颗铁钉。柱和柱之间靠榫卯咬住，柱和梁之间靠斗栱传力。光是斗栱就用了五十四种不同做法，每一种对应不同位置、不同方向的荷载。唯一用铁的地方是塔刹顶上那八条链子，拉住宝瓶使它不被风吹走。从地面到六十五米高处，六万吨木料之间的每一个接头都是靠形状紧密相连，古代精巧木作手艺尽显于此。'],
  fig:[['8+8','每层柱数'],['54','斗栱　种类'],['0','铁钉　颗']],
  hint:'点标注看单件；这副骨架后来怎么了，在「其四 · 倾」'}
];
/* Anchors are read straight off LY rather than typed in, so they follow the
   measured table if it is ever corrected. side is which way the leader runs;
   the point is taken 72 degrees round from the camera on that side, which puts
   it just inside the silhouette and keeps it there while the tower turns. */
const PINS=[
 /* ---- 外觀 ---- */
 {m:0,side: 1,cn:'塔刹',lab:'九米五二',sub:'铁铸　九米五二',
  y:()=>LY.fin.y0+(LY.fin.y1-LY.fin.y0)*0.42,r:()=>LY.st[4].R*0.13,
  note:'砖砌刹座之上是仰莲、覆钵、五重相轮、圆光、仰月、宝珠和宝瓶，全部铁铸，通高九米五二。八条铁链从宝瓶拉到顶层的角脊上，这是全塔唯一用铁的地方。'},
 {m:0,side:-1,cn:'出檐',lab:'外挑二米四四',sub:'三层　外挑二米四四',
  y:()=>LY.st[2].yE,r:()=>LY.st[2].RE*0.96,
  note:'三层的檐口比柱圈往外挑出二米四四，起翘却相对平缓。相比于明清时期飞扬的翼角，辽檐的特点是出挑深远、翼角低平，整条檐线像一道展开的翅膀而不是翘起的指尖。'},
 {m:0,side: 1,cn:'平坐勾栏',lab:'栏高一米一',sub:'栏高一米一',
  y:()=>LY.st[1].pz.y1+RAIL_H*0.5,r:()=>LY.st[1].pz.R*1.08,
  note:'每道暗层外面挑出一圈平坐，绕塔一周，栏杆高一米一。它既是走人的廊道，也是暗层的外皮——从外面看，暗层就是这一圈栏杆。'},
 /* right side, not left: the note card owns the bottom of the left column and
    at a large --k the two boxes met */
 {m:0,side: 1,cn:'副阶周匝',lab:'底径二十九米九七',sub:'底径二十九米九七',
  y:()=>(LY.fujie.y0+LY.fujie.y1)/2,r:()=>LY.fujie.R*0.99,
  note:'「副阶周匝」是宋《营造法式》的说法，意思是塔身外面再围一圈廊子，四面通绕、自成一个屋顶。它的作用是把风雨挡在外圈，保护里面的柱子和墙壁。这种做法在唐辽佛塔和大殿上很常见（佛光寺东大殿也有），明清以后逐渐不用。底径二十九米九七，全塔最宽处在这里，往上每层都收。'},
 /* aimed at the board itself: faceRot(1) is +22.5deg, which is the face every
    board in the column hangs on, and R*1.135*AP is the plane they hang in */
 {m:0,side: 1,a:Math.PI/8,cn:'匾额',lab:'现存五十四方',sub:'历代匾额　现存五十四方',
  y:()=>LY.st[3].y1+LY.st[3].dg*BIAN_RISE,r:()=>LY.st[3].R*1.135*AP,
  note:'木塔现存匾额五十四方，上自辽金、下至民国，历经九百余年各代题写。最知名的几方：三层「释迦塔」是金明昌六年（1195）旧物，也是塔上年代最早的一方匾；明成祖朱棣北征驻跸应州，御题「峻极神工」；明武宗题「天下奇观」。南面五层檐下自下而上一列最为集中，北面和东西各面也各有题悬。'},
 /* ---- 塔內珍藏 ---- */
 /* v9：暗层、斜戗、井栿三枚从这一章搬去了骨架那一章（m 由 1 改 2），换进来
    一枚壁画。其二现在只讲塔里供着什么、藏着什么。 */
 /* the 副階 stands in front of this one and stays solid in every mode, so a
    2.9 zoom left the figure as two slivers between two porch columns */
 {m:1,side: 1,z:4.2,qi:0,cn:'一层大佛',lab:'通高十米三二',sub:'释迦坐像　通高十米三二',
  y:()=>LY.st[0].y0+10.32*M*0.46,r:()=>LY.st[0].Ri*0.70,
  note:'内槽正中的释迦坐像，2021 年实测通高十米三二、膝距五米五四，是国内现存最高的室内佛像。内槽六面墙上各画一尊如来。一层层高十四米五六，除以大佛通高正是根号二，也就是说，这间屋子是按佛像的尺寸定的。'},
 {m:1,side:-1,z:3.2,qi:2,cn:'四层主像',lab:'腹中藏经',sub:'华严三圣　腹中藏经',
  y:()=>LY.st[3].y0+4.85*M*0.62,r:()=>LY.st[3].Ri*0.45,
  note:'四层是华严三圣。释迦居中，文殊普贤骑兽。1974 年维修时从主像胸背部取出辽代秘藏一批，其中十二卷《契丹藏》是这部辽代大藏经留下的唯一实物。二层和四层主像腹中还各藏一枚舍利佛牙。'},
 {m:1,side: 1,z:3.2,qi:3,cn:'五层曼荼罗',lab:'九尊成九宫',sub:'毗卢遮那与八大菩萨',
  y:()=>LY.st[4].y0+3.80*M*0.55,r:()=>LY.st[4].Ri*0.55,
  note:'毗卢遮那佛居中，八大菩萨坐在八个方位，九尊合成一个九宫。宿白认为这一层是「拟大日坛场」，把整层做成一座曼荼罗。从一层的七佛到五层的九位，顺着楼梯拜上去，是一条排好顺序的礼佛路线。'},
 /* v9 新增。锚在二层内槽的墙面上（Ri 往外一点点就是墙），不是壁面正中 ——
    正中被佛坛和塑像占着，签会压在人像上。 */
 {m:1,side:-1,z:3.2,qi:1,cn:'壁画',lab:'供养人与如来',sub:'供养人与如来',
  y:()=>LY.st[1].y0+(LY.st[1].y1-LY.st[1].y0)*0.58,r:()=>LY.st[1].Ri*0.98,
  note:'各层内槽墙壁绘有壁画和供养人像。一层南北门额上画着供养人，是辽代贵族面貌的珍贵图像资料。壁画颜料经近千年仍有留存，但已严重剥落。'},
 /* ---- 骨架 ---- */
 /* v9：这一章从四枚扩到六枚。暗层、井栿从其二搬过来，斜戗留在原位但改了
    副标注。六枚锚在四个不同的高度上（明层柱、暗层、暗层上缘、柱头），
    互相不叠。 */
 {m:2,side:-1,cn:'外槽柱',lab:'八根',sub:'八根　逐层收分',
  y:()=>(LY.st[1].y0+LY.st[1].y1)/2,r:()=>LY.st[1].R,
  note:'外槽柱是位于外圈的立柱，每层八根，作用是把屋檐和斗栱的重量往下传。一层柱圈半径十一米五四，逐层往里收，到五层收为九米六四，塔的重心跟着一直往中间走。「外槽」的意思就是外圈柱和内圈柱之间围出来的那一圈走廊。'},
 {m:2,side: 1,cn:'内槽柱',lab:'八根',sub:'八根　底径十米二六',
  y:()=>(LY.st[2].y0+LY.st[2].y1)/2,r:()=>LY.st[2].Ri,
  note:'内槽柱是位于内圈的立柱，同样每层八根，围出供佛的筒状空间。底层内槽底径十米二六。「内槽」就是这八根柱子围出来的那间屋子。外槽走道和内槽佛堂，就是这座塔的两重空间。'},
 {m:2,side:-1,z:3.6,cn:'暗层',lab:'四道',sub:'四道　全藏在檐下',
  y:()=>(LY.st[3].pz.y0+LY.st[3].pz.y1)/2,r:()=>LY.st[3].pz.R*0.90,
  note:'暗层是夹在两个明层之间的矮层，层高只有一米一到一米五，不开窗也不住人，从外面完全看不到，藏在平坐栏杆的下面。暗层的作用是把内外两圈柱箍成一体：上下各一道井栿、中间斜戗交叉，把散开的十六根柱子锁成一个刚性环。整座塔的抗侧力全靠这四道暗层。'},
 {m:2,side:-1,z:3.6,cn:'斜戗',lab:'交叉成 X',sub:'交叉成 X　只在暗层',
  y:()=>(LY.st[2].pz.y0+LY.st[2].pz.y1)/2,r:()=>(LY.st[2].pz.R+LY.st[2].Ri)*0.5,
  note:'斜戗是暗层里斜着顶在内外两圈柱之间的木料，两根交叉成 X 形。它的作用相当于现代桁架里的腹杆，没有它，两圈柱各自独立，风一吹就散。整座塔的斜撑只出现在暗层里，明层一根也没有，因为明层要开门、开窗、立佛，不能有斜料挡路。这里的排法是示意：文献只证实暗层有斜撑，没有给出它在八个开间里怎么分布，所以模型画成每间一个 X。'},
 {m:2,side: 1,z:3.6,cn:'井栿',lab:'上下各一道',sub:'上下各一道　水平环梁',
  y:()=>LY.st[1].pz.y0,r:()=>LY.st[1].pz.R*0.88,
  note:'井栿是暗层上下各一道的水平大梁，沿着八边形一圈铺过去，相当于现代结构里的环梁。它的作用一是给斜戗一个落脚点（没有横梁，斜料就只是两根斜着的柱子），二是把同一圈的八根柱子串成一条链，阻止它们各自往外倒。'},
 {m:2,side: 1,z:3.2,cn:'斗栱',lab:'五十四种',sub:'五十四种　全塔的接头',
  y:()=>LY.st[3].y1+LY.st[3].dg*0.5,r:()=>LY.st[3].R*1.20,
  note:'斗栱是柱头和檐之间那一丛层层出跳的木构件，由方块（斗）和横木（栱）交替叠起。它的作用是把屋檐的重量一层层缩进来、最后集中到柱头上，同时也是上下两层柱子之间的连接件。这座塔上用了五十四种不同的斗栱做法，每一种对应不同位置的受力方向和出跳距离。'}
];
/* 按 cutMode 索引：0 外观、1 塔内珍藏、2 骨架 */
const CN_BACK=['回到外观总览','回到内部总览','回到骨架总览'];
/* 点一枚签出什么声音，按章分：
   其一 外观 / 其三 骨架 —— 指节敲在木头上。这两章讲的全是木料（出檐、斗栱、
     柱、斜戗、井栿），敲木头就是敲它们本身。轻、干、短，界面音的本分是几乎
     听不见。音高按签的序号在 E♭ 五声上小幅上下，只为了连点几枚不像同一记
     提示音在重复 —— 不成调，敲击本来听不出音高。
   其二 珍藏 —— 磬（lara 说的「颂钵」，汉传佛寺里这一路器物的本名）。音高
     按塔的层数从低到高，见 QING 那张表上面的注。
   收签（再点一次同一枚）不出声：那是关，不是看。 */
function pinSound(p){
  if(p.m===1){
    const qi=p.qi===undefined?0:p.qi;
    sfx('qing_'+qi,{gain:0.30});
  }else{
    /* 序号在五声上取一格，只动 ±两个半音上下，听着还是同一记敲击 */
    const st=[1,0.9439,1.0595,1.0000,0.8909][(p.no||1)%5];
    sfx('tap_wood',{gain:0.34,rate:st});
  }
}
const cutNoteEl=document.getElementById('cutnote');
const pinsEl=document.getElementById('pins');
const pinSvg=document.getElementById('pinsvg');
let annOn=false,pinsOn=false,focusPin=-1;
let pinEls=null,pinLns=null,pinDots=null;
const SVGNS='http://www.w3.org/2000/svg';
function buildPins(){
  if(pinEls||!pinsEl||!pinSvg)return;
  pinSvg.style.color='var(--ink2)';
  pinEls=[];pinLns=[];pinDots=[];
  PINS.forEach((p,i)=>{
    const ln=document.createElementNS(SVGNS,'polyline');
    ln.setAttribute('fill','none');ln.setAttribute('stroke','currentColor');
    ln.setAttribute('stroke-width','1');ln.setAttribute('opacity','0');
    pinSvg.appendChild(ln);pinLns.push(ln);
    const dt=document.createElementNS(SVGNS,'circle');
    dt.setAttribute('r','2.2');dt.setAttribute('fill','currentColor');
    dt.setAttribute('opacity','0');
    pinSvg.appendChild(dt);pinDots.push(dt);
    const el=document.createElement('button');
    el.className='pin gone';el.type='button';
    /* numbered within its own chapter rather than across all fifteen, so 其三
       starts at 1 instead of at 12.
       试过一轮天干（甲乙丙丁戊己）：形是对的，但一枚 27px 的方章里塞一个宋体
       汉字，笔画细到远看只是一团灰，而且六个字长得不够像序列 —— 读者得先认字
       才知道哪个在前。lara 2026-08-27 决定回到数字。数字在这儿反而更古：
       老图版上的条目号本来就是阿拉伯数字排在方框里。 */
    p.no=PINS.filter((q,k)=>k<i&&q.m===p.m).length+1;
    el.textContent=p.no;
    /* the chip is a bare number, so the part's name has to reach a screen
       reader some other way */
    el.setAttribute('aria-label',p.cn+(p.lab?'　'+p.lab:''));
    el.addEventListener('click',ev=>{ev.stopPropagation();
      /* 点签有可能是读者在这一页上的第一个手势，所以先唤 audio context ——
         手机上第一次出声必须挂在一次手势里 */
      resumeAudio();
      const open=focusPin!==i;
      if(open)pinSound(p);
      setFocus(open?i:-1);});
    pinsEl.appendChild(el);pinEls.push(el);
  });
}
const _pp=new T.Vector3();
function placePins(){
  if(!pinEls)return;
  /* a pin is anchored to a coordinate on the UPRIGHT tower, so once the frame
     shears the labels point at where the part used to be.
     v5 dropped pins entirely below 760px: a 390-wide frame has no gutter for a
     leader line, so the labels were unreachable on the device this build is
     for — and the pins are the only way into fifteen part notes. They are
     numbered dots sitting ON the anchor now, no leader, no gutter needed. */
  const show=annOn&&pinsOn&&!leanOn;
  /* CLIP.constant is how far the build has got, so a label for something not
     yet standing has to keep quiet */
  const lim=CLIP.constant+0.02;
  for(let i=0;i<PINS.length;i++){
    const p=PINS[i],el=pinEls[i],ln=pinLns[i],dt=pinDots[i];
    const y=p.y();
    if(!(show&&p.m===cutMode&&y<=lim)){
      el.classList.add('gone');ln.setAttribute('opacity','0');
      dt.setAttribute('opacity','0');continue;
    }
    /* 72 degrees round from the camera lands just inside the silhouette, which
       is what a column or an eave wants. A pin on one particular thing — a board
       on one particular face — overrides it with its own angle. */
    const a=curAz+(p.a!==undefined?p.a:p.side*1.26),R=p.r();
    _pp.set(Math.sin(a)*R,y,Math.cos(a)*R).project(camera);
    if(_pp.z>1){
      el.classList.add('gone');ln.setAttribute('opacity','0');
      dt.setAttribute('opacity','0');continue;
    }
    const ax=(_pp.x*0.5+0.5)*canvasW, ay=(-_pp.y*0.5+0.5)*canvasH;
    /* clamping the label into the frame is fine; clamping it when the thing it
       points at is off-screen entirely is not — the leader then runs off the
       edge to nowhere, which is what happened at focus zoom */
    if(ax<-16||ax>canvasW+16||ay<24||ay>canvasH-24){
      el.classList.add('gone');ln.setAttribute('opacity','0');
      dt.setAttribute('opacity','0');continue;
    }
    /* the dot IS the control: 34px of tap target centred on the anchor, which
       is comfortably over the 24px floor and needs no gutter. The leader line
       and the SVG dot underneath it are both off — the chip draws its own. */
    el.classList.remove('gone');
    el.style.transform='translate('+ax.toFixed(1)+'px,'+ay.toFixed(1)+'px) '+
                       'translate(-50%,-50%)';
    ln.setAttribute('opacity','0');
    dt.setAttribute('opacity','0');
  }
}
function setFocus(i){
  focusPin=i;
  if(i>=0){
    const p=PINS[i],y=p.y();
    /* a part halfway up a half-built tower cannot be looked at, so the
       timeline goes to the end first */
    if(y>CLIP.constant){lastStage=-1;playing=false;quietTime(DUR);}
    playing=false;
    camYT=y;
    orbEl=Math.max(EL_MIN,Math.min(EL_MAX,
      Math.asin(Math.max(-1,Math.min(1,(y-7.065)/80)))));
    /* a 暗層 is 1.5 m of a 65.77 m tower — about twenty pixels at the framing
       the front page uses, which is not something anyone can look at */
    zoomT=p.z||2.6;
  }else{camYT=7.065;zoomT=1;}
  refreshNote();
  /* tapping a numbered dot is a request to read that part, so the sheet comes
     up with it rather than making the reader find the handle afterwards */
  if(typeof setSheet==='function')setSheet(i>=0);
}
function refreshNote(){
  if(!cutNoteEl)return;
  const f=focusPin>=0?PINS[focusPin]:null;
  if(f){
    /* v9：这颗按钮原来一律写「回到剖切说明」，可读者是从某一章的总览点进来的，
       「剖切说明」是这套机器自己的词，不是页面上任何一处的标题。lara
       2026-08-27 要求按章节改名：其二回内部，其三回骨架。 */
    cutNoteEl.innerHTML='<div class="cn-rule"></div><h5>'+f.cn+'</h5>'+
      '<div class="cn-sub">'+(f.sub||'')+'</div><p>'+f.note+'</p>'+
      '<button class="cn-back" type="button" id="cnBack">← '+
      (CN_BACK[f.m]||CN_BACK[0])+'</button>';
    const b=document.getElementById('cnBack');
    if(b)b.addEventListener('click',()=>setFocus(-1));
  }else{
    const c=CUTNOTE[cutMode]||CUTNOTE[0];
    cutNoteEl.innerHTML='<div class="cn-rule"></div><h5>'+c.cn+'</h5>'+
      '<div class="cn-sub">'+c.sub+'</div>'+
      c.p.map(x=>'<p>'+x+'</p>').join('')+
      '<div class="cn-fig">'+
      c.fig.map(g=>'<div><b>'+g[0]+'</b>'+g[1]+'</div>').join('')+'</div>'+
      '<div class="cn-hint">'+c.hint+'</div>';
  }
  cutNoteEl.classList.toggle('on',annOn&&!leanOn);
  cutNoteEl.classList.toggle('focus',!!f);
  const app=document.getElementById('app');
  if(app)app.classList.toggle('zoom',!!f);
  cutNoteEl.style.pointerEvents=annOn?'auto':'none';
  setBtn(document.getElementById('pinBtn'),pinsOn?'ON':'OFF');
  if(pinEls)pinEls.forEach((el,i)=>el.classList.toggle('hot',i===focusPin));
  /* the labels belong to the state this function just wrote, so they move now
     rather than on the next frame */
  placePins();
}
/* the first press of either control turns the whole annotation layer on */
/* the register owns cutMode now. Stepping the cut on its own would leave the
   two disagreeing — the frame would be sectioned while the mark still read
   其一 — so the keyboard shortcut walks 塔 → 藏 → 構 through the register. */
function cycleCut(){
  setChapter(CHAP[chapIdx].lean||chapIdx>=2?0:chapIdx+1);
}
function togglePins(){
  pinsOn=!pinsOn;
  if(pinsOn)annOn=true;
  if(!pinsOn&&focusPin>=0)setFocus(-1);
  refreshNote();
}

/* ------------------------------------------------------------------ *
 * 12b.  章 — four readings of one tower
 *
 * The material was all here already: three cutaway cards, fifteen annotated
 * parts, nine dated events of the lean. All of it opt-in behind buttons whose
 * resting value was 無, which meant the front page was a poem and four lines
 * were the whole of what most readers ever saw.
 *
 * A chapter is a named state that arrives complete: the cut is made, the card
 * is open, the labels are up. 剖切 and 傾斜 are not switches any more because
 * the chapters ARE those switches, with names on them and a place to stand.
 * ------------------------------------------------------------------ */
const CHAP=[
 {n:'其一',cn:'塔',cut:0,lean:false},
 {n:'其二',cn:'藏',cut:1,lean:false},
 {n:'其三',cn:'構',cut:2,lean:false},
 {n:'其四',cn:'傾',cut:0,lean:true},
 /* 其五 借用 其四 的倾斜状态当底：四个方案要修的就是最后那一格的塔（v9 起是
    2021 那一格，柱状图上是 2020 年 8 月那套实测） */
 {n:'其五',cn:'修',cut:0,lean:true,fix:true}
];
let chapIdx=0;
function renderChap(){
  const host=document.getElementById('chap');
  if(host)Array.prototype.forEach.call(host.children,
    (b,i)=>b.classList.toggle('hot',i===chapIdx));
  setChapTitle();
}
/* quiet is for the opening call at startup: it must not run the lean's
   autoplay and it must not cut the build animation short. */
function setChapter(i,quiet){
  chapIdx=((i%CHAP.length)+CHAP.length)%CHAP.length;
  const c=CHAP[chapIdx];
  if(focusPin>=0)setFocus(-1);
  /* a section through a half-built frame is a section through scaffolding, so
     every chapter but the first wants the tower finished. Same rule setFocus
     already used for a part that is not standing yet. */
  if(chapIdx>0&&CLIP.constant<13.9){lastStage=-1;playing=false;quietTime(DUR);}
  /* the cut belongs to the chapter, so arriving at 其四 by way of 其三 must not
     leave the lean being read off a bare frame — the 576 mm is the building's,
     and a section plus a plumb line plus a bar chart is three diagrams at once */
  if(cutMode!==c.cut){cutMode=c.cut;applyCutaway();}
  /* 其五 也要塔是歪的，但它不是一段时间：借 傾斜 的状态，跳到 2020 那一格，
     然后把纪年轨换成方案轨。先把 fixOn 定下来，applyLeanMode 才知道
     该不该点亮纪年轨。 */
  const wantFix=!!c.fix;
  /* 旧值要留着：applyFixMode 靠 fixOn 判断是进还是出，而下面的分支在读它之前
     就把它改掉了 —— 于是「离开其五」那一路从来没跑过，卡片和钢架留在屏幕上。 */
  const wasFix=fixOn;
  fixOn=wantFix;
  if(c.lean){
    if(!leanOn){leanOn=true;eraIdx=0;lnFrom=null;lnTo=null;
                /* on a phone the timeline is something you drag, so it does not
                   start playing itself at you — the hint below says so once */
                lnPlay=false;lnHold=0;}
    if(wantFix){
      /* 四个方案修的是最后那一格的塔，所以先把时间推到最后一格 */
      lnPlay=false;lnFrom=null;lnTo=null;setEra(ERA.length-1,true);
    }
    applyLeanMode();
    buildFixRail();
    applyFixMode();
    if(!wantFix&&!quiet)showScrubHint();
  }else{
    if(wasFix)applyFixMode();   /* fixOn 已经是 false，这一趟是把借的东西还回去 */
    if(leanOn){leanOn=false;applyLeanMode();}
    /* this is the whole point: the card and the labels come up with the
       chapter instead of waiting to be asked for */
    annOn=true;pinsOn=true;
    applyCutaway();
  }
  const ap=document.getElementById('app');
  if(ap)ap.classList.toggle('chap-alt',chapIdx>0);
  wdWarm(chapIdx);
  renderChap();
  /* the strip above the sheet swaps between the build scrubber and the era
     rail, and the sheet's peek height differs per chapter, so the clear band
     the tower is framed into has to be re-measured on every turn of the page */
  closeSheet();
  layout();
}
/* shown the first time 其四 opens, and never again in this session */
let hintSeen=false;
function showScrubHint(){
  const h=document.getElementById('hint');
  if(!h||hintSeen)return;
  hintSeen=true;
  h.classList.add('on');
  setTimeout(()=>h.classList.remove('on'),3200);
}
function buildChap(){
  const host=document.getElementById('chap');
  if(!host||host.children.length)return;
  CHAP.forEach((c,i)=>{
    const b=document.createElement('button');
    b.type='button';
    b.innerHTML='<i>'+c.n+'</i><b>'+c.cn+'</b>';
    b.setAttribute('aria-label',c.n+'　'+c.cn);
    b.addEventListener('click',()=>{resumeAudio();setChapter(i);});
    host.appendChild(b);
  });
}

/* ------------------------------------------------------------------ *
 * 13.  傾斜 — nine dated events, one tower, and the lean they left
 *
 * Every drift figure below is in millimetres of horizontal offset between the
 * head and the foot of that storey's 明層 columns, and the sum of the five is
 * the offset at the apex. Only the second storey has a published per-column
 * series; the other four are that series' documented RANKING turned into
 * numbers, and the whole pre-1926 stretch has no instrument behind it at all —
 * those rows are marked 示意 and 記述 rather than 實測, and their timeline dots
 * are drawn hollow.
 *
 * Two of the rows land on published totals rather than being fitted to them,
 * which is the only external check available:
 *   1926-2020  二層 86 → 576 mm.  576 mm at 2020-08 is 中國文化遺產研究院's
 *              measurement of the south-west-by-north 平柱, and 576/2907 mm of
 *              column height is the 1/5 the reports quote.
 *   2004       26+481+86+33+24 = 650 mm, which is the 整體向東北傾斜 65 厘米 in
 *              山西省文物局's 2004 report. The distribution was set from the
 *              ranking and the total came out on the published number.
 *
 * Sources: 莫宗江《雁北文物勘查團報告》1950; 梁思成 1933 測稿與文集; 陳明達
 * 《應縣木塔》1966; 山西省文物局《關於應縣木塔修繕保護工程情況的報告》2004;
 * 永昕群《應縣木塔科學價值、傾斜變形與保護路徑探析》中國文化遺產 2021(1);
 * 吳育華 · 永昕群《應縣木塔變形的過去、現在與將來》2020;
 * 《別讓「病歪歪」的應縣木塔在議而不決中倒掉》新華每日電訊 2020-10-19.
 * ------------------------------------------------------------------ */
const ERA=[
 /* v9 的正文是 lara 2026-08-27 定稿的重写（personal/应县木塔-其二其三文案重写.md）。
    每格的写法定死了：第一段讲这个时间点发生了什么事，第二段讲这件事对结构造成
    了什么后果，不做文学渲染。逐层毫米数一个没动，改的全是文字。
    刻度从十个减到九个：v8 末尾那格「2026 · 静力失稳拐点」的毫米数是按「每年
    两到三毫米」推算出来的，不是实测；lara 把它改回评估报告本身的年份 2021，
    同时 v8 的「2020 · 二层 576 mm」那一格并了进来 —— 576 是 2020 年 8 月中国
    文化遗产研究院量的，也是至今公布过的最后一套完整实测，所以这一格用它，
    src 标「实测」而不是「推算」。纪年轨的 CSS 本来就是照九个刻度画的。 */
 {y:'1056',yl:'辽 清宁二年 · 1056',cn:'建塔',sub:'夹泥墙与斜戗俱在',
  d:[0,0,0,0,0],cp:0,tw:0,src:'—',hd:'柱头偏移　0',
  p:['辽清宁二年立。八角平面，内外两圈柱，每个明层之上压一道满布斜撑的暗层，一柔一刚地叠四节。',
     '上面四个明层的外槽柱之间砌着夹泥墙，墙里藏有斜戗。这道墙是塔的第二道抗侧力防线，作用是限制任何一层单独发生水平位移。']},
 {y:'1305',yl:'元 大德九年 · 1305',cn:'怀仁地震',sub:'六点五级 · 此后又逢两次七级',
  d:[4,10,26,12,8],cp:128,tw:0.12,src:'示意',soft:1,jolt:1,hd:'无实测',
  p:['建成至今对木塔有明显影响的地震四十余次，其中烈度七度以上两次：1626 年灵丘七级、1683 年原平七级。1305 年怀仁六点五级是有记载的第一次大震。',
     '地震并未对木塔造成绝对损伤，只对木塔造成一定程度的偏移，地震力自下往上传的时候被接缝逐层消耗。这几百年的变形没有实测数据，只有「历代屡修」的文字记载。']},
 {y:'1902',yl:'明治三十五年 · 1902',cn:'伊东忠太勘测',sub:'第三层偏斜明显',
  d:[6,14,52,18,10],cp:194,tw:0.20,src:'记述',soft:1,hd:'三层最甚',
  p:['日本建筑学者伊东忠太于 1902 年勘测木塔，记下的状态是：明层夹泥墙尚存，二层没有明显倾斜，反而三层西北柱「向内倚甚」。1933 年梁思成、莫宗江测绘时判断一致，二层西南柱虽有内倚，程度比三层轻。',
     '也就是说，在二十世纪初，木塔倾斜最明显的还不是二层。']},
 {y:'1926',yl:'民国十五年 · 1926',cn:'军阀炮击',sub:'二百余弹',
  d:[10,86,60,22,13],cp:244,tw:0.42,src:'记述',soft:1,jolt:1,hd:'二层 ~86 mm',
  p:['冯玉祥的国民军自南口退向五原，取道晋北，应县县城成了战场，木塔是城里的最高点。战斗结束后发现，木塔四层阑额里嵌着一枚没取出的弹头，最下层西面两根檐柱被穿透，孔如碗口。',
     '从这时起，二层西南面开始内倾，逐渐成为后来最著名的病灶。']},
 {y:'1935',yl:'一九三〇年代中 · 1935',cn:'拆夹泥墙',sub:'八百余年以来最大的厄运',
  d:[11,120,64,24,14],cp:269,tw:0.52,src:'记述',soft:1,hd:'二层 ~120 mm',
  p:['木塔遭到炮击之后，当地士绅出资修缮。上面四个明层除四正方向的格扇门之外，其余全是带斜戗的夹泥墙。这次修缮把夹泥墙全部拆除，换成了通透的格子门窗，理由是「玲珑宝塔不玲珑」，遮挡了视线。',
     '梁思成对此评价，「在最近的将来，必须恢复原状，否则适足以促短塔的寿命而已。」墙拆掉之后，侧移刚度和扭转刚度同时下降，限制水平位移的那道防线没有了，目前认为是造成木塔倾斜最大的因素之一。']},
 {y:'1950',yl:'一九五〇年 · 1950',cn:'莫宗江复查',sub:'加速倾斜',
  d:[14,235,70,27,17],cp:372,tw:0.80,src:'记述',soft:1,hd:'二层 ~235 mm',
  p:['莫宗江是古建筑研究专家，于 1950 年记录了木塔情况：「自夹泥墙被拆除改成格扇门以来，仅仅经过十四五年，塔身已可以看出歪向东北。在第二层内的各柱向东北倾斜最甚，上部的重心已经离开了正中，各柱头的榫口大多已经松脱，或已因倾斜扭转而劈裂。」',
     '在士绅拆墙之后，木塔十五年的变形量已经超过了此前八百多年的总和。']},
 {y:'1981',yl:'一九七四—八一年 · 1981',cn:'抢险加固',sub:'效果有限',
  d:[20,392,80,31,21],cp:607,tw:1.15,src:'回推',hd:'二层 ~392 mm',
  p:['1974 至 1981 年间，国家文物局组织了一轮抢险加固，包括在暗层补加斜撑、楼板加强、梁柱加铁箍、外槽构件油饰等措施，台基、主梁、平坐栏杆一并整修。',
     '规模不小，但工程图纸档案留存极少。遗憾的是，这些加固措施没能阻止塔身继续变形。']},
 {y:'2004',yl:'二〇〇四年 · 2004',cn:'首次全面实测',sub:'整体向东北 65 厘米',
  d:[26,481,86,33,24],cp:880,tw:1.35,src:'实测',hd:'二层 481 · 塔顶 650 mm',
  p:['山西省文物局组织了第一次全面测量，发现塔身整体向东北倾斜 65 厘米，累计压缩 88 厘米。二层外槽西面北角柱下沉 20 厘米，西南面南平柱向东北倾斜 50 厘米。全塔残损点三百余处。',
     '更值得关注的是加速趋势，在 1991 到 2004 年的十四年里，二层层间位移增加了 7.89 毫米；2004 到 2010 年的六年里增加了 18.17 毫米，速率是前一段的五倍多。']},
 /* 柱状图上的 576 mm 是 2020 年 8 月量的（中国文化遗产研究院，二层西南侧靠北
    的平柱，柱头相对柱脚中心偏移，达柱高的五分之一），正文讲的是 2021 年那份
    评估。两件事差几个月，同一家机构，评估就是坐在这套实测上做的，所以并成
    一格，hd 里把年份写清楚。其五「现状加固」那一格的铅垂线读数也取这里。 */
 {y:'2021',yl:'二〇二一年 · 2021',cn:'静力失稳拐点',sub:'两根柱在危险状态',
  d:[28,576,90,35,26],cp:934,tw:1.45,src:'实测',hd:'二层 576 mm（2020 实测）',
  p:['2021 年应县人民政府委托中国文化遗产研究院做现状结构稳定性评估，发现二层大部分柱体已经进入静力失稳拐点。其中倾斜最重的角柱 W22 和平柱 W23，稳定性能已进入变形急剧加速阶段，处于失稳破坏的危险状态，需要立即采取应急保护措施。',
     '由于木塔结构复杂，修缮方案争议三十年仍然没有定论。']}
];
const ERA_MAX=600;   /* the bar chart's full width, in millimetres */

/* --- the shear itself ------------------------------------------------- */
const lnZero=[0,0,0,0,0];
function lnState(i){
  const e=ERA[Math.max(0,Math.min(ERA.length-1,i))];
  return {d:e.d,cp:e.cp,tw:e.tw};
}
function lnPush(){
  const a=lnFrom||lnState(0),b=lnTo||lnState(0);
  /* an artillery hit is an impulse and the tower rings before it settles; a
     wall coming off is a decade of creep. Same tween, different curve. */
  const x=Math.min(1,lnMix);
  const p=lnRaw?x
         :lnJolt?(x>=1?1:1-Math.exp(-4.5*x)*Math.cos(8*x))
                :(x<0.5?2*x*x:1-Math.pow(-2*x+2,2)/2);
  const d=[];
  for(let k=0;k<5;k++)d[k]=a.d[k]+(b.d[k]-a.d[k])*p;
  const cp=a.cp+(b.cp-a.cp)*p;
  /* 塔顶偏移记下来，driveLean 靠它的每帧变化量当倾斜速度。放在这里是因为
     拖手指和按格跳都要经过 lnPush，一个点管两条路。
     记的是 cp（毫米），不是乘过夸张系数的位移 —— 换夸张倍数（cycleExag）
     只该改画面，不该让塔叫一声。 */
  _lnCp=cp;
  lnWrite(d,cp,a.tw+(b.tw-a.tw)*p,LN_EXAG[exagIdx]);
}
let lnPlay=false,lnHold=0;
/* ------------------------------------------------------------------ *
 * scrubbing the lean by hand
 *
 * On a desktop the nine events were nine dots you clicked, plus a ▶ that
 * played them. On a phone that is nine 30px targets in a row and a movie you
 * watch. The lean is a 970-year process and a finger is the obvious way to
 * move through it — so a horizontal drag across the tower runs the timeline,
 * and the tower shears under your thumb.
 *
 * This works because 其四 has no use for horizontal drag: applyLeanMode pins
 * the azimuth to 45 degrees, which is the one angle the south-west-to-
 * north-east lean can be read from. Nothing is being taken away.
 *
 * lnPush eases lnMix so a STEP between two events lands softly (and rings,
 * for an earthquake). A scrub is not a step — the finger is the easing — so
 * lnRaw makes lnPush read lnMix straight, and lnScrub stops the frame loop
 * from advancing a tween that the hand is driving.
 * ------------------------------------------------------------------ */
let lnScrub=false;
function scrubEra(pos){
  const p=Math.max(0,Math.min(ERA.length-1,pos));
  const i=Math.floor(p),j=Math.min(ERA.length-1,i+1);
  lnPlay=false;lnScrub=true;lnRaw=true;lnJolt=false;
  lnFrom=lnState(i);lnTo=lnState(j);
  lnMix=p-i;lnDur=0.001;
  lnPush();
  /* the card and the strip follow whichever event is nearer, so the reading
     changes over at the halfway point rather than lagging to the end */
  const near=Math.round(p);
  if(near!==eraIdx){eraIdx=near;lnFrame();markEraStrip();renderLeanCard();}
}
/* let go and it settles onto the nearest event, back under the normal tween */
function endScrub(pos){
  lnScrub=false;lnRaw=false;
  setEra(Math.round(Math.max(0,Math.min(ERA.length-1,pos))),true);
}
function stepLean(dt){
  if(!leanOn||lnScrub)return;
  if(lnMix<1){
    lnMix=Math.min(1,lnMix+dt/lnDur);
    lnPush();
    if(lnMix>=1&&lnPlay)lnHold=3.0;
    return;
  }
  if(lnPlay){
    lnHold-=dt;
    if(lnHold<=0){
      if(eraIdx>=ERA.length-1){lnPlay=false;renderLeanCard();}
      else setEra(eraIdx+1);
    }
  }
}
/* the reader wins any argument about the camera: one drag, wheel or pinch in
   this mode and the framing stops being taken over on every step */
/* 其五 自己的取景。傾斜 那一章收到 1.10 是为了让二层填满画面，但其五 里
   钢支承塔架的棚脊在 16.10 单位，而 1.10 的取景带只装得下 14.2 —— 塔剎
   本来就已经被切掉了（0 在屏幕 572、塔顶 14 在 -5.6，量出来的）。
   这两个数是量着调的，不是算的：见 __fixView。四张卡共用同一组，
   不然「干预深度」这个比较就不成立了。 */
let FIX_ZOOM=0.838,FIX_CAMY=7.24;
function lnFrame(){
  if(lnUser)return;
  if(fixOn){zoomT=FIX_ZOOM;camYT=FIX_CAMY;return;}
  const f=Math.min(1,Math.max(0,eraIdx/3));
  zoomT=1+(LN_ZOOM-1)*f;
  camYT=CAM_H+(LN_CAMY-CAM_H)*f;
}
function setEra(i,instant){
  const j=Math.max(0,Math.min(ERA.length-1,i));
  lnFrom=lnTo?lnState(eraIdx):lnState(j);
  eraIdx=j;lnTo=lnState(j);
  lnJolt=!!ERA[j].jolt;
  lnDur=instant?0.001:(lnJolt?0.62:1.15);
  lnMix=instant?1:0;
  /* 1305 怀仁地震、1926 军阀炮击那两格：一记低频的开裂加余振。
     刻意不做地震的轰鸣也不做炮声 —— 这一页的主角是塔，不是那场地震或那场
     战斗，响的该是塔的反应。instant 那一路（换章、进其五）不出声：那是换页。
     慢变形那几格（1935 拆墙、1950、之后）没有这一记，它们的声音是 driveLean
     喂出来的那张床：几十年的蠕变不该有一个撞击点。 */
  if(lnJolt&&!instant)sfx('crack_low',{gain:0.52,rate:0.94+Math.random()*0.13});
  lnPush();lnFrame();
  markEraStrip();renderLeanCard();
}
function cycleExag(){
  exagIdx=(exagIdx+1)%LN_EXAG.length;
  lnPush();renderLeanCard();
}

/* --- the timeline strip ----------------------------------------------- */
let eraBtns=null;
function buildEraStrip(){
  const el=document.getElementById('era');
  if(!el||eraBtns)return;
  eraBtns=[];
  /* spacing is even, not linear time. 1056 to 1902 is eight centuries in which
     the record says almost nothing, and everything that can be dated falls in
     the last hundred years; on a linear axis six labels pile up on the right. */
  ERA.forEach((e,i)=>{
    const f=i/(ERA.length-1);
    const d=document.createElement('button');
    d.type='button';d.className='era-pt';
    d.style.left='calc(38px * var(--k) + (100% - 76px * var(--k)) * '+f.toFixed(4)+')';
    /* the year and the name are wrapped rather than bare text nodes so the rail
       can show nine dots and only the CURRENT year — nine dated labels across
       390px is 43px each and they collide. CSS decides; the markup carries all
       three either way. */
    d.innerHTML='<i></i><span>'+e.y+'</span><b>'+e.cn+'</b>';
    d.setAttribute('aria-label',e.y+'　'+e.cn);
    d.addEventListener('click',ev=>{ev.stopPropagation();lnPlay=false;setEra(i);});
    el.appendChild(d);eraBtns.push(d);
  });
}
function markEraStrip(){
  if(!eraBtns)return;
  eraBtns.forEach((d,i)=>{
    d.className='era-pt'+(ERA[i].soft?' soft':'')+
      (i<eraIdx?' done':'')+(i===eraIdx?' hot':'');
  });
  const pr=document.getElementById('eraProg');
  /* 38, matching the dots' own inset — v5 started the fill at 20 and it stopped
     18px short of the last dot, which was hidden by the rail's padding then and
     is not now that the rail runs the full width of the frame */
  if(pr)pr.style.width='calc(18px * var(--k) + (100% - 76px * var(--k)) * '+
    (eraIdx/(ERA.length-1)).toFixed(4)+')';
}

/* --- the card --------------------------------------------------------- */
const LN_FLOOR=['一层','二层','三层','四层','五层'];
function renderLeanCard(){
  const el=document.getElementById('leancard');
  if(!el)return;
  const e=ERA[eraIdx],ex=LN_EXAG[exagIdx];
  const worst=e.d.indexOf(Math.max.apply(null,e.d));
  let rows='';
  for(let k=4;k>=0;k--){
    const v=e.d[k],f=Math.min(1,v/ERA_MAX);
    rows+='<div class="ln-row'+(v>0&&k===worst?' worst':'')+'"><span>'+LN_FLOOR[k]+
      '</span><i style="width:calc(118px * var(--k) * '+f.toFixed(4)+')"></i><em>'+
      (v?(e.soft?'~':'')+Math.round(v)+'</em>':'0</em>')+'</div>';
  }
  const tot=e.d.reduce((a,b)=>a+b,0);
  el.innerHTML='<div class="ln-rule"></div><div class="ln-y">'+e.yl+'</div>'+
    '<h5>'+e.cn+'</h5><div class="ln-sub">'+e.sub+'</div>'+
    e.p.map(x=>'<p>'+x+'</p>').join('')+
    '<div class="ln-prof">'+rows+'</div>'+
    '<div class="ln-foot"><b>'+e.hd+'</b><span class="ln-src">'+e.src+
    (tot?' · 塔顶 '+(e.soft?'~':'')+Math.round(tot)+' mm':'')+'</span></div>'+
    '<div class="ln-tools">'+
    '<button type="button" id="eraPrev" title="前一件">‹</button>'+
    '<button type="button" id="eraPlay">'+(lnPlay?'‖ 暂停':'▶ 复现倾斜')+'</button>'+
    '<button type="button" id="eraNext" title="后一件">›</button>'+
    '<button type="button" id="eraExag" class="ln-x'+(ex>1?' up':'')+'">'+
    (ex>1?'放大 ×'+ex:'实测 1×')+'</button></div>';
  const g=(id,fn)=>{const b=document.getElementById(id);
    if(b)b.addEventListener('click',ev=>{ev.stopPropagation();fn();});};
  g('eraPrev',()=>{lnPlay=false;setEra(eraIdx-1);});
  g('eraNext',()=>{lnPlay=false;setEra(eraIdx+1);});
  g('eraExag',()=>cycleExag());
  g('eraPlay',()=>{
    if(lnPlay)lnPlay=false;
    else{
      /* pressing 復現傾斜 at the end starts over rather than doing nothing */
      if(eraIdx>=ERA.length-1)setEra(0,true);
      lnPlay=true;lnHold=1.0;
    }
    renderLeanCard();
  });
  el.classList.toggle('on',leanOn&&!fixOn);
}

/* ------------------------------------------------------------------ *
 * 13b.  其五 · 修 — 四个方案，一座塔，四种动法
 *
 * 前四章都有答案：材料在文献里躺着，照着讲就行。这一章没有。修缮方案争了
 * 三十年没定，所以这一章做的不是解释，是并置 —— 四个方案各自要动多深、代价
 * 是什么、谁在支持，摆出来，不下结论。一旦下了结论，读者会立刻发现作者比
 * 国家文物局更有把握，整个作品的可信度就掉了。
 *
 * 相机在这一章锁死。竖屏一次只能看一个方案，本来是缺点 —— 比较的是记忆不是
 * 图像。锁住相机之后它变成优点：塔一个像素都不动，只有被动到的部分在变，而
 * 眼睛对同一位置上的变化远比并排比对敏感。这是竖屏唯一能赢桌面的地方。
 *
 * 四种动法怎么画：
 *   落架 — 完整的塔立在全高保护棚里，营造动画倒着放，逐层往下消失
 *   抬升 — 接缝处裁开、上半截克隆平移 + 门式钢支承塔架（图 A）
 *   支撑 — 塔内回廊里的格构钢柱（图 B），借其三的剖切才看得见
 *   加固 — 二层西南的辅柱（图 D），同上
 *
 * 2026-08-27 上午加过第五格「眼下」（depth 0），当天下午又撤了。lara：「修法就是
 * 那四种，眼下那节不是修法。」对的，而且第五格的正文（2021 评估、塔不会明天倒、
 * 2024-11 协调机制）跟 其四·倾 的末格几乎重了一遍。所以拆成两处：
 *   · 2026 年代表建议落架 + 另址 1∶1 研究性复建 → 其一 落架大修 的 adv 栏
 *     （这条建议本来就是在说落架，长在别处才怪）
 *   · 三十年难产的症结 + 塔上一根新构件也没有 → 其四 现状加固 的正文
 *     （现状加固就是眼下正在做的事），那两道红标也跟它走
 * 干预深度回到四档：100 / 60 / 5 / 2。
 *
 * 「官方」这个词在这一章必须落到具体主体，否则读者会读出自相矛盾：
 *   搁置落架 —— 2002-06 太原评审会（四十余位专家投票，落架不占优）、
 *     2006-04 朔州评审会、此后国家文物局「监测研究先行 + 现状抢险加固」的方针；
 *     四条搁置理由的公开表述出自国家文物局与中国文化遗产研究院项目组 2020-10-20
 *   重提落架 —— 全国人大山西团代表 2026 年两会建议，长远建议，不是施工计划
 * 这两个主体不同、层级不同、年份差二十年。2026-03-18 那场「木塔即将落架」的谣言
 * 正是把它们当成了一个，19 日山西省文物局出面辟谣。卡片上把这一层写明了。
 *
 * ！！画之前先看 第五章-图样参考.md ！！
 * 第一版这四个模型是凭文字描述加本模型的实测尺寸推出来的，一张图样都没看过。
 * 四个里两个形态错了（抬升缺了整座钢架；支撑把塔内画成了塔外的笼子），
 * 一个数量朝向平面方位全错（加固画成一圈明层竖向 X 斜撑，还挪到了东北）。
 * lara 2026-08-26 问「是不是准确的、有没有图样参考过」，才回头去找的图。
 * 那份档案里有五张原始图样和每一处偏差的对照，别再凭文字推。
 *
 * 深度百分比是示意，不是实测：没有任何一份公开文件给出「这个方案要动多少根
 * 构件」的数字。卡片上标了示意，别当数据用。
 *
 * 四个方案被搁置的理由都是官方口径：国家文物局 / 中国文化遗产研究院项目组
 * 《峻极神功，永镇金城》2020-10-20。卡片上原来单开了第三栏「官方否决理由」，
 * 2026-08-27 撤了 —— 前三格那一栏跟「代价」说的是同一件事（否决理由本来就是
 * 反对方最硬的论据），第四格那一栏又根本不是否决理由而是作者判断，一栏三义。
 * 现在两栏：支持 / 反对，官方那句话并进反对，说话的人和场合写进出处栏。
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * 落架那一格的工地保护棚。
 *
 * 落架是四个方案里唯一没找到方案图的，所以这一套是示意，卡片上标了。
 * 依据只有一条侧证：抬升方案的图题作「上部抬升及施工用保护棚示意图」——
 * 这类工程都要先立保护棚。形态借了那张图的思路（罩住全塔），八角、
 * 按实测半径排布、包住最宽的那道檐。
 *
 * 第一版直接借了营造动画那五组脚手架，那是错的。那五组是矩形框，尺寸按
 * 「塔盖到这一层时有多宽」定的（框宽 2.4–3.7），而建成后的塔檐口伸到半径
 * 4.0 —— 于是整套架子卡在屋檐里面，只有杆件从檐缝里戳出来的碎片露在外面，
 * 看着像塔身炸开了。而且塔是八角的，矩形框从 45° 看过去就是一堆乱杆。
 *
 * 尺寸都是在运行时量出来的（塔身最宽 timber r=4.01，瓦作 r=3.75，
 * 台基 r=6.02，沿门架展开方向到 4.257，屋面顶 11.65，塔剎到 14）。
 * ------------------------------------------------------------------ */
const CAGE_R=4.55;          /* 立杆半径：包住 r=4.01 的檐，留半个身位 */
const CAGE_TOP=12.15;       /* 到瓦作之上一点，不上塔剎 —— 钢笼不该罩住铁刹 */
const CAGE_TH=0.075;        /* 杆件截面，约 35 厘米，远看能看见近看不笨重 */
/* 横梁的高度：踩在四道平坐和台基上，这样笼子的节奏跟塔自己的分层一致 */
const CAGE_LV=[0.80,3.72,5.55,7.35,9.40,11.10,CAGE_TOP];

function bar(grp,mat,x,y,z,sx,sy,sz,rotY,rotZ){
  const g=new T.BoxGeometry(sx,sy,sz);
  const m=new T.Mesh(g,mat);
  m.position.set(x,y,z);
  m.rotation.set(0,rotY||0,rotZ||0);
  m.castShadow=true;m.userData.cage=1;
  /* 记下这根杆的顶高：落架那一格塔被拆矮了，笼子要能跟着矮下去 */
  m.userData.yTop=y+Math.abs(sy)/2+Math.abs(sx*Math.sin(rotZ||0))/2;
  grp.add(m);return m;
}
/* 任意方向的一根杆：给两个端点，把 +Y 转到 a→b 上。
   钢支承塔架的外张立腿、人字梁、格构斜撑都不在正交平面里，bar 那两级欧拉角
   （先 Y 后 Z）摆不出来。 */
const _sA=new T.Vector3(),_sB=new T.Vector3(),_sD=new T.Vector3(),
      _sUp=new T.Vector3(0,1,0);
function strut(grp,mat,a,b,th){
  _sA.set(a[0],a[1],a[2]);_sB.set(b[0],b[1],b[2]);
  const L=_sA.distanceTo(_sB);
  if(L<1e-5)return null;
  const m=new T.Mesh(new T.BoxGeometry(th,L,th),mat);
  m.position.copy(_sA).add(_sB).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_sUp,_sD.copy(_sB).sub(_sA).divideScalar(L));
  m.castShadow=true;m.userData.cage=1;
  m.userData.yTop=Math.max(a[1],b[1]);
  grp.add(m);return m;
}
/* 八角钢笼：八根立杆立在角上，每层一圈横梁沿八条边连起来，
   每个面板一道斜撑。斜撑方向逐层翻转 —— 同向会让整圈笼子看着在扭。 */
function buildCage(){
  const grp=new T.Group();
  const mat=steelMat();
  const yb=CAGE_LV[0],yt=CAGE_TOP;
  for(let k=0;k<NS;k++){
    const p=cornPt(k,CAGE_R);
    bar(grp,mat,p[0],(yb+yt)/2,p[1],CAGE_TH*1.35,yt-yb,CAGE_TH*1.35,cornRot(k));
  }
  const face=2*CAGE_R*Math.sin(Math.PI/NS);   /* 一条边的长度 */
  for(let li=0;li<CAGE_LV.length;li++){
    const y=CAGE_LV[li];
    for(let k=0;k<NS;k++){
      const a=cornPt(k,CAGE_R),b=cornPt((k+1)%NS,CAGE_R);
      const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
      const ang=Math.atan2(b[1]-a[1],b[0]-a[0]);
      bar(grp,mat,mx,y,mz,face,CAGE_TH,CAGE_TH,-ang);
      /* 斜撑：把这一层和上一层的两个角连起来 */
      if(li<CAGE_LV.length-1){
        const y2=CAGE_LV[li+1],h=y2-y;
        const len=Math.hypot(face,h);
        const tilt=Math.atan2(h,face)*(li%2?-1:1);
        bar(grp,mat,mx,(y+y2)/2,mz,len,CAGE_TH*0.8,CAGE_TH*0.8,-ang,tilt);
      }
    }
  }
  grp.visible=false;scene.add(grp);
  return grp;
}
/* ------------------------------------------------------------------ *
 * 現狀加固 —— 辅柱
 *
 * 依据：中国文化遗产研究院「一种现状加固思路示意图：二层明层西南侧倾斜严重
 * 部位加设辅柱，红色为加设构件」，载《峻极神功，永镇金城》2020-10。
 * 图上读到的：红色辅柱贴着原柱立起来，穿过下面那道平坐往下落到再下一层承重，
 * 上端顶进二层的柱头铺作；底部另有红色横梁把几根辅柱拉成一体。全在明层室内。
 *
 * 这也不是新招。金明昌四至六年（1193–95）那次大修，明层加辅柱「支顶于内外槽
 * 内侧柱头铺作第一跳的华拱头下，柱脚放在楼板上」，四层共 104 根 ——
 * 木塔的加固传统是加辅柱，不是搭斜撑。
 *
 * 第一版画的是一圈明层柱间的竖向交叉斜撑，而且为了看得见挪到了东北侧。
 * 数量、朝向、所在平面、方位，四样全错，斜撑那个形式是我编的。真实的
 * 1974–81 后加斜撑只有两根，在塔内近水平、从外槽斜拉到内槽角部，也在西南
 * （中国文化遗产研究院《二层明层1970年代结构加固措施》平面图）—— 那是历史，
 * 不是这一格要画的方案，所以只写在卡片文字里。
 *
 * 尺寸按本模型实测：二层明层柱圈半径 2.349（11.037 米），柱身 y 3.873→4.491
 * （18.195→21.102 米），柱头铺作到 4.804（22.570 米）；下面那道平坐
 * 3.558→3.873（16.720→18.195 米）。辅柱取半径 2.24 —— 在柱圈以内，
 * 也就是明层室内那一侧，跟金代辅柱同一条规矩。
 * ------------------------------------------------------------------ */
const AUX_R =2.24;            /* 柱圈 2.349 以内：明层室内那一侧 */
const AUX_Y0=3.500;           /* 穿过平坐（3.558 起），落到下一层结构上 */
const AUX_Y1=4.660;           /* 顶进柱头铺作（4.491→4.804）*/
const AUX_TH=0.085;
/* 病柱在西南 —— 而这里的 k 编号我一开始搞错了，所以把量出来的映射写下来。
   cornPt(k) = (R·cos45k, R·sin45k)，第二个分量是 z。倾斜朝东北，代码里
   uLnB = +X,-Z，于是 +X 是东、-Z 是北、+Z 是南、-X 是西：

       k  0 东   1 东南   2 南   3 西南   4 西   5 西北   6 北   7 东北

   第一版照旧注释写了 k=4,5,6，以为那是西南，实测是西/西北/北 —— 整个跑到
   塔的另一边去了。西南是 k=3。

   相机锁在东南（实测机位 +56.6,+7.1,+56.6，方位角 45°），西南离它正好 90°，
   所以西南落在塔身的左侧影边上 —— 不是背面，是轮廓线，看得见。
   国家文物局的近期目标写的是「二层倾斜最严重部位现状支顶加固」，只做一处：
   西南那个角，两侧各带一面。 */
const AUX_K=[2,3,4];          /* 南、西南、西 三根角柱 */
const AUX_FACES=[2,3];        /* 西南角两侧那两个面，各加两根平柱 */
function buildAux(){
  const grp=new T.Group();
  const mat=redSteelMat();    /* 图上加设构件是红的，就按图上来 */
  const H=AUX_Y1-AUX_Y0;
  const pts=[];
  for(const k of AUX_K)pts.push({p:cornPt(k,AUX_R),r:cornRot(k)});
  /* 每面两根平柱：八角每面三间，平柱落在面的弦线上 */
  for(const kf of AUX_FACES){
    const a=cornPt(kf,AUX_R),b=cornPt((kf+1)%NS,AUX_R);
    for(const f of [1/3,2/3]){
      pts.push({p:[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],r:cornRot(kf)});
    }
  }
  for(const q of pts){
    bar(grp,mat,q.p[0],(AUX_Y0+AUX_Y1)/2,q.p[1],AUX_TH,H,AUX_TH,q.r);
  }
  /* 把辅柱拉成一体的横梁 —— 图上底部那几道红横杆最显眼，柱头那道细一些，
     它在斗栱那一层里，压低到 4.55 免得从屋面上冒出来读成一道红边。 */
  for(const kf of AUX_FACES){
    const a=cornPt(kf,AUX_R),b=cornPt((kf+1)%NS,AUX_R);
    strut(grp,mat,[a[0],AUX_Y0+0.055,a[1]],[b[0],AUX_Y0+0.055,b[1]],AUX_TH*0.95);
    strut(grp,mat,[a[0],4.55,a[1]],[b[0],4.55,b[1]],AUX_TH*0.7);
  }
  grp.visible=false;scene.add(grp);
  return grp;
}
/* ------------------------------------------------------------------ *
 * 鋼架支撐 —— 塔内的格构钢柱
 *
 * 依据：中国城市规划设计研究院《应县木塔加固方案》「图版十七 总剖面（南-北）」，
 * 载《峻极神功，永镇金城》2020-10。图上读到的：
 *   · 红色加固构件全部在塔内，塔外一根杆件都没有；
 *   · 剖面上一边一根格构钢柱，从台基面起，到三层那道 29.950 标高止；
 *   · 柱身是两根弦杆夹斜撑的格构，每层两道 X；
 *   · 底部一道通长底梁把两根柱连在台基上（在一层楼板之下，这里不画）。
 *
 * 第一版把这一格画成一座包住全塔的八角钢笼 —— 方向正好反了。那个笼子留给
 * 落架（工地保护棚），这一格换成塔内。
 *
 * 半径：图上底部尺寸链中央那一档是 12905，即钢柱离轴 6452 毫米。
 * 内槽半径 5.13 米、外檐柱墙内皮约 8.9 米，6452 正落在回廊里 —— 那也是塔内
 * 唯一能立起一根通高钢柱又不碰佛像和内槽的地方。上到三层内槽收到 4.58 米，
 * 钢柱是竖直的新构件，一路不碰内槽。
 * ------------------------------------------------------------------ */
const MAST_R =6.452*M;        /* 回廊里，1.373 场景单位 */
const MAST_TH=0.085;
const MAST_W =0.24;           /* 两根弦杆的间距，约 1.1 米，按图上柱宽比例 */
/* 横杆的高度直接抄图上那条标高链：台基面 3.635，一层柱头 12.361，
   一层平坐面 18.195，二层柱头 21.102，二层平坐面 26.973，收在 29.950。 */
const MAST_LV=[3.635,12.361,18.195,21.102,26.973,29.950].map(v=>v*M);
function buildMasts(){
  const grp=new T.Group(),mat=redSteelMat();
  const yb=MAST_LV[0],yt=MAST_LV[MAST_LV.length-1];
  for(let k=0;k<NS;k++){
    const p=cornPt(k,MAST_R);
    /* 两根弦杆沿切向分开：径向是 p/R，切向就是它转九十度 */
    const tx=-p[1]/MAST_R*MAST_W*0.5, tz=p[0]/MAST_R*MAST_W*0.5;
    const c=[[p[0]-tx,p[1]-tz],[p[0]+tx,p[1]+tz]];
    for(const q of c)strut(grp,mat,[q[0],yb,q[1]],[q[0],yt,q[1]],MAST_TH);
    /* 格构：每层分两段，一段一道斜撑，方向逐段翻转 */
    for(let i=0;i<MAST_LV.length-1;i++){
      for(let j=0;j<2;j++){
        const y0=MAST_LV[i]+(MAST_LV[i+1]-MAST_LV[i])*j/2,
              y1=MAST_LV[i]+(MAST_LV[i+1]-MAST_LV[i])*(j+1)/2;
        const s=((i+j)%2)?0:1;
        strut(grp,mat,[c[s][0],y0,c[s][1]],[c[1-s][0],y1,c[1-s][1]],MAST_TH*0.7);
      }
    }
  }
  /* 每层一圈横梁把八根柱箍成一体 */
  for(const y of MAST_LV){
    for(let k=0;k<NS;k++){
      const a=cornPt(k,MAST_R),b=cornPt((k+1)%NS,MAST_R);
      strut(grp,mat,[a[0],y,a[1]],[b[0],y,b[1]],MAST_TH*0.8);
    }
  }
  grp.visible=false;scene.add(grp);
  return grp;
}
/* ------------------------------------------------------------------ *
 * 整體抬升 —— 钢支承塔架与施工保护棚
 *
 * 依据：太原理工大学建筑设计研究院《应县木塔修缮工程抬升方案》「图9 抬升
 * 示意图」，载《峻极神功，永镇金城》2020-10（图题作「上部抬升及施工用保护
 * 棚示意图」）。图上读到的：
 *   · 一座门式格构钢架，原图标注就叫「钢支承塔架」；
 *   · 顶上是人字形的保护棚屋面，脊在中轴，两坡落到立腿顶；
 *   · 脊下正对塔剎挂一个吊钩 —— 上部三层是从这儿吊起来的；
 *   · 立腿上段竖直、下段大幅外张，落脚在台基之外的地面上；
 *   · 立腿顶之间一道系梁。
 *
 * 第一版这一格塔外什么都没画，只有缝里八根千斤顶。方案里最显眼的构件
 * 整个缺失，于是「吊起上三层」这件事在画面上无从发生。
 *
 * 外张量按图上尺寸链是落脚离轴 38000 毫米，即 8.09 场景单位 —— 这个宽度
 * 在竖屏里放不下（半幅画面才 4.7 单位）。所以取物理上有意义的最小值：
 * 落脚 4.85，刚出台基（台基沿这个方向到 4.257）。压缩了外张量，卡片上标示意。
 *
 * 其余尺寸按本模型实测定：全塔最宽是副階那道檐 4.025（在 y≈1.92），
 * 立腿竖直段取 4.10、转折点 2.50，于是外张段在 y=1.92 处到 4.27，
 * 从最宽的檐外面过去。
 * ------------------------------------------------------------------ */
/* 相机锁在方位角 45°（东南角），所以让两片门架的平面正对相机：立腿沿 u 展开，
   两片门架沿 v 前后错开。近侧那片完整可读，远侧那片给出进深。 */
const GU=[Math.SQRT1_2,0,-Math.SQRT1_2];
const GV=[Math.SQRT1_2,0, Math.SQRT1_2];
const gp=(a,d,y)=>[GU[0]*a+GV[0]*d, y, GU[2]*a+GV[2]*d];
const SHED_A     =4.10;   /* 立腿竖直段离轴 */
const SHED_AF    =4.85;   /* 落脚，出台基 */
const SHED_KNEE  =2.50;   /* 转折高度，副階檐之上 */
const SHED_LEGTOP=14.95;  /* 立腿顶，高过抬起后的塔剎 */
const SHED_RIDGE =16.10;  /* 棚脊 */
const SHED_D     =2.35;   /* 两片门架各自离中轴的前后距离 */
const SHED_TH    =0.085;
const SHED_W     =0.30;   /* 格构两根弦杆的间距 */
function buildShed(){
  const grp=new T.Group(),mat=steelMat();
  const W=SHED_W*0.5;
  /* 某个高度上立腿离轴多远：转折点以上竖直，以下线性外张 */
  const aAt=y=>y>=SHED_KNEE?SHED_A:
    SHED_A+(SHED_AF-SHED_A)*(SHED_KNEE-y)/SHED_KNEE;
  for(const d of [SHED_D,-SHED_D]){
    for(const s of [1,-1]){
      /* 两根弦杆，各自在转折点折一次 */
      for(const off of [-W,W]){
        strut(grp,mat,gp(s*(SHED_A+off),d,SHED_LEGTOP),
                      gp(s*(SHED_A+off),d,SHED_KNEE),SHED_TH);
        strut(grp,mat,gp(s*(SHED_A+off),d,SHED_KNEE),
                      gp(s*(SHED_AF+off),d,0),SHED_TH);
      }
      /* 弦杆之间的格构：竖直段八节，外张段两节 */
      const lat=(yA,yB,n)=>{
        for(let i=0;i<n;i++){
          const y0=yA+(yB-yA)*i/n, y1=yA+(yB-yA)*(i+1)/n;
          const a0=aAt(y0),a1=aAt(y1);
          const f=(i%2)?[-W,W]:[W,-W];
          strut(grp,mat,gp(s*(a0+f[0]),d,y0),gp(s*(a1+f[1]),d,y1),SHED_TH*0.7);
          strut(grp,mat,gp(s*(a1-W),d,y1),gp(s*(a1+W),d,y1),SHED_TH*0.7);
        }
      };
      lat(SHED_LEGTOP,SHED_KNEE,8);lat(SHED_KNEE,0,2);
      /* 人字梁：立腿顶斜上到脊 */
      strut(grp,mat,gp(s*SHED_A,d,SHED_LEGTOP),gp(0,d,SHED_RIDGE),SHED_TH);
      /* 撑住人字梁的那一道斜杆 */
      strut(grp,mat,gp(s*SHED_A*0.46,d,SHED_LEGTOP+0.05),
                    gp(s*SHED_A*0.54,d,SHED_LEGTOP+(SHED_RIDGE-SHED_LEGTOP)*0.56),
                    SHED_TH*0.7);
    }
    /* 立腿顶之间的系梁 */
    strut(grp,mat,gp(-SHED_A,d,SHED_LEGTOP),gp(SHED_A,d,SHED_LEGTOP),SHED_TH);
    /* 接住上部的那道横梁，架在缝的顶上 —— 图上腿间那条横线。
       它离轴 2.35（跟门架的前后距离同一个数），而塔在这个高度只有 2.9 宽，
       所以横梁贴着塔身外侧过去，正好给缝加了一条读得出来的水平基准。
       没有它，0.553 单位的缝在 1× 下混进平坐和两道屋檐的横线里就没了。 */
    strut(grp,mat,gp(-SHED_A,d,LIFT_TOP_Y),gp(SHED_A,d,LIFT_TOP_Y),SHED_TH*0.95);
  }
  /* 脊檩：跨在两片门架之间。吊点挂在它中间，正对塔剎 */
  strut(grp,mat,gp(0,-SHED_D,SHED_RIDGE),gp(0,SHED_D,SHED_RIDGE),SHED_TH*1.15);
  /* 两片门架在腿顶和转折处各拉一道，它才是个立体的架子而不是两张平面 */
  for(const s of [1,-1])for(const y of [SHED_LEGTOP,SHED_KNEE]){
    strut(grp,mat,gp(s*SHED_A,-SHED_D,y),gp(s*SHED_A,SHED_D,y),SHED_TH*0.8);
  }
  /* 吊钩：从脊檩垂到塔剎顶上一点。朱红，跟缝里的顶撑同一种「临时」的颜色 ——
     图上塔是从这儿吊起来的，这一笔说的就是力从哪儿走。 */
  const jm=jackMat(),hy=SHED_LEGTOP+0.12;
  strut(grp,jm,[0,SHED_RIDGE-0.05,0],[0,hy,0],0.055);
  strut(grp,jm,[-0.16,hy,0],[0.16,hy,0],0.055);
  grp.visible=false;scene.add(grp);
  return grp;
}
/* ------------------------------------------------------------------ *
 * 其三、其四的构件全在塔内，从外面看这座塔什么都没变 —— 那正是这两个方案的
 * 论点，但画面上得先能看见。
 *
 * 第一版自己写了一套幽灵外皮：把 walls / infill / rails 压到 0.13。实测无效 ——
 * 数了一下画面里的红色像素，415 个，等于没有。挡住钢柱的不是那三层皮，而是
 * timberD（障水板与格扇框，单藏它红色像素翻到 2285）、dark、pzdg/pzdgD、
 * 以及六道屋檐的瓦作，摊在七八个 mesh 上，一层层压下来。
 *
 * 而这台机器里早就有对的工具：cutMode 2（其三「構」用的那个剖切）——
 * 内层皮整个隐去、屋面留 13% 的影，骨架留下。这也正是图上的做法：
 * 图版十七和辅柱示意图都是剖面，看得见是因为把塔剖开了。
 * 而且其三已经教过读者这个模式是「看骨架」，其五 借它不用再教一遍。
 * ------------------------------------------------------------------ */
/* 抬升那一格：缝里要有东西托着。一道空缝读成塔断了，而真实的抬升是靠一圈
   顶撑把上部的重量接住 —— 八根，落在柱圈半径上，跨过整条缝。
   顶撑的高度跟着抬升量走，所以它是每次进这一格时重建的。 */
let jackGroup=null;
let _jackMat=null;
function jackMat(){
  if(_jackMat)return _jackMat;
  /* 朱红，不是钢灰。缝开在暗层那一带，平坐、勾栏、两道屋檐的横线本来就密，
     灰的顶撑混进去读不出来。朱红是这个作品里「看这里」的颜色（铅垂线、
     最歪那一层的条都是它），而顶撑本来就是临时构件，用临时的颜色对。
     色值压得比 #7d3b2e 深不少：这个渲染器把 setHex 当线性值用，
     再被四盏灯抬亮编码回 sRGB —— 照页面色值给会出来一片粉。 */
  _jackMat=new T.MeshStandardMaterial({color:0x3a0f08,roughness:0.55,metalness:0.05});
  return _jackMat;
}
/* 塔内那两格用的红钢。为什么另开一个材质：jackMat 是照着「缝里、天光背景」
   调的，塔内是背光的腔体，同一个深红进去就没了 —— 实测把钢柱涂成 0xff2200
   才看得出形状，可见问题不在几何而在明度。

   所以带一个 emissive：自发光项不吃光照，塔内塔外读起来一个样。这是图解的
   需要，不是物理。

   颜色为什么是红：三张图（抬升、支撑、加固）里加设构件全是红的，那是工程制图
   的规矩。但这个作品里红是「看这里」的颜色，一整座红钢架会把画面压垮，所以只
   在塔内用红、塔外那两套（落架的保护棚、抬升的钢支承塔架）留钢灰。
   分野正好落在这一章要说的事上：灰在外，红在内。 */
let _redSteel=null;
function redSteelMat(){
  if(_redSteel)return _redSteel;
  _redSteel=new T.MeshStandardMaterial({
    color:0x2a0b05,emissive:0x63150a,roughness:0.5,metalness:0.05});
  return _redSteel;
}
function buildJacks(){
  if(jackGroup){disposeGroup(jackGroup);jackGroup=null;}
  const grp=new T.Group(),mat=jackMat();
  const L=FIX_LIFT_MM*0.001*M;
  /* 半径 2.30 撞上了平坐（R=10.75 米 = 2.29），千斤顶整排埋在平坐里面看不见。
     挪到 2.78：出了平坐，仍在二层屋檐（3.04）以内，正好站在缝里的空处。 */
  const y0=LIFT_JOINT_Y, R=2.78;
  for(let k=0;k<NS;k++){
    const p=cornPt(k,R);
    bar(grp,mat,p[0],y0+L/2,p[1],0.085,L,0.085,cornRot(k));
  }
  grp.visible=false;scene.add(grp);
  jackGroup=grp;return grp;
}
let cageGroup=null,auxGroup=null,mastGroup=null,shedGroup=null,deckGroup=null,
    critGroup=null;
/* 现状加固那一格的那道标记（原属已撤掉的第五格「眼下」）。
   评估报告点了名的两根柱：二层明层西南倾斜最重的角柱 W22、平柱 W23，变形已进
   入急剧加速阶段。现状加固要贴的就是这两根柱，所以标记跟着它走 —— 辅柱在塔内，
   标记在塔外，指的是同一处。
   位置用 LY 现算，不写死：W22 在西南角（k=3，方位映射见 AUX_K 上面那段），
   W23 在西南往西那个面上偏西的三分点，也就是「西南侧靠北」的那根。
   为什么标记要伸到塔外面去：二层明层柱身只有 2.9 米高，在 390 宽的竖屏里是二十
   来个像素，柱径不到两个像素。第一版画成贴着柱身的竖线加上下横头（图纸上量尺寸
   的记号），杆件粗 0.17 米 —— 投出来一个像素多一点，而且整段落在上下两道檐之间
   的阴影里，截图上完全找不到。所以改成从柱子往外引一道横线，端头一个小方块，
   出到半径 3.55（超过一层檐口的 3.478），戳出塔的轮廓落在天上。
   这是引线记号，不是构件：又细又短，只在轮廓外面那一小截看得见。一旦画粗、画满
   层高，它就读成又一根加固构件，而它的全部意思是「就这儿」。
   高度落在柱身正中，那一层的上下都是空的：一层屋面顶到 3.478，平坐 3.478→3.785，
   柱身 3.785→4.389，二层屋面从 4.695 起 —— 引线走 4.09 这一层，一路无遮挡。
   只画一道，不画两道。W22 和 W23 在平面上差一米半，投到这块画面上是十九个像素，
   两道引线的方向也只差三十度，画出来是一个方块贴着一根横杆，读不成「两根柱」，
   反倒像塔上粘了个红东西。两根柱的名字写在卡片上，画面只负责指出是哪一处 ——
   在八个像素等于一米的尺度上分辨两根相邻的柱子是假精确。 */
const CRIT_R=3.62;
function buildCrit(){
  const grp=new T.Group();
  const mat=redSteelMat();
  const st=LY.st[1];                 /* 二层明层：柱身 y0→y1，柱圈 R */
  const y=(st.y0+st.y1)/2, th=0.055;
  const R0=st.R*1.02;                /* 起点贴着柱圈外面 */
  const d=cornPt(3,1);               /* 西南角，单位圆上的方向 */
  const L=Math.hypot(d[0],d[1]),ux=d[0]/L,uz=d[1]/L;
  strut(grp,mat,[ux*R0,y,uz*R0],[ux*CRIT_R,y,uz*CRIT_R],th);
  /* 端头一小段竖笔，约一米二：引线是线，端头才是「就这儿」 */
  bar(grp,mat,ux*CRIT_R,y,uz*CRIT_R,th*1.6,0.25,th*1.6,cornRot(3));
  grp.visible=false;scene.add(grp);
  critGroup=grp;return grp;
}
/* 工作平台：一圈跟着工作面走的钢跳板。
   落架那一格缺的就是这个。裁剪面往下滑的时候，画面上唯一动的是一条横穿全塔的
   水平边界 —— 一条线在动，读起来是「擦掉」，不是「拆」。棚子和塔都不动，
   没有一个近处的东西跟着工作面走，也就没有视差，深度就出不来。
   这一圈八角跳板架在棚子的立杆上，停在剖切面的高度，随工作面下降或上升。
   它跟剖面上那张八角楼板盖构成两个同心的八边形，一个近一个远，透视一眼就读出来；
   工地上也确实是这么干的 —— 人站在平台上，拆到哪儿平台就落到哪儿。
   为什么不用营造那五组木脚手架：那五组是矩形框，尺寸按「塔盖到这一层时有多宽」
   定的（框宽 2.4–3.7），建成后的塔檐口伸到半径 4.0。第一版（lara 2026-08-26
   第一轮之后）把它们全程打开过，结果是一个亮黄的矩形框浮在塔顶上方半空 ——
   它本来是给还没盖到那儿的塔预留的，倒着放就成了无所依附的一片杆件。 */
/* 半径贴塔不贴棚：第一版把跳板放在棚子的立杆上（CAGE_R=4.55）、用的也是钢灰，
   于是它混进那一百一十二根杆件里，跟棚子自己的横梁分不出来，等于没画。
   挪到 4.18 —— 刚出檐口（timber 最宽 4.01），贴着塔身走；材质换成松木跳板，
   暖色在钢灰和纸底之间跳得出来，而且工地上的平台本来就是钢架子上铺木板。 */
const DECK_R=4.18;
function buildDeck(){
  const grp=new T.Group();
  const face=2*DECK_R*Math.sin(Math.PI/NS);
  for(let k=0;k<NS;k++){
    const a=cornPt(k,DECK_R),b=cornPt((k+1)%NS,DECK_R);
    const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
    const ang=Math.atan2(b[1]-a[1],b[0]-a[0]);
    /* 板子薄而宽：横过来的一条带子才读成能站人的平台，而不是又一根横梁。
       建在 y=0 上，整组平移到工作面的高度。 */
    bar(grp,MAT.scaffold,mx,0,mz,face*1.02,CAGE_TH*0.75,CAGE_TH*3.1,-ang);
    /* 一小段栏杆立柱，八个角各一根：平台有了厚度，透视才咬得住 */
    const p=cornPt(k,DECK_R);
    bar(grp,MAT.scaffold,p[0],CAGE_TH*2.4,p[1],CAGE_TH*0.7,CAGE_TH*4.2,
        CAGE_TH*0.7,cornRot(k));
  }
  grp.visible=false;scene.add(grp);
  deckGroup=grp;return grp;
}
/* 平台停在工作面上。高过棚顶就收起来 —— 塔剎那一段还在棚子外面，
   平台跟上去会浮在空中。 */
function deckAt(y){
  if(!deckGroup)return;
  const on=y<=CAGE_TOP-0.25&&y>=CAGE_LV[0];
  deckGroup.visible=on;
  if(on)deckGroup.position.y=y;
}
/* 笼子只留 yMax 以下的部分。现在落架那一格是按全高调的（棚子罩住整座塔、
   全程不动），这个裁法留着 —— 将来若要让棚子跟着工作面走，改的是调用点。 */
function cageUpTo(yMax){
  if(!cageGroup)return;
  cageGroup.children.forEach(m=>{m.visible=(m.userData.yTop<=yMax+0.35);});
}
/* 落架那一格要一个「拆到二层柱头」的营造时刻。buildHeightAt 是 t→高度，
   这里要反过来：采样求最接近的 t，然后走 applyTime，这样楼板盖和那一层
   该有的脚手架都跟着来 —— 第一版直接写 CLIP、又把 capMesh 关掉，
   于是剖面是个裸口，读成把塔锯断了。 */
function tAtHeight(h){
  let bt=0,bd=1e9;
  for(let i=0;i<=400;i++){
    const t=DUR*i/400,d=Math.abs(buildHeightAt(t)-h);
    if(d<bd){bd=d;bt=t;}
  }
  return bt;
}

const FIX=[
 {n:'其一',cn:'落架大修',sub:'全部拆下，修好，装回去',
  mode:'strip',depth:100,dlab:'全塔两万余根构件，逐一拆解编号 · 保护棚示意',
  p:['把塔从上往下全部拆散，坏的修好，实在不能用的换新，再照原样装回去。'+
     '晋祠圣母殿、崇福寺弥陀殿都这么修过，而且修成了。'],
  yes:'唯一能彻底根治的做法。倾斜、劈裂、脱榫一次清完，塔重新变直。',
  no:'构件在近千年压力下已经扭曲。矫正回原尺寸就装不进旧榫口，不矫正就装不成直塔 —— '+
     '换新的没了历史，不换新的装不回去。两万构件、八万榫卯，工期以数十年计。'+
     '这三条也是它一直没被采用的理由：旧构件更换过多，变形矫正后难以安装，'+
     '历史信息损失过多。',
  /* lara 2026-08-27：原来这一章有第五格「眼下」，把 2026 年的代表建议单独放在
     那里。她说得对 —— 修法就四种，「眼下」不是第五种修法，而她真正要说的是
     「有代表建议落架大修、同时另址复建」，这句话本来就该长在落架这一格上。
     所以第五格撤了，那条建议搬到这里，正文照她给的文案。
     ——「官方」是谁必须分清，否则这一格自相矛盾：搁置落架的是 2002 年太原、
     2006 年朔州两次专家评审会与此后国家文物局的方针（表述见 who）；2026 年重提
     落架的是全国人大山西团代表，两会上的长远建议，不是任何一级文物部门批的
     施工计划。这两个「官方」不是一个主体，也不在一个层级上 —— 2026-03-18
     那场谣言就是把它们当成了一个。 */
  adv:'随着木塔二层大部分柱体进入静力失稳拐点，应尽早采取静力稳定性能提升措施。'+
      '山西团代表在今年两会上建议，鉴于木塔当前的保存状况，局部加固无法从根本上'+
      '解决其倾斜严重的问题，从长远来看，仍需实施落架大修。建议在有序开展变形'+
      '监测、全面测绘等工作的同时，在木塔周边区域另行选址，启动 1∶1 研究性复建'+
      '木塔项目。',
  advLab:'2026 年重提',
  advBy:'全国人大山西团代表 2026 年两会建议，是长远建议，不是已批准的施工计划。'+
        '2026 年 3 月 18 日「木塔即将落架大修」在社交平台刷屏，正是把这条建议'+
        '读成了计划；19 日山西省文物局辟谣：没有落架大修规划。'+
        '出处：山西省人民政府网 2026-03-12《实施应县木塔营造及技艺研究项目》'+
        '（山西日报　闫书敏）',
  who:'搁置理由是官方口径：国家文物局与中国文化遗产研究院项目组 2020-10-20。'+
      '2002 年 6 月太原评审会四十余位专家投票，落架不是得票最多的那个，'+
      '此后国家文物局的方针一直是监测研究先行、现状抢险加固 · '+
      '反对者丁垚（建筑学家）：「如果落架大修，木塔就不是它了」'},

 {n:'其二',cn:'整体抬升',sub:'吊起上三层，修二层，再放回',
  mode:'lift',depth:60,dlab:'门式钢支承塔架 · 上部三层整体吊起，二层落架',
  p:['塔外立一座比台基还宽的门式钢架，顶上是人字形的施工保护棚，脊下正对塔剎'+
     '挂吊点。保存较好的三至五层整体吊起来，腾空的二层落架大修，修完再放回去。'+
     '2002 年太原评审会四十余位专家投票，这个方案得票最多。'],
  yes:'上半部分原状保住了，只动病灶那一层。现代工程技术与传统做法的结合。',
  no:'吊起来之后能不能顺利落回修好的二层之上，无法预先确认 —— 这一条就是它被否掉的'+
     '理由。用钢量大，费用高。',
  who:'2002 年 6 月太原评审会得票最多 · 柴泽俊认为「稳妥、透明」· '+
      '2006 年 4 月朔州「应县木塔抬升修缮方案评审会」上，深化后的方案被专家否掉'+
      '（国家文物局与中国文化遗产研究院项目组 2020-10-20）· '+
      '图样：太原理工大学建筑设计研究院'},

 {n:'其三',cn:'钢架支撑',sub:'塔内立钢柱，让塔不再受力',
  mode:'scaffold',depth:5,dlab:'本体几乎不动，回廊里立通高钢柱到三层',
  p:['在塔内的回廊里立起格构钢柱，从台基一直接到三层，把上部的重量接过去，'+
     '让这座近千年的木构不再承担自己的体重。塔外一根杆件都没有，'+
     '从外面看，这座塔什么都没变。'],
  yes:'几乎不碰原构件。历史信息一点不损失，而且可逆 —— 将来想拆掉钢柱还能拆。',
  no:'思路难以落地的技术问题。而且它默认了这座塔已经站不住 —— '+
     '一座靠新结构站着的塔，还是不是那座「历经四十余次地震而不倒」的塔。'+
     '官方口径里的原话是：同时也是对木塔自身挺立的一种否定。',
  who:'21 世纪初四类方案之一 · 那句原话出自国家文物局与中国文化遗产研究院项目组'+
      '2020-10-20 · 反对者：钢铁与木构以柔克刚的特性相冲'+
      '（中国文物报 2022-07-15）· 图样：中国城市规划设计研究院'},

 {n:'其四',cn:'现状加固',sub:'不改变整体结构，只支住最险的地方',
  mode:'brace',depth:2,dlab:'二层西南加设辅柱，局部残损构件修缮',
  p:['不动整体结构，只在最危险的部位贴着原柱加设辅柱、穿过平坐落到下一层承重。'+
     '木塔的加固传统本来就是加辅柱：金明昌年间那次大修，四个明层共加了 104 根。'+
     '这是 2006 年之后一直在走的路，也是此刻正在做的事。',
     /* lara 2026-08-27：原第五格「眼下」撤掉后，2021 评估与 2024 年那套机制
        并入这一格 —— 现状加固就是「眼下」。2021 那份评估的完整结论（含「塔不会
        明天倒」）v8 里由 其四·倾 的末格讲一遍，这里不重复，只留
        三十年难产的症结：它正是隔壁那条「研究性复建」建议要解的东西。
        塔上那两道红标也从这一格出，标的就是下面 who 里点名的 W22、W23。
        v9 注意：lara 重写其四时把「不会邻柱连续倒塌、不会立即整体失稳」那一段
        删掉了，所以「塔不会明天倒」这条结论现在整个页面上都不再出现。要补，
        补在这里最顺（现状加固讲的就是眼下），等她定。 */
     '2024 年 11 月，国家文物局与山西省人民政府建立保护工作协调机制，'+
     '领导小组和专家委员会各开了第一次会，审议的仍是局部加固与全面测绘的方案。'+
     '修缮方案自二十世纪九十年代起「难产」近三十年，症结是基础性技术研究不足，'+
     '各方难以形成一致意见。塔上到今天一根新构件也没有加。'],
  yes:'风险最低，可逆，符合最小干预。白雪冰：相当于给一个行动不便的老人拄上一根拐杖。'+
      '侯卫东：能控制致命伤不继续发展，让塔身上的「癌细胞」不再扩散。',
  no:'解决不了根本问题。2014 年批准、2016 年试验性施工的加固方案，'+
     '2017 年底因未能遏止倾斜趋势而暂停。王永先：局部加固仅是权宜之计，先保命控风险。'+
     '中国文化遗产研究院自己的说法是「治标」，目标只是减缓倾斜发展。'+
     '它把决定交给了下一代，而监测数据显示速率在加快。',
  who:'国家文物局 2006 年至今的方针 · 2021 年评估：二层明层角柱 W22、平柱 W23 '+
      '已进入变形急剧加速阶段，处于失稳破坏的危险状态 —— 塔上那道红标指的就是'+
      '这一处，二层西南 · 二层 23 号柱倾斜量最大，2015 年实测超过 56 厘米，'+
      '近五年每年还增加 2 毫米多（永昕群）'}
];
let fixIdx=0;
/* 抬升那一格要写的沉降剖面，单位毫米，负值是顶升。直接写十个断点而不是走
   lnCum：lnCum 的增量落在柱身那一段，抬升会把二层的柱子拉长；直接写可以把
   过渡放在二层柱头之上的斗栱与暗层那一段，也就是真要打开的那一层，
   上面三层则整块干净地升起来。 */
/* 二层明层柱高是 2907mm（576mm 那根柱子的全长），照这个抬塔剎会顶出取景带。
   相机锁死是这一章的立论，不能为了一格把它放开，所以抬 1800mm —— 约三分之二
   柱高，缺口一眼看得出，塔剎还留在画面里。卡片上标了示意。 */
/* 抬升那一格：把塔在接缝处裁开，另render一份只留上半截的副本，整体平移。

   第一版走的是倾斜 shader 的沉降通道（给负值就是顶升），错在原理上：顶点位移
   对跨过接缝的构件只能拉伸 —— 暗层的柱和墙从缝下长到缝上，下半截的顶点不动、
   上半截的顶点升 2.35 米，那根柱子就被抻成 2.9 米高的一片空白墙。抬升 12 米
   的极端测试把这件事照得很清楚：塔顶确实升上去了，代价是中间多出一层白墙。

   顶点位移做不出干净的缝，这是原理性的。所以改成：
     · 原来那 13 个合并网格用 CLIP 裁在接缝以下（营造动画那套现成的裁剪面）
     · 克隆一份，材质换成裁在接缝以上的平面，整组 position.y 加上抬升量
   两份共用同一批几何体，只多 13 次 draw call。倾斜照旧 —— 两份走的是同一个
   shader、同一批 uniform，上半截的歪法跟下半截连着。

   接缝放在 25.6 米，二层之上那道暗层里：暗层是刚性层，真要下刀就在这儿，
   而且这个高度落在二层与三层两道屋檐之间的空处，缝看得见。 */
/* 2350 毫米在暗层那个高度不够看：缝开在平坐、勾栏、两道屋檐之间，横线本来就
   密，一条 0.5 单位的缝混进去读不出来。3200 够看，但钢支承塔架进来之后
   顶上要腾出棚脊的位置（16.10 单位），抬得越高棚就越高、取景带就越松、
   四张卡里的塔就越小。取 2600（0.553 单位）：缝还是读得出来，而且现在
   缝的位置有钢架的系梁和吊钩替它说话，不必全靠缝本身的高度。 */
const FIX_LIFT_MM=2600;
const LIFT_JOINT_M=25.60;
const LIFT_JOINT_Y=LIFT_JOINT_M*M;
/* 缝的顶：抬起之后上半截的底面。钢架那道接住上部的横梁架在这个高度。 */
const LIFT_TOP_Y=LIFT_JOINT_Y+FIX_LIFT_MM*0.001*M;
/* 上半截用的裁剪面：法向朝上、常数取负，保留接缝以上 */
const CLIP_UP=new T.Plane(new T.Vector3(0,1,0),-LIFT_JOINT_Y);
let liftGroup=null,_liftFor=null;
function buildLiftGroup(){
  const g=new T.Group();
  _liftFor=modelGroup;
  modelGroup.children.forEach(m=>{
    if(!m.isMesh)return;
    /* Material.copy 不带 onBeforeCompile，所以克隆之后要重新打一次倾斜补丁，
       不然上半截是直的、下半截是歪的 */
    /* solidMat 是 applyCutaway 存下的原material：万一在剖切态下重建，
       克隆不该继承那层半透的皮 */
    const mat=(m.userData.solidMat||m.material).clone();
    mat.clippingPlanes=[CLIP_UP];mat.clipShadows=true;
    leanPatch(mat);
    const c=new T.Mesh(m.geometry,mat);
    c.name=m.name;c.castShadow=m.castShadow;c.receiveShadow=m.receiveShadow;
    c.frustumCulled=false;
    g.add(c);
  });
  g.position.y=FIX_LIFT_MM*0.001*M;
  g.visible=false;scene.add(g);
  liftGroup=g;return g;
}
/* 沉降通道回归本职：只画累计压缩，不再兼职顶升 */
function fixSink(){}

/* 装回来最多装到哪：三层柱身的上部。
   这个高度是「装不回去」那一刻的塔高，不是进这一格的初始状态 —— 初始状态是
   完整的塔（见下面 stripB.top）。lara 2026-08-26：「一来就是把什么砍掉了一截」。
   原来进来就停在这个高度上，四格里只有这一格的塔是矮的，相机又锁死，上面空掉
   一半画面，读成模型被锯了，而不是读成落架。拆这件事得由手势做出来才算数。
   两条约束定了这个高度。一、楼板盖只在柱身段有定义，而 tAtHeight 是采样近似，
   误差会把裁剪面顶出柱身上界，盖就不画、剖面成了敞口 —— 所以要落在柱身里，
   让三成。二、装回来停在三层，跟拆之前的完整塔并在一条视线上，缺掉的两层
   半就是「装不回去」的那部分，缺口本身在说话。 */
const FIX_STRIP_Y=LY.st[2].y0+(LY.st[2].y1-LY.st[2].y0)*0.70;
/* 落架落的是木构架，砖石台基留在原处 —— 拆到底就是这里 */
const STRIP_FLOOR_Y=LY.base.y2;
/* 其一的落架动画。营造那条时间轴上，t 是唯一的自变量：裁剪面、楼板盖、
   脚手架、地面都挂在它上面，所以「拆」就是把 t 往回推 —— 营造动画倒着放。
   自己走，不用长按。lara 2026-08-26 第二轮：「还是不好，不如最开始那个建塔的
   动画，现在这个好像就是消失，根本没有 3d 的感觉，而且还得长按。」两条都对，
   而且是同一个病根：
   一、上一版把营造那五组脚手架全程关掉了（怕它们浮在半空）。那个担心是错的：
     裁剪面停在第 k 段时，塔的形状跟营造到第 k 段时一模一样 —— 脚手架本来就是
     照那一刻的塔围出来的，正着看合身，倒着看也合身。关掉之后画面上只剩一个
     往下滑的剖切面，木头一层层「消失」，没有工地、没有近处的杆件，也就没有
     空间可读。现在全程开着：外面一座不动的全高保护棚，里面一组随工作面往下
     退的木脚手架，塔在两层架子中间矮下去 —— 深度是这么来的。
   二、长按把「看」变成了「操作」。开篇那段建塔动画好看恰恰因为它自己走，
     人只用看。所以这一段也自己走：进这一格 → 停半秒（先看清完整的塔立在
     已搭好的棚里，真落架就是这个次序）→ 往下拆到台基 → 停一下（空台基）→
     往回装，到三层柱头停住。
   停在三层不是随便挑的：官方否掉落架的理由正是构件矫正之后装不进旧榫口，
   所以往回装那一段刻意比拆慢一半，然后卡住 —— 缺掉的两层半空在棚子里，
   缺口自己就是论据。看完想再看，点一下那颗药丸，从满高重来。
   applyTime 里 lastStage 只在开头钉一次：它每帧被清成 -1 的话，那块 stage
   判定帧帧都成立，工序名的牌子就会一直重写（音效已经拆了，但牌子还在）。
   三、往下那一段的速度就是营造那条时间轴的原速（走完 DUR = 1.0）。她说建塔
     那段好看，那就照原速倒着放：buildHeightAt 每一段是 easeInOut，而且在段尾
     留了 7% 的停顿，「一层一层拆、每层停一下」的节奏本来就在里面，不用另写。
   3D 感靠两样东西：不动的全高保护棚（塔在它里头矮下去，前后的杆件给出视差），
   和跟着工作面走的那圈钢跳板（deckAt）。营造那五组木脚手架为什么不能用，
   理由写在 buildDeck 上面。 */
const STRIP_V_DOWN=1.00,STRIP_V_UP=0.62;
const STRIP_T_WAIT=0.55,STRIP_T_PAUSE=0.75;
let stripB={top:0,jam:0,floor:0},
    stripPhase='wait',stripClock=0,stripT=0;
function applyStripT(v){
  stripT=Math.max(stripB.floor,Math.min(stripB.top,v));
  playing=false;
  applyTime(stripT);
  /* 营造那五组木脚手架关掉，理由写在 buildDeck 上面 */
  scafGroups.forEach(g=>{g.visible=false;});
  /* tAtHeight 是采样求来的，会差几厘米。卡住那一刻钉回目标值，让剖面正好落在
     柱身里、楼板盖画得出来（盖只在柱身段有定义，顶出去就是个敞口）。 */
  if(stripPhase==='jam'){
    CLIP.constant=FIX_STRIP_Y;
    const ca=capAt(FIX_STRIP_Y);
    if(ca>0.01){
      capMesh.visible=true;
      capMesh.scale.set(ca,ca,1);
      capMesh.position.y=FIX_STRIP_Y-0.003;
    }
  }
  /* 跳板跟着工作面 —— 这一格的深度全在这一行上 */
  deckAt(CLIP.constant);
}
/* 从满高重演一遍。lastStage 钉成满高那一段的序号而不是 -1：钉 -1 的话
   applyTime 会认为跨段了，而满高那一段的 ping 是那口钟（营造完成），
   于是每次进这一格、每次点重看都先当一下钟。 */
function stripRestart(){
  stripPhase='wait';stripClock=0;
  lastStage=stageIndexAt(stripB.top);
  applyStripT(stripB.top);
  renderStripBtn();
}
function stepStrip(dt){
  if(!fixOn||FIX[fixIdx].mode!=='strip'){resetStripAudio();return;}
  if(stripPhase==='jam')return;
  if(stripPhase==='wait'||stripPhase==='pause'){
    stripClock+=dt;
    /* 「唯余台基」这一格要静下来。空台基站在保护棚里，这一格的重量都在这一秒
       上（这句话本来就写在 STRIP_T_PAUSE 上面），往里面塞声音是把它说轻了。
       只 resetStripAudio() 不够 —— 那只是不再喂，床还要按自然衰减淡将近两秒，
       比这一格本身还长。所以进这一格的时候用 0.34 秒收掉，剩下的四成时间是
       真的空的。收的动作放在 pause 的第一帧（wdCut 是幂等的，重复调不出事）。 */
    resetStripAudio();
    if(stripPhase==='pause')wdCut('strip',0.34);
    const lim=stripPhase==='wait'?STRIP_T_WAIT:STRIP_T_PAUSE;
    if(stripClock>=lim){
      stripPhase=stripPhase==='wait'?'down':'up';
      stripClock=0;renderStripBtn();
    }
    return;
  }
  if(stripPhase==='down'){
    const nv=stripT-STRIP_V_DOWN*dt;
    if(nv<=stripB.floor){
      /* 拆到底先停一下 —— 空台基站在棚子里，这一格的重量都在这一秒上 */
      applyStripT(stripB.floor);
      stripPhase='pause';stripClock=0;resetStripAudio();renderStripBtn();
    }else{applyStripT(nv);driveStrip(dt,'strip');}
  }else{
    const nv=stripT+STRIP_V_UP*dt;
    if(nv>=stripB.jam){
      stripPhase='jam';
      applyStripT(stripB.jam);renderStripBtn();
      resetStripAudio();
      /* 归安那张床立刻收掉，再敲那一记 —— 不收的话它还要淡两秒，那一记就落在
         一片还在响的装配声里，听着像装配过程中的一下，而不是装配停了。 */
      wdCut('work',0.22);
      /* 榫口不合。全篇唯一一记钉在事件上的音效 —— 那里确实有一件离散的事
         发生了，而且没成功。响完就没有余音，塔停在缺两层半的样子里。 */
      sfx('jam_knock',{gain:0.62});
    }else{applyStripT(nv);driveStrip(dt,'work');}
  }
}
/* 药丸平时是个读数（现在演到哪儿了），卡住之后才变成一个可点的「再看一遍」。
   动画自己走，所以它不该长得像个必须按的开关 —— 只有 jam 那一态给强调色和
   回环记号。 */
function renderStripBtn(){
  const b=document.getElementById('striphold');
  if(!b)return;
  const on=fixOn&&FIX[fixIdx].mode==='strip';
  b.classList.toggle('on',on);
  const jam=on&&stripPhase==='jam';
  b.classList.toggle('hot',on&&(stripPhase==='down'||stripPhase==='up'));
  b.classList.toggle('jam',jam);
  b.setAttribute('aria-label',jam?'再看一遍落架':'落架动画进行中');
  if(!on)return;
  /* lara 2026-08-27 要更雅致的说法。五个词都取修缮行里的现成话，不是文言仿写：
     「归安」是古建修缮的正式工序名（构件复归原位），「榫口不合」正好就是这个
     方案被搁置的那条理由 —— 官方口径写的是「变形矫正后难以安装」，卡片正文也
     在说这件事，这里的词跟那里对得上。五个都是四字，比原来的五字短，药丸不会
     顶宽。备选见下面注释。 */
  const L={wait:'棚架既立',down:'逐层解落',pause:'唯余台基',
           up:'依次归安',jam:'榫口不合&nbsp;&nbsp;↺'};
  /* 换一套的话，整组一起换，别混：
     偏白：棚架已立 / 自上而下 / 唯余台基 / 依次归安 / 归不回原位
     偏文：棚成塔在 / 次第解落 / 台基独存 / 复归旧位 / 旧榫不纳
     「解落」也可写「卸落」，前者对着「落架」的落，后者更直白。 */
  if(b.innerHTML!==L[stripPhase])b.innerHTML=L[stripPhase];
}
function applyFixMode(){
  const f=FIX[fixIdx];
  const ap=document.getElementById('app');
  if(ap)ap.classList.toggle('fix',fixOn);
  const rail=document.getElementById('fixrail');
  if(rail)rail.classList.toggle('on',fixOn);
  /* 傾斜那张卡让位，纪年轨也让位 —— 这一章不是一段时间 */
  const lc=document.getElementById('leancard');
  if(lc&&fixOn)lc.classList.remove('on');
  const er=document.getElementById('era');
  if(er&&fixOn)er.classList.remove('on');

  if(!fixOn){
    /* 离开这一章：塔恢复建完，四套新构件收起，外皮换回不透明。
       静音跑 —— 这一下是把塔摆回去，不是把它盖起来。 */
    lastStage=-1;playing=false;quietTime(DUR);
    if(cageGroup)cageGroup.visible=false;
    if(auxGroup)auxGroup.visible=false;
    if(mastGroup)mastGroup.visible=false;
    if(shedGroup)shedGroup.visible=false;
    if(jackGroup)jackGroup.visible=false;
    if(liftGroup)liftGroup.visible=false;
    if(deckGroup)deckGroup.visible=false;
    if(critGroup)critGroup.visible=false;
    /* 剖切不在这儿还：setChapter 顶上那道 guard 已经按目标章节把 cutMode 设好，
       并且 else 分支末尾还会再 applyCutaway 一次。这里动它会把它顶回去。 */
    lnPush();
    const fc=document.getElementById('fixcard');
    if(fc)fc.classList.remove('on');
    /* 落架那段停在 jam 上，下次进来 stripRestart 会重置；这里只把药丸收掉 */
    renderStripBtn();
    return;
  }
  /* 塔先回到 2020 的实测状态：四个方案要修的就是这个状态 */
  lnPush();
  /* 换风格会重建 modelGroup，抬升那份克隆和幽灵外皮都得跟着重建 */
  if(liftGroup&&_liftFor!==modelGroup){disposeGroup(liftGroup);liftGroup=null;}
  if(!cageGroup)cageGroup=buildCage();
  if(!auxGroup)auxGroup=buildAux();
  if(!mastGroup)mastGroup=buildMasts();
  if(!shedGroup)shedGroup=buildShed();
  if(!jackGroup)buildJacks();
  if(!liftGroup)buildLiftGroup();
  if(!deckGroup)buildDeck();
  if(!critGroup)buildCrit();
  /* 跳板只属于落架那一格；进别的格先收掉，applyStripT 会在需要时摆回去 */
  if(deckGroup&&f.mode!=='strip')deckGroup.visible=false;

  /* 一、落架 —— 营造那条时间轴倒着放。走时间轴而不是直接写 CLIP：
     applyTime 会把楼板盖摆上，剖面读成一层楼板，不是一个锯口。 */
  if(f.mode==='strip'){
    /* 进这一格是完整的塔（跟另外三格一样高）、棚子已经立好，然后自己往下拆 */
    stripB={top:DUR,jam:tAtHeight(FIX_STRIP_Y),floor:tAtHeight(STRIP_FLOOR_Y)};
    stripRestart();
  }else if(f.mode==='lift'){
    /* 下半截裁在接缝以下，上半截是那份克隆，整组已经平移过 */
    lastStage=-1;playing=false;
    applyTime(DUR);
    CLIP.constant=LIFT_JOINT_Y;
    capMesh.visible=false;
  }else{
    lastStage=-1;playing=false;
    applyTime(DUR);            /* 其余两格塔是完整的 */
  }
  if(liftGroup)liftGroup.visible=(f.mode==='lift');

  /* 一 落架：工地保护棚（八角钢笼），跟着拆到哪儿就到哪儿
     二 抬升：门式钢支承塔架 + 缝里的顶撑
     三 支撑：塔内回廊的格构钢柱
     四 加固：二层西南的辅柱
     三、四的构件全在塔内，所以这两格把外皮压成半透 */
  if(cageGroup){
    cageGroup.visible=(f.mode==='strip');
    /* 棚子全高、全程不动。真的落架是先罩住整座塔再往下拆，所以进这一格就该
       看见一座完整的塔站在完整的棚里；塔在棚里往下落，棚子是那个比着看的
       不动的东西。原来棚顶跟着裁剪面定在三层之上一米多，于是一进来棚和塔
       一起矮了半截，两个都像被削过。 */
    if(f.mode==='strip')cageUpTo(CAGE_TOP+1);
  }
  if(shedGroup)shedGroup.visible=(f.mode==='lift');
  if(jackGroup)jackGroup.visible=(f.mode==='lift');
  if(mastGroup)mastGroup.visible=(f.mode==='scaffold');
  if(auxGroup)auxGroup.visible=(f.mode==='brace');
  /* 那道红标：评估点名的两根二层柱（W22、W23）。原来它只属于第五格「眼下」，
     那一格撤掉之后跟着现状加固走 —— 加固要贴的就是这两根柱，辅柱（auxGroup）
     和红标在塔上是同一处，二层西南。塔身是剖开的，但这道标在轮廓之外，照旧看得见。 */
  if(critGroup)critGroup.visible=(f.mode==='brace');
  /* 塔内那两格借其三的剖切，另外两格塔是实的 —— 落架和抬升看的是外面。 */
  const wantCut=(f.mode==='scaffold'||f.mode==='brace')?2:0;
  if(cutMode!==wantCut){cutMode=wantCut;applyCutaway();}

  renderFixCard();markFixRail();renderStripBtn();
  placeCamera(1);placePlumb();
}
function setFix(i){
  fixIdx=((i%FIX.length)+FIX.length)%FIX.length;
  applyFixMode();
  closeSheet();layout();
}
function renderFixCard(){
  const el=document.getElementById('fixcard');
  if(!el)return;
  const f=FIX[fixIdx];
  /* 两栏对读：支持 / 反对。lara 2026-08-27：原来还有第三栏「官方否决理由」，
     而前三格的第三栏跟「代价」那一栏说的是同一件事（否决理由本来就是反对方最硬
     的论据），第四格的第三栏又根本不是否决理由而是作者自己的判断 —— 一栏三义，
     读者只会问「这个官方是谁」。所以第三栏撤了：官方那句话并进「反对」，说它的
     人和场合写进下面的出处栏。fx-verdict 这条样式也一并删了。 */
  const arg=(f.yes||f.no)
    ? '<div class="fx-arg">'+
        (f.yes?'<div class="fx-ok"><em>支持</em>'+f.yes+'</div>':'')+
        (f.no ?'<div class="fx-no"><em>反对</em>'+f.no+'</div>':'')+
      '</div>'
    : '';
  /* 建议自带出处：它跟这一格的搁置理由不是同一个主体、同一个年份，共用下面那条
     fx-src 会把两个「官方」糊在一起，而那正是要讲清楚的地方。 */
  const adv=f.adv
    ? '<div class="fx-arg"><div class="fx-adv"><em>'+(f.advLab||'建议')+'</em>'+
        f.adv+(f.advBy?'<span class="fx-advsrc">'+f.advBy+'</span>':'')+
      '</div></div>'
    : '';
  el.innerHTML='<div class="fx-rule"></div>'+
    '<h5>'+f.cn+'</h5><div class="fx-sub">'+f.sub+'</div>'+
    /* 深度尺紧跟标题：收起状态下就能看见「要动多少」，
       否则四个方案名读起来一样重 */
    '<div class="fx-depth"><div class="fx-dline">'+
      '<span class="fx-dnum">'+f.depth+'%</span>'+
      '<span class="fx-dbar"><i style="width:'+f.depth+'%"></i></span>'+
      '<span class="fx-dnum">干预深度</span></div>'+
      '<div class="fx-dlab">'+f.dlab+(f.depth?'　示意':'')+'</div></div>'+
    f.p.map(x=>'<p>'+x+'</p>').join('')+
    arg+adv+
    '<div class="fx-src">'+(f.who||'')+'</div>';
  el.classList.toggle('on',fixOn);
}
let fixBtns=null;
function buildFixRail(){
  const el=document.getElementById('fixrail');
  if(!el||fixBtns)return;
  fixBtns=FIX.map((f,i)=>{
    const b=document.createElement('button');
    b.type='button';
    b.innerHTML='<i class="fx-gate" style="--fx-d:'+f.depth+'%"></i><b>'+f.cn+'</b>';
    b.setAttribute('aria-label',f.cn);
    b.addEventListener('click',ev=>{ev.stopPropagation();setFix(i);});
    el.appendChild(b);return b;
  });
}
function markFixRail(){
  if(!fixBtns)return;
  fixBtns.forEach((b,i)=>b.classList.toggle('hot',i===fixIdx));
}
/* 点一下重演一遍。动画自己走，这里不再有长按 —— 长按把「看」变成了「操作」，
   而开篇那段建塔动画好看恰恰因为人只用看。演完卡在「榫口不合」上，想再看点它。 */
(function bindStripReplay(){
  const b=document.getElementById('striphold');
  if(!b)return;
  const replay=e=>{
    if(e){e.preventDefault();e.stopPropagation();}
    if(!fixOn||FIX[fixIdx].mode!=='strip')return;
    resumeAudio();
    stripRestart();
  };
  b.addEventListener('click',replay);
  b.addEventListener('keydown',e=>{
    if(e.key!==' '&&e.key!=='Enter')return;
    e.preventDefault();if(!e.repeat)replay(null);
  });
})();
window.__fix=i=>{if(!fixOn)setChapter(4,true);
  if(i!==undefined)setFix(i);
  placeCamera(1);renderer.render(scene,camera);
  return {on:fixOn,idx:fixIdx,cn:FIX[fixIdx].cn,mode:FIX[fixIdx].mode,
          clip:+CLIP.constant.toFixed(2),cap:capMesh.visible,
          sink:+LNU.uLnS.value[9].toFixed(4),liftMM:FIX_LIFT_MM,
          cage:!!(cageGroup&&cageGroup.visible),
          cageBars:cageGroup?cageGroup.children.length:0,
          shed:!!(shedGroup&&shedGroup.visible),
          shedBars:shedGroup?shedGroup.children.length:0,
          mast:!!(mastGroup&&mastGroup.visible),
          mastBars:mastGroup?mastGroup.children.length:0,
          aux:!!(auxGroup&&auxGroup.visible),
          auxBars:auxGroup?auxGroup.children.length:0,
          cut:cutMode,
          jacks:!!(jackGroup&&jackGroup.visible),
          lift:!!(liftGroup&&liftGroup.visible),
          liftY:liftGroup?+liftGroup.position.y.toFixed(3):0,
          zoomT:zoomT,camYT:+camYT.toFixed(2),
          stripPhase:stripPhase,stripT:+stripT.toFixed(3),
          stripClock:+stripClock.toFixed(2),
          deck:!!(deckGroup&&deckGroup.visible),
          deckY:deckGroup?+deckGroup.position.y.toFixed(2):0,
          crit:!!(critGroup&&critGroup.visible),
          critBars:critGroup?critGroup.children.length:0,
          /* 那道红标的位置是算出来的（现状加固那一格，原第五格「眼下」的遗产），
             所以把它们投到屏幕上的坐标一起吐出来，肉眼看不清时用它核。 */
          critAt:critGroup?critGroup.children.map(m=>{
            const v=new T.Vector3();m.getWorldPosition(v);v.project(camera);
            return [Math.round((v.x*0.5+0.5)*canvasW),
                    Math.round((-v.y*0.5+0.5)*canvasH)];}):null,
          stripBtn:(function(){const b=document.getElementById('striphold');
            return b?{on:b.classList.contains('on'),
                      jam:b.classList.contains('jam'),
                      txt:b.textContent}:null;})(),
          plaqueHid:(function(){const p=document.getElementById('plaque');
            return p?getComputedStyle(p).opacity:null;})(),
          extraVisible:[cageGroup,auxGroup,mastGroup,shedGroup,jackGroup,liftGroup,
                        deckGroup,critGroup].filter(g=>g&&g.visible).length,
          scafShown:scafGroups.filter(g=>g.visible).length};};
/* headless 把 rAF 掐到一秒一帧，落架那段在测试机里等不到自然帧。
   这个入口拿真的 dt 驱动同一段代码：__strip(40) 等于让它自己走四秒。
   第一个参数传 true 是「先从满高重来」，留着是为了老的调用还能跑。 */
window.__strip=(restart,n,dt)=>{
  if(restart===true)stripRestart();
  for(let i=0;i<(n||0);i++)stepStrip(dt||0.10);
  placeCamera(1);renderer.render(scene,camera);
  return window.__fix();};
/* 取景是量着调的：改这两个数、看塔剎和棚脊有没有进画面 */
window.__fixView=(z,y)=>{if(z!==undefined)FIX_ZOOM=z;if(y!==undefined)FIX_CAMY=y;
  lnUser=false;lnFrame();placeCamera(1);placePlumb();renderer.render(scene,camera);
  return {FIX_ZOOM:FIX_ZOOM,FIX_CAMY:FIX_CAMY,zoomT:zoomT,camYT:camYT};};

/* --- the plumb reference on the second storey -------------------------- *
 * The published number is 柱頭相對柱腳, head against foot of one 明層 column, so
 * that is what gets drawn: a plumb line erected on the foot and the offset of
 * the head measured off it. 576 mm on a 65.77 m tower is seven pixels of apex
 * travel and no caption survives that; 576 mm against a 2.9 m column is a
 * quantity you can see. The markers ride the near edge of the outer ring, which
 * from the south-east corner is the north-east side — the way the tower is
 * going.
 * ------------------------------------------------------------------ */
let plumbEls=null;
const _pv=new T.Vector3();
function buildPlumb(){
  const svg=document.getElementById('plumbsvg');
  if(!svg||plumbEls)return;
  const mk=(t,o)=>{const n=document.createElementNS(SVGNS,t);
    for(const k in o)n.setAttribute(k,o[k]);svg.appendChild(n);return n;};
  /* 这几笔画在天上，所以用 --air 那一套（见样式表顶上那段注）：白天是墨，
     夜里翻成骨白和亮一档的朱，不然「夜」那一档整套铅垂线贴在暗天上就没了。 */
  const ln=mk('line',{'stroke-width':'1','stroke-dasharray':'3 4','opacity':'.55'});
  ln.style.stroke='var(--air2)';
  const c0=mk('circle',{'r':'2.4','fill':'none','stroke-width':'1','opacity':'.75'});
  c0.style.stroke='var(--air2)';
  const foot=mk('circle',{'r':'2.0','opacity':'.55'});
  foot.style.fill='var(--air2)';
  const arm=mk('line',{'stroke-width':'1.5'});
  arm.style.stroke='var(--air-a)';
  const c1=mk('circle',{'r':'2.6'});
  c1.style.fill='var(--air-a)';
  /* leader out past the eave, then a plate, then the type. Order is paint
     order: the plate has to go in before the text or it covers it. */
  const lead=mk('line',{'stroke-width':'1','opacity':'.5'});
  lead.style.stroke='var(--air-a)';
  const plate=mk('rect',{'rx':'1.5','opacity':'.92'});
  plate.style.fill='var(--pl-a)';
  plate.style.stroke='var(--pl-br)';
  plate.setAttribute('stroke-width','1');
  const tx=mk('text',{});
  plumbEls={ln:ln,c0:c0,foot:foot,arm:arm,c1:c1,lead:lead,plate:plate,tx:tx};
}
function placePlumb(){
  const host=document.getElementById('plumb');
  if(!host)return;
  /* 576 mm on a 65 m tower is a handful of pixels: the number only means
     anything with the upright reference drawn beside it. v5 hid this on a
     phone, which left 其四 as a bar chart next to a tower that looks straight.
     It is the whole point of the chapter, so it stays. */
  /* 其五 关掉铅垂线：576mm 的读数是其四的活，而抬升那一格的标记锚在
     几何上、不跟着 shader 的顶升走，留着会指错位置 */
  host.classList.toggle('on',leanOn&&!fixOn);
  if(!leanOn||!plumbEls)return;
  const y0=LN_Ym[2]*M,y1=LN_Ym[3]*M,R=LY.st[1].R;
  const dF=LNU.uLnD.value[2],dH=LNU.uLnD.value[3];
  const sF=LNU.uLnS.value[2],sH=LNU.uLnS.value[3];
  const bx=LNU.uLnB.value.x,bz=LNU.uLnB.value.y;
  /* the 576 mm was taken off the SOUTH-WEST column, and from the south-east
     corner south-west is the left-hand edge of the silhouette. Drawn there, the
     head leans right, into the tower, which is the 向內傾 the reports describe.
     Drawn on the near edge instead it would read as bulging out. */
  const fx=-Math.cos(curAz)*R,fz=Math.sin(curAz)*R;
  const pr=(x,y,z)=>{_pv.set(x,y,z).project(camera);
    return [(_pv.x*0.5+0.5)*canvasW,(-_pv.y*0.5+0.5)*canvasH];};
  const A=pr(fx+bx*dF,y0-sF,fz+bz*dF),
        B=pr(fx+bx*dF,y1-sF,fz+bz*dF),
        C=pr(fx+bx*dH,y1-sH,fz+bz*dH);
  const E=plumbEls,at=(el,p,q)=>{
    el.setAttribute('x1',p[0].toFixed(1));el.setAttribute('y1',p[1].toFixed(1));
    el.setAttribute('x2',q[0].toFixed(1));el.setAttribute('y2',q[1].toFixed(1));};
  at(E.ln,A,B);at(E.arm,B,C);
  E.foot.setAttribute('cx',A[0].toFixed(1));E.foot.setAttribute('cy',A[1].toFixed(1));
  E.c0.setAttribute('cx',B[0].toFixed(1));E.c0.setAttribute('cy',B[1].toFixed(1));
  E.c1.setAttribute('cx',C[0].toFixed(1));E.c1.setAttribute('cy',C[1].toFixed(1));
  const e=ERA[eraIdx],v=e.d[1],ex=LN_EXAG[exagIdx];
  E.tx.textContent=v?('二层柱头偏东北 '+(e.soft?'约 ':'')+Math.round(v)+' mm'+
                      (ex>1?' · 放大 ×'+ex:'')):'二层柱头　正';
  /* outward from the tower's own axis, not from the middle of the frame, or
     the caption ends up lying across the timber it is measuring */
  const ax=pr(0,y1,0)[0],out=B[0]<ax?-1:1;
  /* and 'clear of the column' is not clear of the tower: the 斗栱 above the
     head and the eave above that both reach RE, a good 3 m further out than
     the column ring the number is taken off. The caption goes past RE and a
     leader walks back in to the marker. */
  const RC=LY.st[1].RE*1.05;
  const L=pr(-Math.cos(curAz)*RC+bx*dH,y1-sH,Math.sin(curAz)*RC+bz*dH);
  let lx=out<0?Math.min(L[0],C[0]-16*K):Math.max(L[0],C[0]+16*K);
  /* On a 1512 frame there was always room outside the eaves for this caption.
     On 390 there is not: RE lands past the edge and the whole label — '二層柱頭
     偏東北 191 mm' — walked off the left side of the screen. Clamp the leader's
     far end into the frame with room for the type, and if that pulls it back
     inside the marker, put the caption on the other side instead. */
  const need=Math.min(150,canvasW*0.42);
  if(out<0&&lx<need)lx=need;
  if(out>0&&lx>canvasW-need)lx=canvasW-need;
  let side=out;
  if(side<0&&lx>C[0]-16*K)side=1;
  else if(side>0&&lx<C[0]+16*K)side=-1;
  at(E.lead,C,[lx,C[1]]);
  E.tx.setAttribute('x',(lx+side*5*K).toFixed(1));
  E.tx.setAttribute('y',(C[1]-7*K).toFixed(1));
  E.tx.setAttribute('text-anchor',side<0?'end':'start');
  /* a plate sized off the type itself, because the string changes length with
     the era and with the exaggeration label */
  const bb=E.tx.getBBox();
  E.plate.setAttribute('x',(bb.x-4*K).toFixed(1));
  E.plate.setAttribute('y',(bb.y-3*K).toFixed(1));
  E.plate.setAttribute('width',(bb.width+8*K).toFixed(1));
  E.plate.setAttribute('height',(bb.height+5*K).toFixed(1));
}
/* --- the mode ---------------------------------------------------------- */
function applyLeanMode(){
  buildEraStrip();buildPlumb();
  const el=document.getElementById('era');
  if(el)el.classList.toggle('on',leanOn&&!fixOn);
  if(leanOn){
    /* a focused label is pinned to a coordinate on the upright tower, so it has
       to let go before the frame starts moving */
    if(focusPin>=0)setFocus(-1);
    /* the lean runs south-west to north-east, so from due south it is mostly
       pointing away from the reader. From the south-east corner it is sideways,
       which is the only angle it can be read at. */
    orbAz=Math.PI/4;lnUser=false;lnFrame();
    if(CLIP.constant<13.9){lastStage=-1;playing=false;quietTime(DUR);}
    setEra(eraIdx,true);
  }else{
    orbAz=0;zoomT=1;camYT=CAM_H;lnPlay=false;
    lnFrom=null;lnTo=null;lnMix=1;
    lnWrite(lnZero,0,0,1);
  }
  renderLeanCard();
  const lc=document.getElementById('leancard');
  if(lc)lc.classList.toggle('on',leanOn&&!fixOn);
  const ap=document.getElementById('app');
  if(ap)ap.classList.toggle('lean',leanOn);
  /* the 傾斜 button this used to relabel is gone — it is 其四 now. It was also
     where a real bug lived: setBtn translates against data-skin, and the only
     call that ever wrote this button's value came from applyStyle(0), which
     runs BEFORE applySkin(0) sets that attribute. Every other control got
     written a second time afterwards; this one did not, so it sat there in
     English reading PLUMB until you pressed it. applySkin now re-writes 標註
     for the same reason, so init order cannot bite the survivors. */
  if(typeof refreshNote==='function')refreshNote();
}
/* keyboard alias for the last chapter, kept because L was in the shortcuts */
function toggleLean(){setChapter(leanOn?0:3);}

window.__lean=on=>{setChapter(on?3:0,true);
  placeCamera(1);placePlumb();renderer.render(scene,camera);};
window.__era=(i,inst)=>{if(!leanOn)setChapter(3,true);
  lnPlay=false;setEra(i,inst===undefined?true:inst);
  placeCamera(1);placePlumb();renderer.render(scene,camera);
  return window.__leanDbg();};
window.__exag=i=>{exagIdx=((i%LN_EXAG.length)+LN_EXAG.length)%LN_EXAG.length;
  lnPush();renderLeanCard();placePlumb();renderer.render(scene,camera);
  return window.__leanDbg();};
/* headless throttles requestAnimationFrame to about one tick a second and the
   loop caps dt at 0.05, so a 1.15 s tween takes half a minute of wall clock in
   a test harness. This drives the same code with a real dt. */
window.__leanStep=(n,dt)=>{for(let i=0;i<(n||1);i++)stepLean(dt||0.05);
  placeCamera(1);placePlumb();renderer.render(scene,camera);return window.__leanDbg();};
window.__leanView=(z,y)=>{LN_ZOOM=z;LN_CAMY=y;zoomT=z;camYT=y;
  placeCamera(1);placePlumb();renderer.render(scene,camera);return [z,y];};
window.__leanDbg=()=>({on:leanOn,era:eraIdx,y:ERA[eraIdx].y,cn:ERA[eraIdx].cn,
  exag:LN_EXAG[exagIdx],play:lnPlay,mix:+lnMix.toFixed(3),
  driftMM:Math.round(LNU.uLnD.value[9]/M*1000/LN_EXAG[exagIdx]),
  dropMM:Math.round(LNU.uLnS.value[9]/M*1000/LN_EXAG[exagIdx]),
  st2deg:+(Math.atan((LNU.uLnD.value[3]-LNU.uLnD.value[2])/
          ((LN_Ym[3]-LN_Ym[2])*M))*180/Math.PI).toFixed(2),
  card:document.getElementById('leancard').classList.contains('on'),
  strip:document.getElementById('era').classList.contains('on'),
  plumb:document.getElementById('plumb').classList.contains('on')});
window.__skin=i=>{applySkin(i);placeCamera(1);renderer.render(scene,camera);};

/* ------------------------------------------------------------------ *
 * 12.  loop
 * ------------------------------------------------------------------ */
window.addEventListener('resize',layout);
applyStyle(0);
applyWeather(0,true);
applyTheme(0,true);
/* 素絹 is the only 裝幀 now, so it is applied once here rather than toggled */
applySkin(0);
/* 手机上不在加载时建 AudioContext。iOS / WKWebView 里一个在任何手势之前建出来
   的 context，即便后面 resume() 报成功，也可能整场是哑的 —— 必须在手势里建。
   resumeAudio 挂在 pointerdown / touchstart / 「入塔」上，第一次碰屏幕就会建。
   桌面没这个限制，而且提前建能让有 media engagement 的回访直接出声，照旧。
   （lara 2026-08-27：手机上没有声音。） */
if(!matchMedia('(any-pointer:coarse)').matches)autoStartAudio();
layout();
applyTime(0);
buildPins();
buildChap();
/* opens on 其一 with the 外觀 card and the labels already up, which is the
   change: nothing here waits to be switched on any more. quiet keeps the
   opening build animation running rather than jumping it to the end. */
setChapter(0,true);
/* 上面那趟把「其一」整套状态摆好了，但开篇还没落地 —— 这两行把它盖住。
   顺序要在 setChapter 之后：它会 renderChap / layout，那两个不认识开篇。 */
paintOvt();applyOvt();layout();

let prev=performance.now();
let __frozen=false;
/* 一帧要做的事全在这儿，跟 requestAnimationFrame 分开写。
   分开的理由是可测：rAF 在没上屏的标签页里根本不触发（远程 / headless 里
   一律如此），于是「营造声跟不跟得上速度」这类问题在浏览器里完全看不到 ——
   playing 是 true，塔却一动不动，看着像驱动写坏了。现在 __step(dt,n) 能按
   固定步长把同一段逻辑推 n 帧，量出来的数就是真跑起来的数。
   2026-08-27 加的：那天新挂了五处音效（第 10d 节），三张床的音量都是按动作
   速度驱动的，不能推帧就没法验。 */
function stepAll(dt,now,noDraw){
  if(playing){
    let nt=t+dt;
    if(nt>=DUR){nt=DUR;playing=false;}
    applyTime(nt);
    /* 营造声挂在这儿而不是 applyTime 里面：applyTime 还被 quietTime 和
       __seek 调，那两条是跳时间不是播动画，跳到哪儿都不该出声。 */
    driveBuild(dt);
  }else resetBuildAudio();
  stepTheme(dt);
  stepLean(dt);
  stepStrip(dt);
  stepWeather(dt);
  stepWeatherAudio();
  driveLean(dt);
  /* 帧末：把这一帧被喂进来的都应用掉，然后清零 —— 见第 10d 节开头 */
  stepWoodAudio(dt);
  stepSplash(dt,wxRain);
  grassUni.uTime.value=now*0.001;
  updateSwifts(now*0.001);
  stepSwiftAudio();
  placeCamera(1-Math.pow(0.0012,dt));
  if(noDraw)return;
  placePlaque();
  placePins();
  placePlumb();
  renderer.render(scene,camera);
}
(function frame(now){
  if(__frozen){requestAnimationFrame(frame);return;}
  const dt=Math.min(0.05,(now-prev)/1000);prev=now;
  stepAll(dt,now);
  requestAnimationFrame(frame);
})(performance.now());
/* 固定步长推 n 帧。dt 默认 1/60，上限跟真帧一样卡在 0.05。
   推完把 prev 对齐，回到 rAF 之后不会因为累计了几秒而吃一个 0.05 的大步。 */
/* noDraw 跳过 renderer.render 和三处贴签。测声音的时候要推几百帧，而软件
   WebGL（远程 / headless 一律是）画一帧要几十毫秒，几百帧就是几分钟；声音那
   几条驱动跟画面没有关系，跳掉之后同样几百帧是几毫秒。相机还是照算的 ——
   placeCamera 会被 其四 其五 的取景用到。 */
window.__step=(n,dt,noDraw)=>{
  const d=Math.min(0.05,dt||1/60);
  let nw=performance.now();
  for(let i=0;i<(n||1);i++){nw+=d*1000;stepAll(d,nw,noDraw);}
  prev=performance.now();
  return {frames:n||1,dt:d,t:+t.toFixed(3),clip:+CLIP.constant.toFixed(3),playing:playing};
};

window.__seek=v=>{lastStage=-1;playing=false;applyTime(Math.max(0,Math.min(DUR,v)));placeCamera(1);placePlaque();renderer.render(scene,camera);};
window.__grab=()=>{renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');};
window.__halt=()=>{__frozen=true;};
window.__diag=()=>{
  const box=new T.Box3().setFromObject(modelGroup);
  return {min:box.min.toArray().map(v=>+v.toFixed(2)),
          max:box.max.toArray().map(v=>+v.toFixed(2)),
          cam:camera.position.toArray().map(v=>+v.toFixed(2)),
          CAM_D:CAM_D,CAM_H:CAM_H,playing:playing};};
window.__closeup=(tx,ty,tz,px,py,pz,fov)=>{
  playing=false;
  camera.fov=fov||30;camera.position.set(px,py,pz);camera.lookAt(tx,ty,tz);
  camera.updateProjectionMatrix();renderer.render(scene,camera);
  return renderer.domElement.toDataURL('image/png');};
window.__info=()=>({tri:renderer.info.render.triangles,calls:renderer.info.render.calls,
  parts:modelGroup?modelGroup.children.map(m=>m.name):null});
window.__cut=i=>{setChapter(i%3,true);placeCamera(1);placePins();
  renderer.render(scene,camera);
  return {chap:chapIdx,cutMode:cutMode,annOn:annOn,pinsOn:pinsOn};};
window.__chap=i=>{setChapter(i,true);placeCamera(1);placePins();placePlumb();
  renderer.render(scene,camera);
  return {chap:chapIdx,n:CHAP[chapIdx].n,cn:CHAP[chapIdx].cn,
          cutMode:cutMode,lean:leanOn,annOn:annOn,pinsOn:pinsOn,
          card:document.getElementById('cutnote').classList.contains('on'),
          lncard:document.getElementById('leancard').classList.contains('on'),
          title:document.querySelector('.title-cn').textContent,
          hot:Array.prototype.map.call(document.getElementById('chap').children,
                b=>b.classList.contains('hot'))};};
window.__pins=on=>{pinsOn=!!on;if(pinsOn)annOn=true;refreshNote();placePins();
  renderer.render(scene,camera);return pinsOn;};
window.__pin=i=>{annOn=true;pinsOn=true;
  if(i>=0){cutMode=PINS[i].m;applyCutaway();}
  setFocus(i);placeCamera(1);placePins();renderer.render(scene,camera);
  return i<0?null:{cn:PINS[i].cn,m:PINS[i].m,y:+PINS[i].y().toFixed(3),
                   camYT:+camYT.toFixed(3),zoomT:zoomT};};
window.__noteTxt=()=>cutNoteEl?{on:cutNoteEl.classList.contains('on'),
  txt:cutNoteEl.textContent.replace(/\s+/g,' ').trim().slice(0,300)}:null;
window.__pinBoxes=()=>pinEls?pinEls.map((el,i)=>{
  const r=el.getBoundingClientRect();
  return {cn:PINS[i].cn,m:PINS[i].m,shown:!el.classList.contains('gone'),
          x:Math.round(r.left),y:Math.round(r.top),
          w:Math.round(r.width),h:Math.round(r.height)};}):null;
window.__theme=i=>{applyTheme(i,true);placeCamera(1);renderer.render(scene,camera);};
window.__style=i=>{applyStyle(i);placeCamera(1);renderer.render(scene,camera);};
window.__wx=i=>{applyWeather(i,true);renderer.render(scene,camera);};
/* 木头那一套的体检。每张床：合成耗时、峰值、整体 RMS、最静的一格和最响的
   一格差多少（疏密对不对）、循环两端差多少（接缝）。一次性的那几记只量
   长度和峰值。level 是当下三张床各自的实际音量，用来看驱动是不是真的在动。 */
/* 每帧能调的那个。__woodDbg 会把每张床重新合成一遍来量（一次六七十毫秒），
   放在逐帧的循环里就是把页面卡死 —— 2026-08-27 测的时候就这么卡过一次。
   要逐帧看驱动，用这个。 */
window.__wdLvl=()=>({work:+wdLvl.work.toFixed(3),strip:+wdLvl.strip.toFixed(3),
  lean:+wdLvl.lean.toFixed(3),
  phase:(typeof stripPhase==='string'?stripPhase:null),
  playing:playing,leanOn:leanOn,fixOn:fixOn,chap:chapIdx});
window.__woodDbg=()=>{
  if(!actx)return {ok:false};
  const R={level:window.__wdLvl(),
           playing:playing,leanOn:leanOn,fixOn:fixOn,
           stripPhase:(typeof stripPhase==='string'?stripPhase:null),beds:{},hits:{}};
  ['wood_work','wood_strip','wood_lean'].forEach(k=>{
    /* 直接调 SYNTH 里的函数，不走 synthBuf —— 走 synthBuf 就得先删缓存，
       而那三张床可能正在响，删了会让正在放的那一张重新合成一遍。体检不该
       动被检的东西。 */
    const t0=performance.now(),bb=SYNTH[k](actx.sampleRate),
          ms=+(performance.now()-t0).toFixed(1);
    if(!bb){R.beds[k]={ok:false};return;}
    const a=bb.getChannelData(0),n=a.length,sr=bb.sampleRate;
    let pk=0,sm=0;
    for(let i=0;i<n;i++){const v=a[i]<0?-a[i]:a[i];if(v>pk)pk=v;sm+=a[i]*a[i];}
    const W=Math.round(sr*0.25),cells=[];
    for(let c=0;c*W<n;c++){let e=0,m=Math.min(n,(c+1)*W);
      for(let i=c*W;i<m;i++)e+=a[i]*a[i];cells.push(Math.sqrt(e/Math.max(1,m-c*W)));}
    const mx=Math.max.apply(null,cells),mn=Math.min.apply(null,cells);
    const rms=v=>+(20*Math.log10(v+1e-12)).toFixed(1);
    const seg=(from,w)=>{let e=0,m=Math.min(n,from+w);
      for(let i=from;i<m;i++)e+=a[i]*a[i];return Math.sqrt(e/Math.max(1,m-from));};
    R.beds[k]={ms:ms,dur:+bb.duration.toFixed(2),peak:+pk.toFixed(3),
      rmsDb:rms(Math.sqrt(sm/n)),
      quietDb:rms(mn),loudDb:rms(mx),dynDb:+(rms(mx)-rms(mn)).toFixed(1),
      /* 接缝量的是最后一个采样到第一个采样的跳变，占峰值多少 —— 循环点上
         咔嗒不咔嗒只由这一步决定。拿前后各 150 ms 的 RMS 去比是错的：这几张
         床是疏落的事件，那两段有没有声音全看恰好落没落一记敲击，量出来的
         四五分贝是事件的疏密，不是接缝。 */
      jumpPct:+(Math.abs(a[n-1]-a[0])/Math.max(1e-9,pk)*100).toFixed(2),
      /* 折口两侧 20 ms 的斜率也比一下：跳变小但斜率反向也听得出来 */
      slopePct:+(Math.abs((a[n-1]-a[n-2])-(a[1]-a[0]))/Math.max(1e-9,pk)*100).toFixed(2)};
  });
  ['tap_wood','jam_knock','crack_low','qing_0','qing_3'].forEach(k=>{
    const t0=performance.now(),bb=SYNTH[k](actx.sampleRate),
          ms=+(performance.now()-t0).toFixed(1);
    if(!bb){R.hits[k]={ok:false};return;}
    const a=bb.getChannelData(0),n=a.length,sr=bb.sampleRate;
    let pk=0;for(let i=0;i<n;i++){const v=a[i]<0?-a[i]:a[i];if(v>pk)pk=v;}
    /* 余音有多长：从峰值掉到千分之一（-60 dB）用了多久 */
    let tail=n;
    for(let i=n-1;i>=0;i--){const v=a[i]<0?-a[i]:a[i];if(v>pk*0.001){tail=i;break;}}
    R.hits[k]={ms:ms,dur:+bb.duration.toFixed(2),peak:+pk.toFixed(3),
               decay60:+(tail/sr).toFixed(2),
               /* 末尾那个采样占峰值多少 —— 硬切就是在这儿听出咔嗒的 */
               endPct:+(Math.abs(a[n-1])/pk*100).toFixed(3)};
  });
  return R;};
window.__sfxLog=(clear)=>{const a=_sfxLog.slice();if(clear)_sfxLog=[];return a;};
window.__audDbg=()=>actx?{state:actx.state,on:soundOn,music:musicKey,sfxLog:_sfxLog.slice(),mv:+musicBus.gain.value.toFixed(3),sv:+sfxBus.gain.value.toFixed(2),wv:+wdBus.gain.value.toFixed(3),bv:+birdBus.gain.value.toFixed(3),swiftK:+swiftK.toFixed(2),bufs:Object.keys(_buf)}:null;
window.__swift=(n)=>{resumeAudio();for(let i=0;i<(n||1);i++)stepSwiftAudio(),_swNext=0;return {next:+_swNext.toFixed(2)};};
window.__swiftPick=()=>swiftPick();
window.__orbit=(a,e)=>{orbAz=a;orbEl=e;hovAz=0;hovEl=0;placeCamera(1);placePlaque();renderer.render(scene,camera);};
window.__play=()=>{playing=true;};
window.__wxDbg=()=>({wx:WEATHER[wxIdx].id,bolt:+boltK.toFixed(3),
  boltI:+bolt.intensity.toFixed(3),next:+boltNext.toFixed(2),
  bliz:+blizK.toFixed(3),pack:+snowPack.toFixed(3),
  rainN:RAIN.geo.drawRange.count,snowN:SNOW.geo.drawRange.count,
  fall:+rainFall.toFixed(2),
  amb:ambBed.key,bliza:ambBliz.key,
  ground:terrainMat.color.getHexString(),grass:grassMesh.material.color.getHexString(),
  flake:+SNOW.pts.material.size.toFixed(2),fogF:Math.round(scene.fog.far)});
window.__strike=()=>strike();
window.__bliz=v=>{blizT=BLIZ[0]+BLIZ[1]+v*BLIZ[2];};
window.__pack=v=>{snowPack=v;refreshLook();};
/* 开篇的三个钩子。headless 里 rAF 被掐到一秒一帧，等不到建塔动画自然走完，
   所以 __ovt 能直接跳拍；__ovtDbg 吐出这一层现在什么样，肉眼看不清时用它核。 */
window.__ovt=s=>{
  /* 走时间轴而不是直接写 ovtStep：拍数是 applyTime 推出来的，测试也该走同一条路。
     2 = 半程（题签浮起），3 = 塔立定（入塔亮），0 = 落地，其余 = 回到开头。 */
  if(s===2)     {ovtStep=1;applyOvt();lastStage=-1;playing=false;quietTime(DUR*0.5);}
  else if(s===3){ovtStep=1;applyOvt();lastStage=-1;playing=false;quietTime(DUR);}
  else if(s===0){ovtStep=1;applyOvt();quietTime(DUR);ovtEnter();}
  else          {ovtStep=1;applyOvt();lastStage=-1;playing=false;quietTime(0);}
  placeCamera(1);renderer.render(scene,camera);
  return window.__ovtDbg();};
window.__ovtDbg=()=>{
  const el=document.getElementById('ovt'),ap=document.getElementById('app');
  const cs=el?getComputedStyle(el):null;
  const chapEl=document.getElementById('chap');
  const ccs=chapEl?getComputedStyle(chapEl):null;
  const q=document.querySelector('.quote');
  return {step:ovtStep,cls:ap?ap.className:null,
          ovtOpacity:cs?+(+cs.opacity).toFixed(2):null,
          quoteOpacity:q?+(+getComputedStyle(q).opacity).toFixed(2):null,
          chapOpacity:ccs?+(+ccs.opacity).toFixed(2):null,
          chapTf:ccs?ccs.transform:null,
          title:document.querySelector('.ovt-t')?document.querySelector('.ovt-t').textContent:null,
          pLen:(document.getElementById('ovtP')||{}).textContent?document.getElementById('ovtP').textContent.length:0,
          qLen:(document.getElementById('ovtQ')||{}).textContent?document.getElementById('ovtQ').textContent.length:0,
          goRect:(function(){const b=document.getElementById('ovtGo');
            if(!b)return null;const r=b.getBoundingClientRect();
            return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),
                    w:Math.round(r.width),h:Math.round(r.height)};})(),
          inRect:(function(){const b=document.querySelector('.ovt-in');
            if(!b)return null;const r=b.getBoundingClientRect();
            return {top:Math.round(r.top),h:Math.round(r.height)};})(),
          card:document.getElementById('cutnote')?
            +(+getComputedStyle(document.getElementById('cutnote')).opacity).toFixed(2):null,
          clip:+CLIP.constant.toFixed(2),chap:chapIdx};};
/* 风铎那张床的体检。合成一遍，量出来：峰值（有没有削顶）、真正的静默段
   （疏密是不是像谱子写的那样）、循环接缝两端差多少（有没有咔嗒）、合成花了
   多久（手机上是一次性开销，不能太长）。 */
window.__musicDbg=()=>{
  const t0=performance.now();
  const bb=synthBuf('music_feng');
  const ms=+(performance.now()-t0).toFixed(1);
  if(!bb)return {ok:false};
  const a=bb.getChannelData(0),sr=bb.sampleRate,n=a.length;
  let peak=0,sum=0;
  for(let i=0;i<n;i++){const v=a[i]<0?-a[i]:a[i];if(v>peak)peak=v;sum+=a[i]*a[i];}
  /* 每 0.25 秒一格的 RMS，用来找铃和空白 */
  const W=Math.round(sr*0.25),cells=[];
  for(let c=0;c*W<n;c++){
    let e=0,m=Math.min(n,(c+1)*W);
    for(let i=c*W;i<m;i++)e+=a[i]*a[i];
    cells.push(Math.sqrt(e/Math.max(1,m-c*W)));
  }
  const mx=Math.max.apply(null,cells);
  /* 起音：比前一格高出一大截的格子 = 一记铃 */
  const onsets=[];
  for(let c=1;c<cells.length;c++)
    if(cells[c]>mx*0.12&&cells[c]>cells[c-1]*1.9)onsets.push(+(c*0.25).toFixed(2));
  /* 最长的安静段（低于峰值 8%） */
  let quiet=0,run=0;
  for(let c=0;c<cells.length;c++){
    if(cells[c]<mx*0.08){run++;if(run>quiet)quiet=run;}else run=0;}
  /* 底噪层（空气那一层）到底多响：取所有格子里最低的几个当地板，
     跟峰值比。地板一高，谱子里写的空白就听不出是空白，整段会糊成一片
     持续的 pad —— 那正是这段最该避免的东西。 */
  const srt=cells.slice().sort((x,y)=>x-y);
  const flo=srt[Math.round(srt.length*0.10)],med=srt[Math.round(srt.length*0.5)];
  /* 谱子写的十一记，每一记落点后 0.15 秒的能量，确认它真响了 */
  const SC=[0.60,3.20,5.90,6.85,10.40,13.10,17.30,19.60,20.45,23.80,27.40];
  const hits=SC.map(t=>{
    const i0=Math.round(t*sr),i1=Math.min(n,i0+Math.round(0.15*sr));
    let e=0;for(let i=i0;i<i1;i++)e+=a[i]*a[i];
    return +(Math.sqrt(e/Math.max(1,i1-i0))/mx).toFixed(3);});
  return {ok:true,synthMs:ms,dur:+bb.duration.toFixed(2),sr:sr,
          peak:+peak.toFixed(3),rms:+Math.sqrt(sum/n).toFixed(4),
          floorPct:+(flo/mx*100).toFixed(1),medianPct:+(med/mx*100).toFixed(1),
          scoreHits:hits,
          onsets:onsets,onsetCount:onsets.length,
          longestQuietSec:+(quiet*0.25).toFixed(2),
          /* 接缝：头尾各取 200 采样的 RMS，差太多就会听出咔嗒 */
          seam:{head:+Math.sqrt(a.slice(0,200).reduce((s,v)=>s+v*v,0)/200).toFixed(4),
                tail:+Math.sqrt(a.slice(n-200).reduce((s,v)=>s+v*v,0)/200).toFixed(4)}};};
window.__scene=scene;window.__camera=camera;window.__renderer=renderer;
})();

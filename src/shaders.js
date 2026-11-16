// WGSL sources (written from scratch for AGY_Aqua; techniques after abyssal-garden MIT).
const W_NOISE = /*wgsl*/`
fn ss(a:f32,b:f32,x:f32)->f32{let t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
fn h31(p:vec3f)->f32{var q=fract(p*vec3f(.1031,.1030,.0973));q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
fn h33(p:vec3f)->vec3f{var q=fract(p*vec3f(.1031,.1030,.0973));q+=dot(q,q.yxz+33.33);return fract((q.xxy+q.yxx)*q.zyx);}
fn vn(p:vec3f)->f32{let i=floor(p);let f=fract(p);let u=f*f*(3.-2.*f);
 return mix(mix(mix(h31(i),h31(i+vec3f(1,0,0)),u.x),mix(h31(i+vec3f(0,1,0)),h31(i+vec3f(1,1,0)),u.x),u.y),
            mix(mix(h31(i+vec3f(0,0,1)),h31(i+vec3f(1,0,1)),u.x),mix(h31(i+vec3f(0,1,1)),h31(i+vec3f(1,1,1)),u.x),u.y),u.z);}
fn fbm(p:vec3f,n:i32)->f32{var a=.5;var s=0.;var q=p;for(var i=0;i<n;i++){s+=a*vn(q);q=q*2.03+vec3f(17.1,31.7,5.3);a*=.5;}return s/(1.-2.*a);}
fn wor(p:vec3f)->f32{let i=floor(p);let f=fract(p);var d=9.;for(var x=-1;x<=1;x++){for(var y=-1;y<=1;y++){for(var z=-1;z<=1;z++){let o=vec3f(f32(x),f32(y),f32(z));let r=o+h33(i+o)-f;d=min(d,dot(r,r));}}}return sqrt(d);}
`;

const W_DENS = W_NOISE + /*wgsl*/`
struct U{n:vec4u,o:vec4f,c:vec4u};
@group(0)@binding(0)var<uniform> u:U;
@group(0)@binding(1)var<storage,read_write> D:array<f32>;
@group(0)@binding(2)var<storage,read> P:array<vec4f>;
fn smax(a:f32,b:f32,k:f32)->f32{let h=max(k-abs(a-b),0.)/k;return max(a,b)+h*h*k*.25;}
fn smin(a:f32,b:f32,k:f32)->f32{return -smax(-a,-b,k);}
fn seg2(p:vec2f,a:vec2f,b:vec2f)->f32{let pa=p-a;let ba=b-a;let h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-4),0.,1.);return length(pa-ba*h);}
fn dens(p:vec3f)->f32{
 let w=vec3f(fbm(p*.04+11.,3),fbm(p*.04+47.,3),fbm(p*.04+83.,3))-.5;
 let q=p+w*vec3f(15.,6.,15.);
 let g0=-45.5+7.*(fbm(vec3f(q.xz*.011,3.),4)-.5)+1.6*(fbm(vec3f(q.xz*.07,9.),3)-.5);
 var dm=-1e3;var de=1e3;var k=0u;
 for(var i=0u;i<u.c.x;i++){let a=P[k];let b=P[k+1u];k+=2u;
  let yr=clamp((p.y-g0)/(b.y-g0),0.,1.3);
  var e=seg2(q.xz,a.xy,a.zw)-b.x;
  e-=b.z*ss(.3,.92,yr)+3.*(1.-yr)*(1.-yr)-b.w*ss(0.,.5,yr)*(1.-ss(.5,1.,yr));
  dm=smax(dm,smin(-e,b.y-p.y,3.),2.5);de=min(de,e);}
 let rad=length(p.xz)+w.x*14.;
 let ring=ss(156.,172.,rad);
 let th=g0+ring*60.;
 var d=smax(g0+4.5*ss(10.,0.,de)-p.y,dm,3.);
 d=smax(d,(th-p.y)*.7,3.);
 k=u.c.x*2u;
 for(var i=0u;i<u.c.y;i++){let a=P[k];let b=P[k+1u];k+=2u;
  var r=p+w*3.-a.xyz;let cs=cos(a.w);let sn=sin(a.w);
  r=vec3f(cs*r.x+sn*r.z,r.y/b.z,-sn*r.x+cs*r.z);
  d=smax(d,b.y-length(vec2f(length(r.xy)-b.x,r.z)),1.5);}
 let hg=p.y-g0;let rk=mix(.25,1.,ss(.5,5.,hg));
 d+=rk*((.5-wor(p*.17+w*2.))*3.4+(fbm(p*.3,3)-.5)*2.2);
 d+=rk*2.2*(abs(fract(p.y*.21+w.y*2.2)-.5)-.25);
 return min(d,3.-p.y);}
@compute@workgroup_size(4,4,4)fn main(@builtin(global_invocation_id)id:vec3u){
 if(any(id>=u.n.xyz)){return;}
 var d=dens(u.o.xyz+vec3f(id)*u.o.w);
 if(id.x==0u||id.z==0u||id.x==u.n.x-1u||id.z==u.n.z-1u||id.y==u.n.y-1u){d=-1.;}
 D[id.x+u.n.x*(id.y+u.n.y*id.z)]=d;}
`;

const W_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index)i:u32)->@builtin(position)vec4f{return vec4f(f32(i32(i&1u)*4-1),f32(i32(i>>1u)*4-1),0.,1.);}
`;

const W_WATER = W_FS + /*wgsl*/`
@group(0)@binding(0)var<uniform> tm:vec4f;
fn caus(uv:vec2f,t:f32)->f32{let p=uv*6.2831853;var i=p;var c=0.;
 for(var n=1;n<=5;n++){let tt=t*(1.-3.5/f32(n));i=p+vec2f(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));let s=sin(i.x+tt);let k=cos(i.y+tt);c+=abs(s*k)/(1.25*sqrt(s*s+k*k)+1e-4);}
 c=1.17-pow(c/5.,1.4);return pow(abs(c),8.);}
@fragment fn fs(@builtin(position)fc:vec4f)->@location(0)vec4f{
 let uv=fc.xy/${WATER}.;let t=tm.x;
 let wpu=uv+.035*vec2f(sin(uv.y*9.3+t*.3)+.5*sin(uv.y*23.7),cos(uv.x*7.7-t*.2)+.5*cos(uv.x*19.1));
 let c=caus(wpu,t*.45+23.);
 let wu=uv+.02*vec2f(sin(6.2831853*(uv.y*2.+.1*t)),cos(6.2831853*(uv.x*3.-.07*t)));
 var s=vec2f(0.);
 for(var i=0;i<10;i++){let k=vec3f(f32(i+1),f32((i*7)%5+1),.5/f32(i+1));s+=k.xy*k.z*cos(dot(k.xy,wu)*6.2831853+t*(.5+.35*sqrt(length(k.xy)))+f32(i)*1.7);}
 return vec4f(c,c,s*.06);}
`;

const W_BLIT = W_FS + /*wgsl*/`
@group(0)@binding(0)var t:texture_2d<f32>;
@group(0)@binding(1)var s:sampler;
fn uvOf(fc:vec4f,k:f32)->vec2f{return fc.xy*k/vec2f(textureDimensions(t));}
@fragment fn fsMip(@builtin(position)fc:vec4f)->@location(0)vec4f{return textureSampleLevel(t,s,uvOf(fc,2.),0.);}
fn kar(c:vec3f)->vec4f{let w=1./(1.+max(c.r,max(c.g,c.b)));return vec4f(c*w,w);}
@fragment fn fsDown0(@builtin(position)fc:vec4f)->@location(0)vec4f{let uv=uvOf(fc,2.);let e=1./vec2f(textureDimensions(t));
 let a=kar(min(textureSampleLevel(t,s,uv+e*vec2f(-1,-1),0.).rgb,vec3f(24.)));let b=kar(min(textureSampleLevel(t,s,uv+e*vec2f(1,-1),0.).rgb,vec3f(24.)));
 let c=kar(min(textureSampleLevel(t,s,uv+e*vec2f(-1,1),0.).rgb,vec3f(24.)));let d=kar(min(textureSampleLevel(t,s,uv+e*vec2f(1,1),0.).rgb,vec3f(24.)));
 let m=a+b+c+d;return vec4f(m.rgb/m.a,1.);}
@fragment fn fsDown(@builtin(position)fc:vec4f)->@location(0)vec4f{let uv=uvOf(fc,2.);let e=1./vec2f(textureDimensions(t));
 return (textureSampleLevel(t,s,uv+e*vec2f(-1,-1),0.)+textureSampleLevel(t,s,uv+e*vec2f(1,-1),0.)+textureSampleLevel(t,s,uv+e*vec2f(-1,1),0.)+textureSampleLevel(t,s,uv+e*vec2f(1,1),0.))*.25;}
@fragment fn fsUp(@builtin(position)fc:vec4f)->@location(0)vec4f{let uv=uvOf(fc,.5);let e=.75/vec2f(textureDimensions(t));
 return (textureSampleLevel(t,s,uv+e*vec2f(-1,-1),0.)+textureSampleLevel(t,s,uv+e*vec2f(1,-1),0.)+textureSampleLevel(t,s,uv+e*vec2f(-1,1),0.)+textureSampleLevel(t,s,uv+e*vec2f(1,1),0.))*.25;}
`;

const S_G = /*wgsl*/`
struct G{vp:mat4x4f,sm:mat4x4f,cam:vec4f,right:vec4f,up:vec4f,fwd:vec4f,sun:vec4f,res:vec4f,mis:vec4f};
const SIG=vec3f(.058,.0235,.0195);
const KD=vec3f(.056,.0245,.0170);
const WCOL=vec3f(.16,.58,.90);
const PCOL=vec3f(.58,.66,.98);
const SUNC=vec3f(1.7,1.6,1.45);
fn sat(x:f32)->f32{return clamp(x,0.,1.);}
fn sss(a:f32,b:f32,x:f32)->f32{let t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
fn ign(p:vec2f)->f32{return fract(52.9829189*fract(dot(p,vec2f(.06711056,.00583715))));}
fn hs(x:f32)->f32{return fract(sin(x*127.1)*43758.5453);}
fn sg(z:f32)->vec3f{return mix(SIG,vec3f(.034,.026,.022),z);}
fn kd(z:f32)->vec3f{return mix(KD,vec3f(.034,.023,.018),z);}
fn fin(c:vec3f)->vec4f{return vec4f(min(max(c,vec3f(0.)),vec3f(40.)),1.);}
fn fogIn(ro:vec3f,rd:vec3f,d:f32,z:f32,sun:vec3f)->vec3f{
 let k=kd(z);let a=sg(z)-k*rd.y;let I=(1.-exp(-a*d))/a;let mu=max(dot(rd,sun),0.);let m2=mu*mu;
 return mix(WCOL,PCOL,z)*sg(z)*exp(k*ro.y)*I*(1.22+.3*m2*m2);}
`;

const S_B = S_G + /*wgsl*/`
@group(0)@binding(0)var<uniform> g:G;
@group(0)@binding(1)var sR:sampler;
@group(0)@binding(2)var sC:sampler;
@group(0)@binding(3)var sS:sampler_comparison;
@group(0)@binding(4)var tSh:texture_depth_2d;
@group(0)@binding(5)var tW:texture_2d<f32>;
@group(0)@binding(6)var tD:texture_2d<f32>;
@group(0)@binding(7)var tV:texture_3d<f32>;
@group(0)@binding(8)var tM:texture_2d<f32>;
fn shUV(p:vec3f)->vec3f{let s=g.sm*vec4f(p,1.);return vec3f(s.x*.5+.5,.5-s.y*.5,s.z-.0007);}
fn shadow1(p:vec3f)->f32{let s=shUV(p);return textureSampleCompareLevel(tSh,sS,s.xy,s.z);}
fn shadow4(p:vec3f)->f32{let s=shUV(p);let e=1.8/${SHADOW}.;
 return (textureSampleCompareLevel(tSh,sS,s.xy+vec2f(-e,-e),s.z)+textureSampleCompareLevel(tSh,sS,s.xy+vec2f(e,-e),s.z)+textureSampleCompareLevel(tSh,sS,s.xy+vec2f(-e,e),s.z)+textureSampleCompareLevel(tSh,sS,s.xy+vec2f(e,e),s.z))*.25;}
fn cuv(p:vec3f)->vec2f{return p.xz-g.sun.xz*(p.y/g.sun.y);}
fn caus(p:vec3f,d:f32)->vec3f{let q=cuv(p);let o=vec2f(.004,.0025);
 let a=vec3f(textureSample(tW,sR,q/3.3+o).r,textureSample(tW,sR,q/3.3).r,textureSample(tW,sR,q/3.3-o).r);
 let b=textureSample(tW,sR,q.yx/6.9+.37).r;
 let c=min(pow(a,vec3f(2.3))*5.*(.45+b*1.3),vec3f(4.));
 return mix(c,vec3f(.33),sss(35.,100.,d));}
fn sunE(y:f32,z:f32)->vec3f{return SUNC*exp(kd(z)*(min(y,0.)/g.sun.y))*(.5+.5*sat(-y/30.));}
fn vol(p:vec3f)->vec4f{return textureSampleLevel(tV,sC,(p-vec3f(-192.,-56.,-192.))/vec3f(384.,60.,384.),0.);}
fn amb(p:vec3f,n:vec3f,sky:f32,z:f32)->vec3f{let up=n.y*.5+.5;
 return mix(vec3f(.22,.60,.80),vec3f(.34,.56,.82),z)*exp(kd(z)*min(p.y,0.)*1.2)*(.3+.7*sky)*(.24+.76*up*up)*1.8*(.55+.45*sat(-p.y/30.))+vec3f(.04,.10,.16);}
fn fog(c:vec3f,wp:vec3f,z:f32)->vec3f{let v=wp-g.cam.xyz;let d=length(v);let rd=v/d;
 return c*exp(-sg(z)*d)*sss(230.,185.,d)+fogIn(g.cam.xyz,rd,d,z,g.sun.xyz)*(.58+.42*vol(g.cam.xyz+rd*min(d,150.)).g);}
fn qrot(q:vec4f,v:vec3f)->vec3f{return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v);}
`;

const W_SOLID = S_B + /*wgsl*/`
struct VI{@location(0)p:vec3f,@location(1)n:vec4f,@location(2)a:vec4f,@location(3)b:vec4f,@location(4)c:vec4f};
struct VO{@builtin(position)cp:vec4f,@location(0)wp:vec3f,@location(1)n:vec3f,@location(2)op:vec3f,@location(3)@interpolate(flat)m:vec4f};
@vertex fn vs(i:VI)->VO{var o:VO;let w=i.a.xyz+qrot(i.b,i.p*i.a.w);
 o.cp=g.vp*vec4f(w,1.);o.wp=w;o.n=qrot(i.b,i.n.xyz);o.op=i.p*i.a.w+i.c.y*37.;o.m=i.c;return o;}
@fragment fn fs(i:VO,@builtin(front_facing)ff:bool)->@location(0)vec4f{
 let on=normalize(i.n)*select(-1.,1.,ff);
 let dist=length(i.wp-g.cam.xyz);
 let wp=i.op+.35*vec3f(sin(i.op.y*1.7+i.op.z*1.3),sin(i.op.x*1.9+i.op.y*1.1),sin(i.op.z*1.5+i.op.x*1.2));
 var tw=pow(abs(on),vec3f(4.));tw/=(tw.x+tw.y+tw.z);
 let d1=textureSample(tD,sR,wp.zy*.1);let d2=textureSample(tD,sR,wp.xz*.1);let d3=textureSample(tD,sR,wp.xy*.1);
 let hgt=d1.b*tw.x+d2.b*tw.y+d3.b*tw.z;let mot=d1.a*tw.x+d2.a*tw.y+d3.a*tw.z;
 let st=i.op.y*.55+hgt*1.6;let bed=hs(floor(st));
 var alb=mix(vec3f(.11,.12,.13),vec3f(.33,.30,.25),sat(mot*1.5-.25));
 alb=mix(alb,mix(vec3f(.26,.19,.10),vec3f(.20,.22,.14),bed),sss(.42,.66,mot)*.7);
 alb*=mix(.72,1.15,bed);
 let alg=sss(-.1,.6,on.y)*sss(.3,.52,mot);
 alb=mix(alb,vec3f(.035,.14,.07),alg*.8);
 alb*=(.22+1.3*hgt);
 let N=normalize(on+vec3f(d1.r-.5,d2.r-.5,d3.r-.5)*.6);
 let L=g.sun.xyz;let V=normalize(g.cam.xyz-i.wp);
 let v1=vol(i.wp+on*1.5);
 let ao=sat((v1.r-.5)*8.)*.55+.45;
 let E=sunE(i.wp.y,0.)*shadow4(i.wp+on*.35);
 let ndl=sat(dot(N,L));
 let ca=caus(i.wp,dist);
 let am=amb(i.wp,N,v1.g,0.)*ao;
 let dl=E*ndl*(.10+mix(vec3f(.33),ca,sss(.1,.45,dot(on,L)))*1.8);
 var c=alb*(dl+am);
 c+=alb*vec3f(.02,.05,.07);
 let H=normalize(V+L);
 c+=E*(.25+ca)*pow(sat(dot(N,H)),20.)*.15*ndl;
 return fin(fog(c,i.wp,0.));}
`;

const W_GLYPH = S_B + /*wgsl*/`
struct VI{@location(0)p:vec3f,@location(1)n:vec4f,@location(2)a:vec4f,@location(3)b:vec4f};
struct VO{@builtin(position)cp:vec4f,@location(0)wp:vec3f,@location(1)n:vec3f,@location(2)@interpolate(flat)gl:f32};
@vertex fn vs(i:VI)->VO{var o:VO;let w=i.a.xyz+i.p*i.a.w;
 o.cp=g.vp*vec4f(w,1.);o.wp=w;o.n=i.n.xyz;o.gl=i.b.w;return o;}
@fragment fn fs(i:VO)->@location(0)vec4f{
 let n=normalize(i.n);let dist=length(i.wp-g.cam.xyz);
 let base=vec3f(.02,.05,.06);
 let emi=vec3f(.40,1.0,.50)*i.gl*6.0*(.7+.3*sin(g.cam.w*1.5+i.wp.x*2.));
 let E=sunE(i.wp.y,0.)*shadow1(i.wp);
 var c=base*(E*.4+amb(i.wp,n,vol(i.wp).g,0.))+emi;
 return fin(fog(c,i.wp,0.));}
`;

const W_WHALE = S_B + /*wgsl*/`
struct VI{@location(0)p:vec3f,@location(1)n:vec4f,@location(2)a:vec4f,@location(3)b:vec4f,@location(4)c:vec4f};
struct VO{@builtin(position)cp:vec4f,@location(0)wp:vec3f,@location(1)n:vec3f,@location(2)op:vec3f,@location(3)lt:f32};
@vertex fn vs(i:VI)->VO{var o:VO;
 let t=g.cam.w;let R=i.a.w;let omega=i.b.x;let phase=i.b.y;let scale=i.b.z;let seed=i.b.w;
 let depthY=i.c.x;let vertAmp=i.c.y;let pitchBias=i.c.z;
 let ta=t*omega+phase;let ph=phase;
 let P=vec3f(i.a.x,depthY,i.a.z)+vec3f(R*cos(ta),vertAmp*.3*sin(2.*ta+ph),R*.7*sin(ta));
 let T=normalize(vec3f(-R*sin(ta),vertAmp*.6*cos(2.*ta+ph),R*.7*cos(ta)))*sign(omega);
 let S=normalize(cross(vec3f(0.,1.,0.),T));let Up=cross(T,S);
 var l=i.p*scale;
 let aux=i.n.w;
 if(aux>=0.){let u=aux; l.y+=vertAmp*pow(max(u-.55,0.)/.45,1.5)*sin(t*1.6+phase-u*2.);}
 else{let span=-aux; l.y+=.3*sin(t*.8+phase+span)*span;}
 l.y+=pitchBias*l.x;
 let w=P+T*l.x+Up*l.y+S*l.z;
 o.cp=g.vp*vec4f(w,1.);o.wp=w;o.n=T*i.n.x+Up*i.n.y+S*i.n.z;o.op=i.p;o.lt=shadow1(w);return o;}
@fragment fn fs(i:VO)->@location(0)vec4f{
 let n=normalize(i.n);let L=g.sun.xyz;let V=normalize(g.cam.xyz-i.wp);
 let top=sss(-.2,.25,n.y);
 var alb=mix(vec3f(.55,.60,.65),vec3f(.05,.09,.16),top);
 alb*=.8+.4*hs(floor(i.op.x*3.)+floor(i.op.z*3.));
 let E=sunE(i.wp.y,0.)*i.lt;
 let vv=vol(i.wp);
 var c=alb*(E*(.25+.75*sat(dot(n,L)))+amb(i.wp,n,vv.g,0.)*1.2);
 c+=E*pow(sat(dot(n,normalize(V+L))),24.)*.8;
 return fin(fog(c,i.wp,0.));}
`;

const W_SURF = S_B + /*wgsl*/`
struct VO{@builtin(position)cp:vec4f,@location(0)wp:vec3f};
@vertex fn vs(@builtin(vertex_index)i:u32)->VO{var o:VO;let p=vec2f(f32(i&1u),f32(i>>1u))*2.-1.;
 o.wp=vec3f(g.cam.x+p.x*900.,0.,g.cam.z+p.y*900.);o.cp=g.vp*vec4f(o.wp,1.);return o;}
@fragment fn fs(i:VO)->@location(0)vec4f{
 let v=i.wp-g.cam.xyz;let d=length(v);let V=v/d;
 let fl=sss(260.,60.,d);
 let s=(textureSample(tW,sR,i.wp.xz/13.).ba+textureSample(tW,sR,i.wp.zx/4.7+.2).ba*.7)*fl;
 let n=normalize(vec3f(-s.x*.8,-1.,-s.y*.8));
 let ci=sat(dot(V,-n));let k=1.-1.769*(1.-ci*ci);let win=sss(0.,.22,k);
 let rr=refract(V,n,1.33);let sd=max(dot(rr,g.sun.xyz),0.);
 let fr=pow(1.-sqrt(max(k,0.)),5.);
 let sky=(vec3f(.30,.78,1.)*1.3+vec3f(1.,.95,.85)*(pow(sd,60.)*1.3+pow(sd,500.)*12.))*(1.-fr);
 let R=reflect(V,n);let refl=fogIn(i.wp,R,300.,0.,g.sun.xyz)*1.15;
 let c=mix(refl,sky,win);
 return fin(fog(c,i.wp,0.));}
@vertex fn vsB(@builtin(vertex_index)i:u32)->VO{var o:VO;let p=vec2f(f32(i&1u),f32(i>>1u))*2.-1.;
 o.wp=g.cam.xyz+g.fwd.xyz+g.right.xyz*(p.x*g.right.w)+g.up.xyz*(p.y*g.up.w);o.cp=vec4f(p,1e-7,1.);return o;}
@fragment fn fsB(i:VO)->@location(0)vec4f{let p=g.cam.xyz+normalize(i.wp-g.cam.xyz)*300.;return fin(fog(vec3f(0.),p,0.));}
`;

const W_RAYS = S_G + W_FS + /*wgsl*/`
@group(0)@binding(0)var<uniform> g:G;
@group(0)@binding(1)var sR:sampler;
@group(0)@binding(2)var sS:sampler_comparison;
@group(0)@binding(3)var tSh:texture_depth_2d;
@group(0)@binding(4)var tW:texture_2d<f32>;
@group(0)@binding(5)var tDp:texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
@group(0)@binding(6)var tV:texture_3d<f32>;
@group(0)@binding(7)var sC:sampler;
@fragment fn fs(@builtin(position)fc:vec4f)->@location(0)vec4f{
 let dp=textureLoad(tDp,vec2i(fc.xy)*2,0);
 let uv=fc.xy*2.*g.res.zw;
 let nd=vec2f(uv.x*2.-1.,1.-uv.y*2.);
 let rv=g.fwd.xyz+g.right.xyz*(nd.x*g.right.w)+g.up.xyz*(nd.y*g.up.w);
 let rl=length(rv);let rd=rv/rl;
 let zl=g.fwd.w/max(dp,1e-6);
 var tm=min(zl*rl,120.);
 if(rd.y>1e-4){tm=min(tm,-g.cam.y/rd.y);}
 let ro=g.cam.xyz;let sx=g.sun.xyz;let k=kd(0.);let sgz=sg(0.);
 let dt=tm/${RAYN}.;let j=ign(fc.xy);
 var acc=vec3f(0.);
 for(var n=0;n<${RAYN};n++){let t=(f32(n)+j)*dt;let p=ro+rd*t;
  let s=g.sm*vec4f(p,1.);
  let vis=textureSampleCompareLevel(tSh,sS,vec2f(s.x*.5+.5,.5-s.y*.5),s.z-.0006);
  let q=p.xz-sx.xz*(p.y/sx.y);
  let pat=sss(.3,.7,textureSampleLevel(tW,sR,q/27.,2.5).r)*sss(.15,.6,textureSampleLevel(tW,sR,q.yx/11.+.3,2.).r);
  let o=textureSampleLevel(tV,sC,(p-vec3f(-192.,-56.,-192.))/vec3f(384.,60.,384.),0.).r;
  let mist=sat(1.-(o-.5)*3.4);
  acc+=exp(-sgz*t+k*(p.y/sx.y))*(vis*(.012+pat*6.)*(1.+1.2*mist*mist));}
 let mu=max(dot(rd,sx),0.);let ph=mix(.2+2.*mu*mu*mu,.8,0.);
 let wc=WCOL+vec3f(.04,.07,.05);
 return vec4f(min(acc*dt*sgz*wc*SUNC*ph*g.mis.y,vec3f(20.)),zl);}
`;
const W_RBLUR = W_FS + /*wgsl*/`
@group(0)@binding(0)var tR:texture_2d<f32>;
@fragment fn fs(@builtin(position)fc:vec4f)->@location(0)vec4f{
 let p=vec2i(fc.xy);let mx=vec2i(textureDimensions(tR))-1;
 let c=textureLoad(tR,p,0);var acc=vec3f(0.);var ws=0.;
 for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){let r=textureLoad(tR,clamp(p+vec2i(x,y),vec2i(0),mx),0);
  let w=1./(.03+abs(r.a-c.a)/max(c.a,1e-4));acc+=r.rgb*w;ws+=w;}}
 return vec4f(acc/ws,c.a);}
`;
const W_POST = S_G + W_FS + /*wgsl*/`
@group(0)@binding(0)var<uniform> g:G;
@group(0)@binding(1)var sC:sampler;
@group(0)@binding(2)var tS:texture_2d<f32>;
@group(0)@binding(3)var tR:texture_2d<f32>;
@group(0)@binding(4)var tB:texture_2d<f32>;
@group(0)@binding(5)var tDp:texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
fn tmap(x:vec3f)->vec3f{return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3f(0.),vec3f(1.));}
@fragment fn fs(@builtin(position)fc:vec4f)->@location(0)vec4f{
 let px=vec2i(fc.xy);let uv=fc.xy*g.res.zw;
 let zf=g.fwd.w/max(textureLoad(tDp,px,0),1e-6);
 let h=fc.xy*.5-.5;let b=floor(h);let f=h-b;let bi=vec2i(b);
 let mx=vec2i(textureDimensions(tR))-1;
 var acc=vec3f(0.);var ws=0.;
 for(var k=0;k<4;k++){let o=vec2i(k&1,k>>1);let r=textureLoad(tR,clamp(bi+o,vec2i(0),mx),0);
  let bw=mix(1.-f.x,f.x,f32(o.x))*mix(1.-f.y,f.y,f32(o.y));
  let w=(bw+.02)/(.02+abs(r.a-zf)/max(zf,1e-4));acc+=r.rgb*w;ws+=w;}
 var c=textureLoad(tS,px,0).rgb+acc/ws;
 let bl=textureSampleLevel(tB,sC,uv,0.).rgb;
 c=mix(c,bl,.06)+bl*.03;
 c*=g.mis.x;
 let q=uv-.5;c*=1.-dot(q,q)*.55;
 c=tmap(c);
 let l0=dot(c,vec3f(.2126,.7152,.0722));let l=mix(l0,l0*l0*(3.-2.*l0),.55);c*=l/max(l0,1e-4);
 c=mix(c,vec3f(l),sss(.55,1.,l)*.1);c=mix(vec3f(l),c,.93)+vec3f(.008,.002,0.);
 c=pow(max(c,vec3f(0.)),vec3f(1./2.2));
 let n=ign(fc.xy)+ign(fc.xy+37.)-1.;
 return vec4f(c+n/255.,1.);}
`;

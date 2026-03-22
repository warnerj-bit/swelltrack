import { useState, useEffect, useRef } from "react";

// ── version ───────────────────────────────────────────────────────────────────
const VERSION = "1.0.0-beta";

// ── colours ───────────────────────────────────────────────────────────────────
const C = {
  bg:"#020d1a", panel:"#041828", pearl:"#e8f4f8", mist:"#7fb3c8",
  teal:"#00d4c8", teal2:"#00a89e", amber:"#f5a623", coral:"#ff6b6b",
  blue:"#4f9cf5", green:"#5de89e", purple:"#a78bfa",
  g1:"rgba(232,244,248,0.08)", g2:"rgba(232,244,248,0.04)",
};

// ── default spots ─────────────────────────────────────────────────────────────
const DEFAULT_SPOTS = {
  torquay:    { name:"Torquay Main",     lat:-38.3316, lng:144.3253, offshore:[0,90],    breakType:"Beach" },
  impossible: { name:"Point Impossible", lat:-38.3176, lng:144.3697, offshore:[270,360], breakType:"Beach" },
  bells:      { name:"Bells Beach",      lat:-38.3693, lng:144.2837, offshore:[0,90],    breakType:"Reef"  },
};

const MOCK_BASE = {
  torquay:    { waveH:1.2, swellH:0.9,  period:11, waveDir:225, windSpeed:14, windDir:45,  sst:16.8, swellPeriod:12 },
  impossible: { waveH:0.9, swellH:0.6,  period:9,  waveDir:210, windSpeed:18, windDir:55,  sst:16.5, swellPeriod:10 },
  bells:      { waveH:1.6, swellH:1.3,  period:13, waveDir:230, windSpeed:11, windDir:35,  sst:16.2, swellPeriod:14 },
};

// ── prefs ─────────────────────────────────────────────────────────────────────
const buildSpots = (prefs) => {
  const removed = prefs.removedDefaults || [];
  const base = Object.fromEntries(Object.entries(DEFAULT_SPOTS).filter(([k]) => !removed.includes(k)));
  const custom = {};
  (prefs.customLocations || []).forEach(l => { custom[l.id] = l; });
  return { ...base, ...custom };
};

const loadPrefs = () => {
  try {
    const s = localStorage.getItem("swelltrack_prefs");
    if (s) return JSON.parse(s);
  } catch(e) {}
  return { waveUnit:"m", windUnit:"kmh", tempUnit:"c", timeFormat:"12h",
           defaultLocation:"torquay", customLocations:[], removedDefaults:[] };
};
const savePrefs = p => { try { localStorage.setItem("swelltrack_prefs", JSON.stringify(p)); } catch(e) {} };

// ── time ──────────────────────────────────────────────────────────────────────
const TZ = 11;
const aedt   = ()    => new Date(Date.now() + TZ * 3600000);
const nowH   = ()    => { const d = aedt(); return d.getUTCHours() + d.getUTCMinutes()/60; };
const clockStr = (u24=false) => {
  const d = aedt(); let h = d.getUTCHours(), m = d.getUTCMinutes();
  if (u24) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  const p = h < 12 ? "AM" : "PM"; h = h%12||12;
  return `${h}:${String(m).padStart(2,"0")} ${p}`;
};
const fmtH   = h    => { const hh=Math.floor(h)%24,mm=Math.round((h%1)*60),p=hh<12?"am":"pm",dh=hh===0?12:hh>12?hh-12:hh; return `${dh}:${String(mm).padStart(2,"0")}${p}`; };
const fmtSh  = h    => { const hh=h%24,p=hh<12?"am":"pm",dh=hh===0?12:hh>12?hh-12:hh; return `${dh}${p}`; };
const dayName= ds   => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(ds+"T12:00:00").getDay()];
const dateStr= ()   => aedt().toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"});

// ── unit conversions ──────────────────────────────────────────────────────────
const toFt    = m   => (m*3.28084).toFixed(1);
const toKnots = k   => Math.round(k*0.539957);
const toMph   = k   => Math.round(k*0.621371);
const toF     = c   => ((c*9/5)+32).toFixed(1);
const fmtWN   = (m,u) => m==null?"—": u==="ft"?toFt(m):(+m).toFixed(1);
const fmtWU   = u   => u==="ft"?"ft":"m";
const fmtWv   = (m,u) => m==null?"—": u==="ft"?`${toFt(m)} ft`:`${(+m).toFixed(1)} m`;
const fmtWind = (k,u) => k==null?"—": u==="kts"?`${toKnots(k)} kts`:u==="mph"?`${toMph(k)} mph`:`${Math.round(k)} km/h`;
const fmtWN2  = (k,u) => k==null?"—": u==="kts"?toKnots(k):u==="mph"?toMph(k):Math.round(k);
const fmtWU2  = u   => u==="kts"?"kts":u==="mph"?"mph":"km/h";
const fmtTemp = (c,u) => c==null?"—": u==="f"?`${toF(c)}°F`:`${(+c).toFixed(1)}°C`;

// ── wind helpers ──────────────────────────────────────────────────────────────
const compass = d => ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(d/22.5)%16];
const windClass = (dir, sk, spotsMap) => {
  const m = spotsMap||DEFAULT_SPOTS, spot = m[sk]||DEFAULT_SPOTS[sk]||DEFAULT_SPOTS.torquay;
  const r = spot.offshore, n = ((dir%360)+360)%360;
  const inR = (d,s,e) => s<=e?d>=s&&d<=e:d>=s||d<=e;
  if (inR(n,r[0],r[1])) return "offshore";
  if (inR(n,(r[0]+180)%360,(r[1]+180)%360)) return "onshore";
  const dO=Math.min(Math.abs(n-r[0]),Math.abs(n-r[1])), dN=Math.min(Math.abs(n-(r[0]+180)%360),Math.abs(n-(r[1]+180)%360));
  return dO<dN?"cross-offshore":dN<dO?"cross-onshore":"cross";
};
const wCol  = t => ({offshore:C.green,onshore:C.coral,"cross-offshore":C.purple,"cross-onshore":C.amber,cross:C.blue}[t]||C.blue);
const wcLbl = t => ({offshore:"Offshore",onshore:"Onshore","cross-offshore":"Cross-off","cross-onshore":"Cross-on",cross:"Cross"}[t]||"—");
const wetsuit= t => t<14?"5/4mm + boots":t<17?"4/3mm fullsuit":t<20?"3/2mm fullsuit":"Spring suit";
const rateWaves=(wH,per,ws)=>{
  if(!wH||wH<0.2) return{t:"Flat",c:C.coral};
  if(wH>=1.0&&per>=12&&ws<20) return{t:"Epic 🔥",c:C.teal};
  if(wH>=0.6&&per>=9&&ws<30)  return{t:"Good 👌",c:C.teal};
  if(wH>=0.3&&ws<40)           return{t:"Fair",c:C.amber};
  return{t:"Poor",c:C.coral};
};

// ── tide model ────────────────────────────────────────────────────────────────
// ── WorldTides API ────────────────────────────────────────────────────────────
// Tide data fetched via /api/tides (Netlify Function with server-side caching)

// Fetch tides via our Netlify cached proxy (calls WorldTides once/day, caches for all users)
const fetchTides = async (lat, lng) => {
  const url = `/api/tides?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tide proxy error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
};

// Convert WorldTides hourly heights into a curve for a given day offset (0=today)
// Returns [{h, ht}] where h is hours 0-24 local AEDT, ht is metres
const tideCurveFromWT = (wtData, dayOff=0) => {
  if (!wtData?.heights?.length) return fallbackCurve(dayOff);
  const startOfDay = aedt();
  startOfDay.setUTCHours(0,0,0,0);
  startOfDay.setTime(startOfDay.getTime() - TZ*3600000); // back to UTC midnight local
  const dayStart = Math.floor(startOfDay.getTime()/1000) + dayOff*86400;
  const dayEnd   = dayStart + 86400;
  const pts = wtData.heights
    .filter(p => p.dt >= dayStart && p.dt < dayEnd)
    .map(p => ({ h: ((p.dt - dayStart) / 3600), ht: p.height }));
  if (pts.length < 2) return fallbackCurve(dayOff);
  return pts;
};

// Extract extremes (high/low turns) for a given day offset
const turnsFromWT = (wtData, dayOff=0) => {
  if (!wtData?.extremes?.length) return [];
  const startOfDay = aedt();
  startOfDay.setUTCHours(0,0,0,0);
  startOfDay.setTime(startOfDay.getTime() - TZ*3600000);
  const dayStart = Math.floor(startOfDay.getTime()/1000) + dayOff*86400;
  const dayEnd   = dayStart + 86400;
  return wtData.extremes
    .filter(e => e.dt >= dayStart && e.dt < dayEnd)
    .map(e => ({ h: (e.dt - dayStart)/3600, ht: e.height, type: e.type==="High"?"high":"low" }));
};

// Fallback harmonic model if WorldTides unavailable
const tideAt = (h, off=0) => { const t=(h+off*0.84)*2*Math.PI/24; return Math.max(0,0.55*Math.sin(2*t-2.1)+0.15*Math.sin(2*t-2.8)+0.18*Math.sin(t+0.5)+0.12*Math.sin(t-0.8)+0.8); };
const fallbackCurve = (off=0,n=48) => Array.from({length:n+1},(_,i)=>({h:i/n*24,ht:tideAt(i/n*24,off)}));
const tideCurve = (off=0) => fallbackCurve(off); // used only if no wtData
const tideTurns = pts => { const o=[];for(let i=1;i<pts.length-1;i++){const p=pts[i-1].ht,c=pts[i].ht,nx=pts[i+1].ht;if(c>p&&c>nx)o.push({h:pts[i].h,ht:pts[i].ht,type:"high"});else if(c<p&&c<nx)o.push({h:pts[i].h,ht:pts[i].ht,type:"low"});}return o;};

const sunAt = (lat,lng) => {
  const d=aedt(),doy=Math.ceil((d-new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000);
  const B=(360/365)*(doy-81)*Math.PI/180,eot=9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B);
  const noon=720-(4*lng+eot),lr=lat*Math.PI/180,decl=23.45*Math.sin(B)*Math.PI/180;
  const ha=el=>Math.acos(Math.max(-1,Math.min(1,(Math.sin(el*Math.PI/180)-Math.sin(lr)*Math.sin(decl))/(Math.cos(lr)*Math.cos(decl)))))*180/Math.PI;
  const H=ha(-0.833),HT=ha(-6),toL=m=>m/60+TZ;
  return{fl:toL(noon-HT*4),sr:toL(noon-H*4),ss:toL(noon+H*4),ll:toL(noon+HT*4)};
};

// ── mock data ─────────────────────────────────────────────────────────────────
const rng=()=>Math.random();
const mkHourly=(spd,dir,swH,swDir,swPer)=>Array.from({length:24},(_,h)=>({
  h,
  speed:Math.max(2,Math.round(spd*0.6+Math.max(0,Math.sin((h-8)*Math.PI/14))*12+(rng()*3-1.5))),
  dir:Math.round(((dir+Math.max(0,Math.sin((h-10)*Math.PI/12))*55+(rng()*8-4))+360)%360),
  swellH:Math.max(0.1,+(swH*(0.85+rng()*0.3)+(Math.sin(h*Math.PI/12)*0.15)).toFixed(1)),
  swellDir:Math.round(((swDir+(rng()*16-8))+360)%360),
  swellPer:Math.max(6,Math.round(swPer+(rng()*2-1))),
}));
const mkDataset=sk=>{
  const m=MOCK_BASE[sk]||{waveH:1.2,swellH:0.9,period:10,waveDir:225,windSpeed:14,windDir:45,sst:16,swellPeriod:11};
  const v=x=>+(x*(0.85+rng()*0.3)).toFixed(1);
  const ws=Math.round(v(m.windSpeed)),wd=(m.windDir+(rng()*20-10)+360)%360;
  const today=aedt();
  const wave7=Array.from({length:7},(_,i)=>{const dt=new Date(today);dt.setDate(dt.getDate()+i);return{date:dt.toISOString().slice(0,10),waveMax:+v(m.waveH).toFixed(1)};});
  const wind7=Array.from({length:7},(_,i)=>{const dt=new Date(today);dt.setDate(dt.getDate()+i);const d2=(wd+(rng()*40-20)+360)%360;return{date:dt.toISOString().slice(0,10),windMax:Math.round(ws*(0.65+rng()*0.7)),windDir:d2};});
  const hourly7=wind7.map(w=>mkHourly(w.windMax||ws,w.windDir||wd,v(m.swellH),m.waveDir+(rng()*15-7),m.swellPeriod));
  return{
    cond:{waveH:v(m.waveH),swellHeight:+v(m.swellH).toFixed(1),period:Math.round(v(m.period)),waveDir:m.waveDir+(rng()*20-10),windSpeed:ws,windDir:wd,sst:+(m.sst+(rng()*0.4-0.2)).toFixed(1),swellPeriod:Math.round(v(m.swellPeriod))},
    wave7,wind7,hourly7,live:false,
  };
};

// ── live fetch ────────────────────────────────────────────────────────────────
const fetchLive=async(lat,lng)=>{
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),9000);
  try{
    const [mr,wr]=await Promise.all([
      fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,sea_surface_temperature&daily=wave_height_max,wind_wave_direction_dominant,swell_wave_period_max&timezone=auto&forecast_days=7`,{signal:ctrl.signal}),
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=wind_speed_10m,wind_direction_10m&daily=wind_speed_10m_max,wind_direction_10m_dominant,wind_gusts_10m_max&timezone=auto&forecast_days=7`,{signal:ctrl.signal}),
    ]);
    clearTimeout(timer);
    if(!mr.ok||!wr.ok) throw new Error("bad response");
    const[m,w]=await Promise.all([mr.json(),wr.json()]);
    const idx=Math.min(Math.floor(nowH()),23);
    const wS=w.hourly.wind_speed_10m||[],wD=w.hourly.wind_direction_10m||[];
    const hourly7=Array.from({length:7},(_,day)=>Array.from({length:24},(_,h)=>({
      h,
      speed:Math.round(wS[day*24+h]||0),
      dir:Math.round(wD[day*24+h]||0),
      swellH:+(m.hourly.swell_wave_height?.[day*24+h]||0).toFixed(1),
      swellDir:Math.round(m.hourly.wave_direction?.[day*24+h]||0),
      swellPer:Math.round(m.hourly.swell_wave_period?.[day*24+h]||0),
    })));
    const wave7=(m.daily?.time||[]).map((dt,i)=>({date:dt,waveMax:m.daily.wave_height_max?.[i]??null}));
    const wind7=(w.daily?.time||[]).map((dt,i)=>({date:dt,windMax:w.daily.wind_speed_10m_max?.[i]??null,windDir:w.daily.wind_direction_10m_dominant?.[i]??null}));
    return{
      cond:{waveH:m.hourly.wave_height?.[idx]??null,swellHeight:m.hourly.swell_wave_height?.[idx]??null,period:m.hourly.wave_period?.[idx]??null,waveDir:m.hourly.wave_direction?.[idx]??null,windSpeed:w.hourly.wind_speed_10m?.[idx]??null,windDir:w.hourly.wind_direction_10m?.[idx]??null,sst:m.hourly.sea_surface_temperature?.[idx]??null,swellPeriod:m.hourly.swell_wave_period?.[idx]??null},
      wave7,wind7,hourly7,live:true,
    };
  }catch(e){clearTimeout(timer);throw e;}
};

// ── Arrow SVG ─────────────────────────────────────────────────────────────────
const Arrow=({deg,col,size=18})=>{
  const rad=(deg-90)*Math.PI/180,cx=size/2,cy=size/2,len=size*0.36;
  const tx=cx+Math.cos(rad)*len,ty=cy+Math.sin(rad)*len;
  const fx=cx-Math.cos(rad)*len,fy=cy-Math.sin(rad)*len;
  const aw=size*0.15,al=size*0.17;
  const lx=tx-Math.cos(rad)*al-Math.sin(rad)*aw,ly=ty-Math.sin(rad)*al+Math.cos(rad)*aw;
  const rx=tx-Math.cos(rad)*al+Math.sin(rad)*aw,ry=ty-Math.sin(rad)*al-Math.cos(rad)*aw;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{display:"block",flexShrink:0}}><line x1={fx} y1={fy} x2={tx} y2={ty} stroke={col} strokeWidth="1.8" strokeLinecap="round"/><polygon points={`${tx},${ty} ${lx},${ly} ${rx},${ry}`} fill={col}/></svg>;
};

// ── Compass ring ─────────────────────────────────────────────────────────────
const CompassPanel=({deg,col,label,rows,size=44})=>(
  <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:`${col}0c`,border:`1px solid ${col}2a`,borderRadius:14,padding:"10px 8px"}}>
    <div style={{position:"relative",width:size,height:size}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{position:"absolute",inset:0}}>
        <circle cx={size/2} cy={size/2} r={size/2-2} fill="none" stroke={`${col}28`} strokeWidth="1"/>
        {["N","E","S","W"].map((lb,i)=>{const a=i*90*Math.PI/180,tx=size/2+(size/2-6)*Math.sin(a),ty=size/2-(size/2-6)*Math.cos(a);return <text key={lb} x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fill="rgba(127,179,200,.42)" fontSize="5" fontFamily="monospace">{lb}</text>;})}
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <Arrow deg={deg} col={col} size={size-16}/>
      </div>
    </div>
    <div style={{fontFamily:"'Syne',sans-serif",fontSize:".72rem",fontWeight:800,color:col,letterSpacing:"-.02em"}}>{compass(deg)}</div>
    <div style={{fontSize:".70rem",color:C.mist,letterSpacing:".06em",textTransform:"uppercase"}}>{label}</div>
    <div style={{display:"flex",flexDirection:"column",gap:3,width:"100%",marginTop:2}}>
      {rows.map(([k,v,vc])=>(
        <div key={k} style={{display:"flex",justifyContent:"space-between",background:`${col}10`,borderRadius:7,padding:"3px 6px"}}>
          <span style={{fontSize:".70rem",color:C.mist}}>{k}</span>
          <span style={{fontFamily:"'Syne',sans-serif",fontSize:".76rem",fontWeight:800,color:vc||col}}>{v}</span>
        </div>
      ))}
    </div>
  </div>
);

// ── TideChart canvas ──────────────────────────────────────────────────────────
const TideChart=({dayOff,spotData,wtData,h=110})=>{
  const ref=useRef(null);
  useEffect(()=>{
    const cv=ref.current;if(!cv)return;
    const W=cv.parentElement?.clientWidth||300;if(W<10)return;
    cv.width=W;cv.height=h;
    const ctx=cv.getContext("2d");
    const P={l:8,r:8,t:28,b:4},MIN=0,MAX=2.5,NOW=nowH();
    const pts = wtData ? tideCurveFromWT(wtData,dayOff) : tideCurve(dayOff);
    const turns = wtData ? turnsFromWT(wtData,dayOff) : tideTurns(pts);
    const sp=spotData,sun=sp?sunAt(sp.lat,sp.lng):{fl:5,sr:6,ss:20,ll:21};
    const p2x=(hr,ht)=>({x:P.l+(hr/24)*(W-P.l-P.r),y:P.t+(1-(ht-MIN)/(MAX-MIN))*(h-P.t-P.b)});
    ctx.clearRect(0,0,W,h);
    [{h:sun.fl,i:"🌅"},{h:sun.sr,i:"☀️"},{h:sun.ss,i:"🌇"},{h:sun.ll,i:"🌆"}].forEach(ev=>{
      if(ev.h<0||ev.h>24)return;
      const{x}=p2x(ev.h,0),past=ev.h<NOW&&dayOff===0;
      ctx.save();ctx.strokeStyle=past?"rgba(245,166,35,.12)":"rgba(245,166,35,.3)";ctx.lineWidth=1;ctx.setLineDash([2,3]);
      ctx.beginPath();ctx.moveTo(x,P.t);ctx.lineTo(x,h-P.b);ctx.stroke();ctx.setLineDash([]);
      ctx.globalAlpha=past?0.25:0.8;ctx.font="9px serif";ctx.textAlign="center";ctx.fillText(ev.i,x,P.t-3);ctx.globalAlpha=1;ctx.restore();
    });
    [0.5,1.0,1.5,2.0].forEach(ht=>{
      const{y}=p2x(0,ht);
      ctx.save();ctx.strokeStyle="rgba(255,255,255,.04)";ctx.lineWidth=1;ctx.setLineDash([4,5]);
      ctx.beginPath();ctx.moveTo(P.l,y);ctx.lineTo(W-P.r,y);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle="rgba(127,179,200,.22)";ctx.font="6px monospace";ctx.textAlign="left";ctx.fillText(ht.toFixed(1)+"m",P.l+2,y-2);ctx.restore();
    });
    if(dayOff===0){
      ctx.save();ctx.beginPath();pts.forEach((p,i)=>{if(p.h>NOW+.05)return;const{x,y}=p2x(p.h,p.ht);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
      ctx.strokeStyle="rgba(79,156,245,.38)";ctx.lineWidth=2;ctx.lineJoin="round";ctx.stroke();ctx.restore();
    }
    ctx.save();ctx.beginPath();let go=false;
    pts.forEach(p=>{if(dayOff===0&&p.h<NOW-.05)return;const{x,y}=p2x(p.h,p.ht);if(!go){ctx.moveTo(x,y);go=true;}else ctx.lineTo(x,y);});
    ctx.strokeStyle=C.teal;ctx.lineWidth=2.2;ctx.lineJoin="round";ctx.shadowColor=C.teal;ctx.shadowBlur=5;ctx.stroke();ctx.restore();
    if(dayOff===0){
      const nowHt = (() => {
        const idx=pts.findIndex(p=>p.h>NOW);
        if(idx<=0) return pts[0]?.ht??0;
        const a=pts[idx-1],b=pts[idx];
        return a.ht+(b.ht-a.ht)*((NOW-a.h)/(b.h-a.h));
      })();
      const np=p2x(NOW,nowHt);
      ctx.save();ctx.strokeStyle="rgba(245,166,35,.6)";ctx.lineWidth=1.2;ctx.setLineDash([3,4]);
      ctx.beginPath();ctx.moveTo(np.x,P.t);ctx.lineTo(np.x,h-P.b);ctx.stroke();ctx.restore();
      ctx.save();ctx.fillStyle=C.amber;ctx.shadowColor=C.amber;ctx.shadowBlur=7;
      ctx.beginPath();ctx.arc(np.x,np.y,3.5,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    turns.forEach(t=>{
      const{x,y}=p2x(t.h,t.ht),isH=t.type==="high",tc=isH?C.teal:C.blue;
      ctx.save();ctx.fillStyle=tc;ctx.shadowColor=tc;ctx.shadowBlur=5;
      ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.restore();
      const lY=isH?y-12:y+9,cx2=Math.max(20,Math.min(W-20,x));
      ctx.save();ctx.font="bold 6.5px sans-serif";ctx.fillStyle=C.pearl;ctx.textAlign="center";
      ctx.fillText(t.ht.toFixed(1)+"m",cx2,lY);ctx.font="5.5px monospace";ctx.fillStyle=tc;ctx.fillText(fmtH(t.h),cx2,lY+7);ctx.restore();
    });
  },[dayOff,spotData,h]);
  return <canvas ref={ref} style={{width:"100%",height:h,display:"block"}}/>;
};

// ── WindBars canvas ───────────────────────────────────────────────────────────
const WindBars=({data,sk,spotsMap,dayOff=0,h=76})=>{
  const ref=useRef(null);
  useEffect(()=>{
    const cv=ref.current;if(!cv||!data?.length)return;
    const W=cv.parentElement?.clientWidth||300;if(W<10)return;
    cv.width=W;cv.height=h;
    const ctx=cv.getContext("2d");
    const P={l:4,r:4,t:4,b:4},NOW=nowH();
    const MAX=Math.ceil(Math.max(...data.map(d=>d.speed),10)/5)*5+5;
    const bW=Math.max(2,(W-P.l-P.r)/26);
    ctx.clearRect(0,0,W,h);
    data.forEach(d=>{
      const x=P.l+(d.h/24)*(W-P.l-P.r);
      const bH=Math.max(2,(d.speed/MAX)*(h-P.t-P.b)),y=h-P.b-bH;
      const dc=wCol(windClass(d.dir,sk,spotsMap)),past=d.h<NOW&&dayOff===0;
      ctx.save();ctx.fillStyle=past?dc+"44":dc+"aa";
      if(!past){ctx.shadowColor=dc;ctx.shadowBlur=2;}
      ctx.fillRect(x-bW/2,y,bW,bH);ctx.restore();
    });
    const nX=P.l+(NOW/24)*(W-P.l-P.r);
    ctx.save();ctx.strokeStyle="rgba(245,166,35,.55)";ctx.lineWidth=1.2;ctx.setLineDash([3,4]);
    ctx.beginPath();ctx.moveTo(nX,P.t);ctx.lineTo(nX,h-P.b);ctx.stroke();ctx.restore();
  },[data,sk,spotsMap,dayOff,h]);
  return <canvas ref={ref} style={{width:"100%",height:h,display:"block"}}/>;
};

// ── Loading screen ────────────────────────────────────────────────────────────
const LoadingScreen=({spotName,status})=>(
  <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:`linear-gradient(165deg,#041828,#020d1a)`,gap:16,fontFamily:"'DM Mono',monospace"}}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    <div style={{width:48,height:48,border:`3px solid ${C.g1}`,borderTop:`3px solid ${C.teal}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
    <div style={{fontFamily:"'Syne',sans-serif",fontSize:"1rem",fontWeight:800,color:C.pearl}}>{spotName}</div>
    <div style={{fontSize:".72rem",color:C.teal,letterSpacing:".18em",textTransform:"uppercase",animation:"pulse 2s ease-in-out infinite"}}>{status}</div>
  </div>
);

// ── Error / offline banner ────────────────────────────────────────────────────
const OfflineBanner=({onRetry})=>(
  <div style={{margin:"0 14px 10px",background:"rgba(255,107,107,.07)",border:`1px solid rgba(255,107,107,.25)`,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
    <span style={{fontSize:"1rem"}}>⚠️</span>
    <div style={{flex:1}}>
      <div style={{fontSize:".66rem",color:C.coral,fontWeight:600,letterSpacing:".04em"}}>Live data unavailable</div>
      <div style={{fontSize:".60rem",color:C.mist,marginTop:2}}>Showing modelled data — check your connection</div>
    </div>
    <div onClick={onRetry} style={{fontSize:".62rem",color:C.teal,cursor:"pointer",padding:"5px 10px",border:`1px solid rgba(0,212,200,.3)`,borderRadius:8,whiteSpace:"nowrap",letterSpacing:".06em"}}>Retry</div>
  </div>
);

// ── Top Nav ───────────────────────────────────────────────────────────────────
const TopNav=({sk,spots,defaultLoc,prefs,onSpot,onSettings,screen,onBack})=>(
  <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(4,24,40,.97)",backdropFilter:"blur(12px)",borderBottom:`1px solid ${C.g1}`}}>
    <div style={{display:"flex",alignItems:"center",padding:"10px 14px 0",gap:10}}>
      {/* Logo / back */}
      {screen==="conditions"
        ?<div style={{fontFamily:"'Syne',sans-serif",fontSize:".88rem",fontWeight:800,color:C.pearl,letterSpacing:"-.02em",flexShrink:0}}>
            Swell<span style={{color:C.teal}}>Track</span>
          </div>
        :<div onClick={onBack} style={{fontSize:".76rem",color:C.teal,cursor:"pointer",flexShrink:0,letterSpacing:".04em"}}>‹ Back</div>
      }
      <div style={{flex:1}}/>
      {/* Screen title for detail screens */}
      {screen!=="conditions" &&
        <div style={{fontFamily:"'Syne',sans-serif",fontSize:".82rem",fontWeight:700,color:C.pearl,position:"absolute",left:"50%",transform:"translateX(-50%)"}}>
          {screen==="tidewind"?"Tides & Wind":screen==="settings"?"Settings":"About"}
        </div>
      }
      {/* Gear */}
      <div onClick={onSettings} style={{fontSize:"1.1rem",cursor:"pointer",opacity:screen==="settings"?1:0.55,transition:"opacity .2s",padding:"2px 4px"}} title="Settings">⚙️</div>
    </div>
    {/* Spot pills — only on conditions */}
    {screen==="conditions" &&
      <div style={{display:"flex",gap:5,padding:"8px 14px 10px",overflowX:"auto",scrollbarWidth:"none"}}>
        {Object.entries(spots).map(([k,s])=>(
          <div key={k} onClick={()=>onSpot(k)} style={{flexShrink:0,display:"flex",alignItems:"center",gap:4,borderRadius:20,padding:"4px 12px",fontSize:".68rem",cursor:"pointer",whiteSpace:"nowrap",background:k===sk?"rgba(0,212,200,.15)":C.g2,border:`1px solid ${k===sk?"rgba(0,212,200,.5)":C.g1}`,color:k===sk?C.teal:C.mist,letterSpacing:".04em"}}>
            {k===defaultLoc&&<span style={{fontSize:".72rem"}}>★</span>}
            {s.name}
          </div>
        ))}
      </div>
    }
  </div>
);

// ── ToggleRow ─────────────────────────────────────────────────────────────────
const ToggleRow=({label,icon,options,current,onChange})=>(
  <div style={{display:"flex",flexDirection:"column",gap:8,padding:"14px 0",borderBottom:`1px solid ${C.g1}`}}>
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:"1rem"}}>{icon}</span>
      <span style={{fontSize:".68rem",color:C.pearl,letterSpacing:".04em"}}>{label}</span>
    </div>
    <div style={{display:"flex",gap:6}}>
      {options.map(([val,lbl])=>{
        const active=current===val;
        return <div key={val} onClick={()=>onChange(val)} style={{flex:1,textAlign:"center",padding:"8px 4px",borderRadius:10,cursor:"pointer",background:active?"rgba(0,212,200,.15)":C.g2,border:`1px solid ${active?"rgba(0,212,200,.55)":C.g1}`,color:active?C.teal:C.mist,fontSize:".70rem",fontWeight:active?"600":"400",letterSpacing:".04em"}}>{lbl}</div>;
      })}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [screen,  setScreen]  = useState("conditions");
  const [prefs,   setPrefs]   = useState(loadPrefs);
  const [sk,      setSk]      = useState(()=>{ const p=loadPrefs(); const sp=buildSpots(p); return sp[p.defaultLocation]?p.defaultLocation:Object.keys(sp)[0]||"torquay"; });
  const [ds,      setDs]      = useState(null);
  const [hourly,  setHourly]  = useState([]);
  const [selDay,  setSelDay]  = useState(0);
  const [status,  setStatus]  = useState("loading"); // "loading"|"live"|"offline"
  const [loadMsg, setLoadMsg] = useState("Fetching live conditions…");
  const [wtData,  setWtData]  = useState(null); // WorldTides response
  const [clk,     setClk]     = useState(clockStr(false));
  // Settings form state (must be at top level)
  const [addOpen, setAddOpen] = useState(false);
  const [form,    setForm]    = useState({name:"",lat:"",lng:"",breakType:"Beach"});
  const [formErr, setFormErr] = useState("");

  const SPOTS = buildSpots(prefs);
  const u24 = prefs.timeFormat === "24h";

  // Clock tick
  useEffect(()=>{ setClk(clockStr(u24)); const t=setInterval(()=>setClk(clockStr(u24)),30000); return()=>clearInterval(t); },[u24]);

  // Load data whenever spot changes
  const load = async (spotKey) => {
    setStatus("loading");
    setLoadMsg("Fetching live conditions…");
    setSelDay(0);
    setWtData(null);
    const sp = buildSpots(prefs)[spotKey] || DEFAULT_SPOTS.torquay;
    // Fetch wave/wind and tides in parallel
    const [waveResult, tideResult] = await Promise.allSettled([
      fetchLive(sp.lat, sp.lng),
      fetchTides(sp.lat, sp.lng),
    ]);
    if (waveResult.status === "fulfilled") {
      setDs(waveResult.value);
      setHourly(waveResult.value.hourly7[0]);
      setStatus("live");
    } else {
      const d = mkDataset(spotKey);
      setDs(d); setHourly(d.hourly7[0]); setStatus("offline");
    }
    if (tideResult.status === "fulfilled") {
      setWtData(tideResult.value);
    }
    // else wtData stays null → falls back to harmonic model
  };

  useEffect(()=>{ load(sk); },[sk]);

  const pickDay = i => { if(!ds)return; setSelDay(i); setHourly(ds.hourly7[i]||ds.hourly7[0]); };
  const updatePref = (k,v) => { const n={...prefs,[k]:v}; setPrefs(n); savePrefs(n); };
  const addLocation = loc => {
    const id="custom_"+Date.now();
    const n={...prefs,customLocations:[...(prefs.customLocations||[]),{...loc,id,offshore:[0,90]}]};
    setPrefs(n);savePrefs(n);
  };
  const removeLocation = id => {
    const isDef=!!DEFAULT_SPOTS[id];
    let n;
    if(isDef){n={...prefs,removedDefaults:[...(prefs.removedDefaults||[]),id]};}
    else{n={...prefs,customLocations:(prefs.customLocations||[]).filter(l=>l.id!==id)};}
    if(sk===id||prefs.defaultLocation===id){const rem=buildSpots(n);const fk=Object.keys(rem)[0];n.defaultLocation=fk||"torquay";setSk(fk||"torquay");}
    setPrefs(n);savePrefs(n);
  };
  const setDefault = id => updatePref("defaultLocation",id);

  // Loading screen
  if(status==="loading") return(<div><LoadingScreen spotName={SPOTS[sk]?.name||"Loading…"} status={loadMsg}/></div>);

  const {cond,wave7,wind7} = ds;
  const NOW   = nowH();
  // Use real WorldTides data if available, else harmonic fallback
  const todayCurve = wtData ? tideCurveFromWT(wtData,0) : tideCurve(0);
  const curT  = (() => {
    if (!wtData) return tideAt(NOW,0);
    const pts = todayCurve;
    const idx = pts.findIndex(p=>p.h>NOW);
    if(idx<=0) return pts[0]?.ht??0;
    const a=pts[idx-1],b=pts[idx];
    return a.ht+(b.ht-a.ht)*((NOW-a.h)/(b.h-a.h));
  })();
  const rising= (() => {
    if (!wtData) return curT>tideAt(NOW-0.5,0);
    const pts = todayCurve;
    const prev = pts.filter(p=>p.h<=NOW).slice(-1)[0];
    return prev ? curT > prev.ht : true;
  })();
  const turns0= wtData ? turnsFromWT(wtData,0) : tideTurns(tideCurve(0));
  const nextT = turns0.filter(t=>t.h>NOW).slice(0,3);
  const wc    = cond.windDir!=null?windClass(cond.windDir,sk,SPOTS):"cross";
  const wcol  = wCol(wc);
  const rat   = rateWaves(cond.waveH,cond.period,cond.windSpeed);
  const curW  = hourly[Math.min(Math.floor(NOW),hourly.length-1)]||{speed:0,dir:0,swellH:0,swellDir:225,swellPer:0};
  const sp    = SPOTS[sk];

  const bg   = {background:`linear-gradient(165deg,#041828 0%,#020d1a 65%)`,minHeight:"100vh",fontFamily:"'DM Mono',monospace",color:C.pearl};
  const mn   = (sz,col=C.pearl,ex={})=>({fontFamily:"'Syne',sans-serif",fontSize:sz,fontWeight:700,color:col,lineHeight:1,...ex});
  const sm   = (sz,col=C.mist,ex={})=>({fontSize:sz,color:col,...ex});
  const pill = (ex={})=>({background:C.g2,border:`1px solid ${C.g1}`,borderRadius:14,padding:12,...ex});
  const nav  = <TopNav sk={sk} spots={SPOTS} defaultLoc={prefs.defaultLocation} prefs={prefs} onSpot={k=>{setSk(k);}} onSettings={()=>setScreen(screen==="settings"?"conditions":"settings")} screen={screen} onBack={()=>setScreen("conditions")}/>;

  // ── CONDITIONS ─────────────────────────────────────────────────────────────
  if(screen==="conditions") return(
    <div style={bg}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{display:none}input::placeholder{color:rgba(127,179,200,.4)}input:focus{outline:none;border-color:rgba(0,212,200,.5)!important}body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}`}</style>
      {nav}
      <div style={{padding:"12px 16px 0"}}>
        {/* Status banner */}
        {status==="offline"&&<OfflineBanner onRetry={()=>load(sk)}/>}
        {/* Rating */}
        <div style={{display:"inline-flex",alignItems:"center",gap:5,background:`${rat.c}18`,border:`1px solid ${rat.c}44`,borderRadius:18,padding:"3px 10px",fontSize:".68rem",color:rat.c,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>
          <div style={{width:4,height:4,borderRadius:"50%",background:rat.c}}/>{rat.t}
        </div>
        {/* Wave hero + compass panels */}
        <div style={mn("3rem",C.pearl,{letterSpacing:"-.03em"})}>{fmtWN(cond.waveH||0,prefs.waveUnit)}<span style={{fontSize:"1.2rem",fontWeight:400,color:C.mist}}> {fmtWU(prefs.waveUnit)}</span></div>
        <div style={sm(".70rem",C.mist,{marginTop:2,marginBottom:10})}>{cond.period?`${Math.round(cond.period)}s period`:"—"}</div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <CompassPanel deg={cond.windDir??0} col={wcol} label="wind dir" rows={[["speed",fmtWind(cond.windSpeed,prefs.windUnit),wcol],["type",wcLbl(wc),wcol]]}/>
          <CompassPanel deg={cond.waveDir??225} col={C.teal} label="swell dir" rows={[["wave",`${fmtWN(cond.waveH||0,prefs.waveUnit)}${fmtWU(prefs.waveUnit)}`,C.teal],["swell",`${fmtWN(cond.swellHeight||0,prefs.waveUnit)}${fmtWU(prefs.waveUnit)}`,C.teal2],["period",cond.swellPeriod?`${Math.round(cond.swellPeriod)}s`:"—",C.teal]]}/>
        </div>
        {/* Wave animation */}
        <div style={{height:24,overflow:"hidden",opacity:.32,margin:"0 -16px 10px"}}>
          <svg width="100%" height="24" viewBox="0 0 400 24" preserveAspectRatio="none">
            <path d="M0,14 C30,6 50,20 80,10 C110,0 130,17 160,7 C190,-3 210,15 240,5 C270,-5 295,13 320,3 C350,-7 375,11 400,3 L400,24 L0,24Z" fill="rgba(0,212,200,0.1)" stroke="rgba(0,212,200,0.3)" strokeWidth="1.5"/>
          </svg>
        </div>
        {/* Cards */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div onClick={()=>setScreen("tidewind")} style={pill({gridColumn:"1/-1",display:"flex",alignItems:"center",cursor:"pointer",border:`1px solid rgba(0,212,200,.22)`,background:"rgba(0,212,200,.04)"})}>
            <div style={{flex:1}}>
              <div style={sm(".62rem",C.mist,{letterSpacing:".1em",textTransform:"uppercase",marginBottom:4})}>🌊 Tides &amp; 💨 Wind</div>
              <div style={{display:"flex",alignItems:"baseline",gap:7,marginBottom:3}}><span style={mn("1.1rem")}>{curT.toFixed(2)}m</span><span style={sm(".64rem")}>{rising?"↑ Rising":"↓ Falling"}</span></div>
              <div style={{display:"flex",alignItems:"baseline",gap:7}}><span style={mn("1.1rem",wcol)}>{fmtWind(cond.windSpeed,prefs.windUnit)}</span><span style={sm(".64rem")}>{cond.windDir!=null?`${compass(cond.windDir)} · ${wcLbl(wc)}`:"—"}</span></div>
              <div style={{height:2,background:"rgba(255,255,255,.07)",borderRadius:1,marginTop:6}}><div style={{height:"100%",width:`${Math.min(100,Math.round(curT/2.5*100))}%`,background:`linear-gradient(90deg,${C.teal2},${C.teal})`,borderRadius:1}}/></div>
            </div>
            <span style={sm(".60rem","rgba(0,212,200,.5)",{paddingLeft:12})}>Chart →</span>
          </div>
          <div style={pill()}>
            <div style={{fontSize:".9rem",marginBottom:4}}>🌡️</div>
            <div style={sm(".62rem",C.mist,{letterSpacing:".1em",textTransform:"uppercase",marginBottom:2})}>Water Temp</div>
            <div style={mn("1.1rem")}>{fmtTemp(cond.sst,prefs.tempUnit)}</div>
            <div style={sm(".62rem",C.mist,{marginTop:2})}>{cond.sst!=null?wetsuit(cond.sst):"—"}</div>
          </div>
          <div style={pill()}>
            <div style={{fontSize:".9rem",marginBottom:4}}>🔄</div>
            <div style={sm(".62rem",C.mist,{letterSpacing:".1em",textTransform:"uppercase",marginBottom:2})}>Period</div>
            <div style={mn("1.1rem")}>{cond.swellPeriod!=null?`${Math.round(cond.swellPeriod)}s`:"—"}</div>
            <div style={sm(".62rem",C.mist,{marginTop:2})}>{cond.waveDir!=null?`${compass(cond.waveDir)} swell`:"—"}</div>
          </div>
        </div>
      </div>
      <div style={{height:40}}/>
    </div>
  );

  // ── TIDES & WIND ───────────────────────────────────────────────────────────
  if(screen==="tidewind"){
    const dPts = wtData ? tideCurveFromWT(wtData,selDay) : tideCurve(selDay);
    const hiT=Math.max(...dPts.map(p=>p.ht)).toFixed(1);
    const loT=Math.min(...dPts.map(p=>p.ht)).toFixed(1);
    const dW=wind7[selDay]||{};
    const dWt=dW.windDir!=null?windClass(dW.windDir,sk,SPOTS):"cross";
    const dWc=wCol(dWt);
    const maxS=Math.max(...hourly.map(d=>d.speed),10);
    const MAX_S=Math.ceil(maxS/5)*5+5;
    const nextTd=selDay===0?nextT:(wtData?turnsFromWT(wtData,selDay):tideTurns(dPts)).filter(t=>t.h>(selDay===0?NOW:0)).slice(0,3);
    return(
      <div style={bg}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{display:none}`}</style>
        {nav}
        <div style={{padding:"10px 16px 0"}}>
          {status==="offline"&&<OfflineBanner onRetry={()=>load(sk)}/>}
          {/* Hero */}
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <div style={{flex:1}}>
              <div style={sm(".76rem",C.teal,{letterSpacing:".12em",textTransform:"uppercase",marginBottom:2})}>{selDay===0?"Tide now":`Tide · ${dayName(wave7[selDay]?.date||"")}`}</div>
              {selDay===0
                ?<><div style={mn("1.9rem")}>{curT.toFixed(2)}<span style={{fontSize:".85rem",fontWeight:400,color:C.mist}}>m</span></div><div style={sm(".68rem",C.teal,{marginTop:1})}>{rising?"↑ Rising":"↓ Falling"}</div></>
                :<><div style={mn("1.9rem",C.teal)}>{hiT}<span style={{fontSize:".85rem",fontWeight:400,color:C.mist}}>m</span></div><div style={sm(".68rem",C.blue,{marginTop:1})}>▼ {loT}m low</div></>
              }
            </div>
            <div style={{width:1,background:"rgba(255,255,255,.08)",margin:"4px 0"}}/>
            <div style={{flex:1,paddingLeft:8}}>
              <div style={sm(".76rem",C.teal,{letterSpacing:".12em",textTransform:"uppercase",marginBottom:2})}>{selDay===0?"Wind now":`Wind · ${dayName(wind7[selDay]?.date||"")}`}</div>
              <div style={mn("1.9rem")}>{selDay===0?fmtWN2(curW.speed,prefs.windUnit):(dW.windMax!=null?fmtWN2(dW.windMax,prefs.windUnit):"—")}<span style={{fontSize:".85rem",fontWeight:400,color:C.mist}}> {fmtWU2(prefs.windUnit)}</span></div>
              <div style={sm(".68rem",selDay===0?wcol:dWc,{marginTop:1})}>{selDay===0?`${compass(curW.dir)} · ${wcLbl(wc)}`:(dW.windDir!=null?`${compass(dW.windDir)} · ${wcLbl(dWt)}`:"—")}</div>
            </div>
          </div>
          {/* Wave + swell strip */}
          <div style={{display:"flex",gap:0,background:C.g2,border:`1px solid ${C.g1}`,borderRadius:12,overflow:"hidden",marginBottom:8}}>
            <div style={{flex:1,padding:"8px 12px",borderRight:`1px solid ${C.g1}`}}>
              <div style={sm(".70rem",C.mist,{letterSpacing:".1em",textTransform:"uppercase",marginBottom:2})}>🌊 Wave height</div>
              <div style={{display:"flex",alignItems:"baseline",gap:4}}><span style={mn("1.05rem")}>{fmtWN(cond.waveH||0,prefs.waveUnit)}</span><span style={sm(".62rem")}>{fmtWU(prefs.waveUnit)}</span></div>
              <div style={sm(".74rem",C.mist,{marginTop:1})}>Combined sea state</div>
            </div>
            <div style={{flex:1,padding:"8px 12px"}}>
              <div style={sm(".70rem",C.mist,{letterSpacing:".1em",textTransform:"uppercase",marginBottom:2})}>📡 Swell height</div>
              <div style={{display:"flex",alignItems:"baseline",gap:4}}><span style={mn("1.05rem",C.teal2)}>{fmtWN(cond.swellHeight||0,prefs.waveUnit)}</span><span style={sm(".62rem")}>{fmtWU(prefs.waveUnit)}</span>{cond.swellPeriod&&<span style={sm(".74rem",C.mist,{marginLeft:2})}>· {Math.round(cond.swellPeriod)}s</span>}</div>
              <div style={sm(".74rem",C.mist,{marginTop:1})}>Groundswell only</div>
            </div>
          </div>
          {/* Tide pills */}
          <div style={{display:"flex",gap:5,marginBottom:8}}>
            {nextTd.map((t,i)=>(
              <div key={i} style={{flex:1,background:t.type==="high"?"rgba(0,212,200,.06)":"rgba(79,156,245,.05)",border:`1px solid ${t.type==="high"?"rgba(0,212,200,.25)":"rgba(79,156,245,.2)"}`,borderRadius:10,padding:"5px 7px"}}>
                <div style={sm(".72rem",t.type==="high"?C.teal:C.blue,{textTransform:"uppercase",marginBottom:1})}>{t.type==="high"?"▲ High":"▼ Low"}</div>
                <div style={mn(".72rem")}>{fmtH(t.h)}</div>
                <div style={sm(".74rem")}>{t.ht.toFixed(2)}m</div>
              </div>
            ))}
          </div>
          {/* Charts */}
          <div style={{marginBottom:2}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={sm(".74rem",C.mist,{letterSpacing:".08em",textTransform:"uppercase"})}>{selDay===0?"Today · Midnight–Midnight":dayName(wave7[selDay]?.date||"")+" · Full Day"}</span>
              <span style={sm(".74rem")}>0–{fmtWN2(MAX_S,prefs.windUnit)} {fmtWU2(prefs.windUnit)}</span>
            </div>
            <div style={sm(".72rem","rgba(0,212,200,.55)",{letterSpacing:".08em",textTransform:"uppercase",marginBottom:2})}>TIDE (m)</div>
            <TideChart key={`t${sk}${selDay}`} dayOff={selDay} spotData={sp} wtData={wtData} h={108}/>
            <div style={sm(".72rem","rgba(0,212,200,.45)",{letterSpacing:".08em",textTransform:"uppercase",margin:"3px 0 2px"})}>WIND ({fmtWU2(prefs.windUnit).toUpperCase()}) · max {fmtWN2(MAX_S,prefs.windUnit)}</div>
            <WindBars key={`w${sk}${selDay}`} data={hourly} sk={sk} spotsMap={SPOTS} dayOff={selDay} h={74}/>
          </div>
          {/* Time axis */}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:".72rem",color:"rgba(127,179,200,.4)",marginBottom:6}}>
            {["12am","3am","6am",selDay===0?clk+"▼":"9am","12pm","3pm","6pm","9pm","12am"].map((l,i)=>(
              <span key={i} style={selDay===0&&i===3?{color:C.amber}:{}}>{l}</span>
            ))}
          </div>
          {/* Wind key */}
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
            {[["#5de89e","Offshore"],["#ff6b6b","Onshore"],["#4f9cf5","Cross"],["#a78bfa","X-off"],["#f5a623","X-on"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:3}}><div style={{width:6,height:6,borderRadius:"50%",background:c}}/><span style={sm(".74rem")}>{l}</span></div>
            ))}
          </div>
          {/* Wind hourly */}
          <div style={sm(".60rem",C.mist,{letterSpacing:".1em",textTransform:"uppercase",marginBottom:5})}>💨 Wind · Hourly</div>
          <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,marginBottom:8}}>
            {hourly.map((d,i)=>{
              const isNow=selDay===0&&Math.abs(d.h-Math.floor(NOW))<0.5;
              const dc=wCol(windClass(d.dir,sk,SPOTS));
              const wlbl=windClass(d.dir,sk,SPOTS);
              return(
                <div key={i} style={{flexShrink:0,width:48,background:isNow?"rgba(245,166,35,.07)":C.g2,border:`1px solid ${isNow?"rgba(245,166,35,.5)":C.g1}`,borderRadius:10,padding:"5px 4px",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <span style={sm(".70rem",isNow?C.amber:C.mist)}>{fmtSh(d.h)}</span>
                  <Arrow deg={d.dir} col={dc} size={17}/>
                  <span style={mn(".6rem",dc)}>{fmtWN2(d.speed,prefs.windUnit)}</span>
                  <span style={sm(".74rem",C.pearl,{fontWeight:600,opacity:.7})}>{compass(d.dir)}</span>
                  <span style={sm(".50rem",dc,{textTransform:"uppercase"})}>{wlbl==="offshore"?"OFF":wlbl==="onshore"?"ON":wlbl==="cross-offshore"?"X-off":wlbl==="cross-onshore"?"X-on":"X"}</span>
                </div>
              );
            })}
          </div>
          {/* Swell hourly */}
          <div style={sm(".60rem",C.mist,{letterSpacing:".1em",textTransform:"uppercase",marginBottom:5})}>🌊 Swell · Hourly</div>
          <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,marginBottom:8}}>
            {hourly.map((d,i)=>{
              const isNow=selDay===0&&Math.abs(d.h-Math.floor(NOW))<0.5;
              const swH=d.swellH??0,swD=d.swellDir??225,swP=d.swellPer??0;
              const si=Math.min(1,swH/2.5);
              const sc=si>0.6?C.teal:si>0.3?C.teal2:C.mist;
              return(
                <div key={i} style={{flexShrink:0,width:48,background:isNow?"rgba(0,212,200,.07)":C.g2,border:`1px solid ${isNow?"rgba(0,212,200,.45)":C.g1}`,borderRadius:10,padding:"5px 4px",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <span style={sm(".70rem",isNow?C.teal:C.mist)}>{fmtSh(d.h)}</span>
                  <Arrow deg={swD} col={sc} size={17}/>
                  <span style={mn(".6rem",sc)}>{fmtWN(swH,prefs.waveUnit)}{fmtWU(prefs.waveUnit)}</span>
                  <span style={sm(".74rem",C.pearl,{fontWeight:600,opacity:.7})}>{compass(swD)}</span>
                  <span style={sm(".50rem",C.mist)}>{swP}s</span>
                </div>
              );
            })}
          </div>
          {/* 7-day */}
          <div style={sm(".60rem",C.mist,{letterSpacing:".1em",textTransform:"uppercase",marginBottom:5})}>7-Day Forecast</div>
          <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4}}>
            {wave7.map((wd,i)=>{
              const wday=wind7[i]||{};
              const p2 = wtData ? tideCurveFromWT(wtData,i) : tideCurve(i);
              const hi2=Math.max(...p2.map(p=>p.ht)).toFixed(1);
              const lo2=Math.min(...p2.map(p=>p.ht)).toFixed(1);
              const wdir=wday.windDir;
              const wt3=wdir!=null?windClass(wdir,sk,SPOTS):"cross";
              const wc3=wCol(wt3);
              const sel=i===selDay;
              return(
                <div key={i} onClick={()=>pickDay(i)} style={{flexShrink:0,width:54,background:sel?"rgba(0,212,200,.1)":C.g2,border:`1px solid ${sel?"rgba(0,212,200,.6)":C.g1}`,borderRadius:10,padding:"7px 5px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer"}}>
                  <span style={sm(".74rem",sel?C.teal:C.mist,{textTransform:"uppercase"})}>{i===0?"Today":dayName(wd.date)}</span>
                  <span style={mn(".7rem",C.teal)}>{prefs.waveUnit==="ft"?toFt(+hi2)+" ft":hi2+"m"}</span>
                  <span style={sm(".50rem")}>▲ {prefs.waveUnit==="ft"?toFt(+lo2):lo2}m ▼</span>
                  <div style={{height:2,width:"100%",background:"rgba(255,255,255,.06)",borderRadius:1}}><div style={{height:"100%",width:`${Math.min(100,Math.round(parseFloat(hi2)/2.5*100))}%`,background:C.teal,borderRadius:1}}/></div>
                  {wdir!=null&&<Arrow deg={wdir} col={wc3} size={13}/>}
                  <span style={mn(".76rem",wc3)}>{wday.windMax!=null?fmtWN2(wday.windMax,prefs.windUnit):"—"}</span>
                  <span style={sm(".50rem",wc3)}>{wdir!=null?compass(wdir):"—"}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{height:40}}/>
      </div>
    );
  }

  // ── SETTINGS ───────────────────────────────────────────────────────────────
  if(screen==="settings"){
    const handleAdd=()=>{
      const lat=parseFloat(form.lat),lng=parseFloat(form.lng);
      if(!form.name.trim()) return setFormErr("Enter a spot name");
      if(isNaN(lat)||lat<-90||lat>90) return setFormErr("Latitude must be −90 to 90");
      if(isNaN(lng)||lng<-180||lng>180) return setFormErr("Longitude must be −180 to 180");
      if(Object.keys(SPOTS).length>=3) return setFormErr("Maximum 3 locations reached");
      addLocation({name:form.name.trim(),lat,lng,breakType:form.breakType});
      setForm({name:"",lat:"",lng:"",breakType:"Beach"});setFormErr("");setAddOpen(false);
    };
    const inp={width:"100%",background:C.g2,border:`1px solid ${C.g1}`,borderRadius:10,padding:"9px 12px",color:C.pearl,fontSize:".70rem",fontFamily:"'DM Mono',monospace",letterSpacing:".04em"};
    return(
      <div style={bg}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{display:none}input::placeholder{color:rgba(127,179,200,.4)}input:focus{outline:none;border-color:rgba(0,212,200,.5)!important}body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}`}</style>
        {nav}
        <div style={{padding:"12px 16px 0"}}>
          {/* Locations */}
          <div style={{paddingBottom:14,borderBottom:`1px solid ${C.g1}`,marginBottom:4}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:".9rem"}}>📍</span>
              <span style={sm(".68rem",C.pearl,{letterSpacing:".04em"})}>Surf Spots</span>
              <span style={sm(".60rem",C.mist,{marginLeft:"auto"})}>{Object.keys(SPOTS).length}/3</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
              {Object.entries(SPOTS).map(([id,loc])=>{
                const isDef=id===prefs.defaultLocation;
                return(
                  <div key={id} style={{display:"flex",alignItems:"center",gap:8,background:isDef?"rgba(0,212,200,.06)":C.g2,border:`1px solid ${isDef?"rgba(0,212,200,.3)":C.g1}`,borderRadius:12,padding:"9px 12px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        {isDef&&<span style={{fontSize:".6rem",color:C.amber}}>★</span>}
                        <span style={sm(".70rem",C.pearl,{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"})}>{loc.name}</span>
                      </div>
                      <div style={sm(".76rem",C.mist,{marginTop:2})}>{loc.breakType} · {(+loc.lat).toFixed(4)}, {(+loc.lng).toFixed(4)}</div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      {!isDef&&<div onClick={()=>setDefault(id)} style={{padding:"4px 8px",borderRadius:8,background:"rgba(245,166,35,.1)",border:"1px solid rgba(245,166,35,.3)",color:C.amber,fontSize:".76rem",cursor:"pointer",letterSpacing:".06em"}}>SET DEFAULT</div>}
                      {isDef&&<div style={{padding:"4px 8px",borderRadius:8,background:"rgba(245,166,35,.15)",border:"1px solid rgba(245,166,35,.4)",color:C.amber,fontSize:".76rem",letterSpacing:".06em"}}>★ DEFAULT</div>}
                      <div onClick={()=>removeLocation(id)} style={{width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.25)",color:C.coral,fontSize:".8rem",cursor:"pointer",lineHeight:1}}>×</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {Object.keys(SPOTS).length<3&&!addOpen&&(
              <div onClick={()=>setAddOpen(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px",borderRadius:12,border:`1px dashed rgba(0,212,200,.3)`,color:C.teal,fontSize:".68rem",cursor:"pointer",letterSpacing:".06em"}}>
                <span style={{fontSize:".9rem"}}>+</span> Add Surf Spot
              </div>
            )}
            {addOpen&&(
              <div style={{background:C.g2,border:`1px solid rgba(0,212,200,.2)`,borderRadius:14,padding:"14px"}}>
                <div style={sm(".64rem",C.teal,{letterSpacing:".1em",textTransform:"uppercase",marginBottom:10})}>New Surf Spot</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <input value={form.name} placeholder="Spot name (e.g. Jeffreys Bay)" onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inp}/>
                  <div style={{display:"flex",gap:8}}>
                    <input value={form.lat} placeholder="Latitude (e.g. -34.038)" onChange={e=>setForm(f=>({...f,lat:e.target.value}))} style={{...inp,flex:1}}/>
                    <input value={form.lng} placeholder="Longitude (e.g. 26.784)" onChange={e=>setForm(f=>({...f,lng:e.target.value}))} style={{...inp,flex:1}}/>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {["Beach","Reef","Point"].map(bt=>(
                      <div key={bt} onClick={()=>setForm(f=>({...f,breakType:bt}))} style={{flex:1,textAlign:"center",padding:"7px 4px",borderRadius:9,cursor:"pointer",background:form.breakType===bt?"rgba(0,212,200,.15)":C.g2,border:`1px solid ${form.breakType===bt?"rgba(0,212,200,.5)":C.g1}`,color:form.breakType===bt?C.teal:C.mist,fontSize:".66rem"}}>{bt} break</div>
                    ))}
                  </div>
                  {formErr&&<div style={sm(".62rem",C.coral)}>{formErr}</div>}
                  <div style={{display:"flex",gap:8,marginTop:2}}>
                    <div onClick={handleAdd} style={{flex:2,textAlign:"center",padding:"10px",borderRadius:10,background:"rgba(0,212,200,.15)",border:"1px solid rgba(0,212,200,.4)",color:C.teal,fontSize:".68rem",cursor:"pointer",fontWeight:600}}>Save Spot</div>
                    <div onClick={()=>{setAddOpen(false);setFormErr("");}} style={{flex:1,textAlign:"center",padding:"10px",borderRadius:10,background:C.g2,border:`1px solid ${C.g1}`,color:C.mist,fontSize:".68rem",cursor:"pointer"}}>Cancel</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Unit toggles */}
          <ToggleRow label="Wave Height" icon="🌊" options={[["m","Metres (m)"],["ft","Feet (ft)"]]} current={prefs.waveUnit} onChange={v=>updatePref("waveUnit",v)}/>
          <ToggleRow label="Wind Speed" icon="💨" options={[["kmh","km/h"],["kts","Knots"],["mph","mph"]]} current={prefs.windUnit} onChange={v=>updatePref("windUnit",v)}/>
          <ToggleRow label="Temperature" icon="🌡️" options={[["c","Celsius (°C)"],["f","Fahrenheit (°F)"]]} current={prefs.tempUnit} onChange={v=>updatePref("tempUnit",v)}/>
          <ToggleRow label="Time Format" icon="🕐" options={[["12h","12-hour"],["24h","24-hour"]]} current={prefs.timeFormat} onChange={v=>updatePref("timeFormat",v)}/>
          {/* Preview */}
          <div style={{margin:"16px 0",background:"rgba(0,212,200,.04)",border:"1px solid rgba(0,212,200,.18)",borderRadius:14,padding:"14px"}}>
            <div style={sm(".60rem",C.teal,{letterSpacing:".1em",textTransform:"uppercase",marginBottom:10})}>Live Preview</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["Wave height",fmtWv(1.2,prefs.waveUnit)],["Swell height",fmtWv(0.8,prefs.waveUnit)],["Wind speed",fmtWind(18,prefs.windUnit)],["Wind gust",fmtWind(28,prefs.windUnit)],["Water temp",fmtTemp(16.8,prefs.tempUnit)],["Time now",clk]].map(([l,v])=>(
                <div key={l} style={{background:C.g2,borderRadius:10,padding:"8px 10px"}}>
                  <div style={sm(".74rem",C.mist,{marginBottom:3,textTransform:"uppercase",letterSpacing:".08em"})}>{l}</div>
                  <div style={mn(".85rem",C.teal)}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,paddingBottom:16,borderBottom:`1px solid ${C.g1}`}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:C.teal,boxShadow:`0 0 5px ${C.teal}`}}/>
            <span style={sm(".60rem",C.mist)}>Settings saved automatically to this device</span>
          </div>
          {/* About link */}
          <div onClick={()=>setScreen("about")} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0",cursor:"pointer",borderBottom:`1px solid ${C.g1}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:"1rem"}}>ℹ️</span><span style={sm(".68rem",C.pearl)}>About SwellTrack</span></div>
            <span style={sm(".68rem",C.mist)}>›</span>
          </div>
        </div>
        <div style={{height:40}}/>
      </div>
    );
  }

  // ── ABOUT ──────────────────────────────────────────────────────────────────
  return(
    <div style={bg}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{display:none}`}</style>
      {nav}
      <div style={{padding:"24px 16px 0",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:6}}>
        <div style={{fontFamily:"'Syne',sans-serif",fontSize:"2rem",fontWeight:800,color:C.pearl,letterSpacing:"-.04em",marginBottom:4}}>Swell<span style={{color:C.teal}}>Track</span></div>
        <div style={sm(".64rem",C.teal,{letterSpacing:".18em",textTransform:"uppercase"})}>Version {VERSION}</div>
        <div style={sm(".64rem",C.mist,{letterSpacing:".1em",textTransform:"uppercase",marginTop:2})}>Surf Coast Victoria</div>
      </div>
      <div style={{padding:"24px 16px 0",display:"flex",flexDirection:"column",gap:10}}>
        {[
          {icon:"🌊",title:"Wave & Wind Data",body:"Powered by Open-Meteo Marine API. Free, no API key required. Updated twice daily. 7-day hourly forecasts at 5 km resolution."},
          {icon:"🌊",title:"Tide Data",body:"Tidal heights and high/low predictions are sourced from WorldTides (worldtides.info), using real tide station data. Results are for reference only and should not be used for navigation."},
          {icon:"☀️",title:"Sun Times",body:"Sunrise, sunset, first light and last light are calculated mathematically from the location coordinates and current date."},
          {icon:"📍",title:"Supported Locations",body:"Torquay Main, Point Impossible and Bells Beach are built-in. Add custom locations worldwide using any GPS coordinates."},
        ].map(({icon,title,body})=>(
          <div key={title} style={{background:C.g2,border:`1px solid ${C.g1}`,borderRadius:14,padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontSize:".9rem"}}>{icon}</span>
              <span style={sm(".68rem",C.pearl,{fontWeight:600,letterSpacing:".04em"})}>{title}</span>
            </div>
            <div style={sm(".64rem",C.mist,{lineHeight:1.7})}>{body}</div>
          </div>
        ))}
        <div style={{...sm(".60rem",C.mist,{textAlign:"center",lineHeight:1.7}),padding:"8px 0 16px"}}>
          Open-Meteo is open source and free for non-commercial use.<br />
          <span style={{color:C.teal}}>open-meteo.com</span>
        </div>
      </div>
      <div style={{height:40}}/>
    </div>
  );
}

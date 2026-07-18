// =====================================================================
// FinZen — js/travel.js  (módulo Viagens / VYNHunter)
// Grupo: Gestão Pessoal
// Padrões FinZen: ES Modules, auth no topo, addEventListener (sem
// onclick inline), Supabase com RLS para favoritos e alertas.
//
// MOTOR DE PREÇOS SIMULADO (modo demonstração):
// priceQuote() é o único ponto que gera preço. Para plugar API real
// (Amadeus/TravelPayouts), trocar o corpo dela por:
//   const r = await fetch(`/api/travel-quote?o=${o}&d=${d}&date=${dateISO}`);
// seguindo o mesmo padrão do api/quotes.js.
// =====================================================================
import { supabase, requireAuth } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

// ---------- Auth padrão (topo de todo módulo) ----------
const user = await requireAuth();
document.getElementById('btnVoltar').addEventListener('click', () => navigate('./dashboard.html'));

// ---------- Dados de aeroportos ----------
const AIRPORTS = {
  GRU:{n:'São Paulo — Guarulhos',lat:-23.43,lon:-46.47,reg:'Sudeste',grp:'SP',int:1},
  CGH:{n:'São Paulo — Congonhas',lat:-23.63,lon:-46.66,reg:'Sudeste',grp:'SP'},
  VCP:{n:'Campinas — Viracopos',lat:-23.01,lon:-47.13,reg:'Sudeste',grp:'SP'},
  GIG:{n:'Rio — Galeão',lat:-22.81,lon:-43.25,reg:'Sudeste',grp:'RJ',int:1},
  SDU:{n:'Rio — Santos Dumont',lat:-22.91,lon:-43.16,reg:'Sudeste',grp:'RJ'},
  BSB:{n:'Brasília',lat:-15.87,lon:-47.92,reg:'Centro-Oeste'},
  CNF:{n:'Belo Horizonte — Confins',lat:-19.62,lon:-43.97,reg:'Sudeste'},
  SSA:{n:'Salvador',lat:-12.91,lon:-38.32,reg:'Nordeste'},
  REC:{n:'Recife',lat:-8.13,lon:-34.92,reg:'Nordeste'},
  FOR:{n:'Fortaleza',lat:-3.78,lon:-38.53,reg:'Nordeste'},
  NAT:{n:'Natal',lat:-5.77,lon:-35.37,reg:'Nordeste'},
  MCZ:{n:'Maceió',lat:-9.51,lon:-35.79,reg:'Nordeste'},
  POA:{n:'Porto Alegre',lat:-29.99,lon:-51.17,reg:'Sul'},
  CWB:{n:'Curitiba',lat:-25.53,lon:-49.17,reg:'Sul'},
  FLN:{n:'Florianópolis',lat:-27.67,lon:-48.55,reg:'Sul'},
  MAO:{n:'Manaus',lat:-3.04,lon:-60.05,reg:'Norte'},
  BEL:{n:'Belém',lat:-1.38,lon:-48.48,reg:'Norte'},
  EZE:{n:'Buenos Aires — Ezeiza',lat:-34.82,lon:-58.53,reg:'América do Sul',grp:'BUE',int:1},
  AEP:{n:'Buenos Aires — Aeroparque',lat:-34.56,lon:-58.42,reg:'América do Sul',grp:'BUE',int:1},
  SCL:{n:'Santiago',lat:-33.39,lon:-70.79,reg:'América do Sul',int:1},
  MVD:{n:'Montevidéu',lat:-34.84,lon:-56.03,reg:'América do Sul',int:1},
  LIS:{n:'Lisboa',lat:38.77,lon:-9.13,reg:'Europa',int:1},
  MAD:{n:'Madri',lat:40.47,lon:-3.56,reg:'Europa',int:1},
  MIA:{n:'Miami',lat:25.79,lon:-80.29,reg:'EUA & Caribe',int:1},
  MCO:{n:'Orlando',lat:28.43,lon:-81.31,reg:'EUA & Caribe',int:1},
  JFK:{n:'Nova York — JFK',lat:40.64,lon:-73.78,reg:'EUA & Caribe',int:1},
  CUN:{n:'Cancún',lat:21.04,lon:-86.87,reg:'EUA & Caribe',int:1}
};
const AIRLINES  = ['LATAM','GOL','Azul','Avianca','Copa','TAP','Aerolíneas'];
const AIRLINE_SITES = {
  LATAM:'https://www.latamairlines.com/br/pt', GOL:'https://www.voegol.com.br',
  Azul:'https://www.voeazul.com.br', Avianca:'https://www.avianca.com',
  Copa:'https://www.copaair.com', TAP:'https://www.flytap.com',
  Aerolíneas:'https://www.aerolineas.com.ar'
};
const PROVIDERS = [
  {n:'Google Flights',k:1.00},{n:'Skyscanner',k:1.005},{n:'Kayak',k:1.012},
  {n:'Momondo',k:0.998},{n:'Decolar',k:1.03},{n:'Booking',k:1.025},
  {n:'Expedia',k:1.02},{n:'Site da companhia',k:1.008}
];
const CLS = { eco:1, pre:1.9, exe:3.4 };
const CLS_LABEL = { eco:'Econômica', pre:'Premium', exe:'Executiva' };

// ---------- Links externos para comprar (buscadores reais, não afiliados) ----------
function googleFlightsUrl(o,d,dep,ret){
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`voos de ${o} para ${d} em ${dep} volta ${ret}`)}`;
}
function providerUrl(name,o,d,dep,ret,pax){
  switch(name){
    case 'Google Flights': return googleFlightsUrl(o,d,dep,ret);
    case 'Skyscanner':     return `https://www.skyscanner.com.br/transport/flights/${o.toLowerCase()}/${d.toLowerCase()}/${dep.replace(/-/g,'').slice(2)}/${ret.replace(/-/g,'').slice(2)}/`;
    case 'Kayak':           return `https://www.kayak.com.br/flights/${o}-${d}/${dep}/${ret}`;
    case 'Momondo':         return `https://www.momondo.com.br/flight-search/${o}-${d}/${dep}/${ret}`;
    case 'Decolar':         return `https://www.decolar.com/passagens-aereas/${o}/${d}`;
    case 'Booking':         return `https://www.booking.com/flights/index.html?type=ROUNDTRIP&adults=${pax}&from=${o}&to=${d}&depart=${dep}&return=${ret}`;
    case 'Expedia':         return `https://www.expedia.com.br/Flights-Search?trip=roundtrip&leg1=from:${o},to:${d},departure:${dep}&leg2=from:${d},to:${o},departure:${ret}&passengers=adults:${pax}&mode=search`;
    case 'Site da companhia': return AIRLINE_SITES[LAST?.airline] || googleFlightsUrl(o,d,dep,ret);
    default: return googleFlightsUrl(o,d,dep,ret);
  }
}

// ---------- Utilidades ----------
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const BRL  = v => formatCurrency ? formatCurrency(v) : v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const fmtD = d => d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
const iso  = d => d.toISOString().slice(0,10);
const addD = (d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
function hash(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
function rng(seed){ let a=seed; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function dist(a,b){
  const A=AIRPORTS[a],B=AIRPORTS[b],R=6371;
  const dLa=(B.lat-A.lat)*Math.PI/180, dLo=(B.lon-A.lon)*Math.PI/180;
  const h=Math.sin(dLa/2)**2+Math.cos(A.lat*Math.PI/180)*Math.cos(B.lat*Math.PI/180)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

// ---------- Sazonalidade (alta temporada) ----------
function season(d){
  const m=d.getMonth(), day=d.getDate(), dow=d.getDay();
  let f=1, tags=[];
  if((m===11&&day>=15)||(m===0&&day<=5)){ f*=1.65; tags.push(m===11&&day>=22?'Natal/Réveillon':'Festas de fim de ano'); }
  else if(m===0){ f*=1.30; tags.push('Férias de janeiro'); }
  if(m===6){ f*=1.35; tags.push('Férias de julho'); }
  if(m===1&&day>=10&&day<=20){ f*=1.40; tags.push('Carnaval'); }
  if(dow===5||dow===0) f*=1.10;
  return { f, tags, peak:tags.length>0 };
}

// ---------- MOTOR DE PREÇOS (simulado — ponto único de troca por API) ----------
function priceQuote(o,d,dateISO,cls='eco'){
  const dt=new Date(dateISO+'T12:00:00');
  const km=dist(o,d);
  const REG_INT=['Europa','EUA & Caribe','América do Sul'];
  const intl=REG_INT.includes(AIRPORTS[o].reg)||REG_INT.includes(AIRPORTS[d].reg);
  let base=(intl?420:130)+km*(intl?0.42:0.34);
  const s=season(dt);
  const r=rng(hash(o+d+dateISO));
  const noise=0.82+r()*0.45;
  const daysAhead=Math.max(1,(dt-Date.now())/864e5);
  const adv=daysAhead<7?1.35:daysAhead<21?1.12:daysAhead>120?1.05:1;
  return Math.round(base*s.f*noise*adv*CLS[cls]);
}
function airlineFor(o,d,dateISO){ return AIRLINES[hash(o+d+dateISO+'al')%(AIRPORTS[o].reg===AIRPORTS[d].reg?3:AIRLINES.length)]; }
function stopsFor(o,d,seed){ const km=dist(o,d); const r=rng(hash(o+d+seed+'st'))(); return km>4000?(r<0.6?1:2):(r<0.72?0:1); }
function durFor(o,d,stops){ const h=dist(o,d)/780+0.7+stops*2.1; const H=Math.floor(h),M=Math.round((h-H)*60); return `${H}h${String(M).padStart(2,'0')}`; }

// ---------- Estado ----------
let LAST=null;          // última busca (contexto p/ IA, favoritos, share)
const chatHist=[];

// =====================================================================
// BUSCA PRINCIPAL
// =====================================================================
function runSearch(){
  const o=$('#tvOrig').value, d=$('#tvDest').value;
  if(o===d){ alert('Origem e destino não podem ser iguais.'); return; }
  const cls=$('#tvCls').value, pax=+$('#tvPax').value, flex=+$('#tvFlex').value;
  const dep=new Date($('#tvDep').value+'T12:00:00');
  const ret=new Date($('#tvRet').value+'T12:00:00');

  // 1) varre a janela flexível na ida
  const win=[];
  for(let i=-flex;i<=flex;i++){
    const dd=addD(dep,i); if(dd<new Date()) continue;
    win.push({ date:dd, price:priceQuote(o,d,iso(dd),cls) });
  }
  const wanted=win.find(w=>+w.date===+dep)||win[0];
  const best=win.reduce((a,b)=>b.price<a.price?b:a);
  const retP=priceQuote(d,o,iso(ret),cls);
  const total=(best.price+retP)*pax;
  const wantedTotal=(wanted.price+retP)*pax;

  // 2) estratégias de economia
  const strategies=buildStrategies(o,d,best.date,ret,cls,best.price+retP);

  // 3) histórico + tendência
  const hist=[]; for(let i=60;i>=1;i--) hist.push(priceQuote(o,d,iso(addD(new Date(),-i)),cls));
  const recent=hist.slice(-14).reduce((a,b)=>a+b)/14;
  const old=hist.slice(0,14).reduce((a,b)=>a+b)/14;
  const drift=(recent-old)/old;
  let pUp=Math.round(Math.min(88,Math.max(12,50+drift*260)));
  const s=season(best.date); if(s.peak) pUp=Math.min(92,pUp+15);

  // 4) score 0–100 (percentil vs janela + histórico)
  const all=win.map(w=>w.price).concat(hist);
  const sorted=[...all].sort((a,b)=>a-b);
  const pct=sorted.findIndex(v=>v>=best.price)/sorted.length;
  const score=Math.round(97-pct*80);

  LAST={ o,d,cls,pax,flex,dep:iso(dep),ret:iso(ret),bestDate:iso(best.date),
    bestOut:best.price,retP,total,wantedTotal,save:wantedTotal-total,
    airline:airlineFor(o,d,iso(best.date)),retAirline:airlineFor(d,o,iso(ret)),
    stops:stopsFor(o,d,iso(best.date)),score,pUp,pDown:100-pUp,season:s,strategies,
    win:win.map(w=>({date:iso(w.date),price:w.price})) };

  renderResults(win,best,hist);
  $('#tvResults').classList.remove('tv-hidden');
  $('#tvResults').scrollIntoView({behavior:'smooth'});
}

function buildStrategies(o,d,depD,retD,cls,ref){
  const out=[], dISO=iso(depD);
  const near=code=>Object.keys(AIRPORTS).filter(c=>c!==code&&AIRPORTS[c].grp&&AIRPORTS[c].grp===AIRPORTS[code].grp);

  for(const alt of near(d)){
    const p=priceQuote(o,alt,dISO,cls)+priceQuote(alt,o,iso(retD),cls);
    if(p<ref) out.push({t:`Chegar por ${alt}`,s:'Aeroporto vizinho ao destino',v:ref-p});
  }
  for(const alt of near(o)){
    const p=priceQuote(alt,d,dISO,cls)+priceQuote(d,alt,iso(retD),cls);
    if(p<ref) out.push({t:`Sair por ${alt}`,s:'Aeroporto vizinho à origem',v:ref-p});
  }
  const m1=priceQuote(o,d,iso(addD(depD,-1)),cls)+priceQuote(d,o,iso(retD),cls);
  if(m1<ref) out.push({t:'Viajar 1 dia antes',s:fmtD(addD(depD,-1)),v:ref-m1});
  const r1=priceQuote(o,d,dISO,cls)+priceQuote(d,o,iso(addD(retD,1)),cls);
  if(r1<ref) out.push({t:'Voltar 1 dia depois',s:fmtD(addD(retD,1)),v:ref-r1});
  const rr=rng(hash(o+d+dISO+'mix'));
  const mix=Math.round(ref*(0.90+rr()*0.06));
  if(mix<ref) out.push({t:'Ida e volta em companhias diferentes',s:`${airlineFor(o,d,dISO)} + ${airlineFor(d,o,iso(retD))}`,v:ref-mix});
  const sep=Math.round(ref*(0.88+rr()*0.07));
  if(sep<ref) out.push({t:'Emitir trechos separados',s:'2 bilhetes de ida em vez de 1 ida-e-volta',v:ref-sep});
  if(dist(o,d)>1400){
    const via=Math.round(ref*(0.86+rr()*0.08));
    if(via<ref) out.push({t:'Aceitar 1 escala estratégica',s:'Rota mais longa, tarifa menor',v:ref-via});
  }
  return out.sort((a,b)=>b.v-a.v).slice(0,5);
}

// ---------- Render dos resultados ----------
function renderResults(win,best,hist){
  const L=LAST;
  $('#tvBestRoute').textContent=`${L.o} → ${L.d} · ${fmtD(new Date(L.bestDate+'T12:00'))} — volta ${fmtD(new Date(L.ret+'T12:00'))}`;
  $('#tvBestPrice').textContent=BRL(L.total);
  $('#tvBestSave').textContent=L.save>0?`economiza ${BRL(L.save)} vs. sua data`:'';
  $('#tvBestMeta').textContent=`${L.pax} passageiro${L.pax>1?'s':''} · ${CLS_LABEL[L.cls]} · ida+volta, taxas incluídas`;
  $('#tvBestChips').innerHTML=[
    `<span class="tv-chip">${L.airline}${L.retAirline!==L.airline?' + '+L.retAirline:''}</span>`,
    `<span class="tv-chip">${L.stops===0?'Direto':L.stops+' escala'+(L.stops>1?'s':'')}</span>`,
    `<span class="tv-chip">${durFor(L.o,L.d,L.stops)} de voo</span>`,
    L.season.peak?`<span class="tv-chip hot">🔥 ${L.season.tags[0]}</span>`:''
  ].join('');

  const c=L.score>=75?'#34d399':L.score>=45?'#fbbf24':'#f87171';
  $('#tvStamp').style.setProperty('--tv-score',c);
  $('#tvStamp').innerHTML=`<b>${L.score}</b><span>score</span>`;
  $('#tvScoreMsg').textContent=
    L.score>=75?`${L.score}/100 — excelente oportunidade considerando histórico, sazonalidade e demanda. Tendência favorece comprar agora.`:
    L.score>=45?`${L.score}/100 — preço dentro da média para a rota. Vale monitorar com um alerta.`:
    `${L.score}/100 — acima da média histórica. Considere as estratégias abaixo ou espere uma queda.`;

  $('#tvBuyLink').href=googleFlightsUrl(L.o,L.d,L.bestDate,L.ret);

  const txt=encodeURIComponent(`✈ FinZen Viagens: ${L.o}→${L.d} ${fmtD(new Date(L.bestDate+'T12:00'))} por ${BRL(L.total)} (score ${L.score}/100)`);
  $('#tvShWa').href=`https://wa.me/?text=${txt}`;
  $('#tvShTg').href=`https://t.me/share/url?url=finzen&text=${txt}`;
  $('#tvShMail').href=`mailto:?subject=Oferta%20de%20passagem&body=${txt}`;

  renderCalendar(win);
  renderChart(hist);
  $('#tvPUp').textContent=L.pUp+'%';
  $('#tvPDown').textContent=L.pDown+'%';

  const show=L.season.peak&&L.strategies.length>0;
  $('#tvSeasonCard').classList.toggle('tv-hidden',!show);
  if(show){
    $('#tvSeasonWhy').textContent=`Sua viagem cai em ${L.season.tags.join(' + ')}. Estratégias para pagar menos:`;
    $('#tvStrategies').innerHTML=L.strategies.map(st=>
      `<div class="tv-strat"><div><div class="t">${st.t}</div><div class="s">${st.s}</div></div><div class="v">−${BRL(st.v*L.pax)}</div></div>`).join('');
  }
  renderCompare();
}

function renderCalendar(win){
  const prices=win.map(w=>w.price), lo=Math.min(...prices), hi=Math.max(...prices);
  $('#tvCalInfo').textContent=`Ida entre ${fmtD(win[0].date)} e ${fmtD(win[win.length-1].date)} — toque num dia para reprecificar`;
  let html=['D','S','T','Q','Q','S','S'].map(x=>`<div class="tv-dow">${x}</div>`).join('');
  for(let i=0;i<win[0].date.getDay();i++) html+='<div class="tv-day off"></div>';
  for(const w of win){
    const t=(w.price-lo)/Math.max(1,hi-lo);
    const cls=t<0.33?'g':t<0.66?'y':'r';
    const sel=iso(w.date)===LAST.bestDate?' sel':'';
    const lbl=w.price>=1000?(w.price/1000).toFixed(1).replace('.0','')+'k':w.price;
    html+=`<div class="tv-day ${cls}${sel}" data-d="${iso(w.date)}" role="button" tabindex="0">
      <div class="d">${w.date.getDate()}</div><div class="p">${lbl}</div></div>`;
  }
  $('#tvCal').innerHTML=html;
  $$('#tvCal .tv-day[data-d]').forEach(el=>el.addEventListener('click',()=>{
    $('#tvDep').value=el.dataset.d; runSearch();
  }));
}

function renderChart(hist){
  const w=320,h=110,lo=Math.min(...hist),hi=Math.max(...hist);
  const pts=hist.map((p,i)=>`${(i/(hist.length-1))*w},${h-8-((p-lo)/(hi-lo))*(h-24)}`).join(' ');
  const avg=hist.reduce((a,b)=>a+b)/hist.length;
  const avgY=h-8-((avg-lo)/(hi-lo))*(h-24);
  $('#tvChart').innerHTML=`
    <line x1="0" y1="${avgY}" x2="${w}" y2="${avgY}" stroke="#666f83" stroke-dasharray="4 4" stroke-width="1"/>
    <text x="4" y="${avgY-4}" fill="#8b93a7" font-size="9" font-family="monospace">média ${BRL(Math.round(avg))}</text>
    <polyline points="${pts}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${w}" cy="${pts.split(' ').pop().split(',')[1]}" r="3.5" fill="#f59e0b"/>`;
}

function renderCompare(){
  const L=LAST, base=L.total, r=rng(hash(L.o+L.d+L.bestDate+'cmp'));
  const rows=PROVIDERS.map(p=>{
    const price=Math.round(base*p.k*(0.985+r()*0.05));
    const st=stopsFor(L.o,L.d,L.bestDate+p.n);
    const url=providerUrl(p.n,L.o,L.d,L.bestDate,L.ret,L.pax);
    return { n:p.n, price, st, dur:durFor(L.o,L.d,st), bag:r()<0.6, url };
  }).sort((a,b)=>a.price-b.price);
  $('#tvCmp tbody').innerHTML=rows.map((x,i)=>`<tr>
    <td><a href="${x.url}" target="_blank" rel="noopener">${x.n}</a> ${i===0?'<span class="tv-badge">MELHOR</span>':''}</td>
    <td class="p">${BRL(x.price)}</td><td>${x.st===0?'Direto':x.st}</td>
    <td>${x.dur}</td><td>${x.bag?'🧳 23kg':'🎒 mão'}</td></tr>`).join('');
}

// =====================================================================
// ORÇAMENTO — "para onde consigo ir com R$ X"
// =====================================================================
function runBudget(){
  const o=$('#tvBudOrig').value, bud=+$('#tvBudget').value;
  const found=[];
  for(const d of Object.keys(AIRPORTS)){
    if(d===o) continue;
    if(AIRPORTS[d].grp&&AIRPORTS[d].grp===AIRPORTS[o].grp) continue;
    let min=Infinity, minD=null;
    for(let i=10;i<=90;i+=5){
      const dd=addD(new Date(),i);
      const p=priceQuote(o,d,iso(dd),'eco')+priceQuote(d,o,iso(addD(dd,7)),'eco');
      if(p<min){ min=p; minD=dd; }
    }
    if(min<=bud) found.push({d,min,minD});
  }
  found.sort((a,b)=>a.min-b.min);
  if(!found.length){
    $('#tvBudResults').innerHTML=`<div class="tv-empty"><span class="big">🗺️</span>Nada abaixo de ${BRL(bud)} nos próximos 90 dias.<br>Tente aumentar o valor.</div>`;
    return;
  }
  const byReg={};
  found.forEach(f=>{ (byReg[AIRPORTS[f.d].reg]??=[]).push(f); });
  $('#tvBudResults').innerHTML=Object.entries(byReg).map(([reg,list])=>`
    <div class="tv-region">${reg}</div><div class="tv-card">${list.map(f=>`
      <div class="tv-dest" data-o="${o}" data-d="${f.d}" data-dt="${iso(f.minD)}">
        <div><div class="n">${AIRPORTS[f.d].n}</div><div class="r">${f.d} · melhor data ${fmtD(f.minD)}</div></div>
        <div class="pv">${BRL(f.min)}<small>ida e volta</small></div>
      </div>`).join('')}</div>`).join('');
  $$('#tvBudResults .tv-dest').forEach(el=>el.addEventListener('click',()=>{
    $('#tvOrig').value=el.dataset.o; $('#tvDest').value=el.dataset.d;
    $('#tvDep').value=el.dataset.dt;
    $('#tvRet').value=iso(addD(new Date(el.dataset.dt+'T12:00'),7));
    switchTab('buscar'); runSearch();
  }));
}

// =====================================================================
// ALERTAS — Supabase (travel_alerts, RLS)
// =====================================================================
async function createAlert(o,d,maxPrice,dropPct){
  const ref=priceQuote(o,d,iso(addD(new Date(),30)),'eco')*2;
  const { error }=await supabase.from('travel_alerts').insert({
    user_id:user.id, origin:o, destination:d,
    max_price:maxPrice, drop_pct:dropPct, ref_price:ref
  });
  if(error){ alert('Erro ao criar alerta: '+error.message); return; }
  await renderAlerts();
}

async function checkAlerts(){
  const { data:alerts }=await supabase.from('travel_alerts').select('*').eq('user_id',user.id);
  for(const a of (alerts||[])){
    const now=Math.round(priceQuote(a.origin,a.destination,iso(addD(new Date(),30)),'eco')*2
      *(0.85+rng(hash(String(Date.now())+a.id))()*0.25));
    const fired=now<=(a.max_price||0)||(a.drop_pct&&now<=a.ref_price*(1-a.drop_pct/100));
    await supabase.from('travel_alerts')
      .update({ last_price:now, fired, checked_at:new Date().toISOString() })
      .eq('id',a.id);
  }
  await renderAlerts();
}

async function renderAlerts(){
  const { data:alerts, error }=await supabase.from('travel_alerts')
    .select('*').eq('user_id',user.id).order('created_at',{ascending:false});
  if(error){ $('#tvAlList').innerHTML=`<div class="tv-empty">Erro ao carregar alertas.</div>`; return; }
  $('#tvAlList').innerHTML=(alerts&&alerts.length)?alerts.map(a=>`
    <div class="tv-item ${a.fired?'fired':''}">
      <div><div class="t">${a.origin} → ${a.destination} ${a.fired?'🟢 DISPAROU!':''}</div>
      <div class="s">Alvo ${BRL(+a.max_price)} ou queda de ${a.drop_pct}%${a.last_price?` · último: ${BRL(+a.last_price)}`:''}</div></div>
      <button class="tv-x" data-id="${a.id}" aria-label="Excluir alerta">✕</button></div>`).join('')
    :'<div class="tv-empty"><span class="big">🔔</span>Nenhum alerta criado ainda.</div>';
  $$('#tvAlList .tv-x').forEach(b=>b.addEventListener('click',async()=>{
    await supabase.from('travel_alerts').delete().eq('id',b.dataset.id);
    await renderAlerts();
  }));
}

// =====================================================================
// FAVORITOS — Supabase (travel_favorites, RLS)
// =====================================================================
async function saveFavorite(){
  if(!LAST) return;
  const { error }=await supabase.from('travel_favorites').insert({
    user_id:user.id, origin:LAST.o, destination:LAST.d,
    depart_date:LAST.bestDate, return_date:LAST.ret,
    price_total:LAST.total, score:LAST.score, cabin_class:LAST.cls, pax:LAST.pax
  });
  if(error){ alert('Erro ao salvar: '+error.message); return; }
  $('#tvFavBtn').textContent='★ Salvo!';
  setTimeout(()=>{ $('#tvFavBtn').textContent='☆ Salvar nos favoritos'; },1500);
}

async function renderFavs(){
  const { data:favs, error }=await supabase.from('travel_favorites')
    .select('*').eq('user_id',user.id).order('created_at',{ascending:false});
  if(error){ $('#tvFavList').innerHTML=`<div class="tv-empty">Erro ao carregar favoritos.</div>`; return; }
  $('#tvFavList').innerHTML=(favs&&favs.length)?favs.map(f=>{
    const now=(priceQuote(f.origin,f.destination,f.depart_date,f.cabin_class)
      +priceQuote(f.destination,f.origin,f.return_date||f.depart_date,f.cabin_class))*f.pax;
    const diff=now-(+f.price_total);
    return `<div class="tv-item"><div>
      <div class="t">${f.origin} → ${f.destination} · ${fmtD(new Date(f.depart_date+'T12:00'))}</div>
      <div class="s">Salvo por ${BRL(+f.price_total)} · agora ${BRL(now)}
      <b style="color:${diff<=0?'#34d399':'#f87171'}">(${diff<=0?'':'+'}${BRL(diff)})</b> · score ${f.score}</div></div>
      <button class="tv-x" data-id="${f.id}" aria-label="Remover favorito">✕</button></div>`;
  }).join('')
    :'<div class="tv-empty"><span class="big">☆</span>Salve buscas para comparar depois.</div>';
  $$('#tvFavList .tv-x').forEach(b=>b.addEventListener('click',async()=>{
    await supabase.from('travel_favorites').delete().eq('id',b.dataset.id);
    await renderFavs();
  }));
}

// =====================================================================
// ASSISTENTE IA — via /api/travel-ai (ANTHROPIC_API_KEY na Vercel)
// =====================================================================
function bubble(t,cls){
  const div=document.createElement('div');
  div.className='tv-msg '+cls; div.textContent=t;
  $('#tvChat').appendChild(div);
  $('#tvChat').scrollTop=$('#tvChat').scrollHeight;
  return div;
}

async function ask(q){
  q=(q||'').trim(); if(!q) return;
  $('#tvAiIn').value='';
  bubble(q,'u');
  const th=bubble('analisando dados da rota…','a thinking');
  const ctx=LAST?{
    rota:`${LAST.o}→${LAST.d}`, classe:LAST.cls, passageiros:LAST.pax,
    data_desejada:LAST.dep, melhor_data:LAST.bestDate,
    preco_total:LAST.total, economia_vs_data_desejada:LAST.save,
    score:LAST.score, prob_subir_pct:LAST.pUp, prob_cair_pct:LAST.pDown,
    alta_temporada:LAST.season.tags, estrategias_economia:LAST.strategies,
    janela_precos:LAST.win.slice(0,20)
  }:null;
  chatHist.push({role:'user',content:q});
  try{
    const { data:sd }=await supabase.auth.getSession();
    const r=await fetch('/api/travel-ai',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${sd.session?.access_token}`
      },
      body:JSON.stringify({ question:q, context:ctx, history:chatHist })
    });
    const data=await r.json();
    const txt=data.text||data.error||'Não consegui responder agora.';
    th.textContent=txt; th.classList.remove('thinking');
    chatHist.push({role:'assistant',content:txt});
  }catch(e){
    th.textContent='Erro ao consultar a IA. Verifique a conexão.'; th.classList.remove('thinking');
  }
  $('#tvChat').scrollTop=$('#tvChat').scrollHeight;
}

// =====================================================================
// ABAS + INICIALIZAÇÃO
// =====================================================================
function switchTab(name){
  $$('.tv-tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===name));
  $$('.tv-view').forEach(v=>v.classList.toggle('on',v.dataset.tab===name));
  if(name==='favoritos') renderFavs();
  if(name==='alertas') renderAlerts();
}

function fillSelect(sel,val){
  sel.innerHTML=Object.entries(AIRPORTS)
    .map(([c,a])=>`<option value="${c}">${c} · ${a.n}</option>`).join('');
  if(val) sel.value=val;
}

function init(){
  fillSelect($('#tvOrig'),'GIG'); fillSelect($('#tvDest'),'GRU');
  fillSelect($('#tvBudOrig'),'GIG');
  fillSelect($('#tvAlOrig'),'GIG'); fillSelect($('#tvAlDest'),'SSA');

  const t0=addD(new Date(),30);
  $('#tvDep').value=iso(t0); $('#tvRet').value=iso(addD(t0,7));
  $('#tvDep').min=iso(new Date()); $('#tvRet').min=iso(new Date());

  $('#tvFlex').addEventListener('input',e=>{
    $('#tvFlexVal').textContent=`±${e.target.value} dia${e.target.value>1?'s':''}`;
  });
  $('#tvSwap').addEventListener('click',()=>{
    const a=$('#tvOrig').value; $('#tvOrig').value=$('#tvDest').value; $('#tvDest').value=a;
  });
  $('#tvSearchBtn').addEventListener('click',runSearch);
  $('#tvBudBtn').addEventListener('click',runBudget);
  $('#tvFavBtn').addEventListener('click',saveFavorite);
  $('#tvAlertFromBest').addEventListener('click',async()=>{
    if(!LAST) return;
    await createAlert(LAST.o,LAST.d,Math.round(LAST.total*0.9),10);
    switchTab('alertas');
  });
  $('#tvAlBtn').addEventListener('click',()=>createAlert(
    $('#tvAlOrig').value,$('#tvAlDest').value,+$('#tvAlPrice').value,+$('#tvAlDrop').value));
  $('#tvAlCheck').addEventListener('click',checkAlerts);
  $('#tvAiSend').addEventListener('click',()=>ask($('#tvAiIn').value));
  $('#tvAiIn').addEventListener('keydown',e=>{ if(e.key==='Enter') ask($('#tvAiIn').value); });
  $$('.tv-sug button').forEach(b=>b.addEventListener('click',()=>ask(b.dataset.q)));
  $$('.tv-tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));

  renderAlerts();
}

init();

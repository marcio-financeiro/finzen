// =====================================================================
// FinZen — js/stay.js  (módulo Hospedagens / StayHunter)
// Grupo: Gestão Pessoal
// Padrões FinZen: ES Modules, auth no topo, addEventListener (sem
// onclick inline), Supabase com RLS para favoritos e alertas.
//
// MOTOR DE PREÇOS SIMULADO (modo demonstração):
// As propriedades são geradas deterministicamente por cidade (seed) e
// os preços por data/plataforma. Ponto único de troca por API real:
// pricePlatforms() → fetch('/api/stay-quote?...') no padrão api/quotes.js
// (Amadeus Hotels / Hotelbeds / TravelPayouts).
// =====================================================================
import { supabase, requireAuth } from './supabaseClient.js';
import { navigate } from './router.js';
import { formatCurrency } from './utils.js';

// ---------- Auth padrão (topo de todo módulo) ----------
const user = await requireAuth();
document.getElementById('btnVoltar').addEventListener('click', () => navigate('./dashboard.html'));

// ---------- Cidades e bairros (x,y = posição no mapa SVG 320x180) ----------
const CITIES = {
  RIO:{n:'Rio de Janeiro',base:290,bairros:[
    {n:'Copacabana',x:210,y:120,k:1.25,seg:6,praia:1,centro:0,vida:8,fam:7,transp:9},
    {n:'Ipanema',x:170,y:135,k:1.55,seg:7,praia:1,centro:0,vida:9,fam:7,transp:8},
    {n:'Centro',x:150,y:55,k:0.80,seg:4,praia:0,centro:1,vida:5,fam:4,transp:10},
    {n:'Barra da Tijuca',x:60,y:140,k:1.10,seg:8,praia:1,centro:0,vida:6,fam:9,transp:5}]},
  SAO:{n:'São Paulo',base:260,bairros:[
    {n:'Paulista/Jardins',x:160,y:90,k:1.30,seg:7,praia:0,centro:0,vida:9,fam:6,transp:10},
    {n:'Centro',x:190,y:60,k:0.75,seg:4,praia:0,centro:1,vida:6,fam:4,transp:10},
    {n:'Vila Madalena',x:110,y:80,k:1.15,seg:7,praia:0,centro:0,vida:10,fam:5,transp:7},
    {n:'Itaim/Faria Lima',x:140,y:130,k:1.40,seg:8,praia:0,centro:0,vida:8,fam:6,transp:8}]},
  SSA:{n:'Salvador',base:230,bairros:[
    {n:'Barra',x:120,y:130,k:1.20,seg:6,praia:1,centro:0,vida:8,fam:8,transp:7},
    {n:'Pelourinho',x:150,y:70,k:0.95,seg:5,praia:0,centro:1,vida:9,fam:5,transp:8},
    {n:'Rio Vermelho',x:190,y:110,k:1.05,seg:6,praia:1,centro:0,vida:10,fam:6,transp:7}]},
  FLN:{n:'Florianópolis',base:270,bairros:[
    {n:'Jurerê',x:110,y:40,k:1.60,seg:9,praia:1,centro:0,vida:8,fam:8,transp:4},
    {n:'Lagoa da Conceição',x:180,y:90,k:1.15,seg:8,praia:0,centro:0,vida:9,fam:7,transp:5},
    {n:'Centro',x:120,y:100,k:0.85,seg:7,praia:0,centro:1,vida:6,fam:6,transp:9},
    {n:'Campeche',x:160,y:150,k:1.05,seg:8,praia:1,centro:0,vida:6,fam:9,transp:4}]},
  GRA:{n:'Gramado',base:340,bairros:[
    {n:'Centro',x:160,y:90,k:1.30,seg:9,praia:0,centro:1,vida:8,fam:10,transp:6},
    {n:'Planalto',x:110,y:60,k:1.00,seg:9,praia:0,centro:0,vida:5,fam:9,transp:5},
    {n:'Carniel',x:210,y:120,k:0.85,seg:8,praia:0,centro:0,vida:4,fam:8,transp:5}]},
  PGL:{n:'Porto de Galinhas',base:310,bairros:[
    {n:'Vila (Centro)',x:160,y:90,k:1.25,seg:7,praia:1,centro:1,vida:8,fam:8,transp:5},
    {n:'Muro Alto',x:130,y:40,k:1.55,seg:9,praia:1,centro:0,vida:5,fam:10,transp:3},
    {n:'Maracaípe',x:180,y:140,k:0.95,seg:7,praia:1,centro:0,vida:7,fam:7,transp:4}]},
  FOR:{n:'Fortaleza',base:220,bairros:[
    {n:'Meireles',x:150,y:70,k:1.25,seg:6,praia:1,centro:0,vida:8,fam:8,transp:8},
    {n:'Praia de Iracema',x:180,y:55,k:1.05,seg:5,praia:1,centro:0,vida:9,fam:6,transp:8},
    {n:'Praia do Futuro',x:220,y:100,k:0.90,seg:5,praia:1,centro:0,vida:7,fam:7,transp:5}]},
  NAT:{n:'Natal',base:210,bairros:[
    {n:'Ponta Negra',x:170,y:120,k:1.20,seg:7,praia:1,centro:0,vida:8,fam:8,transp:6},
    {n:'Centro',x:130,y:60,k:0.75,seg:5,praia:0,centro:1,vida:5,fam:5,transp:8}]},
  BUZ:{n:'Búzios',base:330,bairros:[
    {n:'Rua das Pedras',x:160,y:80,k:1.40,seg:7,praia:1,centro:1,vida:10,fam:6,transp:5},
    {n:'Geribá',x:120,y:130,k:1.15,seg:8,praia:1,centro:0,vida:7,fam:8,transp:4},
    {n:'Ferradura',x:200,y:110,k:1.25,seg:8,praia:1,centro:0,vida:6,fam:9,transp:4}]},
  IGU:{n:'Foz do Iguaçu',base:200,bairros:[
    {n:'Centro',x:150,y:80,k:1.00,seg:7,praia:0,centro:1,vida:6,fam:8,transp:8},
    {n:'Vila Yolanda',x:180,y:110,k:0.90,seg:8,praia:0,centro:0,vida:5,fam:8,transp:6},
    {n:'Rod. das Cataratas',x:110,y:130,k:1.35,seg:9,praia:0,centro:0,vida:4,fam:9,transp:4}]},
  BUE:{n:'Buenos Aires',base:250,bairros:[
    {n:'Palermo',x:130,y:70,k:1.25,seg:7,praia:0,centro:0,vida:10,fam:7,transp:9},
    {n:'Recoleta',x:170,y:85,k:1.30,seg:8,praia:0,centro:0,vida:7,fam:8,transp:9},
    {n:'San Telmo',x:190,y:120,k:0.90,seg:5,praia:0,centro:1,vida:9,fam:5,transp:8},
    {n:'Puerto Madero',x:210,y:95,k:1.60,seg:9,praia:0,centro:1,vida:6,fam:7,transp:7}]},
  SCL:{n:'Santiago',base:260,bairros:[
    {n:'Providencia',x:160,y:80,k:1.15,seg:8,praia:0,centro:0,vida:8,fam:7,transp:10},
    {n:'Lastarria',x:140,y:95,k:1.20,seg:7,praia:0,centro:1,vida:9,fam:6,transp:9},
    {n:'Las Condes',x:210,y:60,k:1.40,seg:9,praia:0,centro:0,vida:6,fam:8,transp:8}]},
  LIS:{n:'Lisboa',base:420,bairros:[
    {n:'Baixa/Chiado',x:150,y:100,k:1.35,seg:8,praia:0,centro:1,vida:9,fam:7,transp:10},
    {n:'Alfama',x:180,y:95,k:1.10,seg:7,praia:0,centro:1,vida:8,fam:6,transp:8},
    {n:'Belém',x:80,y:120,k:1.05,seg:9,praia:0,centro:0,vida:5,fam:9,transp:7},
    {n:'Parque das Nações',x:230,y:50,k:1.00,seg:9,praia:0,centro:0,vida:6,fam:8,transp:9}]},
  ORL:{n:'Orlando',base:520,bairros:[
    {n:'Intl. Drive',x:150,y:90,k:1.10,seg:8,praia:0,centro:0,vida:8,fam:9,transp:6},
    {n:'Lake Buena Vista',x:110,y:120,k:1.35,seg:9,praia:0,centro:0,vida:6,fam:10,transp:5},
    {n:'Kissimmee',x:170,y:150,k:0.80,seg:7,praia:0,centro:0,vida:5,fam:8,transp:4}]},
  CUN:{n:'Cancún',base:480,bairros:[
    {n:'Zona Hoteleira',x:210,y:90,k:1.45,seg:8,praia:1,centro:0,vida:9,fam:8,transp:6},
    {n:'Centro',x:120,y:80,k:0.75,seg:6,praia:0,centro:1,vida:7,fam:5,transp:8},
    {n:'Puerto Morelos',x:170,y:150,k:1.00,seg:8,praia:1,centro:0,vida:5,fam:9,transp:4}]}
};

const TYPES = {
  hotel:{n:'Hotel',ic:'🏨',k:1.00,w:30}, pousada:{n:'Pousada',ic:'🏡',k:0.80,w:18},
  resort:{n:'Resort',ic:'🏖️',k:1.90,w:10}, hostel:{n:'Hostel',ic:'🎒',k:0.38,w:12},
  apto:{n:'Apartamento',ic:'🏢',k:0.85,w:18}, casa:{n:'Casa',ic:'🏠',k:1.15,w:8},
  chale:{n:'Chalé',ic:'🌲',k:1.05,w:4}
};

const PLATFORMS = [
  {n:'Booking.com',k:1.00,genius:1}, {n:'Airbnb',k:0.97,cleanShow:0},
  {n:'Expedia',k:1.02}, {n:'Hoteis.com',k:1.03}, {n:'Agoda',k:0.99,mobile:1},
  {n:'Decolar',k:1.05,parcel:1}, {n:'Trip.com',k:1.01}, {n:'Vrbo',k:0.99,cleanShow:0},
  {n:'Site oficial',k:1.015,oficial:1}
];

const AMEN_LABELS = {
  pool:'Piscina', gym:'Academia', pet:'Pet Friendly', spa:'Spa', mar:'Vista mar',
  cozinha:'Cozinha', lavar:'Máq. lavar', office:'Home Office', park:'Estacionamento',
  cafe:'Café incluso', allinc:'All Inclusive', acess:'Acessibilidade', ac:'Ar-cond.', wifi:'Wi-Fi'
};
const PROFILES = { familia:'Família', casal:'Casal', negocios:'Negócios', mochilao:'Mochilão', luxo:'Luxo', pet:'Pet Friendly' };

// ---------- Utilidades ----------
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const BRL  = v => formatCurrency ? formatCurrency(v) : v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const fmtD = d => d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
const iso  = d => d.toISOString().slice(0,10);
const addD = (d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
function hash(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
function rng(seed){ let a=seed; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function season(d){
  const m=d.getMonth(), day=d.getDate(), dow=d.getDay();
  let f=1, tags=[];
  if((m===11&&day>=15)||(m===0&&day<=5)){ f*=1.70; tags.push('Festas de fim de ano'); }
  else if(m===0){ f*=1.35; tags.push('Férias de janeiro'); }
  if(m===6){ f*=1.30; tags.push('Férias de julho'); }
  if(m===1&&day>=10&&day<=20){ f*=1.45; tags.push('Carnaval'); }
  if(dow===5||dow===6) f*=1.12;
  return { f, tags, peak:tags.length>0 };
}

// ---------- Gerador determinístico de propriedades por cidade ----------
const NAME_A = { hotel:['Grand','Royal','Comfort','Vista','Solar','Blue','Prime'],
  pousada:['Pousada','Recanto','Cantinho','Villa'], resort:['Resort','Paradise','Ocean'],
  hostel:['Che','Social','Nômade','Backpackers'], apto:['Studio','Flat','Loft','Residence'],
  casa:['Casa','Vila','Refúgio'], chale:['Chalé','Cabana','Montanha'] };
const NAME_B = ['do Sol','das Águas','Central','Premium','Boutique','Garden','Palace','Mar','Real','Encanto','Suítes','Charme'];
const PROP_CACHE = {};
function genProps(cityKey){
  if(PROP_CACHE[cityKey]) return PROP_CACHE[cityKey];
  const city=CITIES[cityKey], r=rng(hash('stay'+cityKey)), props=[];
  const typeKeys=Object.keys(TYPES);
  const pool=typeKeys.flatMap(t=>Array(TYPES[t].w).fill(t)); // sorteio ponderado
  for(let i=0;i<20;i++){
    const type=pool[Math.floor(r()*pool.length)];
    const bi=Math.floor(r()*city.bairros.length), b=city.bairros[bi];
    const stars=type==='hostel'?2:type==='resort'?4+Math.round(r()):2+Math.floor(r()*3.2);
    const rating=Math.round((5.6+stars*0.75+r()*1.2)*10)/10;
    const name=`${NAME_A[type][Math.floor(r()*NAME_A[type].length)]} ${NAME_B[Math.floor(r()*NAME_B.length)]} ${b.n.split('/')[0]}`;
    const amen={
      wifi:1, ac:r()<0.9?1:0,
      pool:(type==='resort'||r()<(stars>=4?0.7:0.3))?1:0,
      gym:(stars>=4&&r()<0.7)?1:0,
      pet:r()<0.3?1:0, spa:(type==='resort'||(stars===5&&r()<0.5))?1:0,
      mar:(b.praia&&r()<0.55)?1:0,
      cozinha:(type==='apto'||type==='casa'||type==='chale')?1:(r()<0.1?1:0),
      lavar:(type==='apto'||type==='casa')&&r()<0.7?1:0,
      office:r()<0.4?1:0, park:r()<0.55?1:0,
      cafe:(type==='pousada'||type==='hotel')&&r()<0.7?1:(type==='resort'?1:0),
      allinc:type==='resort'&&r()<0.5?1:0,
      acess:r()<0.35?1:0
    };
    props.push({
      key:i, city:cityKey, type, bi, stars, rating, name,
      reviews:Math.round(80+r()*6000),
      distC:Math.round((b.centro?0.3:1+r()*7)*10)/10,
      distA:Math.round((5+r()*25)*10)/10,
      amen,
      cancelFree:r()<0.6,
      feeClean:(type==='apto'||type==='casa'||type==='chale')?Math.round(80+r()*220):0,
      feeResort:type==='resort'?Math.round(60+r()*140):0,
      feePark:amen.park&&r()<0.5?Math.round(20+r()*40):0,
      weekdayDeal:{ day:2+Math.floor(r()*2), pct:Math.round(8+r()*14) }, // ter/qua
      parcel:r()<0.75
    });
  }
  PROP_CACHE[cityKey]=props;
  return props;
}

// ---------- Precificação (diária, plataformas, taxas) ----------
function nightly(prop, dateISO){
  const city=CITIES[prop.city], b=city.bairros[prop.bi];
  const dt=new Date(dateISO+'T12:00:00');
  const r=rng(hash(prop.city+prop.key+dateISO));
  const q=0.55+prop.stars*0.20;
  return city.base*b.k*TYPES[prop.type].k*q*season(dt).f*(0.85+r()*0.35);
}
function nights(ci,co){ return Math.max(1,Math.round((new Date(co)-new Date(ci))/864e5)); }

// Diária média do período + total base
function stayBase(prop, ci, co, rooms){
  const N=nights(ci,co); let sum=0;
  for(let i=0;i<N;i++) sum+=nightly(prop, iso(addD(new Date(ci+'T12:00'),i)));
  return { N, base:sum*rooms };
}

// Comparação entre plataformas: headline (anunciado) vs final (com taxas)
// PONTO ÚNICO de troca por API real (Amadeus Hotels / Hotelbeds / TravelPayouts).
function pricePlatforms(prop, ci, co, rooms){
  const { N, base }=stayBase(prop, ci, co, rooms);
  const r=rng(hash(prop.city+prop.key+ci+'plat'));
  const avail=PLATFORMS.filter(p=>{
    if(prop.type==='apto'||prop.type==='casa'||prop.type==='chale')
      return ['Airbnb','Vrbo','Booking.com'].includes(p.n);
    return p.n!=='Airbnb'&&p.n!=='Vrbo';
  });
  const rows=avail.map(p=>{
    const headline=Math.round(base*p.k*(0.97+r()*0.07));
    const iss=Math.round(headline*0.05);
    const clean=p.cleanShow===0?prop.feeClean*rooms:0;      // taxa escondida no checkout
    const resort=prop.feeResort*N*rooms;
    const fees=iss+clean+resort;
    let perk='';
    if(p.oficial){ perk=prop.amen.cafe?'☕ café + cancelamento flex':'cancelamento flex'; }
    if(p.genius&&r()<0.4) perk='Genius −10% aplicado';
    if(p.mobile&&r()<0.4) perk='Oferta Mobile −8%';
    if(p.parcel&&prop.parcel) perk=(perk?perk+' · ':'')+'até 10x';
    return { n:p.n, headline, fees, final:headline+fees, hiddenPct:fees/headline, perk, oficial:!!p.oficial };
  }).sort((a,b)=>a.final-b.final);
  return { N, rows };
}

// ---------- Índice de valor real (score 0-100 por perfil) ----------
function scoreProp(prop, finalTotal, allTotals, profile){
  const b=CITIES[prop.city].bairros[prop.bi];
  const sorted=[...allTotals].sort((x,y)=>x-y);
  const pricePct=1-(sorted.findIndex(v=>v>=finalTotal)/Math.max(1,sorted.length-1)); // 1 = mais barato
  const rate=(prop.rating-5.5)/4.5;                        // 0..1
  const loc=(b.seg/10)*0.5+(1-Math.min(prop.distC,8)/8)*0.5;
  const am=Object.values(prop.amen).filter(Boolean).length/12;
  let w={ price:0.35, rate:0.25, loc:0.20, am:0.20 }, bonus=0;
  if(profile==='familia'){ bonus+=(b.fam/10)*8+(prop.amen.pool?4:0)+(prop.amen.cozinha?3:0); }
  if(profile==='casal'){ bonus+=(b.vida/10)*6+(prop.amen.mar?5:0)+(prop.type==='pousada'?3:0); }
  if(profile==='negocios'){ bonus+=(b.transp/10)*7+(prop.amen.office?5:0)+(b.centro?3:0); }
  if(profile==='mochilao'){ w.price=0.55; w.am=0.05; bonus+=(prop.type==='hostel'?8:0); }
  if(profile==='luxo'){ w.price=0.15; w.rate=0.40; bonus+=(prop.stars-3)*4+(prop.amen.spa?4:0); }
  if(profile==='pet'){ bonus+=prop.amen.pet?12:-15; }
  const s=(pricePct*w.price+rate*w.rate+loc*w.loc+am*w.am)*100/(w.price+w.rate+w.loc+w.am);
  return Math.max(5,Math.min(99,Math.round(s*0.92+bonus)));
}

// ---------- Estado ----------
let LAST=null;        // { params, list } — busca atual
let CUR=null;         // propriedade aberta no detalhe
const COMPARE=new Set();
const chatHist=[];
const FILTERS={ chips:new Set() };

// =====================================================================
// BUSCA
// =====================================================================
function runSearch(){
  const p={
    city:$('#stCity').value, ci:$('#stCi').value, co:$('#stCo').value,
    guests:+$('#stGuests').value, rooms:+$('#stRooms').value,
    kids:+$('#stKids').value, kidAges:$('#stKidAges').value.trim(),
    type:$('#stType').value, profile:$('#stProfile').value,
    maxPrice:+($('#stMax').value||0)
  };
  if(new Date(p.co)<=new Date(p.ci)){ alert('Check-out deve ser depois do check-in.'); return; }
  let props=genProps(p.city);
  if(p.type!=='all') props=props.filter(x=>x.type===p.type);
  for(const c of FILTERS.chips) props=props.filter(x=>c==='cancel'?x.cancelFree:x.amen[c]);
  let list=props.map(prop=>{
    const { N, rows }=pricePlatforms(prop, p.ci, p.co, p.rooms);
    return { prop, N, best:rows[0], rows };
  });
  if(p.maxPrice>0) list=list.filter(x=>x.best.final<=p.maxPrice);
  if(!list.length){
    $('#stResults').classList.remove('st-hidden');
    $('#stList').innerHTML='<div class="st-empty"><span class="big">🔍</span>Nenhuma hospedagem com esses filtros.<br>Afrouxe os filtros ou aumente o orçamento.</div>';
    $('#stSummary').innerHTML=''; $('#stMapCard').classList.add('st-hidden');
    $('#stHoodCard').classList.add('st-hidden'); closeDetail(); return;
  }
  const totals=list.map(x=>x.best.final);
  list.forEach(x=>{ x.score=scoreProp(x.prop,x.best.final,totals,p.profile); });
  list.sort((a,b)=>b.score-a.score);
  const cheapest=Math.min(...totals), avg=totals.reduce((a,b)=>a+b)/totals.length;
  LAST={ params:p, list, cheapest, avg, season:season(new Date(p.ci+'T12:00')) };
  renderSummary(); renderHoods(); renderMap(); renderList();
  $('#stResults').classList.remove('st-hidden'); closeDetail();
  $('#stResults').scrollIntoView({behavior:'smooth'});
}

function renderSummary(){
  const L=LAST;
  $('#stSummary').innerHTML=`
    <div class="st-kpi"><b>${BRL(L.cheapest)}</b><span>menor total (${L.list[0].N} noites)</span></div>
    <div class="st-kpi"><b>${BRL(Math.round(L.avg-L.cheapest))}</b><span>economia vs. média</span></div>
    <div class="st-kpi"><b>${L.list.length}</b><span>opções encontradas</span></div>`;
  $('#stSeasonTag').textContent=L.season.peak?`🔥 ${L.season.tags.join(' + ')} — preços de alta temporada`:'';
}

function renderHoods(){
  const p=LAST.params, city=CITIES[p.city];
  const goal={ familia:'fam', casal:'vida', negocios:'transp', mochilao:'vida', luxo:'seg', pet:'fam' }[p.profile]||'seg';
  const ranked=[...city.bairros].map((b,i)=>({b,i,
    val:b[goal]+b.seg*0.5+(b.centro?1:0)})).sort((a,b)=>b.val-a.val);
  const why={ familia:'melhor para família', casal:'melhor vida noturna', negocios:'melhor transporte',
    mochilao:'mais movimento por menos', luxo:'mais seguro e valorizado', pet:'tranquilo para passeios' };
  $('#stHoodCard').classList.remove('st-hidden');
  $('#stHoods').innerHTML=ranked.slice(0,3).map((x,idx)=>`
    <div class="st-hood"><div><span class="bd">${idx+1}º ${x.b.n}</span>
      <div class="why">segurança ${x.b.seg}/10 · ${why[p.profile]||'bom custo-benefício'}${x.b.praia?' · praia':''}${x.b.centro?' · centro':''}</div></div>
      <div class="st-muted">média ${BRL(Math.round(CITIES[p.city].base*x.b.k*LAST.list[0].N))}</div></div>`).join('');
}

function renderMap(){
  const L=LAST, city=CITIES[L.params.city];
  const top=L.list.slice(0,12);
  const totals=top.map(x=>x.best.final), lo=Math.min(...totals), hi=Math.max(...totals);
  const jr=rng(hash(L.params.city+'jit'));
  let svg=city.bairros.map(b=>`<text class="bname" x="${b.x}" y="${b.y-10}" text-anchor="middle">${b.n.toUpperCase()}</text>
    <circle cx="${b.x}" cy="${b.y}" r="2" fill="#3a4258"/>`).join('');
  svg+=top.map((x,i)=>{
    const b=city.bairros[x.prop.bi];
    const px=b.x+(jr()-0.5)*34, py=b.y+(jr()-0.5)*26;
    const t=(x.best.final-lo)/Math.max(1,hi-lo);
    const c=t<0.33?'#34d399':t<0.66?'#fbbf24':'#f87171';
    return `<g class="pin" data-k="${x.prop.key}"><circle cx="${px}" cy="${py}" r="7.5" fill="${c}"/>
      <text x="${px}" y="${py+2}" text-anchor="middle">${i+1}</text></g>`;
  }).join('');
  $('#stMapCard').classList.remove('st-hidden');
  $('#stMap').innerHTML=svg;
  $$('#stMap .pin').forEach(el=>el.addEventListener('click',()=>openDetail(+el.dataset.k)));
}

function renderList(){
  const L=LAST;
  $('#stList').innerHTML=L.list.map((x,i)=>{
    const b=CITIES[x.prop.city].bairros[x.prop.bi];
    const c=x.score>=75?'#34d399':x.score>=50?'#fbbf24':'#f87171';
    const tags=Object.entries(x.prop.amen).filter(([k,v])=>v&&['pool','cafe','mar','pet','allinc','cozinha'].includes(k))
      .slice(0,3).map(([k])=>`<span class="tag">${AMEN_LABELS[k]}</span>`).join('');
    return `<div class="st-prop" data-k="${x.prop.key}">
      <div class="ic">${TYPES[x.prop.type].ic}</div>
      <div><div class="n">${i+1}. ${x.prop.name}</div>
        <div class="meta">${'★'.repeat(x.prop.stars)} · <span class="st-rate">${x.prop.rating.toFixed(1)}</span> (${x.prop.reviews.toLocaleString('pt-BR')}) · ${b.n} · ${x.prop.distC} km do centro</div>
        <div class="tags">${tags}${x.prop.cancelFree?'<span class="tag">Cancel. grátis</span>':''}</div>
        <span class="st-score" style="--st-c:${c}">VALOR REAL ${x.score}/100</span></div>
      <div class="right"><div class="pv">${BRL(x.best.final)}<small>${x.N} noites · ${x.best.n}</small></div></div>
    </div>`;
  }).join('');
  $$('#stList .st-prop').forEach(el=>el.addEventListener('click',()=>openDetail(+el.dataset.k)));
}

// =====================================================================
// DETALHE DA HOSPEDAGEM
// =====================================================================
function openDetail(key){
  const x=LAST.list.find(i=>i.prop.key===key); if(!x) return;
  CUR=x;
  const p=LAST.params, prop=x.prop, b=CITIES[prop.city].bairros[prop.bi];
  const c=x.score>=75?'#34d399':x.score>=50?'#fbbf24':'#f87171';
  $('#stDetName').textContent=prop.name;
  $('#stDetMeta').textContent=`${TYPES[prop.type].n} ${'★'.repeat(prop.stars)} · ${prop.rating.toFixed(1)} (${prop.reviews.toLocaleString('pt-BR')} avaliações) · ${b.n}, ${CITIES[prop.city].n} · ${prop.distC} km do centro · ${prop.distA} km do aeroporto`;
  $('#stDetStamp').style.setProperty('--st-c',c);
  $('#stDetStamp').innerHTML=`<b>${x.score}</b><span>valor real</span>`;
  $('#stDetVerdict').textContent=
    x.score>=75?`${x.score}/100 — excelente custo-benefício para o perfil ${PROFILES[p.profile]}. A IA considera preço, nota, localização, comodidades e histórico.`:
    x.score>=50?`${x.score}/100 — opção razoável; compare com as 3 primeiras da lista antes de reservar.`:
    `${x.score}/100 — entrega pouco pelo valor pago neste perfil. Veja alternativas melhores na lista.`;
  // Comparação de plataformas + radar de taxas ocultas
  $('#stPlat tbody').innerHTML=x.rows.map((r,i)=>`<tr>
    <td>${r.n} ${i===0?'<span class="st-badge">MELHOR</span>':''}${r.hiddenPct>0.12?' <span class="st-badge warn">taxas!</span>':''}</td>
    <td class="p">${BRL(r.headline)}</td>
    <td class="p">${r.fees?'+'+BRL(r.fees):'—'}</td>
    <td class="p">${BRL(r.final)}</td>
    <td class="st-tiny">${r.perk||(prop.cancelFree?'cancel. grátis':'não reembolsável')}</td></tr>`).join('');
  const worst=x.rows[x.rows.length-1];
  $('#stPlatNote').textContent=`Reservando pela ${x.rows[0].n} em vez da ${worst.n} você economiza ${BRL(worst.final-x.rows[0].final)}.`;
  // Calculadora da viagem
  const best=x.best, iss=Math.round(best.headline*0.05);
  const clean=prop.feeClean*p.rooms, resort=prop.feeResort*x.N*p.rooms, park=prop.feePark*x.N;
  const cafe=prop.amen.cafe?0:Math.round(35*p.guests*x.N);
  const grand=best.final+park+cafe;
  const feeRow=(l,v,hid)=>v?`<div class="st-fee"><span>${l}${hid?' <span class="hid">(oculta no anúncio)</span>':''}</span><span class="v">${BRL(v)}</span></div>`:'';
  $('#stCalc').innerHTML=
    feeRow(`Hospedagem (${x.N} noites × ${p.rooms} quarto${p.rooms>1?'s':''})`,best.headline)+
    feeRow('ISS / impostos (5%)',iss)+
    feeRow('Taxa de limpeza',clean,best.fees>iss&&clean>0)+
    feeRow('Resort fee',resort,resort>0)+
    feeRow('Estacionamento (estimado)',park)+
    feeRow('Café da manhã à parte (estimado)',cafe)+
    `<div class="st-fee total"><span>Total da viagem</span><span class="v">${BRL(grand)}</span></div>
     <div class="st-fee"><span>Por noite</span><span class="v">${BRL(Math.round(grand/x.N))}</span></div>
     <div class="st-fee"><span>Por pessoa</span><span class="v">${BRL(Math.round(grand/p.guests))}</span></div>`;
  renderHistory(prop); renderTips(x); renderReviews(prop);
  const txt=encodeURIComponent(`🏨 FinZen StayHunter: ${prop.name} (${CITIES[prop.city].n}) — ${x.N} noites por ${BRL(best.final)} via ${best.n} · valor real ${x.score}/100`);
  $('#stShWa').href=`https://wa.me/?text=${txt}`;
  $('#stShTg').href=`https://t.me/share/url?url=finzen&text=${txt}`;
  $('#stShMail').href=`mailto:?subject=Hospedagem%20encontrada&body=${txt}`;
  const inCmp=COMPARE.has(prop.key);
  $('#stCmpBtn').textContent=inCmp?'✓ No comparador':'⇄ Comparar (até 5)';
  $('#stDetail').classList.remove('st-hidden');
  $('#stDetail').scrollIntoView({behavior:'smooth'});
}
function closeDetail(){ CUR=null; $('#stDetail').classList.add('st-hidden'); }

function renderHistory(prop){
  const hist=[]; for(let i=60;i>=1;i--) hist.push(Math.round(nightly(prop, iso(addD(new Date(),-i)))));
  const w=320,h=110,lo=Math.min(...hist),hi=Math.max(...hist);
  const pts=hist.map((v,i)=>`${(i/(hist.length-1))*w},${h-8-((v-lo)/Math.max(1,hi-lo))*(h-24)}`).join(' ');
  const avg=hist.reduce((a,b)=>a+b)/hist.length, avgY=h-8-((avg-lo)/Math.max(1,hi-lo))*(h-24);
  $('#stChart').innerHTML=`
    <line x1="0" y1="${avgY}" x2="${w}" y2="${avgY}" stroke="#666f83" stroke-dasharray="4 4" stroke-width="1"/>
    <text x="4" y="${avgY-4}" fill="#8b93a7" font-size="9" font-family="monospace">média ${BRL(Math.round(avg))}/noite</text>
    <polyline points="${pts}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${w}" cy="${pts.split(' ').pop().split(',')[1]}" r="3.5" fill="#f59e0b"/>`;
  $('#stHistMin').textContent=BRL(lo); $('#stHistMax').textContent=BRL(hi);
  const recent=hist.slice(-14).reduce((a,b)=>a+b)/14, old=hist.slice(0,14).reduce((a,b)=>a+b)/14;
  let pUp=Math.round(Math.min(88,Math.max(12,50+((recent-old)/old)*260)));
  if(LAST.season.peak) pUp=Math.min(92,pUp+12);
  $('#stPUp').textContent=pUp+'%'; $('#stPDown').textContent=(100-pUp)+'%';
  $('#stAdvice').textContent=pUp>=60?'Alta probabilidade de aumento — se as condições servem, reservar agora tende a ser melhor.':
    pUp<=40?'Boa chance de queda — vale criar um alerta e esperar alguns dias.':
    'Preço estável — decida pelas condições (cancelamento, café, localização), não pelo preço.';
}

function renderTips(x){
  const p=LAST.params, prop=x.prop, tips=[];
  // mudar a viagem em ±2 dias
  const alt=(ci,co)=>pricePlatforms(prop,ci,co,p.rooms).rows[0].final;
  const shift=(n)=>({ ci:iso(addD(new Date(p.ci+'T12:00'),n)), co:iso(addD(new Date(p.co+'T12:00'),n)) });
  const m2=shift(-2), pM2=new Date(m2.ci)>new Date()?alt(m2.ci,m2.co):Infinity;
  const p2=shift(2),  pP2=alt(p2.ci,p2.co);
  const bestShift=Math.min(pM2,pP2);
  if(bestShift<x.best.final-30)
    tips.push({t:`Se mudar sua viagem em 2 dias (${bestShift===pM2?'antes':'depois'})`,v:x.best.final-bestShift});
  // dia da semana
  const wd=['domingos','segundas','terças','quartas','quintas','sextas','sábados'][prop.weekdayDeal.day];
  tips.push({t:`Historicamente fica ${prop.weekdayDeal.pct}% mais barato às ${wd}`,v:0});
  // site oficial
  const off=x.rows.find(r=>r.oficial);
  if(off&&off.final<=x.rows[0].final+50)
    tips.push({t:`Reservando pelo site oficial: ${off.perk||'condições melhores'}`,v:Math.max(0,x.rows[x.rows.length-1].final-off.final)});
  tips.push({t:'Reservando ~40 dias antes há maior chance de desconto nesta região',v:0});
  $('#stTips').innerHTML=tips.map(t=>`<div class="st-tip"><span>💡 ${t.t}</span>${t.v>0?`<span class="sv">economiza ${BRL(t.v)}</span>`:''}</div>`).join('');
}

const REV_POS=['Quartos muito limpos','Excelente localização','Funcionários atenciosos','Café da manhã variado','Cama confortável','Vista incrível','Ótimo silêncio à noite','Check-in rápido','Piscina bem cuidada'];
const REV_NEG=['Café simples','Elevador pequeno','Internet instável','Chuveiro fraco','Isolamento acústico ruim','Estacionamento pago','Ar-condicionado barulhento','Decoração datada'];
function renderReviews(prop){
  const r=rng(hash(prop.city+prop.key+'rev'));
  const pick=(arr,n)=>{ const c=[...arr],out=[]; for(let i=0;i<n;i++) out.push(c.splice(Math.floor(r()*c.length),1)[0]); return out; };
  $('#stRevPos').innerHTML=pick(REV_POS,3).map(t=>`<li>${t}</li>`).join('');
  $('#stRevNeg').innerHTML=pick(REV_NEG,3).map(t=>`<li>${t}</li>`).join('');
  $('#stRevNote').textContent=`Resumo simulado de ${prop.reviews.toLocaleString('pt-BR')} avaliações. Na versão real, a IA resume reviews reais (TripAdvisor Content API).`;
}

// =====================================================================
// COMPARADOR (até 5 lado a lado)
// =====================================================================
function toggleCompare(){
  if(!CUR) return;
  const k=CUR.prop.key;
  if(COMPARE.has(k)) COMPARE.delete(k);
  else{ if(COMPARE.size>=5){ alert('Máximo de 5 hospedagens no comparador.'); return; } COMPARE.add(k); }
  $('#stCmpBtn').textContent=COMPARE.has(k)?'✓ No comparador':'⇄ Comparar (até 5)';
  $('#stCmpCount').textContent=COMPARE.size||'';
  renderCompare();
}
function renderCompare(){
  const items=LAST?LAST.list.filter(x=>COMPARE.has(x.prop.key)):[];
  if(!items.length){
    $('#stCmpArea').innerHTML='<div class="st-empty"><span class="big">⇄</span>Abra uma hospedagem e toque em "Comparar" para adicionar aqui (até 5).</div>';
    return;
  }
  const row=(label,fn)=>`<tr><td>${label}</td>${items.map(x=>`<td>${fn(x)}</td>`).join('')}</tr>`;
  const chk=v=>v?'✅':'—';
  $('#stCmpArea').innerHTML=`<div class="st-cmp-wrap"><table class="st-table st-cmp">
    <thead><tr><th></th>${items.map(x=>`<th>${x.prop.name}</th>`).join('')}</tr></thead><tbody>
    ${row('Valor real (score)',x=>`<b>${x.score}/100</b>`)}
    ${row('Nota dos hóspedes',x=>x.prop.rating.toFixed(1)+' ★')}
    ${row('Valor total',x=>`<b>${BRL(x.best.final)}</b>`)}
    ${row('Por noite',x=>BRL(Math.round(x.best.final/x.N)))}
    ${row('Melhor plataforma',x=>x.best.n)}
    ${row('Dist. centro',x=>x.prop.distC+' km')}
    ${row('Dist. aeroporto',x=>x.prop.distA+' km')}
    ${row('Taxa de limpeza',x=>x.prop.feeClean?BRL(x.prop.feeClean):'—')}
    ${row('Cancelamento grátis',x=>chk(x.prop.cancelFree))}
    ${row('Café da manhã',x=>chk(x.prop.amen.cafe))}
    ${row('Piscina',x=>chk(x.prop.amen.pool))}
    ${row('Academia',x=>chk(x.prop.amen.gym))}
    ${row('Estacionamento',x=>chk(x.prop.amen.park))}
    ${row('Ar-condicionado',x=>chk(x.prop.amen.ac))}
    ${row('Wi-Fi',x=>chk(x.prop.amen.wifi))}
    ${row('Remover',x=>`<button class="st-x" data-k="${x.prop.key}">✕</button>`)}
  </tbody></table></div>`;
  $$('#stCmpArea .st-x').forEach(b=>b.addEventListener('click',()=>{
    COMPARE.delete(+b.dataset.k); $('#stCmpCount').textContent=COMPARE.size||''; renderCompare();
  }));
}

// =====================================================================
// ALERTAS — Supabase (stay_alerts, RLS)
// =====================================================================
async function createAlertFromDetail(){
  if(!CUR||!LAST) return;
  const p=LAST.params;
  const { error }=await supabase.from('stay_alerts').insert({
    user_id:user.id, city:p.city, prop_key:CUR.prop.key, prop_name:CUR.prop.name,
    checkin:p.ci, checkout:p.co,
    max_price:Math.round(CUR.best.final*0.9), drop_pct:10, ref_price:CUR.best.final
  });
  if(error){ alert('Erro ao criar alerta: '+error.message); return; }
  switchTab('alertas');
}
async function checkAlerts(){
  const { data:alerts }=await supabase.from('stay_alerts').select('*').eq('user_id',user.id);
  for(const a of (alerts||[])){
    const prop=genProps(a.city).find(x=>x.key===a.prop_key); if(!prop) continue;
    const ci=a.checkin||iso(addD(new Date(),30));
    const co=a.checkout||iso(addD(new Date(ci+'T12:00'),3));
    const wob=rng(hash(String(Date.now())+a.id))();
    const now=Math.round(pricePlatforms(prop,ci,co,1).rows[0].final*(0.85+wob*0.25));
    const fired=now<=(+a.max_price||0)||(a.drop_pct&&now<=(+a.ref_price)*(1-a.drop_pct/100));
    await supabase.from('stay_alerts')
      .update({ last_price:now, fired, checked_at:new Date().toISOString() })
      .eq('id',a.id);
  }
  await renderAlerts();
}
async function renderAlerts(){
  const { data:alerts, error }=await supabase.from('stay_alerts')
    .select('*').eq('user_id',user.id).order('created_at',{ascending:false});
  if(error){ $('#stAlList').innerHTML='<div class="st-empty">Erro ao carregar alertas.</div>'; return; }
  $('#stAlList').innerHTML=(alerts&&alerts.length)?alerts.map(a=>`
    <div class="st-item ${a.fired?'fired':''}">
      <div><div class="t">${a.prop_name} ${a.fired?'🟢 DISPAROU!':''}</div>
      <div class="s">${CITIES[a.city]?.n||a.city} · alvo ${BRL(+a.max_price)} ou queda de ${a.drop_pct}%${a.last_price?` · último: ${BRL(+a.last_price)}`:''}</div></div>
      <button class="st-x" data-id="${a.id}" aria-label="Excluir alerta">✕</button></div>`).join('')
    :'<div class="st-empty"><span class="big">🔔</span>Nenhum alerta. Abra uma hospedagem e toque em "Criar alerta".</div>';
  $$('#stAlList .st-x').forEach(b=>b.addEventListener('click',async()=>{
    await supabase.from('stay_alerts').delete().eq('id',b.dataset.id);
    await renderAlerts();
  }));
}

// =====================================================================
// FAVORITOS — Supabase (stay_favorites, RLS)
// =====================================================================
async function saveFavorite(){
  if(!CUR||!LAST) return;
  const p=LAST.params;
  const { error }=await supabase.from('stay_favorites').insert({
    user_id:user.id, city:p.city, prop_key:CUR.prop.key, prop_name:CUR.prop.name,
    prop_type:CUR.prop.type, checkin:p.ci, checkout:p.co,
    guests:p.guests, rooms:p.rooms, total_price:CUR.best.final, score:CUR.score
  });
  if(error){ alert('Erro ao salvar: '+error.message); return; }
  $('#stFavBtn').textContent='★ Salvo!';
  setTimeout(()=>{ $('#stFavBtn').textContent='☆ Salvar nos favoritos'; },1500);
}
async function renderFavs(){
  const { data:favs, error }=await supabase.from('stay_favorites')
    .select('*').eq('user_id',user.id).order('created_at',{ascending:false});
  if(error){ $('#stFavList').innerHTML='<div class="st-empty">Erro ao carregar favoritos.</div>'; return; }
  $('#stFavList').innerHTML=(favs&&favs.length)?favs.map(f=>{
    const prop=genProps(f.city).find(x=>x.key===f.prop_key);
    let nowHtml='';
    if(prop){
      const now=pricePlatforms(prop,f.checkin,f.checkout,f.rooms).rows[0].final;
      const diff=now-(+f.total_price);
      nowHtml=` · agora ${BRL(now)} <b style="color:${diff<=0?'#34d399':'#f87171'}">(${diff<=0?'':'+'}${BRL(diff)})</b>`;
    }
    return `<div class="st-item"><div>
      <div class="t">${TYPES[f.prop_type]?.ic||'🏨'} ${f.prop_name}</div>
      <div class="s">${CITIES[f.city]?.n||f.city} · ${fmtD(new Date(f.checkin+'T12:00'))}→${fmtD(new Date(f.checkout+'T12:00'))} · salvo por ${BRL(+f.total_price)}${nowHtml} · score ${f.score}</div></div>
      <button class="st-x" data-id="${f.id}" aria-label="Remover favorito">✕</button></div>`;
  }).join('')
    :'<div class="st-empty"><span class="big">☆</span>Salve hospedagens para comparar depois.</div>';
  $$('#stFavList .st-x').forEach(b=>b.addEventListener('click',async()=>{
    await supabase.from('stay_favorites').delete().eq('id',b.dataset.id);
    await renderFavs();
  }));
}

// =====================================================================
// CONSULTOR IA — via /api/travel-ai (module:'stay') — ANTHROPIC_API_KEY na Vercel.
// Endpoint compartilhado com o módulo Viagens (limite de 12 Serverless
// Functions no plano Hobby da Vercel).
// =====================================================================
function bubble(t,cls){
  const div=document.createElement('div');
  div.className='st-msg '+cls; div.textContent=t;
  $('#stChat').appendChild(div);
  $('#stChat').scrollTop=$('#stChat').scrollHeight;
  return div;
}
async function ask(q){
  q=(q||'').trim(); if(!q) return;
  $('#stAiIn').value='';
  bubble(q,'u');
  const th=bubble('analisando hospedagens…','a thinking');
  const ctx=LAST?{
    cidade:CITIES[LAST.params.city].n, checkin:LAST.params.ci, checkout:LAST.params.co,
    hospedes:LAST.params.guests, criancas:LAST.params.kids, perfil:PROFILES[LAST.params.profile],
    alta_temporada:LAST.season.tags,
    top5:LAST.list.slice(0,5).map(x=>({ nome:x.prop.name, tipo:TYPES[x.prop.type].n,
      bairro:CITIES[x.prop.city].bairros[x.prop.bi].n, nota:x.prop.rating,
      total:x.best.final, plataforma:x.best.n, taxas_ocultas:x.best.fees,
      score_valor_real:x.score, cancelamento_gratis:x.prop.cancelFree,
      cafe:!!x.prop.amen.cafe, dist_centro_km:x.prop.distC })),
    hospedagem_aberta:CUR?{ nome:CUR.prop.name, total:CUR.best.final, score:CUR.score }:null
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
      body:JSON.stringify({ module:'stay', question:q, context:ctx, history:chatHist })
    });
    const data=await r.json();
    const txt=data.text||data.error||'Não consegui responder agora.';
    th.textContent=txt; th.classList.remove('thinking');
    chatHist.push({role:'assistant',content:txt});
  }catch(e){
    th.textContent='Erro ao consultar a IA. Verifique a conexão.'; th.classList.remove('thinking');
  }
  $('#stChat').scrollTop=$('#stChat').scrollHeight;
}

// =====================================================================
// ABAS + INICIALIZAÇÃO
// =====================================================================
function switchTab(name){
  $$('.st-tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===name));
  $$('.st-view').forEach(v=>v.classList.toggle('on',v.dataset.tab===name));
  if(name==='favoritos') renderFavs();
  if(name==='alertas') renderAlerts();
  if(name==='comparar') renderCompare();
}

function init(){
  $('#stCity').innerHTML=Object.entries(CITIES)
    .map(([k,c])=>`<option value="${k}">${c.n}</option>`).join('');
  $('#stCity').value='RIO';
  const t0=addD(new Date(),30);
  $('#stCi').value=iso(t0); $('#stCo').value=iso(addD(t0,3));
  $('#stCi').min=iso(new Date()); $('#stCo').min=iso(new Date());
  $('#stType').innerHTML='<option value="all">Todos os tipos</option>'+
    Object.entries(TYPES).map(([k,t])=>`<option value="${k}">${t.ic} ${t.n}</option>`).join('');
  $('#stProfile').innerHTML=Object.entries(PROFILES)
    .map(([k,n])=>`<option value="${k}">${n}</option>`).join('');
  $('#stProfile').value='casal';
  $$('.st-fchip').forEach(ch=>ch.addEventListener('click',()=>{
    const f=ch.dataset.f;
    if(FILTERS.chips.has(f)){ FILTERS.chips.delete(f); ch.classList.remove('on'); }
    else{ FILTERS.chips.add(f); ch.classList.add('on'); }
  }));
  $('#stSearchBtn').addEventListener('click',runSearch);
  $('#stBack').addEventListener('click',closeDetail);
  $('#stFavBtn').addEventListener('click',saveFavorite);
  $('#stAlertBtn').addEventListener('click',createAlertFromDetail);
  $('#stCmpBtn').addEventListener('click',toggleCompare);
  $('#stAlCheck').addEventListener('click',checkAlerts);
  $('#stAiSend').addEventListener('click',()=>ask($('#stAiIn').value));
  $('#stAiIn').addEventListener('keydown',e=>{ if(e.key==='Enter') ask($('#stAiIn').value); });
  $$('.st-sug button').forEach(b=>b.addEventListener('click',()=>ask(b.dataset.q)));
  $$('.st-tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  renderAlerts();
}
init();

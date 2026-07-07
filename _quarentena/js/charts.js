import { supabase } from './supabaseClient.js';

async function loadCharts(){

const tx = await supabase.from('transactions').select('type,amount,category_id');
const categories = await supabase.from('categories').select('*');
const inv = await supabase.from('investments').select('tipo,quantidade,preco_medio');
const dividends = await supabase
.from('investment_transactions')
.select('tipo,valor_total,data_movimento');

let receitas = 0;
let despesas = 0;

(tx.data||[]).forEach(r=>{
 if(r.type==='receita') receitas += Number(r.amount||0);
 if(r.type==='despesa') despesas += Number(r.amount||0);
});

new Chart(document.getElementById('incomeExpenseChart'),{
 type:'bar',
 data:{
  labels:['Receitas','Despesas'],
  datasets:[{label:'R$',data:[receitas,despesas]}]
 }
});

const catMap = {};
(tx.data||[]).forEach(r=>{
 if(r.type!=='despesa') return;
 catMap[r.category_id]=(catMap[r.category_id]||0)+Number(r.amount||0);
});

const catLabels=[];
const catValues=[];

Object.keys(catMap).forEach(id=>{
 const c=(categories.data||[]).find(x=>x.id===id);
 catLabels.push(c?.nome||'Sem categoria');
 catValues.push(catMap[id]);
});

new Chart(document.getElementById('categoryChart'),{
 type:'pie',
 data:{labels:catLabels,datasets:[{data:catValues}]}
});

const alloc={};
(inv.data||[]).forEach(i=>{
 const total=Number(i.quantidade||0)*Number(i.preco_medio||0);
 alloc[i.tipo]=(alloc[i.tipo]||0)+total;
});

new Chart(document.getElementById('allocationChart'),{
 type:'doughnut',
 data:{
  labels:Object.keys(alloc),
  datasets:[{data:Object.values(alloc)}]
 }
});

const meses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const valores=new Array(12).fill(0);

(dividends.data||[]).forEach(d=>{
 if(!['dividendo','jcp','rendimento_fii'].includes(d.tipo)) return;
 const m=new Date(d.data_movimento).getMonth();
 valores[m]+=Number(d.valor_total||0);
});

new Chart(document.getElementById('dividendChart'),{
 type:'line',
 data:{
  labels:meses,
  datasets:[{label:'Dividendos',data:valores}]
 }
});

}

loadCharts();

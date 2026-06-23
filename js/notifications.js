/**
 * notifications.js
 * Gerencia notificações push PWA do FinZen
 * - Alertas de faturas próximas do vencimento
 * - Alertas de lançamentos pendentes
 * - Resumo diário (opcional)
 */

import { supabase } from './supabaseClient.js';
import { formatCurrency } from './utils.js';

const fmt = v => formatCurrency(v, 'BRL');

// ── Registrar Service Worker ──────────────────────────
export async function registrarSW() {
  if(!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('../sw.js', { scope: '../' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch(e) {
    console.warn('[FinZen] SW não registrado:', e.message);
    return null;
  }
}

// ── Solicitar permissão de notificação ────────────────
export async function solicitarPermissao() {
  if(!('Notification' in window)) return false;
  if(Notification.permission === 'granted') return true;
  if(Notification.permission === 'denied') return false;

  const resultado = await Notification.requestPermission();
  return resultado === 'granted';
}

// ── Status atual ──────────────────────────────────────
export function statusNotificacoes() {
  if(!('Notification' in window)) return 'indisponivel';
  return Notification.permission; // granted | denied | default
}

// ── Enviar notificação imediata via SW ────────────────
export async function notificar(title, body, options = {}) {
  if(Notification.permission !== 'granted') return;
  const sw = await navigator.serviceWorker.ready;
  sw.active?.postMessage({
    type: 'SHOW_NOTIFICATION',
    title,
    body,
    tag:  options.tag  || 'finzen-geral',
    data: options.data || {},
  });
}

// ── Carregar e agendar alertas ────────────────────────
export async function agendarAlertas(userId) {
  if(Notification.permission !== 'granted') return 0;

  const hoje    = new Date();
  const hojeISO = hoje.toISOString().split('T')[0];
  const em7     = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
  const ref     = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;

  const [
    { data: pendentes },
    { data: faturas   },
    { data: cartoes   },
  ] = await Promise.all([
    supabase.from('transactions')
      .select('description,amount,date,type')
      .eq('user_id', userId).eq('status', 'pendente')
      .gte('date', hojeISO).lte('date', em7)
      .order('date', { ascending: true }),

    supabase.from('card_transactions')
      .select('valor_parcela,fatura_referencia,credit_cards:card_id(nome,vencimento_dia)')
      .eq('user_id', userId).eq('status', 'aberta').eq('fatura_referencia', ref),

    supabase.from('credit_cards')
      .select('id,nome,vencimento_dia').eq('user_id', userId).eq('ativo', true),
  ]);

  const alertas = [];
  const agora   = Date.now();

  // ── Alertas de lançamentos pendentes ─────────────────
  (pendentes || []).forEach(p => {
    const diasAte = Math.round((new Date(p.date+'T00:00:00') - hoje) / 864e5);
    if(diasAte < 0) return;

    const dataHoraAlerta = new Date();
    dataHoraAlerta.setHours(9, 0, 0, 0); // notificar às 9h
    if(dataHoraAlerta.getTime() <= agora) return; // já passou hoje

    alertas.push({
      title: diasAte === 0 ? '⏰ Vence hoje!' : `📅 Vence em ${diasAte} dia${diasAte > 1 ? 's' : ''}`,
      body:  `${p.description} — ${fmt(p.amount)}`,
      tag:   `pendente-${p.date}`,
      dataHora: dataHoraAlerta.toISOString(),
      url:   './pages/movements.html',
    });
  });

  // ── Alertas de faturas de cartão ──────────────────────
  (cartoes || []).forEach(cartao => {
    if(!cartao.vencimento_dia) return;

    const diaVenc = cartao.vencimento_dia;
    let anoVenc = hoje.getFullYear();
    let mesVenc = hoje.getMonth() + 1;

    if(diaVenc < hoje.getDate()) {
      mesVenc++;
      if(mesVenc > 12) { mesVenc = 1; anoVenc++; }
    }

    const dataVenc = new Date(`${anoVenc}-${String(mesVenc).padStart(2,'0')}-${String(diaVenc).padStart(2,'0')}T00:00:00`);
    const diasAte  = Math.round((dataVenc - hoje) / 864e5);
    if(diasAte < 0 || diasAte > 7) return;

    // Total da fatura
    const totalFatura = (faturas || [])
      .filter(f => f.credit_cards?.nome === cartao.nome)
      .reduce((s, f) => s + Number(f.valor_parcela || 0), 0);
    if(totalFatura <= 0) return;

    // Notificar 3 dias antes e no dia
    if(diasAte <= 3) {
      const dataHoraAlerta = new Date();
      dataHoraAlerta.setHours(8, 0, 0, 0);
      if(dataHoraAlerta.getTime() <= agora) {
        dataHoraAlerta.setDate(dataHoraAlerta.getDate() + 1);
        dataHoraAlerta.setHours(8, 0, 0, 0);
      }

      alertas.push({
        title: diasAte === 0 ? `💳 Fatura vence HOJE!` : `💳 Fatura vence em ${diasAte} dia${diasAte > 1 ? 's' : ''}`,
        body:  `${cartao.nome} — ${fmt(totalFatura)} • Vence dia ${diaVenc}`,
        tag:   `fatura-${cartao.id}`,
        dataHora: dataHoraAlerta.toISOString(),
        url:   './pages/card-bills.html',
      });
    }
  });

  // Enviar lista ao SW para agendar
  if(alertas.length) {
    const sw = await navigator.serviceWorker.ready;
    sw.active?.postMessage({ type: 'SCHEDULE_ALERTS', alertas });
  }

  return alertas.length;
}

// ── Inicialização automática ──────────────────────────
export async function inicializarNotificacoes(userId) {
  const reg = await registrarSW();
  if(!reg) return;

  // Verificar permissão atual
  const status = statusNotificacoes();

  // Só agenda se já tem permissão
  if(status === 'granted') {
    const n = await agendarAlertas(userId);
    if(n > 0) console.log(`[FinZen] ${n} alerta(s) agendado(s)`);
  }
}

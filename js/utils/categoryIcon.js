/**
 * categoryIcon.js — mapeia o nome de uma categoria pra um ícone de linha
 * (id do sprite em js/iconSprite.js) por palavra-chave. Sem correspondência
 * cai no ícone genérico (ic-wallet).
 */
export function categoriaIcone(nome) {
  const n = (nome||'').toLowerCase();
  if(/mercado|supermerc|compra/.test(n))                 return 'ic-bag';
  if(/aliment|comida|restaur|lanche|padaria/.test(n))    return 'ic-food';
  if(/transport|uber|carro|combust|gasolina|estacion/.test(n)) return 'ic-car';
  if(/moradia|casa|aluguel|condom/.test(n))               return 'ic-home';
  if(/sa[uú]de|farm[aá]cia|m[eé]dico|plano/.test(n))      return 'ic-heart';
  if(/educa[çc][aã]o|curso|escola|faculdade/.test(n))     return 'ic-book';
  if(/lazer|entreten|cinema|streaming|viagem/.test(n))    return 'ic-film';
  if(/pet|animal/.test(n))                                return 'ic-paw';
  if(/assinatur|internet|telefone|celular/.test(n))       return 'ic-wifi';
  if(/sal[aá]rio|renda|receita/.test(n))                  return 'ic-coin';
  if(/investi/.test(n))                                   return 'ic-trend';
  return 'ic-wallet';
}

export function iconeCategoriaSvg(nome, size) {
  const s = size || 17;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="#${categoriaIcone(nome)}"/></svg>`;
}

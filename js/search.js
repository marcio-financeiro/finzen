import { supabase } from './supabaseClient.js';

const searchInput = document.getElementById('searchInput');
const results = document.getElementById('results');

searchInput.addEventListener('input', async () => {
    const termo = searchInput.value.trim().toLowerCase();

    if(termo.length < 2){
        results.innerHTML = '<p class="muted">Digite pelo menos 2 caracteres.</p>';
        return;
    }

    const pesquisas = await Promise.all([
        supabase.from('investments').select('*'),
        supabase.from('goals').select('*'),
        supabase.from('accounts').select('*'),
        supabase.from('cards').select('*'),
        supabase.from('categories').select('*')
    ]);

    let html = '';

    const adicionarGrupo = (titulo, dados, campo1, campo2='') => {
        const filtrados = (dados || []).filter(item =>
            JSON.stringify(item).toLowerCase().includes(termo)
        );

        if(!filtrados.length) return;

        html += `<h3>${titulo}</h3><table class="data-table"><tbody>`;

        filtrados.forEach(item => {
            html += `<tr>
                <td><strong>${item[campo1] || '-'}</strong></td>
                <td>${campo2 ? (item[campo2] || '') : ''}</td>
            </tr>`;
        });

        html += '</tbody></table><br>';
    };

    adicionarGrupo('Investimentos', pesquisas[0].data, 'ticker', 'nome');
    adicionarGrupo('Metas', pesquisas[1].data, 'nome');
    adicionarGrupo('Contas', pesquisas[2].data, 'nome');
    adicionarGrupo('Cartões', pesquisas[3].data, 'nome');
    adicionarGrupo('Categorias', pesquisas[4].data, 'nome');

    results.innerHTML = html || '<p class="muted">Nenhum resultado encontrado.</p>';
});

/**
 * SISTEMA DE GESTÃO DE SAÚDE - VERSÃO COMPLETA (CLOUD)
 */

// --- CONFIGURAÇÃO SUPABASE (NOME ALTERADO PARA EVITAR CONFLITO) ---
const SUPABASE_URL = 'https://hjxxeinmndqvzoqkbpeg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6dnp4dmVqb2FyZ2ZxcmxteGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTU5ODIsImV4cCI6MjA4NDU5MTk4Mn0._ew5X-XraLq1PxHIn413KrwdcwTMSMg1pOSvm0gaZ4o'; // Verifique se esta é a sua 'anon public'
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Cache local (Espelho do banco para manter a lógica original)
let LOCAL_DATA_CACHE = [];
const PROCEDIMENTOS_PADRAO = [
    "EXAMES LABORATORIAIS", "GASTROLOGISTA", "CARDIOLOGISTA", "ENDOCRINOLOGISTA", 
    "CIRURGIA", "ONCOLOGIA", "PROCTOLOGISTA", "ALTO RISCO", "UROLOGIA", 
    "NEFROLOGISTA", "DERMATOLOGIA", "MASTOLOGISTA", "NEUROLOGISTA", "GINECOLOGISTA", 
    "INFECTOLOGISTA", "ALERGISTA", "PNEUMOLOGISTA", "REUMATOLOGISTA", "OFTALMOLOGISTA"
];

// --- MÓDULO DE AUTENTICAÇÃO ---
const Auth = {
    init: async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            document.getElementById('loginOverlay').style.display = 'none';
            await DB.sincronizar();
        }
    },
    login: async () => {
        const email = document.getElementById('emailLogin').value;
        const password = document.getElementById('senhaLogin').value;
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) alert("Erro: " + error.message);
        else window.location.reload();
    },
    logout: async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
    }
};

// --- BANCO DE DADOS (MAPEAMENTO 1:1 COM SEU SISTEMA ANTERIOR) ---
const DB = {
    sincronizar: async () => {
        const { data, error } = await supabaseClient.from('atendimentos').select('*');
        if (error) return console.error(error);
        
        // Converte o formato do SQL para o formato de OBJETOS que seu sistema usa
        LOCAL_DATA_CACHE = data.map(item => ({
            id: item.id,
            status: item.status,
            justificativa: item.justificativa,
            statusJustificativa: item.status_justificativa,
            paciente: {
                nome: item.paciente_nome,
                nascimento: item.paciente_nascimento,
                endereco: item.paciente_endereco,
                contato: item.paciente_contato
            },
            procedimento: {
                nome: item.procedimento_nome,
                dataRecebimento: item.data_recebimento,
                dataSolicitacao: item.data_solicitacao,
                dataMarcacao: item.data_marcacao,
                dataProcedimento: item.data_procedimento,
                tipo: item.tipo_marcacao,
                isRetorno: item.is_retorno
            }
        }));
        
        Router.refreshCurrent();
        RelatoriosModule.atualizarDashboard();
    },

    salvarNovo: async (registro) => {
        const sqlData = {
            paciente_nome: registro.paciente.nome,
            paciente_nascimento: registro.paciente.nascimento,
            paciente_endereco: registro.paciente.endereco,
            paciente_contato: registro.paciente.contato,
            procedimento_nome: registro.procedimento.nome,
            data_recebimento: registro.procedimento.dataRecebimento || null,
            data_solicitacao: registro.procedimento.dataSolicitacao || null,
            data_marcacao: registro.procedimento.dataMarcacao || null,
            data_procedimento: registro.procedimento.dataProcedimento || null,
            tipo_marcacao: registro.procedimento.tipo,
            is_retorno: registro.procedimento.isRetorno,
            status: registro.status,
            justificativa: registro.justificativa
        };
        await supabaseClient.from('atendimentos').insert([sqlData]);
        await DB.sincronizar();
    },

    atualizarStatus: async (id, novosCampos) => {
        const mapeamento = {};
        if(novosCampos.status) mapeamento.status = novosCampos.status;
        if(novosCampos.justificativa) mapeamento.justificativa = novosCampos.justificativa;
        if(novosCampos.statusJustificativa) mapeamento.status_justificativa = novosCampos.statusJustificativa;

        await supabaseClient.from('atendimentos').update(mapeamento).eq('id', id);
        await DB.sincronizar();
    },

    excluir: async (id) => {
        if(confirm("Deseja realmente excluir?")) {
            await supabaseClient.from('atendimentos').delete().eq('id', id);
            await DB.sincronizar();
        }
    }
};

// --- LÓGICA DE CADASTRO ---
const CadastroModule = {
    buscarPaciente: (termo) => {
        const lista = document.getElementById('sugestoesPaciente');
        lista.innerHTML = '';
        if(termo.length < 3) return;
        
        const unicos = [...new Map(LOCAL_DATA_CACHE.map(i => [i.paciente.nome, i.paciente])).values()];
        unicos.filter(p => p.nome.toLowerCase().includes(termo.toLowerCase())).forEach(p => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerText = p.nome;
            div.onclick = () => {
                document.getElementById('nomePaciente').value = p.nome;
                document.getElementById('dataNascimento').value = p.nascimento;
                document.getElementById('endereco').value = p.endereco;
                document.getElementById('contato').value = p.contato;
                lista.innerHTML = '';
            };
            lista.appendChild(div);
        });
    },
    salvar: async (e) => {
        e.preventDefault();
        const dataProc = document.getElementById('dataProcedimento').value;
        const novo = {
            status: dataProc ? 'agendado' : 'espera',
            paciente: {
                nome: document.getElementById('nomePaciente').value.toUpperCase(),
                nascimento: document.getElementById('dataNascimento').value,
                endereco: document.getElementById('endereco').value,
                contato: document.getElementById('contato').value
            },
            procedimento: {
                nome: document.getElementById('procedimento').value,
                dataRecebimento: document.getElementById('dataRecebimento').value,
                dataSolicitacao: document.getElementById('dataSolicitacao').value,
                dataMarcacao: document.getElementById('dataMarcacao').value,
                dataProcedimento: dataProc,
                tipo: document.getElementById('tipoMarcacao').value,
                isRetorno: document.getElementById('isRetorno').checked
            }
        };
        await DB.salvarNovo(novo);
        alert("Salvo com sucesso!");
        document.getElementById('formCadastro').reset();
    }
};

// --- RELATÓRIOS E HISTÓRICO (RESTAURADO) ---
const RelatoriosModule = {
    atualizarDashboard: () => {
        const dados = LOCAL_DATA_CACHE;
        document.getElementById('dashMarcados').innerText = dados.filter(i => i.status === 'agendado').length;
        document.getElementById('dashConcluidos').innerText = dados.filter(i => i.status === 'concluido').length;
        document.getElementById('dashFaltosos').innerText = dados.filter(i => i.status === 'faltoso').length;
        document.getElementById('dashEspera').innerText = dados.filter(i => i.status === 'espera').length;
    },
    buscarPacienteHistorico: (termo) => {
        const container = document.getElementById('containerHistorico');
        const tabela = document.getElementById('tabelaHistorico');
        if(termo.length < 3) { container.style.display = 'none'; return; }

        const historico = LOCAL_DATA_CACHE.filter(i => i.paciente.nome.toLowerCase().includes(termo.toLowerCase()));
        if(historico.length > 0) {
            container.style.display = 'block';
            document.getElementById('nomePacienteHistorico').innerText = historico[0].paciente.nome;
            tabela.innerHTML = historico.map(i => `
                <tr>
                    <td>${Utils.formatarData(i.procedimento.dataRecebimento)}</td>
                    <td>${i.procedimento.nome}</td>
                    <td><span class="badge ${i.status}">${i.status.toUpperCase()}</span></td>
                </tr>
            `).join('');
        }
    }
};

// --- UTILITÁRIOS ---
const Utils = {
    formatarData: (data) => data ? data.split('-').reverse().join('/') : '-',
    calcularEspera: (data) => {
        const d1 = new Date(data);
        const d2 = new Date();
        return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
    }
};

const Router = {
    current: 'cadastro',
    navigate: (page) => {
        if(page === 'logout') return Auth.logout();
        document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
        document.getElementById(page).classList.add('active');
        Router.current = page;
        
        // Renderização específica de cada tela
        if(page === 'acompanhamento') AcompanhamentoModule.render();
        if(page === 'concluidos') ConcluidosModule.render();
        if(page === 'faltosos') FaltososModule.render();
        if(page === 'espera') EsperaModule.render();
    },
    refreshCurrent: () => Router.navigate(Router.current)
};

// --- INICIALIZAÇÃO ---
window.onload = () => {
    // Carregar selects
    const selectProc = document.getElementById('procedimento');
    PROCEDIMENTOS_PADRAO.sort().forEach(p => {
        const opt = document.createElement('option');
        opt.value = p; opt.innerText = p;
        selectProc.appendChild(opt);
    });
    
    document.getElementById('formCadastro').onsubmit = CadastroModule.salvar;
    Auth.init();
};

// --- MÓDULOS DE TELAS (RESUMO) ---
const AcompanhamentoModule = {
    render: () => {
        const lista = LOCAL_DATA_CACHE.filter(i => i.status === 'agendado');
        document.getElementById('tabelaAcompanhamento').innerHTML = lista.map(i => `
            <tr>
                <td>${i.paciente.nome}</td>
                <td>${i.procedimento.nome}</td>
                <td>${Utils.formatarData(i.procedimento.dataProcedimento)}</td>
                <td>${Utils.calcularEspera(i.procedimento.dataRecebimento)} dias</td>
                <td>
                    <button onclick="AcompanhamentoModule.concluir(${i.id})">✔</button>
                    <button onclick="DB.excluir(${i.id})">🗑</button>
                </td>
            </tr>
        `).join('');
    },
    concluir: async (id) => await DB.atualizarStatus(id, {status: 'concluido'})
};

const EsperaModule = {
    render: () => {
        const lista = LOCAL_DATA_CACHE.filter(i => i.status === 'espera');
        document.getElementById('tabelaEspera').innerHTML = lista.map(i => `
            <tr>
                <td>${i.paciente.nome}</td>
                <td>${i.procedimento.nome}</td>
                <td>${Utils.calcularEspera(i.procedimento.dataRecebimento)} dias</td>
                <td><button onclick="DB.excluir(${i.id})">🗑</button></td>
            </tr>
        `).join('');
    }
};



/**
 * SISTEMA DE GESTÃO DE SAÚDE - SCRIPT PRINCIPAL
 * Adaptado para manter suas variáveis e lógica originais
 */

// --- CONFIGURAÇÃO (COLE SUAS CHAVES AQUI) ---
// 1. Vá em Settings > API no Supabase
// 2. Copie o URL e a Chave "anon public"
const SUPABASE_URL = 'https://zzvzxvejoargfqrlmxfq.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6dnp4dmVqb2FyZ2ZxcmxteGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTU5ODIsImV4cCI6MjA4NDU5MTk4Mn0._ew5X-XraLq1PxHIn413KrwdcwTMSMg1pOSvm0gaZ4o';

// Inicializa o cliente Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Cache local (para o sistema parecer rápido como o antigo)
let DADOS_CACHE = [];
let PROCEDIMENTOS_CACHE = [
    "CLINICO GERAL", "CARDIOLOGISTA", "DERMATOLOGIA", "GINECOLOGISTA", 
    "OFTALMOLOGISTA", "ORTOPEDISTA", "PEDIATRIA", "PSIQUIATRIA", 
    "ULTRASSOM", "RAIO-X", "EXAMES LABORATORIAIS"
];

// --- MÓDULO DE AUTENTICAÇÃO (LOGIN) ---
const Auth = {
    isLoginMode: true,
    
    // Verifica se já está logado ao abrir
    init: async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            document.getElementById('loginOverlay').style.display = 'none';
            DB.carregarTudo(); // Puxa os dados do banco
        }
    },

    toggleMode: () => {
        Auth.isLoginMode = !Auth.isLoginMode;
        const btn = document.getElementById('btnAuthMain');
        const link = document.getElementById('toggleAuthBtn');
        
        if (Auth.isLoginMode) {
            btn.innerText = "Entrar";
            link.innerText = "Criar nova conta";
        } else {
            btn.innerText = "Cadastrar Usuário";
            link.innerText = "Voltar para Login";
        }
    },

    login: async () => {
        const email = document.getElementById('emailLogin').value;
        const senha = document.getElementById('senhaLogin').value;
        const msg = document.getElementById('msgLogin');
        
        if (!email || !senha) { msg.innerText = "Preencha tudo."; return; }

        let result;
        if (Auth.isLoginMode) {
            // Fazer Login
            result = await supabaseClient.auth.signInWithPassword({ email, password: senha });
        } else {
            // Criar Conta
            result = await supabaseClient.auth.signUp({ email, password: senha });
            if (!result.error) alert("Conta criada! Verifique seu e-mail ou tente entrar.");
        }

        if (result.error) {
            msg.innerText = result.error.message;
        } else if (Auth.isLoginMode) {
            document.getElementById('loginOverlay').style.display = 'none';
            DB.carregarTudo();
        }
    },

    logout: async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
    }
};

// --- BANCO DE DADOS (DB) ---
const DB = {
    carregarTudo: async () => {
        // 1. Carrega Atendimentos
        const { data, error } = await supabaseClient.from('atendimentos').select('*');
        if (error) console.error(error);
        if (data) DADOS_CACHE = data;

        // 2. Carrega Procedimentos Extras
        const { data: procs } = await supabaseClient.from('procedimentos_lista').select('*');
        if (procs) {
            procs.forEach(p => {
                if(!PROCEDIMENTOS_CACHE.includes(p.nome)) PROCEDIMENTOS_CACHE.push(p.nome);
            });
        }
        
        PROCEDIMENTOS_CACHE.sort();
        ProcedimentosDB.renderSelect();
        RelatoriosModule.atualizar(); // Atualiza dashboard
        alert("Sistema carregado e pronto.");
    },

    salvarNovo: async (objetoCadastro) => {
        // Mapeia o objeto do formulário para as colunas do SQL
        const dadosSQL = {
            nome_paciente: objetoCadastro.nome,
            nascimento: objetoCadastro.nascimento,
            endereco: objetoCadastro.endereco,
            contato: objetoCadastro.contato,
            procedimento_nome: objetoCadastro.procedimento,
            data_recebimento: objetoCadastro.dataRecebimento || null,
            data_solicitacao: objetoCadastro.dataSolicitacao || null,
            data_marcacao: objetoCadastro.dataMarcacao || null,
            data_procedimento: objetoCadastro.dataProcedimento || null,
            tipo_marcacao: objetoCadastro.tipo,
            is_retorno: objetoCadastro.isRetorno,
            status: objetoCadastro.status || 'agendado'
        };

        const { data, error } = await supabaseClient.from('atendimentos').insert([dadosSQL]).select();
        
        if (error) {
            alert("Erro ao salvar: " + error.message);
        } else {
            alert("Salvo com sucesso!");
            DADOS_CACHE.push(data[0]); // Atualiza cache local
        }
    },

    atualizarStatus: async (id, novoStatus, justificativa = null) => {
        const updateData = { status: novoStatus };
        if (justificativa) updateData.justificativa = justificativa;

        const { error } = await supabaseClient.from('atendimentos').update(updateData).eq('id', id);
        
        if (!error) {
            // Atualiza cache local
            const item = DADOS_CACHE.find(i => i.id == id);
            if (item) {
                item.status = novoStatus;
                item.justificativa = justificativa;
            }
            return true;
        }
        return false;
    },

    excluir: async (id) => {
        if(confirm("Tem certeza que deseja apagar?")) {
            const { error } = await supabaseClient.from('atendimentos').delete().eq('id', id);
            if (!error) {
                DADOS_CACHE = DADOS_CACHE.filter(i => i.id != id);
                Router.refresh();
            }
        }
    }
};

// --- LÓGICA DE PROCEDIMENTOS ---
const ProcedimentosDB = {
    renderSelect: () => {
        const select = document.getElementById('procedimento');
        select.innerHTML = '<option value="">Selecione...</option>';
        PROCEDIMENTOS_CACHE.forEach(proc => {
            const opt = document.createElement('option');
            opt.value = proc;
            opt.innerText = proc;
            select.appendChild(opt);
        });
    },
    adicionarNovoViaInterface: async () => {
        const novo = prompt("Nome do novo procedimento:");
        if (novo) {
            const upper = novo.toUpperCase();
            if (!PROCEDIMENTOS_CACHE.includes(upper)) {
                // Salva no banco auxiliar
                await supabaseClient.from('procedimentos_lista').insert([{ nome: upper }]);
                PROCEDIMENTOS_CACHE.push(upper);
                ProcedimentosDB.renderSelect();
            }
            document.getElementById('procedimento').value = upper;
        }
    }
};

// --- CADASTRO (Lógica Original Mantida) ---
const CadastroModule = {
    buscarPaciente: (termo) => {
        const lista = document.getElementById('sugestoesPaciente');
        lista.innerHTML = '';
        if (termo.length < 3) return;

        // Filtra no cache local (mais rápido)
        const sugestoes = DADOS_CACHE.filter(i => i.nome_paciente.toLowerCase().includes(termo.toLowerCase()));
        
        // Remove duplicados pelo nome
        const unicos = [...new Map(sugestoes.map(item => [item.nome_paciente, item])).values()];

        unicos.forEach(paciente => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerText = paciente.nome_paciente;
            div.onclick = () => {
                document.getElementById('nomePaciente').value = paciente.nome_paciente;
                document.getElementById('dataNascimento').value = paciente.nascimento;
                document.getElementById('endereco').value = paciente.endereco;
                document.getElementById('contato').value = paciente.contato;
                lista.innerHTML = '';
            };
            lista.appendChild(div);
        });
    },

    limparFormulario: () => {
        document.getElementById('formCadastro').reset();
    },

    salvar: async (e) => {
        e.preventDefault();
        
        // Pega os valores usando os IDs que você já configurou no HTML
        const dadosFormulario = {
            nome: document.getElementById('nomePaciente').value,
            nascimento: document.getElementById('dataNascimento').value,
            endereco: document.getElementById('endereco').value,
            contato: document.getElementById('contato').value,
            procedimento: document.getElementById('procedimento').value,
            dataRecebimento: document.getElementById('dataRecebimento').value,
            dataSolicitacao: document.getElementById('dataSolicitacao').value,
            dataMarcacao: document.getElementById('dataMarcacao').value,
            dataProcedimento: document.getElementById('dataProcedimento').value, // Importante
            tipo: document.getElementById('tipoMarcacao').value,
            isRetorno: document.getElementById('isRetorno').checked,
            status: document.getElementById('dataProcedimento').value ? 'agendado' : 'espera'
        };

        await DB.salvarNovo(dadosFormulario);
        CadastroModule.limparFormulario();
    }
};

// --- MÓDULOS DE VISUALIZAÇÃO ---
const AcompanhamentoModule = {
    tempId: null,
    render: () => {
        const tbody = document.getElementById('tabelaAcompanhamento');
        tbody.innerHTML = '';
        // Filtra apenas agendados
        const lista = DADOS_CACHE.filter(i => i.status === 'agendado');
        
        lista.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.nome_paciente}</td>
                <td>${item.procedimento_nome} ${item.is_retorno ? '(R)' : ''}</td>
                <td>${formatData(item.data_procedimento)}</td>
                <td>
                    <button class="btn-danger" onclick="AcompanhamentoModule.abrirModalFalta(${item.id})">Faltou</button>
                    <button class="btn-primary" onclick="AcompanhamentoModule.confirmarPresenca(${item.id})">Realizado</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    confirmarPresenca: async (id) => {
        await DB.atualizarStatus(id, 'concluido');
        AcompanhamentoModule.render();
    },
    abrirModalFalta: (id) => {
        AcompanhamentoModule.tempId = id;
        document.getElementById('modalJustificativa').classList.remove('hidden');
    },
    confirmarFalta: async () => {
        const just = document.getElementById('textoJustificativa').value;
        await DB.atualizarStatus(AcompanhamentoModule.tempId, 'faltoso', just);
        document.getElementById('modalJustificativa').classList.add('hidden');
        AcompanhamentoModule.render();
    }
};

const ConcluidosModule = {
    render: () => {
        const tbody = document.getElementById('tabelaConcluidos');
        tbody.innerHTML = '';
        const lista = DADOS_CACHE.filter(i => i.status === 'concluido');
        lista.forEach(item => {
            tbody.innerHTML += `<tr>
                <td>${item.nome_paciente}</td>
                <td>${item.procedimento_nome}</td>
                <td>${formatData(item.data_procedimento)}</td>
                <td><i class="ph ph-trash" style="cursor:pointer; color:red;" onclick="DB.excluir(${item.id})"></i></td>
            </tr>`;
        });
    }
};

const FaltososModule = {
    render: () => {
        const tbody = document.getElementById('tabelaFaltosos');
        tbody.innerHTML = '';
        const lista = DADOS_CACHE.filter(i => i.status === 'faltoso');
        lista.forEach(item => {
            tbody.innerHTML += `<tr>
                <td>${item.nome_paciente}</td>
                <td>${item.justificativa || '-'}</td>
                <td><i class="ph ph-trash" style="cursor:pointer; color:red;" onclick="DB.excluir(${item.id})"></i></td>
            </tr>`;
        });
    }
};

const EsperaModule = {
    render: () => {
        const tbody = document.getElementById('tabelaEspera');
        tbody.innerHTML = '';
        const lista = DADOS_CACHE.filter(i => i.status === 'espera');
        lista.forEach(item => {
            // Calcula dias de espera
            const d1 = new Date(item.data_recebimento || new Date());
            const diff = Math.floor((new Date() - d1) / (1000 * 60 * 60 * 24));
            
            tbody.innerHTML += `<tr>
                <td>${item.nome_paciente}</td>
                <td>${item.procedimento_nome}</td>
                <td>${diff} dias</td>
                <td><i class="ph ph-trash" style="cursor:pointer; color:red;" onclick="DB.excluir(${item.id})"></i></td>
            </tr>`;
        });
    }
};

const RelatoriosModule = {
    atualizar: () => {
        document.getElementById('dashMarcados').innerText = DADOS_CACHE.filter(i => i.status === 'agendado').length;
        document.getElementById('dashConcluidos').innerText = DADOS_CACHE.filter(i => i.status === 'concluido').length;
        document.getElementById('dashFaltosos').innerText = DADOS_CACHE.filter(i => i.status === 'faltoso').length;
        document.getElementById('dashEspera').innerText = DADOS_CACHE.filter(i => i.status === 'espera').length;
    }
};

// --- UTILITÁRIOS ---
const Router = {
    navigate: (page) => {
        if(page === 'logout') { Auth.logout(); return; }
        
        document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
        document.getElementById(page).classList.add('active');
        
        // Renderiza o módulo específico ao abrir
        if(page === 'acompanhamento') AcompanhamentoModule.render();
        if(page === 'concluidos') ConcluidosModule.render();
        if(page === 'faltosos') FaltososModule.render();
        if(page === 'espera') EsperaModule.render();
        if(page === 'relatorios') RelatoriosModule.atualizar();
    },
    refresh: () => {
        // Recarrega a página atual
        const ativa = document.querySelector('.module.active').id;
        Router.navigate(ativa);
        RelatoriosModule.atualizar();
    }
};

function formatData(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// INICIALIZAÇÃO
document.getElementById('formCadastro').addEventListener('submit', CadastroModule.salvar);
window.onload = () => {
    Auth.init();
};

/*************************************************
 * SISTEMA DE GESTÃO DE SAÚDE - CLOUD VERSION (SUPABASE)
 * Com padrão Adapter para manter compatibilidade com o código legado.
 */

// --- VARIÁVEL DE CONTROLE DE FLUXO ---
// Verifica se há um token na URL (Link Mágico ou Convite)
// Fazemos isso logo no início porque a biblioteca do Supabase limpa o hash da URL rapidamente.
const IS_INVITE_LINK = window.location.hash.includes('access_token=') && 
                       (window.location.hash.includes('type=invite') || window.location.hash.includes('type=recovery'));

const veioPorLinkAuth = () => {
    return window.location.hash.includes('access_token=');
};

// --- CONFIGURAÇÃO SUPABASE ---
// Substitua pelas suas chaves do projeto Supabase
const SUPABASE_URL = "https://zzvzxvejoargfqrlmxfq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6dnp4dmVqb2FyZ2ZxcmxteGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTU5ODIsImV4cCI6MjA4NDU5MTk4Mn0._ew5X-XraLq1PxHIn413KrwdcwTMSMg1pOSvm0gaZ4o";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variável de controle para saber se estamos em modo de recuperação/convite
let isRecoveryMode = false;

// --- 2. GESTÃO DE AUTENTICAÇÃO E INICIALIZAÇÃO (CORRIGIDO) ---

// Função única para preparar o sistema quando o usuário é detectado
async function prepararAmbiente(user) {
    console.log("🔓 Usuário detectado:", user.email);
    Auth.user = user;

    // 1. UI: Ajusta visibilidade das telas
    const loginOverlay = document.getElementById('loginOverlay');
    const modalSenha = document.getElementById('modalCriarSenha');
    
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (modalSenha) modalSenha.classList.add('hidden');

    // 2. UI: Garante que o botão de sair exista
    // Pequeno delay para garantir que a Sidebar já existe no DOM
    setTimeout(() => {
        Auth.renderLogoutButton();
    }, 100);

    // 3. DADOS: Inicializa o banco de dados
    try {
        console.log("🔄 Buscando dados do Supabase...");
        await DB.init(); // Isso já preenche a tabela e atualiza a tela
        console.log("✅ Dados carregados com sucesso.");
    } catch (error) {
        console.error("❌ Erro ao carregar dados:", error);
        alert("Erro de conexão. Verifique sua internet.");
    }

    // 4. SYNC: Liga o Realtime
    ativarSincronizacao();
}

// Inicialização Principal - Roda quando a página carrega
document.addEventListener('DOMContentLoaded', async () => {
    
    // Verifica hash de recuperação de senha (URL)
    const hash = window.location.hash;
    if (hash && (hash.includes('type=recovery') || hash.includes('type=invite'))) {
        console.log("🔑 Modo de recuperação de senha detectado.");
        isRecoveryMode = true;
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('modalCriarSenha').classList.remove('hidden');
        return; // Para aqui e deixa o usuário definir a senha
    }

    // Verifica sessão existente (F5 ou nova aba)
    const { data: { session }, error } = await supabaseClient.auth.getSession();

    if (session) {
        // Se tem sessão, inicia direto
        await prepararAmbiente(session.user);
    } else {
        // Se não tem, garante que o login apareça
        console.log("🔒 Nenhuma sessão ativa. Aguardando login.");
        document.getElementById('loginOverlay').style.display = 'flex';
    }
});

// Listener apenas para Logout e Login manual (Evita conflito com o F5)
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log(`🔔 Evento Auth: ${event}`);

    if (event === 'SIGNED_IN' && session) {
        // Só roda se o sistema ainda NÃO estiver iniciado (evita rodar 2x no F5)
        if (!Auth.user) {
            await prepararAmbiente(session.user);
        }
    }
    
    if (event === 'SIGNED_OUT') {
        // Limpa tudo e recarrega a página para evitar cache sujo
        APP_CACHE = [];
        window.location.reload();
    }
    
    if (event === 'PASSWORD_RECOVERY') {
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('modalCriarSenha').classList.remove('hidden');
    }
});

// ============================================================
// 1. O INTERMEDIÁRIO (ADAPTER PATTERN)
// Converte os dados do Supabase (SQL/Snake_case) para o App (Objeto/CamelCase) e vice-versa.
// ============================================================
const DataMapper = {
    // Banco de Dados -> Aplicação
    toApp: (row) => {
        return {
            id: row.id, // UUID do Supabase
            status: row.status,
            justificativa: row.justificativa,
            statusJustificativa: row.status_justificativa,
            paciente: {
                nome: row.paciente_nome,
                nascimento: row.paciente_nascimento,
                endereco: row.paciente_endereco,
                contato: row.paciente_contato
            },
            procedimento: {
                nome: row.procedimento_nome,
                dataRecebimento: row.data_recebimento,
                dataSolicitacao: row.data_solicitacao,
                dataMarcacao: row.data_marcacao,
                tipo: row.tipo_marcacao,
                isRetorno: row.is_retorno
            }
        };
    },

    // Aplicação -> Banco de Dados
    toSQL: (appData, userId) => {
        return {
            // O ID não vai aqui no insert (gerado auto), mas vai no update
            user_id: userId, // Importante para RLS
            status: appData.status,
            justificativa: appData.justificativa || null,
            status_justificativa: appData.statusJustificativa || null,
            
            // Achatando objeto Paciente
            paciente_nome: appData.paciente.nome,
            paciente_nascimento: appData.paciente.nascimento,
            paciente_endereco: appData.paciente.endereco,
            paciente_contato: appData.paciente.contato,
            
            // Achatando objeto Procedimento
            procedimento_nome: appData.procedimento.nome,
            data_recebimento: appData.procedimento.dataRecebimento || null,
            data_solicitacao: appData.procedimento.dataSolicitacao || null,
            data_marcacao: appData.procedimento.dataMarcacao || null,
            tipo_marcacao: appData.procedimento.tipo,
            is_retorno: appData.procedimento.isRetorno
        };
    }
};

// ============================================================
// 2. MÓDULO DE AUTENTICAÇÃO
// ============================================================
const Auth = {
    user: null,
    
    // Init simplificado (o onAuthStateChange já cuida de tudo)
    init: async () => {
        // Apenas verifica se já existe sessão ao carregar a página
        const { data } = await supabaseClient.auth.getSession();
        if (!data.session) {
            // Se não tem sessão, garante que o login apareça (se não for recuperação)
            if (!window.location.hash.includes('type=')) {
                document.getElementById('loginOverlay').style.display = 'flex';
            }
        }
    },

    login: async () => {
        const email = document.getElementById('emailLogin').value;
        const password = document.getElementById('senhaLogin').value;
        const btn = document.getElementById('btnAuthMain');
        const msg = document.getElementById('msgLogin');

        btn.disabled = true;
        btn.innerText = 'Verificando...';
        msg.innerText = '';

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            msg.innerText = "Erro: " + error.message;
            btn.disabled = false;
            btn.innerText = 'Entrar';
        }
        // Se der sucesso, o onAuthStateChange 'SIGNED_IN' vai rodar automaticamente
    },

    // Função ajustada para abrir apenas se houver sessão (evita o erro "session missing")
    abrirCriarSenha: async () => {
        const { data } = await supabaseClient.auth.getSession();
        if (!data.session) {
            alert("Para criar uma senha, você precisa clicar no link enviado para o seu e-mail.");
            return;
        }
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('modalCriarSenha').classList.remove('hidden');
    },

    definirSenha: async () => {
        const senha = document.getElementById('novaSenha').value;
        const confirmar = document.getElementById('confirmarSenha').value;
        const msg = document.getElementById('msgSenha');
        const btn = document.querySelector('#modalCriarSenha button');

        msg.innerText = '';

        if (senha.length < 6) {
            msg.innerText = 'A senha deve ter no mínimo 6 caracteres';
            return;
        }

        if (senha !== confirmar) {
            msg.innerText = 'As senhas não coincidem';
            return;
        }

        // Verifica se existe sessão antes de tentar atualizar
        const sessionData = await supabaseClient.auth.getSession();
        if (!sessionData.data.session) {
            msg.innerText = "Sessão expirada. Clique no link do e-mail novamente.";
            return;
        }

        btn.innerText = "Salvando...";
        btn.disabled = true;

        const { error } = await supabaseClient.auth.updateUser({
            password: senha
        });

        if (error) {
            msg.innerText = "Erro: " + error.message;
            btn.innerText = "Salvar senha";
            btn.disabled = false;
        } else {
            alert('Senha criada com sucesso! Faça login com sua nova senha.');
            
            // FLUXO CRÍTICO: Logout forçado para validar o login manual
            await supabaseClient.auth.signOut();
            window.location.hash = ''; // Limpa URL
            window.location.reload();
        }
    },

    logout: async () => {
        await supabaseClient.auth.signOut();
    },

    renderLogoutButton: () => {
        const nav = document.querySelector('.sidebar ul');
        // Evita duplicar botão
        if (document.getElementById('btnLogoutSidebar')) return;

        const li = document.createElement('li');
        li.id = 'btnLogoutSidebar';
        li.innerHTML = '<i class="ph ph-sign-out"></i> Sair';
        li.onclick = Auth.logout;
        li.style.marginTop = 'auto';
        li.style.borderTop = '1px solid rgba(255,255,255,0.1)';
        nav.appendChild(li);
    }
};

// ============================================================
// 3. BANCO DE DADOS (Substitui LocalStorage)
// Mantém cache local para performance, mas sincroniza com nuvem.
// ============================================================
let APP_CACHE = []; // Armazena os dados convertidos para uso imediato do app

const DB = {
    init: async () => {
        await DB.sync();
        ProcedimentosDB.init(); // Inicia procedimentos baseados nos dados carregados
        Router.initModule('cadastro');
    },

    // Puxa tudo da nuvem e atualiza o cache
    sync: async () => {
        try {

          // LOG PARA DESCOBRIR O ERRO
            console.log("Iniciando sync...");
          
            const { data, error } = await supabaseClient
                .from('atendimentos')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error("ERRO CRÍTICO SUPABASE:", error); // Isso vai aparecer vermelho no console
                throw error;
            }

            console.log("Dados recebidos:", data); // Mostra o que veio

            if (!data || data.length === 0) {
                console.warn("Supabase retornou 0 dados. A tabela está vazia ou o nome está errado.");
            }

            // Converte SQL -> App usando o Intermediário
            APP_CACHE = data.map(row => DataMapper.toApp(row));
            
            StorageModule.atualizarGrafico(); // Atualiza contador
            return true;
        } catch (e) {
            console.error("Erro de sincronização:", e);
            alert("Erro ao sincronizar dados. Verifique sua conexão.");
            return false;
        }
    },

    // Retorna dados do Cache (Instantâneo para UI)
    getAll: () => {
        return APP_CACHE;
    },

    // Adiciona novo registro
    add: async (registroApp) => {
        // Converte App -> SQL
        const payload = DataMapper.toSQL(registroApp, Auth.user.id);
        
        const { data, error } = await supabaseClient
            .from('atendimentos')
            .insert([payload])
            .select(); // Retorna o dado inserido (importante para pegar o ID gerado)

        if (error) {
            alert('Erro ao salvar na nuvem: ' + error.message);
            return;
        }

        // Atualiza cache local com o dado real vindo do servidor
        const novoItem = DataMapper.toApp(data[0]);
        APP_CACHE.unshift(novoItem); // Adiciona no topo
        StorageModule.atualizarGrafico();
    },

    // Atualiza registro existente
    update: async (id, novosDadosApp) => {
        // Encontra o antigo para mesclar (merge) dados parciais
        const index = APP_CACHE.findIndex(i => i.id === id);
        if (index === -1) return;

        const itemAtual = APP_CACHE[index];
        
        // Mesclagem profunda manual simplificada
        const itemMesclado = {
            ...itemAtual,
            ...novosDadosApp,
            paciente: { ...itemAtual.paciente, ...(novosDadosApp.paciente || {}) },
            procedimento: { ...itemAtual.procedimento, ...(novosDadosApp.procedimento || {}) }
        };

        // Prepara payload
        const payload = DataMapper.toSQL(itemMesclado, Auth.user.id);
        
        const { error } = await supabaseClient
            .from('atendimentos')
            .update(payload)
            .eq('id', id);

        if (error) {
            alert("Erro ao atualizar: " + error.message);
        } else {
            // Atualiza cache local
            APP_CACHE[index] = itemMesclado;
            Router.refreshCurrent();
        }
    },

    // Remove registro
    delete: async (id) => {
        if (confirm("Tem certeza que deseja apagar permanentemente da nuvem?")) {
            const { error } = await supabaseClient
                .from('atendimentos')
                .delete()
                .eq('id', id);

            if (error) {
                alert("Erro ao deletar: " + error.message);
            } else {
                APP_CACHE = APP_CACHE.filter(item => item.id !== id);
                Router.refreshCurrent();
                StorageModule.atualizarGrafico();
            }
        }
    },

    clear: async () => {
        if(confirm("PERIGO: Isso apagará TODOS os seus dados do servidor. Continuar?")){
            const { error } = await supabaseClient
                .from('atendimentos')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all trick

            if(!error) {
                APP_CACHE = [];
                Router.refreshCurrent();
                StorageModule.atualizarGrafico();
            }
        }
    }
};

// ============================================================
// 4. MÓDULOS DO SISTEMA (ADAPTADOS ONDE NECESSÁRIO)
// ============================================================

// LISTA PADRÃO INICIAL
const PROCEDIMENTOS_PADRAO = [
    "EXAMES LABORATORIAIS", "GASTROLOGISTA", "CARDIOLOGISTA", "ENDOCRINOLOGISTA", 
    "CIRURGIA", "ONCOLOGIA", "PROCTOLOGISTA", "ALTO RISCO", "UROLOGIA", 
    "NEFROLOGISTA", "DERMATOLOGIA", "MASTOLOGISTA", "NEUROLOGISTA", "GINECOLOGISTA", 
    "INFECTOLOGISTA", "ALERGISTA", "PNEUMOLOGISTA", "REUMATOLOGISTA", "OFTALMOLOGISTA", 
    "ANGIOLOGISTA VASCULAR", "MAMOGRAFIA", "PEQUENAS CIRURGIAS", "GENÉTICA", 
    "ORTOPEDISTA", "OTORRINOLARINGOLOGISTA", "GERIATRIA", "HEMATOLOGISTA", 
    "DENSITOMETRIA", "TOMOGRAFIA", "ULTRASSOM", "ECOCARDIOGRAMA", "ESPIROMETRIA", 
    "RESSONANCIA", "APLICAÇÃO DE LUCENTIS", "ELETROENCELOGRAMA", "CINTILOGRAFIA", 
    "ENDOSCOPIA", "ESTUDO URODINAMICO", "COLONOSCOPIA"
];

// Gerenciador de Procedimentos Dinâmicos
// Agora ele extrai os procedimentos direto do Cache do Banco de Dados
const ProcedimentosDB = {
    listaCache: [...PROCEDIMENTOS_PADRAO],

    init: () => {
        // Pega todos os nomes usados no banco
        const usadosBanco = DB.getAll().map(i => i.procedimento.nome);
        // Junta com o padrão e remove duplicatas
        const unicos = [...new Set([...PROCEDIMENTOS_PADRAO, ...usadosBanco])];
        ProcedimentosDB.listaCache = unicos.sort();
        ProcedimentosDB.renderSelects();
    },

    getAll: () => ProcedimentosDB.listaCache,

    add: (nome) => {
        if(!nome) return false;
        const upper = nome.toUpperCase().trim();
        if(!ProcedimentosDB.listaCache.includes(upper)){
            ProcedimentosDB.listaCache.push(upper);
            ProcedimentosDB.listaCache.sort();
            return true;
        }
        return false;
    },

    adicionarNovoViaInterface: () => {
        const novo = prompt("Digite o nome do novo procedimento:");
        if(novo) {
            const upper = novo.toUpperCase().trim();
            ProcedimentosDB.add(upper);
            ProcedimentosDB.renderSelects();
            // Seleciona o novo
            setTimeout(() => {
                const selects = document.querySelectorAll('#procedimento');
                selects.forEach(s => s.value = upper);
            }, 100);
        }
    },

    renderSelects: () => {
        const lista = ProcedimentosDB.getAll();
        const selects = document.querySelectorAll('select#procedimento, .select-filtro-proc');
        
        selects.forEach(sel => {
            const valorAtual = sel.value;
            sel.innerHTML = '<option value="">' + (sel.id === 'procedimento' ? 'Selecione...' : 'Todos') + '</option>';
            lista.forEach(proc => {
                const opt = document.createElement('option');
                opt.value = proc;
                opt.innerText = proc;
                sel.appendChild(opt);
            });
            if(valorAtual && lista.includes(valorAtual)) sel.value = valorAtual;
        });
    }
};

// Utils (Utilitários) - Mantido igual, apenas ajuste no verDetalhes
const Utils = {
    // Removemos UUID generator daqui, pois o Supabase gera IDs
    formatDate: (dateString) => {
        if (!dateString) return '-';
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    },
    diffDays: (d1, d2) => {
        if(!d1) return 0;
        const date1 = new Date(d1);
        const date2 = d2 ? new Date(d2) : new Date();
        const diffTime = Math.abs(date2 - date1);
        return Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    },
    getRandomColor: () => {
        const colors = ['#0056b3', '#2e7d32', '#d32f2f', '#ed6c02', '#9c27b0', '#0097a7', '#455a64', '#795548'];
        return colors[Math.floor(Math.random() * colors.length)];
    },
    verDetalhes: (id) => {
        const dados = DB.getAll();
        const item = dados.find(i => i.id === id);
        if (!item) return;
        const content = document.getElementById('detalhesConteudo');
        content.innerHTML = `
            <p><strong>Nome:</strong> ${item.paciente.nome}</p>
            <p><strong>Nascimento:</strong> ${Utils.formatDate(item.paciente.nascimento)}</p>
            <p><strong>Endereço:</strong> ${item.paciente.endereco}</p>
            <p><strong>Contato:</strong> ${item.paciente.contato}</p>
            <hr style="margin: 10px 0; border: 0; border-top: 1px solid #eee;">
            <p><strong>Procedimento:</strong> ${item.procedimento.nome}</p>
            <p><strong>Tipo:</strong> ${item.procedimento.tipo}</p>
            <p><strong>É Retorno:</strong> ${item.procedimento.isRetorno ? 'Sim' : 'Não'}</p>
            <p><strong>Data Solicitação:</strong> ${Utils.formatDate(item.procedimento.dataSolicitacao)}</p>
            <p><strong>Marcado Para:</strong> ${Utils.formatDate(item.procedimento.dataProcedimento || item.procedimento.dataMarcacao)}</p>
            ${item.justificativa ? `<p style="color:red"><strong>Justificativa:</strong> ${item.justificativa}</p>` : ''}
            <p style="font-size:0.8em; color:#999; margin-top:10px;">ID Sistema: ${item.id}</p>
        `;
        document.getElementById('modalDetalhes').classList.remove('hidden');
    },
    fecharModalDetalhes: () => {
        document.getElementById('modalDetalhes').classList.add('hidden');
    }
};

// Router - Ligeiramente ajustado
const Router = {
    currentPage: 'cadastro',
    navigate: (pageId) => {
        document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
        // Seleção mais robusta para evitar erro se não encontrar
        const menuItem = document.querySelector(`.sidebar li[onclick*="${pageId}"]`);
        if(menuItem) menuItem.classList.add('active');

        document.querySelectorAll('.module').forEach(sec => sec.classList.remove('active'));
        const target = document.getElementById(pageId);
        if(target) target.classList.add('active');
        
        Router.currentPage = pageId;
        Router.initModule(pageId);
    },
    initModule: (pageId) => {
        ProcedimentosDB.renderSelects(); 
        switch(pageId) {
            case 'cadastro': CadastroModule.init(); break;
            case 'acompanhamento': AcompanhamentoModule.render(); break;
            case 'concluidos': ConcluidosModule.render(); break;
            case 'faltosos': FaltososModule.render(); break;
            case 'espera': EsperaModule.render(); break;
            case 'relatorios': RelatoriosModule.init(); break;
            case 'armazenamento': StorageModule.init(); break;
        }
    },
    refreshCurrent: () => {
        Router.initModule(Router.currentPage);
    }
};

// --- MÓDULOS DE UI (Lógica de interface mantida, chamando o novo DB) ---

const CadastroModule = {
    init: () => {
        document.getElementById('dataRecebimento').valueAsDate = new Date();
    },
    buscarPaciente: (termo) => {
        const lista = document.getElementById('sugestoesPaciente');
        lista.innerHTML = '';
        if (termo.length < 3) return;
        const todos = DB.getAll();
        
        // Map para remover duplicatas
        const unicos = new Map();
        todos.forEach(reg => unicos.set(reg.paciente.nome, reg.paciente));

        unicos.forEach((paciente, nome) => {
            if (nome.toLowerCase().includes(termo.toLowerCase())) {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerText = nome;
                div.onclick = () => CadastroModule.preencherPaciente(paciente);
                lista.appendChild(div);
            }
        });
    },
    preencherPaciente: (paciente) => {
        document.getElementById('nomePaciente').value = paciente.nome;
        document.getElementById('dataNascimento').value = paciente.nascimento;
        document.getElementById('endereco').value = paciente.endereco;
        document.getElementById('contato').value = paciente.contato;
        document.getElementById('sugestoesPaciente').innerHTML = '';
    },
    limparFormulario: () => {
        document.getElementById('formCadastro').reset();
        document.getElementById('editId').value = '';
        document.getElementById('dataRecebimento').valueAsDate = new Date();
    },
    salvar: async (e) => {
        e.preventDefault();
        const idEdicao = document.getElementById('editId').value;
        const dataMarcacao = document.getElementById('dataMarcacao').value; // O dia que marcou
        
        // NOVA LÓGICA DE STATUS:
        let status = 'espera'; // Padrão é espera
        
        // Se já tem uma data de marcação registrada, ele pula para acompanhamento (agendado)
        if (dataMarcacao) {
            status = 'agendado';
        }
        
        const registro = {
            status: status,
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
                tipo: document.getElementById('tipoMarcacao').value,
                isRetorno: document.getElementById('isRetorno').checked
            }
        };

        const btn = e.target.querySelector('button[type="submit"]');
        const txtOriginal = btn.innerText;
        btn.innerText = "Salvando...";
        btn.disabled = true;

        try {
            if (idEdicao) {
                await DB.update(idEdicao, registro);
                alert('Atualizado com sucesso!');
            } else {
                await DB.add(registro);
                alert("Agendado com sucesso!");
            }
            CadastroModule.limparFormulario();
        } catch (err) {
            console.error(err);
        } finally {
            btn.innerText = txtOriginal;
            btn.disabled = false;
        }
    }
};
document.getElementById('formCadastro').addEventListener('submit', CadastroModule.salvar);

const AcompanhamentoModule = {
    tempId: null,
    render: (filtros = {}) => {
        const tbody = document.getElementById('tabelaAcompanhamento');
        tbody.innerHTML = '';
        
        let dados = DB.getAll().filter(i => i.status === 'agendado');
        
        if(filtros.inicio) dados = dados.filter(i => i.procedimento.dataProcedimento >= filtros.inicio);
        if(filtros.fim) dados = dados.filter(i => i.procedimento.dataProcedimento <= filtros.fim);
        if(filtros.tipo) dados = dados.filter(i => i.procedimento.tipo === filtros.tipo);
        if(filtros.retorno) dados = dados.filter(i => i.procedimento.isRetorno);
        if(filtros.procedimento) dados = dados.filter(i => i.procedimento.nome === filtros.procedimento);

        dados.sort((a, b) => new Date(a.procedimento.dataProcedimento) - new Date(b.procedimento.dataProcedimento));

        dados.forEach(item => {
            const diasEspera = Utils.diffDays(item.procedimento.dataRecebimento, item.procedimento.dataMarcacao || new Date());
            const dataExibicao = item.procedimento.dataProcedimento || item.procedimento.dataMarcacao;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.paciente.nome} ${item.procedimento.isRetorno ? '<b>(R)</b>' : ''}</td>
                <td>${item.procedimento.nome}</td>
                <td><strong>${Utils.formatDate(dataExibicao)}</strong></td> <td>${diasEspera} dias</td>
                <td>
                    <button class="btn-danger" style="padding: 5px 10px; font-size: 0.8em;" onclick="AcompanhamentoModule.abrirModalFalta('${item.id}')">Não</button>
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 0.8em;" onclick="AcompanhamentoModule.marcarCompareceu('${item.id}')">Sim</button>
                    <i class="ph ph-magnifying-glass icon-btn" onclick="Utils.verDetalhes('${item.id}')"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    aplicarFiltros: () => {
        const filtros = {
            inicio: document.getElementById('filtroAcompInicio').value,
            fim: document.getElementById('filtroAcompFim').value,
            tipo: document.getElementById('filtroAcompTipo').value,
            retorno: document.getElementById('filtroRetornoAcomp').checked,
            procedimento: document.getElementById('filtroAcompProcedimento').value
        };
        AcompanhamentoModule.render(filtros);
    },
    marcarCompareceu: async (id) => {
        await DB.update(id, { status: 'concluido' });
    },
    abrirModalFalta: (id) => {
        AcompanhamentoModule.tempId = id;
        document.getElementById('textoJustificativa').value = '';
        document.getElementById('modalJustificativa').classList.remove('hidden');
    },
    fecharModal: () => {
        document.getElementById('modalJustificativa').classList.add('hidden');
        AcompanhamentoModule.tempId = null;
    },
    confirmarFalta: async (comJustificativa) => {
        const justificativa = comJustificativa ? document.getElementById('textoJustificativa').value : "Não justificado";
        await DB.update(AcompanhamentoModule.tempId, {
            status: 'faltoso',
            justificativa: justificativa,
            statusJustificativa: comJustificativa ? 'Justificado' : 'Não Justificado'
        });
        AcompanhamentoModule.fecharModal();
    }
};

const ConcluidosModule = {
    render: (filtros = {}) => {
        const tbody = document.getElementById('tabelaConcluidos');
        tbody.innerHTML = '';
        let dados = DB.getAll().filter(i => i.status === 'concluido');

        if(filtros.inicio) dados = dados.filter(i => (i.procedimento.dataProcedimento || i.procedimento.dataMarcacao) >= filtros.inicio);
        if(filtros.fim) dados = dados.filter(i => (i.procedimento.dataProcedimento || i.procedimento.dataMarcacao) <= filtros.fim);
        if(filtros.tipo) dados = dados.filter(i => i.procedimento.tipo === filtros.tipo);
        if(filtros.retorno) dados = dados.filter(i => i.procedimento.isRetorno);
        if(filtros.procedimento) dados = dados.filter(i => i.procedimento.nome === filtros.procedimento);

        dados.forEach(item => {
            const dataExibicao = item.procedimento.dataProcedimento || item.procedimento.dataMarcacao;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.paciente.nome} ${item.procedimento.isRetorno ? '<b>(R)</b>' : ''} </td>
                <td>${item.procedimento.nome}</td>
                <td>${Utils.formatDate(dataExibicao)}</td>
                <td>
                    <i class="ph ph-magnifying-glass icon-btn" onclick="Utils.verDetalhes('${item.id}')"></i>
                    <i class="ph ph-trash icon-btn delete" onclick="DB.delete('${item.id}')"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    aplicarFiltros: () => {
        const filtros = {
            inicio: document.getElementById('filtroDataConcluidoInicio').value,
            fim: document.getElementById('filtroDataConcluidoFim').value,
            tipo: document.getElementById('filtroTipoConcluido').value,
            retorno: document.getElementById('filtroRetornoConcluido').checked,
            procedimento: document.getElementById('filtroConcluidoProcedimento').value
        };
        ConcluidosModule.render(filtros);
    }
};

const FaltososModule = {
    render: (filtros = {}) => {
        const tbody = document.getElementById('tabelaFaltosos');
        tbody.innerHTML = '';
        let dados = DB.getAll().filter(i => i.status === 'faltoso');

        if(filtros.inicio) dados = dados.filter(i => (i.procedimento.dataProcedimento || i.procedimento.dataMarcacao) >= filtros.inicio);
        if(filtros.fim) dados = dados.filter(i => (i.procedimento.dataProcedimento || i.procedimento.dataMarcacao) <= filtros.fim);
        if(filtros.tipo) dados = dados.filter(i => i.procedimento.tipo === filtros.tipo);
        if(filtros.retorno) dados = dados.filter(i => i.procedimento.isRetorno);
        if(filtros.procedimento) dados = dados.filter(i => i.procedimento.nome === filtros.procedimento);
        
        dados.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.paciente.nome} ${item.procedimento.isRetorno ? '<b>(R)</b>' : ''}</td>
                <td>${item.statusJustificativa}</td>
                <td><span style="color:red">Faltoso</span></td>
                <td>
                    <i class="ph ph-magnifying-glass icon-btn" onclick="Utils.verDetalhes('${item.id}')"></i>
                    <i class="ph ph-trash icon-btn delete" onclick="DB.delete('${item.id}')"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    aplicarFiltros: () => {
        const filtros = {
            inicio: document.getElementById('filtroDataFaltosoInicio').value,
            fim: document.getElementById('filtroDataFaltosoFim').value,
            tipo: document.getElementById('filtroTipoFaltoso').value,
            retorno: document.getElementById('filtroRetornoFaltoso').checked,
            procedimento: document.getElementById('filtroFaltosoProcedimento').value
        };
        FaltososModule.render(filtros);
    }
};

const EsperaModule = {
    render: (filtros = {}) => {
        const tbody = document.getElementById('tabelaEspera');
        const alertaContainer = document.getElementById('alertaEspera');
        tbody.innerHTML = '';
        
        let dados = DB.getAll().filter(i => i.status === 'espera');
        let nomesAtrasados = [];

        if(filtros.inicio) dados = dados.filter(i => i.procedimento.dataRecebimento >= filtros.inicio);
        if(filtros.fim) dados = dados.filter(i => i.procedimento.dataRecebimento <= filtros.fim);
        if(filtros.tipo) dados = dados.filter(i => i.procedimento.tipo === filtros.tipo);
        if(filtros.retorno) dados = dados.filter(i => i.procedimento.isRetorno);
        if(filtros.procedimento) dados = dados.filter(i => i.procedimento.nome === filtros.procedimento);

        dados.forEach(item => {
            const diasPassados = Utils.diffDays(item.procedimento.dataRecebimento, null);
            if (diasPassados >= 90) { nomesAtrasados.push(item.paciente.nome); }

            const tr = document.createElement('tr');
            if(diasPassados >= 90) tr.style.backgroundColor = '#fff3e0';

            tr.innerHTML = `
                <td>${item.paciente.nome} ${item.procedimento.isRetorno ? '<b>(R)</b>' : ''}</td>
                <td>${item.procedimento.nome}</td>
                <td>${!item.procedimento.dataSolicitacao ? 'Solicitação' : 'Marcação'}</td>
                <td style="${diasPassados >= 90 ? 'color:red; font-weight:bold' : ''}">${diasPassados} dias</td>
                <td>
                    <i class="ph ph-magnifying-glass icon-btn" onclick="Utils.verDetalhes('${item.id}')"></i>
                    <i class="ph ph-pencil-simple icon-btn" onclick="EsperaModule.editar('${item.id}')"></i>
                    <i class="ph ph-trash icon-btn delete" onclick="DB.delete('${item.id}')"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (nomesAtrasados.length > 0) {
            alertaContainer.innerHTML = `
                <div class="alert-box danger">
                    <i class="ph ph-warning"></i>
                    <span><strong>ATENÇÃO (90+ dias):</strong> ${nomesAtrasados.join(', ')}</span>
                </div>`;
        } else {
            alertaContainer.innerHTML = `
                <div class="alert-box success">
                    <i class="ph ph-check-circle"></i>
                    <span>Sem atrasos de 90 dias.</span>
                </div>`;
        }
    },
    aplicarFiltros: () => {
        const filtros = {
            inicio: document.getElementById('filtroEsperaInicio').value,
            fim: document.getElementById('filtroEsperaFim').value,
            tipo: document.getElementById('filtroEsperaTipo').value,
            retorno: document.getElementById('filtroRetornoEspera').checked,
            procedimento: document.getElementById('filtroEsperaProcedimento').value
        };
        EsperaModule.render(filtros);
    },
    editar: (id) => {
        const item = DB.getAll().find(i => i.id === id);
        if(!item) return;
        Router.navigate('cadastro');
        document.getElementById('editId').value = item.id;
        document.getElementById('nomePaciente').value = item.paciente.nome;
        document.getElementById('dataNascimento').value = item.paciente.nascimento;
        document.getElementById('endereco').value = item.paciente.endereco;
        document.getElementById('contato').value = item.paciente.contato;
        document.getElementById('procedimento').value = item.procedimento.nome;
        document.getElementById('dataRecebimento').value = item.procedimento.dataRecebimento;
        document.getElementById('dataSolicitacao').value = item.procedimento.dataSolicitacao;
        document.getElementById('dataMarcacao').value = item.procedimento.dataMarcacao;
        document.getElementById('dataProcedimento').value = item.procedimento.dataProcedimento || '';
        document.getElementById('tipoMarcacao').value = item.procedimento.tipo;
        document.getElementById('isRetorno').checked = item.procedimento.isRetorno;
    }
};

const RelatoriosModule = {
    dadosConcluidosCache: [],
    init: () => {
        RelatoriosModule.atualizarTudo();
    },
    atualizarTudo: () => {
        const inicio = document.getElementById('filtroRelatorioInicio').value;
        const fim = document.getElementById('filtroRelatorioFim').value;
        
        let dados = DB.getAll();

        if(inicio || fim) {
            dados = dados.filter(i => {
                const dataRef = i.procedimento.dataProcedimento || i.procedimento.dataMarcacao || i.procedimento.dataRecebimento;
                if(!dataRef) return true;
                if(inicio && dataRef < inicio) return false;
                if(fim && dataRef > fim) return false;
                return true;
            });
        }

        const marcados = dados.filter(i => i.status === 'agendado').length;
        const concluidos = dados.filter(i => i.status === 'concluido');
        const faltosos = dados.filter(i => i.status === 'faltoso').length;
        const espera = dados.filter(i => i.status === 'espera').length;
        
        const solicitacoesAbertas = dados.filter(i => {
            const isEspera = i.status === 'espera';
            const faltaSolicitacao = !i.procedimento.dataSolicitacao;
            const isActive = i.status !== 'concluido' && i.status !== 'faltoso'; 
            return (isEspera || (isActive && faltaSolicitacao));
        }).length;

        document.getElementById('dashMarcados').innerText = marcados;
        document.getElementById('dashConcluidos').innerText = concluidos.length;
        document.getElementById('dashFaltosos').innerText = faltosos;
        document.getElementById('dashEspera').innerText = espera;
        document.getElementById('dashSolicitacoes').innerText = solicitacoesAbertas;

        const counts = {};
        concluidos.forEach(item => {
            const nome = item.procedimento.nome;
            if(!counts[nome]) counts[nome] = 0;
            counts[nome]++;
        });

        const containerCards = document.getElementById('gridProcedimentosConcluidos');
        containerCards.innerHTML = '';
        
        Object.keys(counts).forEach((procNome, index) => {
            const qtd = counts[procNome];
            const div = document.createElement('div');
            div.className = 'proc-card';
            div.style.backgroundColor = Utils.getRandomColor();
            
            div.innerHTML = `
                <div>
                    <h4>${procNome}</h4>
                    <span>${qtd}</span>
                </div>
                <div class="proc-card-icon" onclick="RelatoriosModule.abrirListaDetalhada('${procNome}')" title="Ver Lista">
                     <i class="ph ph-magnifying-glass" style="color:white; font-size:1.2rem;"></i>
                </div>
            `;
            containerCards.appendChild(div);
        });

        RelatoriosModule.dadosConcluidosCache = concluidos;
        document.getElementById('containerHistorico').style.display = 'none';
        document.getElementById('buscaHistorico').value = '';
    },
    abrirListaDetalhada: (nomeProcedimento) => {
        const modal = document.getElementById('modalListaProcedimento');
        document.getElementById('tituloModalLista').innerText = nomeProcedimento;
        const tbody = document.getElementById('tabelaListaProcedimento');
        tbody.innerHTML = '';

        const filtrados = RelatoriosModule.dadosConcluidosCache.filter(i => i.procedimento.nome === nomeProcedimento);
        
        filtrados.forEach(item => {
            const data = item.procedimento.dataProcedimento || item.procedimento.dataMarcacao;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${Utils.formatDate(data)}</td><td>${item.paciente.nome}</td>`;
            tbody.appendChild(tr);
        });

        modal.classList.remove('hidden');
    },
    baixarPDF: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Exemplo básico mantido
        doc.text("Relatório de Gestão de Saúde", 10, 10);
        doc.text("Gerado via Web (Supabase Cloud)", 10, 20);
        
        // ... Logica de tabela mantida igual
        doc.save(`relatorio_saude.pdf`);
    },
    buscarPaciente: (termo) => {
        const lista = document.getElementById('sugestoesHistorico');
        lista.innerHTML = '';
        if (termo.length < 3) return;
        
        const todos = DB.getAll();
        const unicos = new Map();
        todos.forEach(reg => unicos.set(reg.paciente.nome, reg.paciente));

        unicos.forEach((paciente, nome) => {
            if (nome.toLowerCase().includes(termo.toLowerCase())) {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerText = nome;
                div.onclick = () => RelatoriosModule.exibirHistorico(nome);
                lista.appendChild(div);
            }
        });
    },
    exibirHistorico: (nomePaciente) => {
        document.getElementById('sugestoesHistorico').innerHTML = '';
        document.getElementById('buscaHistorico').value = nomePaciente;
        document.getElementById('containerHistorico').style.display = 'block';
        document.getElementById('nomePacienteHistorico').innerText = nomePaciente;

        const tbody = document.getElementById('tabelaHistorico');
        tbody.innerHTML = '';

        const historico = DB.getAll().filter(i => i.paciente.nome === nomePaciente);
        // ... (filtro de data igual)

        historico.forEach(item => {
            const dataRef = item.procedimento.dataProcedimento || item.procedimento.dataMarcacao || item.procedimento.dataRecebimento;
            const tr = document.createElement('tr');
            
            let statusLabel = item.status;
            if(item.status === 'agendado') statusLabel = '<span style="color:var(--primary)">Marcado</span>';
            if(item.status === 'concluido') statusLabel = '<span style="color:var(--success)">Concluído</span>';
            if(item.status === 'faltoso') statusLabel = '<span style="color:var(--danger)">Faltou</span>';
            if(item.status === 'espera') statusLabel = '<span style="color:var(--warning)">Lista de Espera</span>';

            tr.innerHTML = `
                <td>${Utils.formatDate(dataRef)} ${item.procedimento.isRetorno ? '<b>(R)</b>' : ''}</td>
                <td>${item.procedimento.nome}</td>
                <td>${item.procedimento.tipo}</td>
                <td>${statusLabel}</td>
                <td><i class="ph ph-magnifying-glass icon-btn" onclick="Utils.verDetalhes('${item.id}')"></i></td>
            `;
            tbody.appendChild(tr);
        });
    }
};

const StorageModule = {
    init: () => { StorageModule.atualizarGrafico(); },
    atualizarGrafico: () => {
        // Agora mostra contagem de registros carregados na memória
        const qtd = DB.getAll().length;
        document.getElementById('storagePercent').innerText = `${qtd} Reg.`;
        // Gráfico meramente visual agora
        const chart = document.getElementById('storageChart');
        chart.style.background = `conic-gradient(var(--primary) 100%, var(--secondary) 0)`;
        
        // Atualiza texto
        const info = document.querySelector('.storage-info p');
        if(info) info.innerText = "Os dados estão salvos no Supabase (Nuvem).";
    },
    baixarCSV: () => {
        const dados = DB.getAll();
        if (dados.length === 0) { alert("Sem dados."); return; }
        
        let csv = "ID;Status;Nome;Nascimento;Endereco;Contato;Procedimento;DataRec;DataSol;DataMarc;Tipo;Retorno;Justificativa;DataProcedimento\n";
        
        dados.forEach(i => {
            const linha = [
                i.id,
                i.status,
                i.paciente.nome,
                i.paciente.nascimento,
                i.paciente.endereco.replace(/;/g, ","),
                i.paciente.contato,
                i.procedimento.nome,
                i.procedimento.dataRecebimento,
                i.procedimento.dataSolicitacao,
                i.procedimento.dataMarcacao,
                i.procedimento.tipo,
                i.procedimento.isRetorno,
                i.justificativa || '',
            ];
            csv += linha.join(";") + "\n";
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "backup_saude_nuvem.csv";
        link.click();
    },
    // Importação via CSV pode ser perigosa em massa na nuvem, 
    // mas se quiser manter, precisaria adaptar para chamar DB.add num loop
    importarCSV: async (input) => {
        if(!confirm("Atenção: Isso irá inserir todos os dados do CSV no banco de dados da nuvem. Pode demorar. Continuar?")) return;
        
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(e) {
            const text = e.target.result;
            const lines = text.split("\n");
            
            let count = 0;
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i].trim();
                if (!row) continue;
                
                const cols = row.split(";");
                if (cols.length < 5) continue;

                const registro = {
                    status: cols[1],
                    paciente: {
                        nome: cols[2],
                        nascimento: cols[3],
                        endereco: cols[4],
                        contato: cols[5]
                    },
                    procedimento: {
                        nome: cols[6],
                        dataRecebimento: cols[7],
                        dataSolicitacao: cols[8],
                        dataMarcacao: cols[9],
                        tipo: cols[10],
                        isRetorno: cols[11] === 'true',
                    },
                    justificativa: cols[12]
                };
                
                // Salva um por um na nuvem
                await DB.add(registro);
                count++;
            }
            alert(`Importação finalizada. ${count} registros inseridos.`);
        };
        reader.readAsText(file);
        input.value = '';
    },
    limparTudo: () => DB.clear()
};

// ============================================================
// INICIALIZAÇÃO
// ============================================================
window.onload = () => {
    // Configura botões de Login
    document.getElementById('btnAuthMain').addEventListener('click', Auth.login);

  ProcedimentosDB.renderSelects();
    // Inicia verificação de Auth
    Auth.init();
};

// --- SINCRONIZAÇÃO EM TEMPO REAL ---
// Esta função monitora o banco e atualiza a tela automaticamente para todos os usuários
const ativarSincronizacao = () => {
    // Criamos um canal único para a tabela 'atendimentos'
    const channel = supabaseClient.channel('db-atendimentos');

    channel
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'atendimentos' }, 
            async (payload) => {
                console.log("Mudança detectada em atendimentos!", payload);
                await DB.init(); // Recarrega os dados e atualiza a tela
            }
        )
        .subscribe((status) => {
            console.log("Status da Sincronização:", status);
            if (status === 'CHANNEL_ERROR') {
                console.error("Erro: Verifique se o Realtime está ativo no SQL Editor do Supabase.");
            }
        });
};

// Função para o botão manual de atualizar
window.ForcarSincronizacao = async () => {
    const btn = document.querySelector('button[onclick="ForcarSincronizacao()"]');
    if(btn) btn.innerText = "Carregando...";
    
    console.log("Tentando puxar dados do Supabase...");
    const sucesso = await DB.sync();
    
    if(btn) btn.innerText = "🔄 Atualizar Dados";
    
    if (sucesso) {
        alert("Dados atualizados com sucesso da nuvem!");
        Router.refreshCurrent(); // Atualiza a tela atual
    } else {
        alert("Falha ao puxar dados. Veja o Console (F12) para o erro vermelho.");
    }
};





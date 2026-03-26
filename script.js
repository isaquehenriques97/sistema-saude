/*************************************************
 * SISTEMA ISAÚDE - SECRETARIA DE SAÚDE DE BARRA DE SÃO MIGUEL
 * Versão melhorada com PDF, filtros mensais, série histórica,
 * alerta expansível, painel Supabase e contagem de registros.
 *************************************************/

// ============================================================
// THEME MANAGER — Claro / Escuro
// ============================================================
const ThemeManager = {
    init: () => {
        const saved = localStorage.getItem('theme');
        if (saved === 'dark') {
            document.body.classList.add('dark-mode');
            const toggle = document.getElementById('darkModeToggle');
            if (toggle) toggle.checked = true;
        }
    },
    toggle: (isDark) => {
        if (isDark) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }
    }
};

const IS_INVITE_LINK = window.location.hash.includes('access_token=') &&
    (window.location.hash.includes('type=invite') || window.location.hash.includes('type=recovery'));

const veioPorLinkAuth = () => window.location.hash.includes('access_token=');

// --- CONFIGURAÇÃO SUPABASE ---
let SUPABASE_URL = localStorage.getItem('sb_url') || "https://zzvzxvejoargfqrlmxfq.supabase.co";
let SUPABASE_KEY = localStorage.getItem('sb_key') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6dnp4dmVqb2FyZ2ZxcmxteGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTU5ODIsImV4cCI6MjA4NDU5MTk4Mn0._ew5X-XraLq1PxHIn413KrwdcwTMSMg1pOSvm0gaZ4o";

let supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- CONFIGURAÇÃO SUPABASE PELA INTERFACE ---
const SupabaseConfig = {
    init: () => {
        const urlInput = document.getElementById('supabaseUrlInput');
        const keyInput = document.getElementById('supabaseKeyInput');
        if (urlInput) urlInput.value = SUPABASE_URL;
        if (keyInput) keyInput.value = SUPABASE_KEY;
        SupabaseConfig.verificarStatus();
    },

    verificarStatus: async () => {
        const el = document.getElementById('supabaseStatus');
        const txt = document.getElementById('supabaseStatusText');
        if (!el || !txt) return;
        el.className = 'supabase-status testing';
        txt.textContent = 'Verificando conexão...';
        try {
            const { error } = await supabaseClient.from('atendimentos').select('id').limit(1);
            if (error) throw error;
            el.className = 'supabase-status connected';
            txt.textContent = `Conectado — ${SUPABASE_URL.replace('https://', '')}`;
        } catch {
            el.className = 'supabase-status disconnected';
            txt.textContent = 'Não conectado. Verifique URL e chave.';
        }
    },

    testar: async () => {
        const url = document.getElementById('supabaseUrlInput').value.trim();
        const key = document.getElementById('supabaseKeyInput').value.trim();
        if (!url || !key) { alert('Preencha URL e chave antes de testar.'); return; }

        const el = document.getElementById('supabaseStatus');
        const txt = document.getElementById('supabaseStatusText');
        el.className = 'supabase-status testing';
        txt.textContent = 'Testando...';

        try {
            const testClient = supabase.createClient(url, key);
            const { error } = await testClient.from('atendimentos').select('id').limit(1);
            if (error) throw error;
            el.className = 'supabase-status connected';
            txt.textContent = 'Conexão bem-sucedida! Salve para aplicar.';
        } catch {
            el.className = 'supabase-status disconnected';
            txt.textContent = 'Falha na conexão. Verifique os dados.';
        }
    },

    salvar: () => {
        const url = document.getElementById('supabaseUrlInput').value.trim();
        const key = document.getElementById('supabaseKeyInput').value.trim();
        if (!url || !key) { alert('Preencha URL e chave.'); return; }
        localStorage.setItem('sb_url', url);
        localStorage.setItem('sb_key', key);
        SUPABASE_URL = url;
        SUPABASE_KEY = key;
        supabaseClient = supabase.createClient(url, key);
        alert('Configuração salva! A página será recarregada.');
        window.location.reload();
    }
};

let isRecoveryMode = false;

async function prepararAmbiente(user) {
    console.log("🔓 Usuário detectado:", user.email);
    Auth.user = user;
    const loginOverlay = document.getElementById('loginOverlay');
    const modalSenha = document.getElementById('modalCriarSenha');
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (modalSenha) modalSenha.classList.add('hidden');
    setTimeout(() => { Auth.renderLogoutButton(); }, 100);
    try {
        await DB.init();
    } catch (error) {
        console.error("❌ Erro ao carregar dados:", error);
        alert("Erro de conexão. Verifique sua internet.");
    }
    ativarSincronizacao();
}

document.addEventListener('DOMContentLoaded', async () => {
    const hash = window.location.hash;
    if (hash && (hash.includes('type=recovery') || hash.includes('type=invite'))) {
        isRecoveryMode = true;
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('modalCriarSenha').classList.remove('hidden');
        return;
    }
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await prepararAmbiente(session.user);
    } else {
        document.getElementById('loginOverlay').style.display = 'flex';
    }
});

supabaseClient.auth.onAuthStateChange(async (event, session) => {
    Auth.user = session?.user || null;
    Auth.ready = true;
    if (session) {
        document.getElementById('loginOverlay').style.display = 'none';
        iniciarAplicacao();
        Auth.renderLogoutButton();
    } else {
        document.getElementById('loginOverlay').style.display = 'flex';
    }
    if (event === 'SIGNED_OUT') {
        APP_CACHE = [];
        window.location.reload();
    }
    if (event === 'PASSWORD_RECOVERY') {
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('modalCriarSenha').classList.remove('hidden');
    }
});

// ============================================================
// ADAPTER / DATA MAPPER
// ============================================================
const DataMapper = {
    toApp: (row) => ({
        id: row.id,
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
    }),

    toSQL: (appData, userId) => ({
        user_id: userId,
        status: appData.status,
        justificativa: appData.justificativa || null,
        status_justificativa: appData.statusJustificativa || null,
        paciente_nome: appData.paciente.nome,
        paciente_nascimento: appData.paciente.nascimento,
        paciente_endereco: appData.paciente.endereco,
        paciente_contato: appData.paciente.contato,
        procedimento_nome: appData.procedimento.nome,
        data_recebimento: appData.procedimento.dataRecebimento || null,
        data_solicitacao: appData.procedimento.dataSolicitacao || null,
        data_marcacao: appData.procedimento.dataMarcacao || null,
        tipo_marcacao: appData.procedimento.tipo,
        is_retorno: appData.procedimento.isRetorno
    })
};

// ============================================================
// AUTH
// ============================================================
const Auth = {
    user: null,
    ready: false,

    init: async () => {
        const { data } = await supabaseClient.auth.getSession();
        if (!data.session && !window.location.hash.includes('type=')) {
            document.getElementById('loginOverlay').style.display = 'flex';
        }
    },

    login: async () => {
        const email = document.getElementById('emailLogin').value;
        const password = document.getElementById('senhaLogin').value;
        const btn = document.getElementById('btnAuthMain');
        const msg = document.getElementById('msgLogin');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-circle-notch"></i> Verificando...';
        msg.innerText = '';
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            msg.innerText = "Erro: " + error.message;
            btn.disabled = false;
            btn.innerHTML = '<i class="ph ph-sign-in"></i> Entrar';
        }
    },

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
        if (senha.length < 6) { msg.innerText = 'A senha deve ter no mínimo 6 caracteres'; return; }
        if (senha !== confirmar) { msg.innerText = 'As senhas não coincidem'; return; }
        const sessionData = await supabaseClient.auth.getSession();
        if (!sessionData.data.session) { msg.innerText = "Sessão expirada. Clique no link do e-mail novamente."; return; }
        btn.innerText = "Salvando...";
        btn.disabled = true;
        const { error } = await supabaseClient.auth.updateUser({ password: senha });
        if (error) {
            msg.innerText = "Erro: " + error.message;
            btn.innerText = "Salvar senha";
            btn.disabled = false;
        } else {
            alert('Senha criada com sucesso! Faça login com sua nova senha.');
            await supabaseClient.auth.signOut();
            window.location.hash = '';
            window.location.reload();
        }
    },

    logout: async () => { await supabaseClient.auth.signOut(); },

    renderLogoutButton: () => {
        const nav = document.querySelector('.sidebar ul');
        if (document.getElementById('btnLogoutSidebar')) return;
        const li = document.createElement('li');
        li.id = 'btnLogoutSidebar';
        li.innerHTML = '<i class="ph ph-sign-out"></i> Sair';
        li.onclick = Auth.logout;
        nav.appendChild(li);
    }
};

async function iniciarAplicacao() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) return;
    await DB.init();
    ativarSincronizacao();
}

document.addEventListener("DOMContentLoaded", () => { iniciarAplicacao(); });

// ============================================================
// PROCEDIMENTOS DINÂMICOS
// ============================================================
let LISTA_PROCEDIMENTOS = [];

const ProcedimentosManager = {
    init: async () => {
        try {
            const { data, error } = await supabaseClient.from('procedimentos').select('*').order('nome', { ascending: true });
            if (error) throw error;
            LISTA_PROCEDIMENTOS = data.map(p => p.nome);
            ProcedimentosManager.atualizarDropdowns();
            ProcedimentosManager.renderTabelaGerenciamento();
        } catch (err) {
            console.error("Erro ao carregar procedimentos:", err);
        }
    },

    adicionar: async (nome) => {
        if (!nome || !nome.trim()) return;
        const nomeFinal = nome.trim().toUpperCase();
        document.getElementById('novoNomeProcedimento').value = '';
        const { error } = await supabaseClient.from('procedimentos').insert([{ nome: nomeFinal }]);
        if (error) { alert("Erro ou procedimento já existente!"); } else { await ProcedimentosManager.init(); }
    },

    remover: async (nome) => {
        if (!confirm(`Deseja remover o procedimento "${nome}"?`)) return;
        const { error } = await supabaseClient.from('procedimentos').delete().eq('nome', nome);
        if (error) { alert("Erro ao remover!"); } else { await ProcedimentosManager.init(); }
    },

    atualizarDropdowns: () => {
        const IDS = ['procedimento', 'filtroEsperaProcedimento', 'filtroAcompProcedimento', 'filtroConcluidoProcedimento', 'filtroFaltosoProcedimento'];
        IDS.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            const valorAtual = select.value;
            select.innerHTML = id.includes('filtro') ? '<option value="">Todos os Procedimentos</option>' : '<option value="">Selecione...</option>';
            LISTA_PROCEDIMENTOS.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p; opt.textContent = p;
                select.appendChild(opt);
            });
            select.value = valorAtual;
        });
    },

    renderTabelaGerenciamento: () => {
        const container = document.getElementById('listaGerenciarProcedimentos');
        if (!container) return;
        if (LISTA_PROCEDIMENTOS.length === 0) {
            container.innerHTML = '<p style="color:var(--text-light);font-size:0.85rem;text-align:center;padding:20px;">Nenhum procedimento cadastrado.</p>';
            return;
        }
        container.innerHTML = LISTA_PROCEDIMENTOS.map(p => `
            <div class="proc-manager-item">
                <span><i class="ph ph-clipboard-text" style="color:var(--primary);margin-right:6px;"></i>${p}</span>
                <i class="ph ph-trash icon-btn delete" onclick="ProcedimentosManager.remover('${p.replace(/'/g, "\\'")}')" title="Remover"></i>
            </div>
        `).join('');
    }
};

// ============================================================
// BANCO DE DADOS
// ============================================================
let APP_CACHE = [];

const DB = {
    init: async () => {
        await DB.sync();
        ProcedimentosDB.init();
        Router.initModule('cadastro');
        await ProcedimentosManager.init();
    },

    sync: async () => {
        try {
            const { data, error } = await supabaseClient.from('atendimentos').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            APP_CACHE = data.map(row => DataMapper.toApp(row));
            StorageModule.atualizarGrafico();
            return true;
        } catch (e) {
            console.error("Erro de sincronização:", e);
            alert("Erro ao sincronizar dados. Verifique sua conexão.");
            return false;
        }
    },

    getAll: () => APP_CACHE,

    add: async (registroApp) => {
        const payload = DataMapper.toSQL(registroApp, Auth.user.id);
        const { data, error } = await supabaseClient.from('atendimentos').insert([payload]).select();
        if (error) { alert('Erro ao salvar: ' + error.message); return; }
        APP_CACHE.unshift(DataMapper.toApp(data[0]));
        StorageModule.atualizarGrafico();
    },

    update: async (id, novosDadosApp) => {
        const index = APP_CACHE.findIndex(i => i.id === id);
        if (index === -1) return;
        const itemAtual = APP_CACHE[index];
        const itemMesclado = {
            ...itemAtual, ...novosDadosApp,
            paciente: { ...itemAtual.paciente, ...(novosDadosApp.paciente || {}) },
            procedimento: { ...itemAtual.procedimento, ...(novosDadosApp.procedimento || {}) }
        };
        const payload = DataMapper.toSQL(itemMesclado, Auth.user.id);
        const { error } = await supabaseClient.from('atendimentos').update(payload).eq('id', id);
        if (error) { alert("Erro ao atualizar: " + error.message); }
        else { APP_CACHE[index] = itemMesclado; Router.refreshCurrent(); }
    },

    delete: async (id) => {
        if (confirm("Tem certeza que deseja apagar permanentemente?")) {
            const { error } = await supabaseClient.from('atendimentos').delete().eq('id', id);
            if (error) { alert("Erro ao deletar: " + error.message); }
            else { APP_CACHE = APP_CACHE.filter(item => item.id !== id); Router.refreshCurrent(); StorageModule.atualizarGrafico(); }
        }
    },

    clear: async () => {
        if (confirm("PERIGO: Isso apagará TODOS os dados do servidor. Continuar?")) {
            const { error } = await supabaseClient.from('atendimentos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if (!error) { APP_CACHE = []; Router.refreshCurrent(); StorageModule.atualizarGrafico(); }
        }
    }
};

// ============================================================
// PROCEDIMENTOS PADRÃO
// ============================================================
const PROCEDIMENTOS_PADRAO = [
    "EXAMES LABORATORIAIS","GASTROLOGISTA","CARDIOLOGISTA","ENDOCRINOLOGISTA",
    "CIRURGIA","ONCOLOGIA","PROCTOLOGISTA","ALTO RISCO","UROLOGIA",
    "NEFROLOGISTA","DERMATOLOGIA","MASTOLOGISTA","NEUROLOGISTA","GINECOLOGISTA",
    "INFECTOLOGISTA","ALERGISTA","PNEUMOLOGISTA","REUMATOLOGISTA","OFTALMOLOGISTA",
    "ANGIOLOGISTA VASCULAR","MAMOGRAFIA","PEQUENAS CIRURGIAS","GENÉTICA",
    "ORTOPEDISTA","OTORRINOLARINGOLOGISTA","GERIATRIA","HEMATOLOGISTA",
    "DENSITOMETRIA","TOMOGRAFIA","ULTRASSOM","ECOCARDIOGRAMA","ESPIROMETRIA",
    "RESSONANCIA","APLICAÇÃO DE LUCENTIS","ELETROENCELOGRAMA","CINTILOGRAFIA",
    "ENDOSCOPIA","ESTUDO URODINAMICO","COLONOSCOPIA"
];

const ProcedimentosDB = {
    listaCache: [...PROCEDIMENTOS_PADRAO],

    init: () => {
        const usadosBanco = DB.getAll().map(i => i.procedimento.nome);
        const unicos = [...new Set([...PROCEDIMENTOS_PADRAO, ...usadosBanco])];
        ProcedimentosDB.listaCache = unicos.sort();
        ProcedimentosDB.renderSelects();
    },

    getAll: () => ProcedimentosDB.listaCache,

    add: (nome) => {
        if (!nome) return false;
        const upper = nome.toUpperCase().trim();
        if (!ProcedimentosDB.listaCache.includes(upper)) {
            ProcedimentosDB.listaCache.push(upper);
            ProcedimentosDB.listaCache.sort();
            return true;
        }
        return false;
    },

    adicionarNovoViaInterface: () => {
        const novo = prompt("Digite o nome do novo procedimento:");
        if (novo) {
            const upper = novo.toUpperCase().trim();
            ProcedimentosDB.add(upper);
            ProcedimentosDB.renderSelects();
            ProcedimentosManager.adicionar(upper);
            setTimeout(() => {
                const selects = document.querySelectorAll('#procedimento');
                selects.forEach(s => s.value = upper);
            }, 300);
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
                opt.value = proc; opt.innerText = proc;
                sel.appendChild(opt);
            });
            if (valorAtual && lista.includes(valorAtual)) sel.value = valorAtual;
        });
    }
};

// ============================================================
// UTILS
// ============================================================
const Utils = {
    formatDate: (dateString) => {
        if (!dateString) return '-';
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    },
    diffDays: (d1, d2) => {
        if (!d1) return 0;
        const date1 = new Date(d1);
        const date2 = d2 ? new Date(d2) : new Date();
        return Math.floor(Math.abs(date2 - date1) / (1000 * 60 * 60 * 24));
    },
    getRandomColor: () => {
        const colors = ['#0a7c6a','#2e7d32','#c05621','#6b46c1','#0097a7','#c53030','#1a6696','#7b5e22','#3d7ebf','#5a6c22'];
        return colors[Math.floor(Math.random() * colors.length)];
    },
    verDetalhes: (id) => {
        const item = DB.getAll().find(i => i.id === id);
        if (!item) return;
        document.getElementById('detalhesConteudo').innerHTML = `
            <p><strong>Nome:</strong> ${item.paciente.nome}</p>
            <p><strong>Nascimento:</strong> ${Utils.formatDate(item.paciente.nascimento)}</p>
            <p><strong>Endereço:</strong> ${item.paciente.endereco}</p>
            <p><strong>Contato:</strong> ${item.paciente.contato}</p>
            <hr style="margin:10px 0;border:0;border-top:1px solid var(--border);">
            <p><strong>Procedimento:</strong> ${item.procedimento.nome}</p>
            <p><strong>Tipo:</strong> ${item.procedimento.tipo}</p>
            <p><strong>É Retorno:</strong> ${item.procedimento.isRetorno ? 'Sim' : 'Não'}</p>
            <p><strong>Data Solicitação:</strong> ${Utils.formatDate(item.procedimento.dataSolicitacao)}</p>
            <p><strong>Data Marcação:</strong> ${Utils.formatDate(item.procedimento.dataMarcacao)}</p>
            ${item.justificativa ? `<p style="color:var(--danger)"><strong>Justificativa:</strong> ${item.justificativa}</p>` : ''}
            <p style="font-size:0.75em;color:#999;margin-top:10px;">ID: ${item.id}</p>
        `;
        document.getElementById('modalDetalhes').classList.remove('hidden');
    },
    fecharModalDetalhes: () => {
        document.getElementById('modalDetalhes').classList.add('hidden');
    },
    getMesAtual: () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    },
    popularAnos: () => {
        const select = document.getElementById('filtroRelatorioAno');
        if (!select) return;
        const anoAtual = new Date().getFullYear();
        for (let a = anoAtual; a >= anoAtual - 5; a--) {
            const opt = document.createElement('option');
            opt.value = a; opt.textContent = a;
            select.appendChild(opt);
        }
    }
};

// ============================================================
// ROUTER
// ============================================================
const Router = {
    currentPage: 'cadastro',
    navigate: (pageId) => {
        document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
        const menuItem = document.querySelector(`.sidebar li[onclick*="${pageId}"]`);
        if (menuItem) menuItem.classList.add('active');
        document.querySelectorAll('.module').forEach(sec => sec.classList.remove('active'));
        const target = document.getElementById(pageId);
        if (target) target.classList.add('active');
        Router.currentPage = pageId;
        Router.initModule(pageId);
    },
    initModule: (pageId) => {
        ProcedimentosDB.renderSelects();
        switch (pageId) {
            case 'cadastro': CadastroModule.init(); break;
            case 'acompanhamento': AcompanhamentoModule.render(); break;
            case 'concluidos': ConcluidosModule.render(); break;
            case 'faltosos': FaltososModule.render(); break;
            case 'espera': EsperaModule.render(); break;
            case 'procedimentos': ProcedimentosModule.init(); break;
            case 'relatorios': RelatoriosModule.init(); break;
            case 'armazenamento': StorageModule.init(); break;
        }
    },
    refreshCurrent: () => Router.initModule(Router.currentPage)
};

// ============================================================
// CADASTRO
// ============================================================
const CadastroModule = {
    _pendingRegistro: null,
    _pendingBtn: null,
    _pendingBtnOriginal: null,

    init: () => {
        document.getElementById('dataRecebimento').valueAsDate = new Date();
    },
    buscarPaciente: (termo) => {
        const lista = document.getElementById('sugestoesPaciente');
        lista.innerHTML = '';
        if (termo.length < 3) return;
        const unicos = new Map();
        DB.getAll().forEach(reg => unicos.set(reg.paciente.nome, reg.paciente));
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

    verificarDuplicata: (nome, procedimento) => {
        return DB.getAll().filter(r =>
            r.paciente.nome.toLowerCase() === nome.toLowerCase() &&
            r.procedimento.nome.toLowerCase() === procedimento.toLowerCase()
        );
    },

    cancelarDuplicado: () => {
        document.getElementById('modalDuplicado').classList.add('hidden');
        if (CadastroModule._pendingBtn) {
            CadastroModule._pendingBtn.innerHTML = CadastroModule._pendingBtnOriginal;
            CadastroModule._pendingBtn.disabled = false;
        }
        CadastroModule._pendingRegistro = null;
        CadastroModule._pendingBtn = null;
    },

    confirmarDuplicado: async () => {
        document.getElementById('modalDuplicado').classList.add('hidden');
        await CadastroModule._executarSalvar();
    },

    _executarSalvar: async () => {
        const registro = CadastroModule._pendingRegistro;
        const btn = CadastroModule._pendingBtn;
        const idEdicao = document.getElementById('editId').value;
        try {
            if (idEdicao) { await DB.update(idEdicao, registro); alert('Atualizado com sucesso!'); }
            else { await DB.add(registro); alert("Cadastro salvo com sucesso!"); }
            CadastroModule.limparFormulario();
        } catch (err) { console.error(err); }
        finally {
            if (btn) { btn.innerHTML = CadastroModule._pendingBtnOriginal; btn.disabled = false; }
            CadastroModule._pendingRegistro = null;
            CadastroModule._pendingBtn = null;
        }
    },

    salvar: async (e) => {
        e.preventDefault();
        const idEdicao = document.getElementById('editId').value;
        const dataMarcacao = document.getElementById('dataMarcacao').value;
        const status = dataMarcacao ? 'agendado' : 'espera';
        const nomePaciente = document.getElementById('nomePaciente').value.toUpperCase();
        const procedimentoNome = document.getElementById('procedimento').value;
        const registro = {
            status,
            paciente: {
                nome: nomePaciente,
                nascimento: document.getElementById('dataNascimento').value,
                endereco: document.getElementById('endereco').value,
                contato: document.getElementById('contato').value
            },
            procedimento: {
                nome: procedimentoNome,
                dataRecebimento: document.getElementById('dataRecebimento').value,
                dataSolicitacao: document.getElementById('dataSolicitacao').value,
                dataMarcacao: document.getElementById('dataMarcacao').value,
                tipo: document.getElementById('tipoMarcacao').value,
                isRetorno: document.getElementById('isRetorno').checked
            }
        };
        const btn = e.target.querySelector('button[type="submit"]');
        const txtOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-circle-notch"></i> Verificando...';
        btn.disabled = true;

        // Verifica duplicata apenas em novos cadastros (não em edições)
        if (!idEdicao) {
            const duplicatas = CadastroModule.verificarDuplicata(nomePaciente, procedimentoNome);
            if (duplicatas.length > 0) {
                // Guarda o estado pendente e abre o modal
                CadastroModule._pendingRegistro = registro;
                CadastroModule._pendingBtn = btn;
                CadastroModule._pendingBtnOriginal = txtOriginal;

                const statusMap = { agendado:'Agendado', concluido:'Concluído', faltoso:'Faltou', espera:'Em Espera' };
                const dup = duplicatas[0];
                const dataRef = dup.procedimento.dataMarcacao || dup.procedimento.dataRecebimento || dup.procedimento.dataSolicitacao;
                const Utils_fmt = (d) => { if (!d) return '-'; const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}`; };

                document.getElementById('modalDuplicadoInfo').innerHTML = `
                    <strong>Paciente:</strong> ${dup.paciente.nome}<br>
                    <strong>Procedimento:</strong> ${dup.procedimento.nome}<br>
                    <strong>Status atual:</strong> ${statusMap[dup.status] || dup.status}<br>
                    <strong>Data referência:</strong> ${Utils_fmt(dataRef)}<br>
                    ${duplicatas.length > 1 ? `<span style="color:var(--warning);font-weight:600;">⚠ ${duplicatas.length} registros encontrados com este mesmo paciente e procedimento.</span>` : ''}
                `;
                document.getElementById('modalDuplicado').classList.remove('hidden');
                return; // Espera a decisão do usuário no modal
            }
        }

        // Sem duplicata (ou é edição): salva diretamente
        CadastroModule._pendingRegistro = registro;
        CadastroModule._pendingBtn = btn;
        CadastroModule._pendingBtnOriginal = txtOriginal;
        btn.innerHTML = '<i class="ph ph-circle-notch"></i> Salvando...';
        await CadastroModule._executarSalvar();
    }
};
document.getElementById('formCadastro').addEventListener('submit', CadastroModule.salvar);

// ============================================================
// ACOMPANHAMENTO
// ============================================================
const AcompanhamentoModule = {
    tempId: null,
    render: (filtros = {}) => {
        const tbody = document.getElementById('tabelaAcompanhamento');
        tbody.innerHTML = '';
        let dados = DB.getAll().filter(i => i.status === 'agendado');
        if (filtros.nome) { const t = filtros.nome.toLowerCase(); dados = dados.filter(i => i.paciente.nome.toLowerCase().includes(t)); }
        if (filtros.inicio) dados = dados.filter(i => i.procedimento.dataMarcacao >= filtros.inicio);
        if (filtros.fim) dados = dados.filter(i => i.procedimento.dataMarcacao <= filtros.fim);
        if (filtros.tipo) dados = dados.filter(i => i.procedimento.tipo === filtros.tipo);
        if (filtros.retorno) dados = dados.filter(i => i.procedimento.isRetorno);
        if (filtros.procedimento) dados = dados.filter(i => i.procedimento.nome === filtros.procedimento);
        dados.sort((a, b) => new Date(a.procedimento.dataMarcacao) - new Date(b.procedimento.dataMarcacao));

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:30px;">Nenhum registro encontrado.</td></tr>';
            return;
        }

        dados.forEach(item => {
            const dataMarcacao = item.procedimento.dataMarcacao;
            if (!dataMarcacao) return;
            const hoje = new Date(); hoje.setHours(0,0,0,0);
            const [ano, mes, dia] = dataMarcacao.split('-').map(Number);
            const dataAlvo = new Date(ano, mes-1, dia); dataAlvo.setHours(0,0,0,0);
            const diffDays = Math.round((dataAlvo - hoje) / (1000*60*60*24));
            let textoPrazo, estiloPrazo, badgeClass;
            if (diffDays > 0) {
                textoPrazo = `Faltam ${diffDays} dias`;
                estiloPrazo = 'color:var(--primary);';
                badgeClass = 'badge-info';
            } else if (diffDays === 0) {
                textoPrazo = '📅 Hoje!';
                estiloPrazo = 'color:var(--warning);font-weight:700;';
                badgeClass = 'badge-warning';
            } else {
                textoPrazo = `Passou ${Math.abs(diffDays)} dia${Math.abs(diffDays)>1?'s':''}`;
                estiloPrazo = 'color:var(--danger);font-weight:700;';
                badgeClass = 'badge-danger';
            }
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.paciente.nome}</strong> ${item.procedimento.isRetorno ? '<span class="badge badge-info" style="font-size:0.68rem;">Retorno</span>' : ''}</td>
                <td>${item.procedimento.nome}</td>
                <td><strong>${Utils.formatDate(dataMarcacao)}</strong></td>
                <td><span style="${estiloPrazo}">${textoPrazo}</span></td>
                <td>
                    <button class="btn-danger" style="padding:4px 10px;font-size:0.78em;" onclick="AcompanhamentoModule.abrirModalFalta('${item.id}')"><i class="ph ph-x"></i> Não</button>
                    <button class="btn-primary" style="padding:4px 10px;font-size:0.78em;" onclick="AcompanhamentoModule.marcarCompareceu('${item.id}')"><i class="ph ph-check"></i> Sim</button>
                    <i class="ph ph-magnifying-glass icon-btn" onclick="Utils.verDetalhes('${item.id}')" title="Detalhes"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    aplicarFiltros: () => {
        AcompanhamentoModule.render({
            nome: document.getElementById('filtroNome').value,
            inicio: document.getElementById('filtroAcompInicio').value,
            fim: document.getElementById('filtroAcompFim').value,
            tipo: document.getElementById('filtroAcompTipo').value,
            retorno: document.getElementById('filtroRetornoAcomp').checked,
            procedimento: document.getElementById('filtroAcompProcedimento').value
        });
    },
    marcarCompareceu: async (id) => { await DB.update(id, { status: 'concluido' }); },
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
            justificativa,
            statusJustificativa: comJustificativa ? 'Justificado' : 'Não Justificado'
        });
        AcompanhamentoModule.fecharModal();
    }
};

// ============================================================
// CONCLUÍDOS
// ============================================================
const ConcluidosModule = {
    render: (filtros = {}) => {
        const tbody = document.getElementById('tabelaConcluidos');
        tbody.innerHTML = '';
        let dados = DB.getAll().filter(i => i.status === 'concluido');
        if (filtros.inicio) dados = dados.filter(i => (i.procedimento.dataMarcacao) >= filtros.inicio);
        if (filtros.fim) dados = dados.filter(i => (i.procedimento.dataMarcacao) <= filtros.fim);
        if (filtros.tipo) dados = dados.filter(i => i.procedimento.tipo === filtros.tipo);
        if (filtros.retorno) dados = dados.filter(i => i.procedimento.isRetorno);
        if (filtros.procedimento) dados = dados.filter(i => i.procedimento.nome === filtros.procedimento);

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:30px;">Nenhum registro encontrado.</td></tr>';
            return;
        }

        dados.forEach(item => {
            const dataExibicao = item.procedimento.dataMarcacao;
            const tipoClass = item.procedimento.tipo === 'SUS' ? 'badge-info' : item.procedimento.tipo === 'PARTICULAR' ? 'badge-warning' : 'badge-neutral';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.paciente.nome}</strong> ${item.procedimento.isRetorno ? '<span class="badge badge-info" style="font-size:0.68rem;">Retorno</span>' : ''}</td>
                <td>${item.procedimento.nome}</td>
                <td><span class="badge ${tipoClass}">${item.procedimento.tipo}</span></td>
                <td>${Utils.formatDate(dataExibicao)}</td>
                <td>
                    <i class="ph ph-magnifying-glass icon-btn" onclick="Utils.verDetalhes('${item.id}')" title="Detalhes"></i>
                    <i class="ph ph-trash icon-btn delete" onclick="DB.delete('${item.id}')" title="Apagar"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    aplicarFiltros: () => {
        ConcluidosModule.render({
            inicio: document.getElementById('filtroDataConcluidoInicio').value,
            fim: document.getElementById('filtroDataConcluidoFim').value,
            tipo: document.getElementById('filtroTipoConcluido').value,
            retorno: document.getElementById('filtroRetornoConcluido').checked,
            procedimento: document.getElementById('filtroConcluidoProcedimento').value
        });
    }
};

// ============================================================
// FALTOSOS
// ============================================================
const FaltososModule = {
    render: (filtros = {}) => {
        const tbody = document.getElementById('tabelaFaltosos');
        tbody.innerHTML = '';
        let dados = DB.getAll().filter(i => i.status === 'faltoso');
        if (filtros.inicio) dados = dados.filter(i => (i.procedimento.dataMarcacao) >= filtros.inicio);
        if (filtros.fim) dados = dados.filter(i => (i.procedimento.dataMarcacao) <= filtros.fim);
        if (filtros.tipo) dados = dados.filter(i => i.procedimento.tipo === filtros.tipo);
        if (filtros.retorno) dados = dados.filter(i => i.procedimento.isRetorno);
        if (filtros.procedimento) dados = dados.filter(i => i.procedimento.nome === filtros.procedimento);

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:30px;">Nenhum registro encontrado.</td></tr>';
            return;
        }

        dados.forEach(item => {
            const tr = document.createElement('tr');
            const justClass = item.statusJustificativa === 'Justificado' ? 'badge-warning' : 'badge-danger';
            tr.innerHTML = `
                <td><strong>${item.paciente.nome}</strong> ${item.procedimento.isRetorno ? '<span class="badge badge-info" style="font-size:0.68rem;">Retorno</span>' : ''}</td>
                <td>${item.procedimento.nome}</td>
                <td>${item.justificativa || '-'}</td>
                <td><span class="badge ${justClass}">${item.statusJustificativa || 'Faltoso'}</span></td>
                <td>
                    <i class="ph ph-magnifying-glass icon-btn" onclick="Utils.verDetalhes('${item.id}')" title="Detalhes"></i>
                    <i class="ph ph-trash icon-btn delete" onclick="DB.delete('${item.id}')" title="Apagar"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    aplicarFiltros: () => {
        FaltososModule.render({
            inicio: document.getElementById('filtroDataFaltosoInicio').value,
            fim: document.getElementById('filtroDataFaltosoFim').value,
            tipo: document.getElementById('filtroTipoFaltoso').value,
            retorno: document.getElementById('filtroRetornoFaltoso').checked,
            procedimento: document.getElementById('filtroFaltosoProcedimento').value
        });
    }
};

// ============================================================
// LISTA DE ESPERA (com alerta expansível)
// ============================================================
const EsperaModule = {
    render: (filtros = {}) => {
        const tbody = document.getElementById('tabelaEspera');
        const alertaContainer = document.getElementById('alertaEspera');
        tbody.innerHTML = '';
        let dados = DB.getAll().filter(i => i.status === 'espera');
        let atrasados = [];

        if (filtros.nome) { const t = filtros.nome.toLowerCase(); dados = dados.filter(i => i.paciente.nome.toLowerCase().includes(t)); }
        if (filtros.inicio) dados = dados.filter(i => i.procedimento.dataRecebimento >= filtros.inicio);
        if (filtros.fim) dados = dados.filter(i => i.procedimento.dataRecebimento <= filtros.fim);
        if (filtros.tipo) dados = dados.filter(i => i.procedimento.tipo === filtros.tipo);
        if (filtros.retorno) dados = dados.filter(i => i.procedimento.isRetorno);
        if (filtros.procedimento) dados = dados.filter(i => i.procedimento.nome === filtros.procedimento);

        // Sempre coleta atrasados da lista completa (antes do filtro +90)
        const todosEspera = DB.getAll().filter(i => i.status === 'espera');
        todosEspera.forEach(item => {
            const dataBase = item.procedimento.dataSolicitacao || item.procedimento.dataRecebimento;
            if (Utils.diffDays(dataBase) >= 90) {
                atrasados.push({ nome: item.paciente.nome, dias: Utils.diffDays(dataBase), proc: item.procedimento.nome });
            }
        });

        // Renderiza alerta expansível
        if (atrasados.length > 0) {
            alertaContainer.innerHTML = `
                <div class="alert-box danger alert-expandable">
                    <div class="alert-expandable-header" onclick="EsperaModule.toggleAlerta(this)">
                        <i class="ph ph-warning"></i>
                        <span><strong>ATENÇÃO:</strong> ${atrasados.length} paciente(s) aguardando há mais de 90 dias</span>
                        <i class="ph ph-caret-down alert-arrow"></i>
                    </div>
                    <div class="alert-expandable-body" id="listaAtrasados">
                        ${atrasados.map(a => `
                            <div class="alert-patient-item">
                                <i class="ph ph-user"></i>
                                <strong>${a.nome}</strong>
                                <span style="margin-left:auto;font-size:0.78rem;opacity:0.8;">${a.proc} • ${a.dias} dias</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        } else {
            alertaContainer.innerHTML = `
                <div class="alert-box success">
                    <i class="ph ph-check-circle"></i>
                    <span>Nenhum paciente aguardando mais de 90 dias.</span>
                </div>`;
        }

        dados.forEach(item => {
            const dataBase = item.procedimento.dataSolicitacao || item.procedimento.dataRecebimento;
            const diasPassados = Utils.diffDays(dataBase);
            if (filtros.atrasados && diasPassados < 90) return;
            const tr = document.createElement('tr');
            if (diasPassados >= 90) tr.style.background = '#fff5f5';
            tr.innerHTML = `
                <td><strong>${item.paciente.nome}</strong> ${item.procedimento.isRetorno ? '<span class="badge badge-info" style="font-size:0.68rem;">Retorno</span>' : ''}</td>
                <td>${item.procedimento.nome}</td>
                <td>${!item.procedimento.dataSolicitacao ? '<span class="badge badge-warning">Solicitação</span>' : '<span class="badge badge-info">Marcação</span>'}</td>
                <td style="${diasPassados >= 90 ? 'color:var(--danger);font-weight:700;' : ''}">
                    ${diasPassados >= 90 ? '⚠ ' : ''}${diasPassados} dias
                </td>
                <td>
                    <i class="ph ph-magnifying-glass icon-btn" onclick="Utils.verDetalhes('${item.id}')" title="Detalhes"></i>
                    <i class="ph ph-pencil-simple icon-btn" onclick="EsperaModule.editar('${item.id}')" title="Editar"></i>
                    <i class="ph ph-trash icon-btn delete" onclick="DB.delete('${item.id}')" title="Apagar"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (tbody.children.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:30px;">Nenhum registro encontrado.</td></tr>';
        }
    },

    toggleAlerta: (header) => {
        header.classList.toggle('open');
        const body = header.nextElementSibling;
        body.classList.toggle('open');
    },

    aplicarFiltros: () => {
        EsperaModule.render({
            nome: document.getElementById('filtroNomeEspera').value,
            atrasados: document.getElementById('filtroAtrasadosEspera')?.checked || false,
            inicio: document.getElementById('filtroEsperaInicio').value,
            fim: document.getElementById('filtroEsperaFim').value,
            tipo: document.getElementById('filtroEsperaTipo').value,
            retorno: document.getElementById('filtroRetornoEspera').checked,
            procedimento: document.getElementById('filtroEsperaProcedimento').value,
        });
    },

    editar: (id) => {
        const item = DB.getAll().find(i => i.id === id);
        if (!item) return;
        Router.navigate('cadastro');
        document.getElementById('editId').value = item.id;
        document.getElementById('nomePaciente').value = item.paciente.nome;
        document.getElementById('dataNascimento').value = item.paciente.nascimento;
        document.getElementById('endereco').value = item.paciente.endereco;
        document.getElementById('contato').value = item.paciente.contato;
        document.getElementById('procedimento').value = item.procedimento.nome;
        document.getElementById('dataRecebimento').value = item.procedimento.dataRecebimento || '';
        document.getElementById('dataSolicitacao').value = item.procedimento.dataSolicitacao || '';
        document.getElementById('dataMarcacao').value = item.procedimento.dataMarcacao || '';
        document.getElementById('tipoMarcacao').value = item.procedimento.tipo;
        document.getElementById('isRetorno').checked = item.procedimento.isRetorno;
    }
};

// ============================================================
// MÓDULO PROCEDIMENTOS (nova aba)
// ============================================================
const ProcedimentosModule = {
    init: () => {
        ProcedimentosManager.renderTabelaGerenciamento();
    }
};

// ============================================================
// RELATÓRIOS — com filtro mensal e PDFs elegantes
// ============================================================
const RelatoriosModule = {
    dadosConcluidosCache: [],

    init: () => {
        Utils.popularAnos();
        RelatoriosModule.atualizarTudo();
    },

    aplicarFiltroMensal: () => {
        const mes = document.getElementById('filtroRelatorioMes').value;
        const ano = document.getElementById('filtroRelatorioAno').value;
        // Limpa filtros de data quando usa mês/ano
        document.getElementById('filtroRelatorioInicio').value = '';
        document.getElementById('filtroRelatorioFim').value = '';
        RelatoriosModule.atualizarTudo(mes, ano);
    },

    atualizarTudo: (mes, ano) => {
        const inicio = document.getElementById('filtroRelatorioInicio').value;
        const fim = document.getElementById('filtroRelatorioFim').value;
        const mesSel = mes || document.getElementById('filtroRelatorioMes').value;
        const anoSel = ano || document.getElementById('filtroRelatorioAno').value;

        let dados = DB.getAll();

        if (mesSel && anoSel) {
            dados = dados.filter(i => {
                const dataRef = i.procedimento.dataMarcacao || i.procedimento.dataRecebimento;
                if (!dataRef) return false;
                return dataRef.startsWith(`${anoSel}-${mesSel}`);
            });
        } else if (inicio || fim) {
            dados = dados.filter(i => {
                const dataRef = i.procedimento.dataMarcacao || i.procedimento.dataRecebimento;
                if (!dataRef) return true;
                if (inicio && dataRef < inicio) return false;
                if (fim && dataRef > fim) return false;
                return true;
            });
        }

        const marcados = dados.filter(i => i.status === 'agendado').length;
        const concluidos = dados.filter(i => i.status === 'concluido');
        const faltosos = dados.filter(i => i.status === 'faltoso').length;
        const espera = dados.filter(i => i.status === 'espera').length;
        const solicitacoes = dados.filter(i => i.status === 'espera' || (!i.procedimento.dataSolicitacao && i.status !== 'concluido' && i.status !== 'faltoso')).length;

        document.getElementById('dashMarcados').innerText = marcados;
        document.getElementById('dashConcluidos').innerText = concluidos.length;
        document.getElementById('dashFaltosos').innerText = faltosos;
        document.getElementById('dashEspera').innerText = espera;
        document.getElementById('dashSolicitacoes').innerText = solicitacoes;

        const counts = {};
        concluidos.forEach(item => {
            const nome = item.procedimento.nome;
            if (!counts[nome]) counts[nome] = 0;
            counts[nome]++;
        });

        const containerCards = document.getElementById('gridProcedimentosConcluidos');
        containerCards.innerHTML = '';
        const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
        if (sorted.length === 0) {
            containerCards.innerHTML = '<p style="color:var(--text-light);font-size:0.88rem;">Nenhum procedimento concluído no período.</p>';
        }
        sorted.forEach(([procNome, qtd]) => {
            const div = document.createElement('div');
            div.className = 'proc-card';
            div.style.backgroundColor = Utils.getRandomColor();
            div.innerHTML = `
                <div>
                    <h4>${procNome}</h4>
                    <span>${qtd}</span>
                </div>
                <div class="proc-card-icon" onclick="RelatoriosModule.abrirListaDetalhada('${procNome}')" title="Ver Lista">
                    <i class="ph ph-magnifying-glass" style="color:white;font-size:1rem;"></i>
                </div>
            `;
            containerCards.appendChild(div);
        });

        RelatoriosModule.dadosConcluidosCache = concluidos;
    },

    abrirListaDetalhada: (nomeProcedimento) => {
        document.getElementById('tituloModalLista').innerText = nomeProcedimento;
        const tbody = document.getElementById('tabelaListaProcedimento');
        tbody.innerHTML = '';
        RelatoriosModule.dadosConcluidosCache
            .filter(i => i.procedimento.nome === nomeProcedimento)
            .forEach(item => {
                const data = item.procedimento.dataMarcacao;
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${Utils.formatDate(data)}</td><td>${item.paciente.nome}</td>`;
                tbody.appendChild(tr);
            });
        document.getElementById('modalListaProcedimento').classList.remove('hidden');
    },

    // Cabeçalho padrão para todos os PDFs
    _cabecalhoPDF: (doc, titulo, periodo = '') => {
        const { jsPDF } = window.jspdf;
        const w = doc.internal.pageSize.getWidth();

        // Faixa verde no topo
        doc.setFillColor(10, 124, 106);
        doc.rect(0, 0, w, 32, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('ISaúde — Secretaria de Saúde de Barra de São Miguel', w/2, 12, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Gestão Municipal de Saúde — Relatório Oficial', w/2, 20, { align: 'center' });

        // Linha separadora
        doc.setFillColor(0, 212, 170);
        doc.rect(0, 32, w, 2, 'F');

        // Título do relatório
        doc.setTextColor(10, 124, 106);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(titulo, w/2, 46, { align: 'center' });

        // Período e data de geração
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        const now = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
        doc.text(`Gerado em: ${now}`, 14, 56);
        if (periodo) doc.text(`Período: ${periodo}`, w - 14, 56, { align: 'right' });

        // Linha divisória
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(14, 60, w - 14, 60);

        return 66; // yStart
    },

    _rodapePDF: (doc) => {
        const { pageCount } = doc.internal;
        const w = doc.internal.pageSize.getWidth();
        const h = doc.internal.pageSize.getHeight();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFillColor(240, 250, 248);
            doc.rect(0, h - 14, w, 14, 'F');
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text('ISaúde — Sistema de Gestão de Saúde | Secretaria de Saúde de Barra de São Miguel', 14, h - 5);
            doc.text(`Pág. ${i} / ${pageCount}`, w - 14, h - 5, { align: 'right' });
        }
    },

    _getPeriodo: () => {
        const mes = document.getElementById('filtroRelatorioMes').value;
        const ano = document.getElementById('filtroRelatorioAno').value;
        const ini = document.getElementById('filtroRelatorioInicio').value;
        const fim = document.getElementById('filtroRelatorioFim').value;
        if (mes && ano) {
            const nomes = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            return `${nomes[parseInt(mes)]} / ${ano}`;
        }
        if (ini || fim) return `${ini ? Utils.formatDate(ini) : '—'} a ${fim ? Utils.formatDate(fim) : '—'}`;
        return 'Todos os períodos';
    },

    _getDadosFiltrados: () => {
        const mes = document.getElementById('filtroRelatorioMes').value;
        const ano = document.getElementById('filtroRelatorioAno').value;
        const ini = document.getElementById('filtroRelatorioInicio').value;
        const fim = document.getElementById('filtroRelatorioFim').value;
        let dados = DB.getAll();
        if (mes && ano) {
            dados = dados.filter(i => {
                const d = i.procedimento.dataMarcacao || i.procedimento.dataRecebimento;
                return d && d.startsWith(`${ano}-${mes}`);
            });
        } else if (ini || fim) {
            dados = dados.filter(i => {
                const d = i.procedimento.dataMarcacao || i.procedimento.dataRecebimento;
                if (!d) return true;
                if (ini && d < ini) return false;
                if (fim && d > fim) return false;
                return true;
            });
        }
        return dados;
    },

    baixarPDFGeral: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const periodo = RelatoriosModule._getPeriodo();
        const y = RelatoriosModule._cabecalhoPDF(doc, 'RELATÓRIO GERAL DE ATENDIMENTOS', periodo);
        const dados = RelatoriosModule._getDadosFiltrados();

        const marcados = dados.filter(i => i.status === 'agendado').length;
        const concluidos = dados.filter(i => i.status === 'concluido').length;
        const faltosos = dados.filter(i => i.status === 'faltoso').length;
        const espera = dados.filter(i => i.status === 'espera').length;

        // Resumo com cards
        const cardW = 38; const cardH = 20; const gap = 6;
        const startX = 14;
        const cards = [
            { label: 'Marcados', value: marcados, r:10, g:124, b:106 },
            { label: 'Concluídos', value: concluidos, r:39, g:119, b:69 },
            { label: 'Faltosos', value: faltosos, r:197, g:48, b:48 },
            { label: 'Em Espera', value: espera, r:192, g:86, b:33 },
        ];
        cards.forEach((c, i) => {
            const x = startX + i * (cardW + gap);
            doc.setFillColor(c.r, c.g, c.b);
            doc.roundedRect(x, y, cardW, cardH, 3, 3, 'F');
            doc.setTextColor(255,255,255);
            doc.setFont('helvetica','bold');
            doc.setFontSize(14);
            doc.text(String(c.value), x + cardW/2, y + 11, { align:'center' });
            doc.setFontSize(7);
            doc.setFont('helvetica','normal');
            doc.text(c.label, x + cardW/2, y + 17, { align:'center' });
        });

        // Tabela detalhada
        const rows = dados.map(i => [
            i.paciente.nome,
            i.procedimento.nome,
            Utils.formatDate(i.procedimento.dataMarcacao || i.procedimento.dataRecebimento),
            i.procedimento.tipo,
            i.status === 'agendado' ? 'Marcado' : i.status === 'concluido' ? 'Concluído' : i.status === 'faltoso' ? 'Faltou' : 'Em Espera'
        ]);

        doc.autoTable({
            startY: y + cardH + 10,
            head: [['Paciente', 'Procedimento', 'Data', 'Tipo', 'Status']],
            body: rows,
            styles: { font: 'helvetica', fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [10, 124, 106], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [240, 250, 248] },
            theme: 'striped',
            margin: { left: 14, right: 14 }
        });

        RelatoriosModule._rodapePDF(doc);
        doc.save(`isaude_relatorio_geral_${new Date().toISOString().slice(0,10)}.pdf`);
    },

    baixarPDFConcluidos: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const periodo = RelatoriosModule._getPeriodo();
        const y = RelatoriosModule._cabecalhoPDF(doc, 'RELATÓRIO DE PROCEDIMENTOS CONCLUÍDOS', periodo);
        const dados = RelatoriosModule._getDadosFiltrados().filter(i => i.status === 'concluido');

        const rows = dados.map(i => [
            i.paciente.nome,
            i.procedimento.nome,
            Utils.formatDate(i.procedimento.dataMarcacao),
            i.procedimento.tipo,
            i.procedimento.isRetorno ? 'Sim' : 'Não'
        ]);

        doc.autoTable({
            startY: y + 4,
            head: [['Paciente', 'Procedimento', 'Data', 'Tipo', 'Retorno']],
            body: rows,
            styles: { font: 'helvetica', fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [39, 119, 69], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [240, 255, 244] },
            theme: 'striped',
            margin: { left: 14, right: 14 }
        });

        // Rodapé com total
        const finalY = doc.lastAutoTable.finalY + 6;
        doc.setFontSize(9);
        doc.setTextColor(39, 119, 69);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total de procedimentos concluídos: ${dados.length}`, 14, finalY);

        RelatoriosModule._rodapePDF(doc);
        doc.save(`isaude_concluidos_${new Date().toISOString().slice(0,10)}.pdf`);
    },

    baixarPDFEspera: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const y = RelatoriosModule._cabecalhoPDF(doc, 'RELATÓRIO — LISTA DE ESPERA', 'Posição atual');
        const dados = DB.getAll().filter(i => i.status === 'espera');

        const rows = dados.map(i => {
            const dataBase = i.procedimento.dataSolicitacao || i.procedimento.dataRecebimento;
            const dias = Utils.diffDays(dataBase);
            return [
                i.paciente.nome,
                i.procedimento.nome,
                Utils.formatDate(dataBase),
                i.procedimento.tipo,
                `${dias} dias`,
                dias >= 90 ? '⚠ ATRASADO' : 'Normal'
            ];
        });

        doc.autoTable({
            startY: y + 4,
            head: [['Paciente', 'Procedimento', 'Data Ref.', 'Tipo', 'Espera', 'Situação']],
            body: rows,
            styles: { font: 'helvetica', fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [192, 86, 33], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [255, 250, 240] },
            theme: 'striped',
            margin: { left: 14, right: 14 },
            didParseCell: (data) => {
                if (data.column.index === 5 && data.cell.raw && data.cell.raw.includes('ATRASADO')) {
                    data.cell.styles.textColor = [197, 48, 48];
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        const atrasados = dados.filter(i => Utils.diffDays(i.procedimento.dataSolicitacao || i.procedimento.dataRecebimento) >= 90).length;
        const finalY = doc.lastAutoTable.finalY + 6;
        doc.setFontSize(9);
        doc.setTextColor(197, 48, 48);
        doc.setFont('helvetica', 'bold');
        if (atrasados > 0) doc.text(`⚠ ${atrasados} paciente(s) com espera superior a 90 dias.`, 14, finalY);

        RelatoriosModule._rodapePDF(doc);
        doc.save(`isaude_lista_espera_${new Date().toISOString().slice(0,10)}.pdf`);
    },

    baixarPDFFaltosos: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const periodo = RelatoriosModule._getPeriodo();
        const y = RelatoriosModule._cabecalhoPDF(doc, 'RELATÓRIO DE PACIENTES FALTOSOS', periodo);
        const dados = RelatoriosModule._getDadosFiltrados().filter(i => i.status === 'faltoso');

        const rows = dados.map(i => [
            i.paciente.nome,
            i.procedimento.nome,
            Utils.formatDate(i.procedimento.dataMarcacao),
            i.procedimento.tipo,
            i.statusJustificativa || 'N/I',
            i.justificativa || '—'
        ]);

        doc.autoTable({
            startY: y + 4,
            head: [['Paciente', 'Procedimento', 'Data', 'Tipo', 'Justificativa', 'Observação']],
            body: rows,
            styles: { font: 'helvetica', fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [197, 48, 48], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [255, 245, 245] },
            theme: 'striped',
            margin: { left: 14, right: 14 }
        });

        const finalY = doc.lastAutoTable.finalY + 6;
        doc.setFontSize(9);
        doc.setTextColor(197, 48, 48);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total de faltosos: ${dados.length}`, 14, finalY);

        RelatoriosModule._rodapePDF(doc);
        doc.save(`isaude_faltosos_${new Date().toISOString().slice(0,10)}.pdf`);
    },

    baixarPDFMarcados: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const periodo = RelatoriosModule._getPeriodo();
        const y = RelatoriosModule._cabecalhoPDF(doc, 'RELATÓRIO DE PACIENTES AGENDADOS', periodo);
        const dados = RelatoriosModule._getDadosFiltrados().filter(i => i.status === 'agendado');
        const rows = dados.map(i => {
            const hoje = new Date(); hoje.setHours(0,0,0,0);
            const d = i.procedimento.dataMarcacao;
            let situacao = '-';
            if (d) {
                const [a,m,dd] = d.split('-').map(Number);
                const diff = Math.round((new Date(a,m-1,dd) - hoje)/(1000*60*60*24));
                situacao = diff > 0 ? `Faltam ${diff}d` : diff === 0 ? 'Hoje' : `${Math.abs(diff)}d atrás`;
            }
            return [i.paciente.nome, i.procedimento.nome, Utils.formatDate(d), i.procedimento.tipo, situacao];
        });
        doc.autoTable({
            startY: y + 4,
            head: [['Paciente','Procedimento','Data Marcação','Tipo','Situação']],
            body: rows,
            styles: { font:'helvetica', fontSize:8, cellPadding:3 },
            headStyles: { fillColor:[10,124,106], textColor:255, fontStyle:'bold' },
            alternateRowStyles: { fillColor:[240,250,248] },
            theme: 'striped', margin:{ left:14, right:14 }
        });
        const finalY = doc.lastAutoTable.finalY + 6;
        doc.setFontSize(9); doc.setTextColor(10,124,106); doc.setFont('helvetica','bold');
        doc.text(`Total agendado: ${dados.length}`, 14, finalY);
        RelatoriosModule._rodapePDF(doc);
        doc.save(`isaude_agendados_${new Date().toISOString().slice(0,10)}.pdf`);
    },

    baixarPDFPorProcedimento: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const periodo = RelatoriosModule._getPeriodo();
        const y = RelatoriosModule._cabecalhoPDF(doc, 'RELATÓRIO ANALÍTICO — POR PROCEDIMENTO', periodo);
        const dados = RelatoriosModule._getDadosFiltrados();
        const contagem = {};
        dados.forEach(i => {
            const n = i.procedimento.nome;
            if (!contagem[n]) contagem[n] = { marcados:0, concluidos:0, faltosos:0, espera:0, total:0 };
            contagem[n][i.status === 'agendado' ? 'marcados' : i.status] = (contagem[n][i.status === 'agendado' ? 'marcados' : i.status] || 0) + 1;
            contagem[n].total++;
        });
        const rows = Object.entries(contagem).sort((a,b)=>b[1].total-a[1].total).map(([proc, c]) => [
            proc, c.total, c.concluidos||0, c.marcados||0, c.faltosos||0, c.espera||0
        ]);
        doc.autoTable({
            startY: y + 4,
            head: [['Procedimento','Total','Concluídos','Agendados','Faltosos','Em Espera']],
            body: rows,
            styles: { font:'helvetica', fontSize:8, cellPadding:3 },
            headStyles: { fillColor:[107,70,193], textColor:255, fontStyle:'bold' },
            alternateRowStyles: { fillColor:[248,244,255] },
            theme: 'striped', margin:{ left:14, right:14 }
        });
        RelatoriosModule._rodapePDF(doc);
        doc.save(`isaude_por_procedimento_${new Date().toISOString().slice(0,10)}.pdf`);
    },

    baixarPDFPorTipo: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const periodo = RelatoriosModule._getPeriodo();
        const y = RelatoriosModule._cabecalhoPDF(doc, 'RELATÓRIO ANALÍTICO — POR TIPO DE ATENDIMENTO', periodo);
        const dados = RelatoriosModule._getDadosFiltrados();
        const tipos = ['SUS','CONSORCIO','PARTICULAR','DESCONTO'];
        const rows = tipos.map(tipo => {
            const sub = dados.filter(i => i.procedimento.tipo === tipo);
            return [tipo, sub.length, sub.filter(i=>i.status==='concluido').length, sub.filter(i=>i.status==='agendado').length, sub.filter(i=>i.status==='faltoso').length, sub.filter(i=>i.status==='espera').length];
        }).filter(r => r[1] > 0);
        doc.autoTable({
            startY: y + 4,
            head: [['Tipo','Total','Concluídos','Agendados','Faltosos','Em Espera']],
            body: rows,
            styles: { font:'helvetica', fontSize:9, cellPadding:4 },
            headStyles: { fillColor:[0,151,167], textColor:255, fontStyle:'bold' },
            alternateRowStyles: { fillColor:[240,252,255] },
            theme: 'striped', margin:{ left:14, right:14 }
        });
        // Gráfico simples de barras em texto
        let yPos = doc.lastAutoTable.finalY + 14;
        doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(30,50,80);
        doc.text('Distribuição por tipo', 14, yPos); yPos += 8;
        const total = dados.length || 1;
        const w = doc.internal.pageSize.getWidth() - 28;
        rows.forEach(r => {
            const pct = Math.round((r[1]/total)*100);
            const barW = Math.max((r[1]/total)*w, 2);
            doc.setFillColor(10,124,106); doc.roundedRect(14, yPos, barW, 7, 2, 2, 'F');
            doc.setFontSize(7); doc.setTextColor(50,50,50); doc.setFont('helvetica','normal');
            doc.text(`${r[0]}  ${r[1]} (${pct}%)`, 14 + barW + 4, yPos + 5);
            yPos += 12;
        });
        RelatoriosModule._rodapePDF(doc);
        doc.save(`isaude_por_tipo_${new Date().toISOString().slice(0,10)}.pdf`);
    },

    baixarPDFAtrasados: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const y = RelatoriosModule._cabecalhoPDF(doc, 'RELATÓRIO DE PACIENTES COM ESPERA SUPERIOR A 90 DIAS', 'Posição atual');
        const dados = DB.getAll().filter(i => {
            if (i.status !== 'espera') return false;
            const dataBase = i.procedimento.dataSolicitacao || i.procedimento.dataRecebimento;
            return Utils.diffDays(dataBase) >= 90;
        }).sort((a,b) => {
            const da = Utils.diffDays(a.procedimento.dataSolicitacao||a.procedimento.dataRecebimento);
            const db = Utils.diffDays(b.procedimento.dataSolicitacao||b.procedimento.dataRecebimento);
            return db - da;
        });
        const rows = dados.map(i => {
            const dataBase = i.procedimento.dataSolicitacao || i.procedimento.dataRecebimento;
            return [i.paciente.nome, i.procedimento.nome, Utils.formatDate(dataBase), `${Utils.diffDays(dataBase)} dias`, i.procedimento.tipo];
        });
        doc.autoTable({
            startY: y + 4,
            head: [['Paciente','Procedimento','Data Ref.','Dias em Espera','Tipo']],
            body: rows,
            styles: { font:'helvetica', fontSize:8, cellPadding:3 },
            headStyles: { fillColor:[197,48,48], textColor:255, fontStyle:'bold' },
            bodyStyles: { textColor:[80,20,20] },
            alternateRowStyles: { fillColor:[255,245,245] },
            theme: 'striped', margin:{ left:14, right:14 }
        });
        const finalY = doc.lastAutoTable.finalY + 6;
        doc.setFontSize(9); doc.setTextColor(197,48,48); doc.setFont('helvetica','bold');
        doc.text(`Total de pacientes em situação crítica: ${dados.length}`, 14, finalY);
        RelatoriosModule._rodapePDF(doc);
        doc.save(`isaude_atrasados_90dias_${new Date().toISOString().slice(0,10)}.pdf`);
    },

    baixarPDFRetornos: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const periodo = RelatoriosModule._getPeriodo();
        const y = RelatoriosModule._cabecalhoPDF(doc, 'RELATÓRIO DE RETORNOS', periodo);
        const dados = RelatoriosModule._getDadosFiltrados().filter(i => i.procedimento.isRetorno);
        const rows = dados.map(i => {
            const d = i.procedimento.dataMarcacao || i.procedimento.dataRecebimento;
            const statusMap = { agendado:'Agendado', concluido:'Concluído', faltoso:'Faltou', espera:'Em Espera' };
            return [i.paciente.nome, i.procedimento.nome, Utils.formatDate(d), i.procedimento.tipo, statusMap[i.status]||i.status];
        });
        doc.autoTable({
            startY: y + 4,
            head: [['Paciente','Procedimento','Data','Tipo','Status']],
            body: rows,
            styles: { font:'helvetica', fontSize:8, cellPadding:3 },
            headStyles: { fillColor:[45,106,179], textColor:255, fontStyle:'bold' },
            alternateRowStyles: { fillColor:[235,248,255] },
            theme: 'striped', margin:{ left:14, right:14 }
        });
        const finalY = doc.lastAutoTable.finalY + 6;
        doc.setFontSize(9); doc.setTextColor(45,106,179); doc.setFont('helvetica','bold');
        doc.text(`Total de retornos: ${dados.length}`, 14, finalY);
        RelatoriosModule._rodapePDF(doc);
        doc.save(`isaude_retornos_${new Date().toISOString().slice(0,10)}.pdf`);
    },

    // Legado — mantido para compatibilidade
    baixarPDF: () => { RelatoriosModule.baixarPDFGeral(); },

    buscarPaciente: (termo) => {
        const lista = document.getElementById('sugestoesHistorico');
        lista.innerHTML = '';
        if (termo.length < 3) return;
        const unicos = new Map();
        DB.getAll().forEach(reg => unicos.set(reg.paciente.nome, reg.paciente));
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
        historico.sort((a,b) => {
            const da = a.procedimento.dataMarcacao || a.procedimento.dataRecebimento || '';
            const db = b.procedimento.dataMarcacao || b.procedimento.dataRecebimento || '';
            return db.localeCompare(da);
        });
        if (historico.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:20px;">Nenhum registro encontrado.</td></tr>';
            return;
        }
        historico.forEach(item => {
            const dataRef = item.procedimento.dataMarcacao || item.procedimento.dataRecebimento;
            const statusMap = {
                agendado: '<span class="badge badge-info">Marcado</span>',
                concluido: '<span class="badge badge-success">Concluído</span>',
                faltoso: '<span class="badge badge-danger">Faltou</span>',
                espera: '<span class="badge badge-warning">Em Espera</span>'
            };
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${Utils.formatDate(dataRef)} ${item.procedimento.isRetorno ? '<span class="badge badge-neutral" style="font-size:0.65rem;">R</span>' : ''}</td>
                <td>${item.procedimento.nome}</td>
                <td>${item.procedimento.tipo}</td>
                <td>${statusMap[item.status] || item.status}</td>
                <td><i class="ph ph-magnifying-glass icon-btn" onclick="Utils.verDetalhes('${item.id}')"></i></td>
            `;
            tbody.appendChild(tr);
        });
    }
};

// ============================================================
// ARMAZENAMENTO
// ============================================================
const StorageModule = {
    init: () => {
        StorageModule.atualizarGrafico();
        SupabaseConfig.init();
    },

    atualizarGrafico: () => {
        const todos = DB.getAll();
        const qtd = todos.length;
        const concluidos = todos.filter(i => i.status === 'concluido').length;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('storagePercent', `${qtd}`);

        const chart = document.getElementById('storageChart');
        if (chart) {
            const pct = qtd > 0 ? Math.min(Math.round((concluidos / qtd) * 100), 100) : 0;
            chart.style.background = `conic-gradient(var(--primary) ${pct}%, var(--secondary) 0)`;
        }

        const info = document.querySelector('.storage-info p');
        if (info) info.innerText = "Dados sincronizados com Supabase (Nuvem).";
    },

    baixarCSV: () => {
        const dados = DB.getAll();
        if (dados.length === 0) { alert("Sem dados para exportar."); return; }
        let csv = "ID;Status;Nome;Nascimento;Endereco;Contato;Procedimento;DataRec;DataSol;DataMarc;Tipo;Retorno;Justificativa\n";
        dados.forEach(i => {
            csv += [i.id, i.status, i.paciente.nome, i.paciente.nascimento,
                (i.paciente.endereco||'').replace(/;/g,','), i.paciente.contato,
                i.procedimento.nome, i.procedimento.dataRecebimento||'',
                i.procedimento.dataSolicitacao||'', i.procedimento.dataMarcacao||'',
                i.procedimento.tipo, i.procedimento.isRetorno, i.justificativa||''].join(';') + '\n';
        });
        const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `isaude_backup_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
    },

    importarCSV: async (input) => {
        if (!confirm("Isso irá inserir todos os dados do CSV na nuvem. Pode demorar. Continuar?")) return;
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const lines = e.target.result.split('\n');
            let count = 0;
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i].trim();
                if (!row) continue;
                const cols = row.split(';');
                if (cols.length < 5) continue;
                await DB.add({
                    status: cols[1],
                    paciente: { nome: cols[2], nascimento: cols[3], endereco: cols[4], contato: cols[5] },
                    procedimento: { nome: cols[6], dataRecebimento: cols[7], dataSolicitacao: cols[8], dataMarcacao: cols[9], tipo: cols[10], isRetorno: cols[11]==='true' },
                    justificativa: cols[12]
                });
                count++;
            }
            alert(`Importação concluída. ${count} registros inseridos.`);
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
    ThemeManager.init();
    document.getElementById('btnAuthMain').addEventListener('click', Auth.login);
    ProcedimentosDB.renderSelects();
    Auth.init();
};

// SYNC EM TEMPO REAL
const ativarSincronizacao = () => {
    supabaseClient.channel('db-atendimentos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, async () => {
            await DB.init();
        })
        .subscribe((status) => {
            if (status === 'CHANNEL_ERROR') console.error("Erro no Realtime do Supabase.");
        });
};

window.ForcarSincronizacao = async () => {
    const btn = document.querySelector('button[onclick="ForcarSincronizacao()"]');
    if (btn) btn.innerHTML = '<span class="sync-icon">⟳</span> Carregando...';
    const sucesso = await DB.sync();
    if (btn) btn.innerHTML = '<span class="sync-icon">⟳</span><span class="sync-text">Atualizar</span>';
    if (sucesso) { Router.refreshCurrent(); }
    else { alert("Falha ao atualizar. Verifique sua conexão."); }
};

function filtrarListaEspera() {
    EsperaModule.aplicarFiltros();
    AcompanhamentoModule.aplicarFiltros();
}

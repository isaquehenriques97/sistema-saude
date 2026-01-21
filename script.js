/**
 * SISTEMA DE GESTÃO DE SAÚDE - VERSÃO CLOUD (SUPABASE)
 */

// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://hjxxeinmndqvzoqkbpeg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mccotQ72Z6xLM22aDn3XmA_BMOZThGK';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Cache local para performance (espelho do banco)
let LOCAL_DATA_CACHE = [];
let CUSTOM_PROCEDIMENTOS_CACHE = [];

// Lista Padrão (Hardcoded)
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

// --- MÓDULO DE AUTENTICAÇÃO ---
const Auth = {
    init: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            document.getElementById('loginOverlay').style.display = 'none';
            await DB.init(); // Carrega dados iniciais
        } else {
            document.getElementById('loginOverlay').style.display = 'flex';
        }
    },
    login: async () => {
        const email = document.getElementById('emailLogin').value;
        const password = document.getElementById('senhaLogin').value;
        const btn = document.querySelector('#loginOverlay button');
        const msg = document.getElementById('msgLogin');

        btn.innerText = 'Entrando...';
        btn.disabled = true;

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            msg.innerText = "Erro: " + error.message;
            btn.innerText = 'Entrar';
            btn.disabled = false;
        } else {
            document.getElementById('loginOverlay').style.display = 'none';
            await DB.init();
        }
    },
    logout: async () => {
        await supabase.auth.signOut();
        window.location.reload();
    }
};

// --- GERENCIADOR DE DADOS (ADAPTADO PARA SUPABASE) ---
const DB = {
    // Carrega tudo do Supabase para a memória no início
    init: async () => {
        // 1. Carregar Atendimentos
        const { data: atendimentos, error: err1 } = await supabase
            .from('atendimentos')
            .select('*');
        
        if (err1) console.error("Erro ao carregar atendimentos", err1);
        
        // Mapear do formato SQL para o formato do seu Objeto JS antigo
        LOCAL_DATA_CACHE = (atendimentos || []).map(row => ({
            id: row.id,
            status: row.status,
            paciente: {
                nome: row.paciente_nome,
                ...row.paciente_dados
            },
            procedimento: {
                nome: row.procedimento_nome,
                ...row.procedimento_dados
            },
            justificativa: row.justificativa,
            statusJustificativa: row.justificativa ? 'Justificado' : 'Não Justificado'
        }));

        // 2. Carregar Procedimentos Customizados
        const { data: procs, error: err2 } = await supabase.from('tipos_procedimentos').select('nome');
        if(!err2) {
            CUSTOM_PROCEDIMENTOS_CACHE = procs.map(p => p.nome);
        }

        console.log("Dados carregados:", LOCAL_DATA_CACHE.length);
        ProcedimentosDB.renderSelects();
        Router.refreshCurrent();
        StorageModule.atualizarGrafico();
    },

    getAll: () => {
        // Retorna do cache local (síncrono, como seu código antigo espera)
        return LOCAL_DATA_CACHE; 
    },

    add: async (registro) => {
        // Prepara objeto para o formato do Banco SQL
        const dbRow = {
            status: registro.status,
            paciente_nome: registro.paciente.nome,
            paciente_dados: {
                nascimento: registro.paciente.nascimento,
                endereco: registro.paciente.endereco,
                contato: registro.paciente.contato
            },
            procedimento_nome: registro.procedimento.nome,
            procedimento_dados: {
                dataRecebimento: registro.procedimento.dataRecebimento,
                dataSolicitacao: registro.procedimento.dataSolicitacao,
                dataMarcacao: registro.procedimento.dataMarcacao,
                dataProcedimento: registro.procedimento.dataProcedimento,
                tipo: registro.procedimento.tipo,
                isRetorno: registro.procedimento.isRetorno
            },
            justificativa: registro.justificativa
        };

        const { data, error } = await supabase.from('atendimentos').insert([dbRow]).select();
        
        if (error) {
            alert('Erro ao salvar no servidor: ' + error.message);
            return;
        }

        // Atualiza Cache Local com o ID gerado pelo banco
        const novoItem = { ...registro, id: data[0].id };
        LOCAL_DATA_CACHE.push(novoItem);
        DB.saveLocalFallback(); // Apenas atualiza UI/Graficos
    },

    update: async (id, novosDados) => {
        const index = LOCAL_DATA_CACHE.findIndex(item => item.id === id);
        if (index === -1) return;

        // Mescla dados antigos com novos no cache
        const registroAtualizado = { ...LOCAL_DATA_CACHE[index], ...novosDados };
        
        // Prepara para enviar ao Supabase
        // Nota: Aqui simplificamos. Em produção ideal, atualizaria apenas os campos mudados.
        // Vamos reconstruir o objeto DB row
        const dbRow = {
            status: registroAtualizado.status,
            paciente_nome: registroAtualizado.paciente.nome,
            paciente_dados: {
                nascimento: registroAtualizado.paciente.nascimento,
                endereco: registroAtualizado.paciente.endereco,
                contato: registroAtualizado.paciente.contato
            },
            procedimento_nome: registroAtualizado.procedimento.nome,
            procedimento_dados: {
                dataRecebimento: registroAtualizado.procedimento.dataRecebimento,
                dataSolicitacao: registroAtualizado.procedimento.dataSolicitacao,
                dataMarcacao: registroAtualizado.procedimento.dataMarcacao,
                dataProcedimento: registroAtualizado.procedimento.dataProcedimento,
                tipo: registroAtualizado.procedimento.tipo,
                isRetorno: registroAtualizado.procedimento.isRetorno
            },
            justificativa: registroAtualizado.justificativa
        };

        const { error } = await supabase.from('atendimentos').update(dbRow).eq('id', id);

        if (error) {
            alert("Erro ao atualizar: " + error.message);
            return;
        }

        LOCAL_DATA_CACHE[index] = registroAtualizado;
        DB.saveLocalFallback();
    },

    delete: async (id) => {
        if (confirm("Tem certeza que deseja apagar do servidor permanentemente?")) {
            const { error } = await supabase.from('atendimentos').delete().eq('id', id);
            
            if (error) {
                alert("Erro ao deletar: " + error.message);
                return;
            }

            LOCAL_DATA_CACHE = LOCAL_DATA_CACHE.filter(item => item.id !== id);
            Router.refreshCurrent();
        }
    },

    // Função auxiliar para atualizar UI após mudanças
    saveLocalFallback: () => {
        Router.refreshCurrent();
        StorageModule.atualizarGrafico();
    },
    
    // Método novo para importar CSV em lote
    importarLote: async (listaNovos) => {
         // Converte formato JS para SQL
         const batch = listaNovos.map(reg => ({
            status: reg.status,
            paciente_nome: reg.paciente.nome,
            paciente_dados: {
                nascimento: reg.paciente.nascimento,
                endereco: reg.paciente.endereco,
                contato: reg.paciente.contato
            },
            procedimento_nome: reg.procedimento.nome,
            procedimento_dados: {
                dataRecebimento: reg.procedimento.dataRecebimento,
                dataSolicitacao: reg.procedimento.dataSolicitacao,
                dataMarcacao: reg.procedimento.dataMarcacao,
                dataProcedimento: reg.procedimento.dataProcedimento,
                tipo: reg.procedimento.tipo,
                isRetorno: reg.procedimento.isRetorno
            },
            justificativa: reg.justificativa
         }));

         const { error } = await supabase.from('atendimentos').insert(batch);
         if(error) throw error;
         await DB.init(); // Recarrega tudo
    }
};

// --- PROCEDIMENTOS DB ADAPTADO ---
const ProcedimentosDB = {
    getAll: () => {
        const unicos = [...new Set([...PROCEDIMENTOS_PADRAO, ...CUSTOM_PROCEDIMENTOS_CACHE])];
        return unicos.sort();
    },
    add: async (nome) => {
        if(!nome) return false;
        const upper = nome.toUpperCase().trim();
        const atuais = ProcedimentosDB.getAll();
        if(atuais.includes(upper)) return true; 

        if(!PROCEDIMENTOS_PADRAO.includes(upper)){
            // Salva no Supabase
            const { error } = await supabase.from('tipos_procedimentos').insert([{ nome: upper }]);
            if(!error) {
                CUSTOM_PROCEDIMENTOS_CACHE.push(upper);
                return true;
            } else {
                console.error(error);
                return false;
            }
        }
        return true;
    },
    adicionarNovoViaInterface: async () => {
        const novo = prompt("Digite o nome do novo procedimento:");
        if(novo) {
            const upper = novo.toUpperCase().trim();
            await ProcedimentosDB.add(upper); // Agora é async
            ProcedimentosDB.renderSelects(); 
            document.getElementById('procedimento').value = upper; 
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

// --- MANTENDO MÓDULOS DE UI (Router, Utils, etc.) ---
// ... (Mantenha o código do Router, Utils, e Modules UI quase igual)
// A única mudança necessária é onde chamavam `DB.save` ou `DB.add`
// As funções CadastroModule.salvar, AcompanhamentoModule.marcarCompareceu, etc.
// precisam ser marcadas como `async` se quiserem esperar o salvamento.

const Router = {
    currentPage: 'cadastro',
    navigate: (pageId) => {
        // Verifica se usuário quer sair
        if(pageId === 'logout') {
            Auth.logout();
            return;
        }

        document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
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

const Utils = {
    // ... (Mantenha igual ao original) ...
    uuid: () => Date.now().toString(36) + Math.random().toString(36).substr(2),
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
        const dados = DB.getAll(); // Pega do cache, funciona igual
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
            <p><strong>Data Marcação (Sistema):</strong> ${Utils.formatDate(item.procedimento.dataMarcacao)}</p>
            <p><strong>Marcado Para (Consulta):</strong> ${Utils.formatDate(item.procedimento.dataProcedimento)}</p>
            ${item.justificativa ? `<p style="color:red"><strong>Justificativa:</strong> ${item.justificativa}</p>` : ''}
        `;
        document.getElementById('modalDetalhes').classList.remove('hidden');
    },
    fecharModalDetalhes: () => {
        document.getElementById('modalDetalhes').classList.add('hidden');
    }
};

const CadastroModule = {
    // ... (Mantenha o init, buscarPaciente e preencherPaciente iguais) ...
    init: () => {
        document.getElementById('dataRecebimento').valueAsDate = new Date();
    },
    buscarPaciente: (termo) => {
        // ... (igual ao original)
        const lista = document.getElementById('sugestoesPaciente');
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
    // SALVAR AGORA É ASYNC
    salvar: async (e) => {
        e.preventDefault();
        const btnSubmit = document.querySelector('#formCadastro button[type="submit"]');
        const txtOriginal = btnSubmit.innerText;
        btnSubmit.innerText = "Salvando...";
        btnSubmit.disabled = true;

        const idEdicao = document.getElementById('editId').value;
        const dataSolicitacao = document.getElementById('dataSolicitacao').value;
        const dataMarcacao = document.getElementById('dataMarcacao').value;
        const dataProcedimento = document.getElementById('dataProcedimento').value;

        let status = 'agendado';
        if (!dataProcedimento) {
            status = 'espera';
        }

        const registro = {
            id: idEdicao, // Se for nulo, o DB.add ignora
            status: status,
            paciente: {
                nome: document.getElementById('nomePaciente').value,
                nascimento: document.getElementById('dataNascimento').value,
                endereco: document.getElementById('endereco').value,
                contato: document.getElementById('contato').value
            },
            procedimento: {
                nome: document.getElementById('procedimento').value,
                dataRecebimento: document.getElementById('dataRecebimento').value,
                dataSolicitacao: dataSolicitacao,
                dataMarcacao: dataMarcacao,
                dataProcedimento: dataProcedimento,
                tipo: document.getElementById('tipoMarcacao').value,
                isRetorno: document.getElementById('isRetorno').checked
            }
        };

        try {
            if (idEdicao) {
                await DB.update(idEdicao, registro);
                alert('Cadastro atualizado!');
            } else {
                await DB.add(registro);
            }

            if (status === 'espera') {
                if(confirm("Enviado para Lista de Espera. Novo cadastro?")){
                    CadastroModule.limparFormulario();
                }
            } else {
                alert("Salvo com sucesso!");
                CadastroModule.limparFormulario();
            }
        } catch (err) {
            console.error(err);
        } finally {
            btnSubmit.innerText = txtOriginal;
            btnSubmit.disabled = false;
        }
    }
};
document.getElementById('formCadastro').addEventListener('submit', CadastroModule.salvar);

// MÓDULOS DE RENDERIZAÇÃO (Acompanhamento, Concluidos, Faltosos, Espera)
// Eles continuam iguais ao original, pois DB.getAll() agora lê do cache.
// Apenas as funções de ação (marcarCompareceu, confirmarFalta) precisam ser atualizadas.

const AcompanhamentoModule = {
    // ... render e aplicarFiltros IGUAIS AO ORIGINAL ...
    tempId: null,
    render: (filtros = {}) => {
        const tbody = document.getElementById('tabelaAcompanhamento');
        tbody.innerHTML = '';
        let dados = DB.getAll().filter(i => i.status === 'agendado');
        // ... (logica de filtros original) ...
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
        AcompanhamentoModule.render();
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
        AcompanhamentoModule.render();
    }
};

const ConcluidosModule = {
    // Render e aplicarFiltros iguais, só precisa mudar o DELETE
    render: (filtros = {}) => {
        // ... Copie o conteúdo original de ConcluidosModule.render aqui ...
        // Mas a linha do delete deve ser: onclick="DB.delete('${item.id}')" (já está ok pois DB.delete agora é async e lida com isso)
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
        // ... (Copie o original) ...
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
        // ... (Copie o original) ...
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
        // ... (igual ao original)
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

// RELATÓRIOS E STORAGE
// RelatoriosModule: Mantenha IGUAL (ele usa DB.getAll que lê do cache)
// StorageModule: Precisa adaptar a Importação para usar DB.importarLote

const RelatoriosModule = {
    // ... (Copie todo o RelatoriosModule original aqui, está perfeito pois lê o cache) ...
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
        // ... RESTANTE DA LOGICA DE RELATORIOS IGUAL ...
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
         // ... (LOGICA PDF IGUAL) ...
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const inicio = document.getElementById('filtroRelatorioInicio').value;
        const fim = document.getElementById('filtroRelatorioFim').value;
        const periodoTexto = (inicio || fim) ? `Período: ${Utils.formatDate(inicio)} a ${Utils.formatDate(fim)}` : "Período: Todo o Histórico";

        doc.setFontSize(18);
        doc.text("Relatório de Gestão de Saúde", 14, 20);
        doc.setFontSize(12);
        doc.text(periodoTexto, 14, 30);

        const marcados = document.getElementById('dashMarcados').innerText;
        const concluidos = document.getElementById('dashConcluidos').innerText;
        const faltosos = document.getElementById('dashFaltosos').innerText;
        const espera = document.getElementById('dashEspera').innerText;
        const solicitacoes = document.getElementById('dashSolicitacoes').innerText;

        const dadosResumo = [
            ["Categoria", "Quantidade"],
            ["Pacientes Marcados", marcados],
            ["Pacientes Concluídos", concluidos],
            ["Pacientes Faltosos", faltosos],
            ["Lista de Espera", espera],
            ["Solicitações Abertas", solicitacoes]
        ];

        doc.autoTable({
            startY: 40,
            head: [dadosResumo[0]],
            body: dadosResumo.slice(1),
            theme: 'striped',
            headStyles: { fillColor: [0, 86, 179] }
        });

        const counts = {};
        RelatoriosModule.dadosConcluidosCache.forEach(item => {
            const nome = item.procedimento.nome;
            counts[nome] = (counts[nome] || 0) + 1;
        });

        const dadosProcedimentos = Object.keys(counts).map(nome => [nome, counts[nome]]);
        dadosProcedimentos.sort((a,b) => b[1] - a[1]);

        if(dadosProcedimentos.length > 0) {
            doc.text("Procedimentos Realizados (Concluídos)", 14, doc.lastAutoTable.finalY + 15);
            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 20,
                head: [["Nome do Procedimento", "Qtd. Realizada"]],
                body: dadosProcedimentos,
                theme: 'grid',
                headStyles: { fillColor: [46, 125, 50] }
            });
        }
        doc.save(`relatorio_saude_${new Date().toISOString().slice(0,10)}.pdf`);
    },
    buscarPaciente: (termo) => {
        // ... (igual ao original)
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
        // ... (igual ao original)
        document.getElementById('sugestoesHistorico').innerHTML = '';
        document.getElementById('buscaHistorico').value = nomePaciente;
        document.getElementById('containerHistorico').style.display = 'block';
        document.getElementById('nomePacienteHistorico').innerText = nomePaciente;

        const tbody = document.getElementById('tabelaHistorico');
        tbody.innerHTML = '';

        const historico = DB.getAll().filter(i => i.paciente.nome === nomePaciente);
        const inicio = document.getElementById('filtroRelatorioInicio').value;
        const fim = document.getElementById('filtroRelatorioFim').value;

        historico.forEach(item => {
            const dataRef = item.procedimento.dataProcedimento || item.procedimento.dataMarcacao || item.procedimento.dataRecebimento;
            if(inicio && dataRef < inicio) return;
            if(fim && dataRef > fim) return;

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
        // Como agora é nuvem, mostramos "Nuvem" ao invés de bytes
        document.getElementById('storagePercent').innerText = "OK";
        const chart = document.getElementById('storageChart');
        chart.style.background = `conic-gradient(var(--success) 100%, var(--secondary) 0)`;
        document.querySelector('.storage-info p').innerText = "Os dados estão seguros na nuvem (Supabase).";
    },
    baixarCSV: () => {
        const dados = DB.getAll(); // Pega do Cache
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
                i.procedimento.dataProcedimento || ''
            ];
            csv += linha.join(";") + "\n";
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `backup_saude_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
    },
    importarCSV: (input) => {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(e) {
            const text = e.target.result;
            const lines = text.split("\n");
            
            let novosDados = [];
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i].trim();
                if (!row) continue;
                
                const cols = row.split(";");
                if (cols.length < 5) continue;

                const nomeProc = cols[6];
                if(nomeProc) await ProcedimentosDB.add(nomeProc.toUpperCase());

                const registro = {
                    status: cols[1],
                    paciente: {
                        nome: cols[2],
                        nascimento: cols[3],
                        endereco: cols[4],
                        contato: cols[5]
                    },
                    procedimento: {
                        nome: nomeProc,
                        dataRecebimento: cols[7],
                        dataSolicitacao: cols[8],
                        dataMarcacao: cols[9],
                        tipo: cols[10],
                        isRetorno: cols[11] === 'true',
                        dataProcedimento: cols[13] || ''
                    },
                    justificativa: cols[12]
                };
                novosDados.push(registro);
            }

            if(novosDados.length > 0) {
                if(confirm(`Encontrados ${novosDados.length} registros no CSV. Deseja enviar para o Banco de Dados?`)){
                    try {
                        await DB.importarLote(novosDados);
                        alert("Importação concluída com sucesso!");
                    } catch(err) {
                        alert("Erro na importação: " + err.message);
                    }
                }
            } else {
                alert("Erro ao ler CSV. Verifique o formato.");
            }
        };
        reader.readAsText(file);
        input.value = '';
    },
    limparTudo: () => {
        alert("A limpeza total foi desabilitada por segurança na versão Cloud. Apague manualmente ou contate o administrador.");
    }
};

// Adicionar botão de logout na Sidebar (Opcional, mas recomendado)
// Você pode adicionar manualmente no HTML ou via JS
const sidebarUl = document.querySelector('.sidebar ul');
const liLogout = document.createElement('li');
liLogout.innerHTML = '<i class="ph ph-sign-out"></i> Sair';
liLogout.onclick = () => Router.navigate('logout');
sidebarUl.appendChild(liLogout);


window.onload = () => {
    // Inicializa verificando sessão
    Auth.init();
    
    // Configura UI
    Router.navigate('cadastro');
};
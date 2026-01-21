/**
 * SISTEMA DE GESTÃO DE SAÚDE - VERSÃO HÍBRIDA (CLOUD + LÓGICA ORIGINAL)
 */

// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://hjxxeinmndqvzoqkbpeg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6dnp4dmVqb2FyZ2ZxcmxteGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTU5ODIsImV4cCI6MjA4NDU5MTk4Mn0._ew5X-XraLq1PxHIn413KrwdcwTMSMg1pOSvm0gaZ4o';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Cache Local (Substitui o localStorage para manter a velocidade e lógica antiga)
let CACHE_DADOS = [];
let CACHE_PROCEDIMENTOS = [];

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

// --- MÓDULO DE AUTENTICAÇÃO E INICIALIZAÇÃO ---
const Auth = {
    init: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
            document.getElementById('loginOverlay').style.display = 'none';
            await DB.sincronizar(); // Baixa os dados da nuvem
            ProcedimentosDB.init(); // Inicializa procedimentos
            Router.initModule(Router.current); // Renderiza a tela atual
        } else {
            document.getElementById('loginOverlay').style.display = 'flex';
        }
    },
    login: async () => {
        const email = document.getElementById('emailLogin').value;
        const password = document.getElementById('senhaLogin').value;
        const btn = document.getElementById('btnAuthMain');
        
        btn.innerText = "Entrando...";
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
            document.getElementById('msgLogin').innerText = "Erro: " + error.message;
            btn.innerText = "Entrar";
        } else {
            window.location.reload();
        }
    },
    logout: async () => {
        await supabase.auth.signOut();
        window.location.reload();
    }
};

// --- BANCO DE DADOS (PONTE ENTRE APP ANTIGO E SUPABASE) ---
const DB = {
    // Transforma dados do Supabase (snake_case) para o App (Objeto aninhado)
    converterParaApp: (rows) => {
        return rows.map(r => ({
            id: r.id,
            status: r.status,
            justificativa: r.justificativa,
            statusJustificativa: r.status_justificativa,
            paciente: {
                nome: r.paciente_nome,
                nascimento: r.paciente_nascimento,
                endereco: r.paciente_endereco,
                contato: r.paciente_contato
            },
            procedimento: {
                nome: r.procedimento_nome,
                dataRecebimento: r.data_recebimento,
                dataSolicitacao: r.data_solicitacao,
                dataMarcacao: r.data_marcacao,
                dataProcedimento: r.data_procedimento,
                tipo: r.tipo_marcacao,
                isRetorno: r.is_retorno
            }
        }));
    },

    // Transforma dados do App para Supabase
    converterParaSQL: (item) => {
        return {
            status: item.status,
            justificativa: item.justificativa,
            status_justificativa: item.statusJustificativa,
            paciente_nome: item.paciente.nome,
            paciente_nascimento: item.paciente.nascimento,
            paciente_endereco: item.paciente.endereco,
            paciente_contato: item.paciente.contato,
            procedimento_nome: item.procedimento.nome,
            data_recebimento: item.procedimento.dataRecebimento || null,
            data_solicitacao: item.procedimento.dataSolicitacao || null,
            data_marcacao: item.procedimento.dataMarcacao || null,
            data_procedimento: item.procedimento.dataProcedimento || null,
            tipo_marcacao: item.procedimento.tipo,
            is_retorno: item.procedimento.isRetorno
        };
    },

    sincronizar: async () => {
        // Baixa tudo do Supabase
        const { data, error } = await supabase.from('atendimentos').select('*');
        if (error) {
            console.error(error);
            alert("Erro de conexão com o banco.");
            return;
        }
        CACHE_DADOS = DB.converterParaApp(data);
        StorageModule.atualizarGrafico();
    },

    // Métodos mantidos com a mesma assinatura do script antigo, mas apontando para o cache/supabase
    getAll: () => {
        return CACHE_DADOS;
    },

    add: async (registro) => {
        const sqlData = DB.converterParaSQL(registro);
        // Remove ID para deixar o Supabase gerar, ou usa se for migração
        delete sqlData.id; 
        
        const { error } = await supabase.from('atendimentos').insert([sqlData]);
        if(error) alert("Erro ao salvar: " + error.message);
        
        await DB.sincronizar(); // Atualiza cache e UI
        Router.refreshCurrent();
    },

    update: async (id, novosDadosParciais) => {
        // Precisamos fundir o objeto antigo com o novo para converter corretamente
        const itemAtual = CACHE_DADOS.find(i => i.id === id);
        if(!itemAtual) return;

        // Mescla profunda simples
        const itemAtualizado = { 
            ...itemAtual, 
            ...novosDadosParciais,
            paciente: { ...itemAtual.paciente, ...(novosDadosParciais.paciente || {}) },
            procedimento: { ...itemAtual.procedimento, ...(novosDadosParciais.procedimento || {}) }
        };

        const sqlData = DB.converterParaSQL(itemAtualizado);
        const { error } = await supabase.from('atendimentos').update(sqlData).eq('id', id);
        
        if(error) alert("Erro ao atualizar: " + error.message);
        
        await DB.sincronizar();
        Router.refreshCurrent();
    },

    delete: async (id) => {
        if (confirm("Tem certeza que deseja apagar permanentemente este registro (Nuvem)?")) {
            const { error } = await supabase.from('atendimentos').delete().eq('id', id);
            if(error) alert("Erro ao excluir: " + error.message);
            await DB.sincronizar();
            Router.refreshCurrent();
        }
    },

    clear: async () => {
        if(confirm("ATENÇÃO: ISSO APAGARÁ TODO O BANCO DE DADOS NA NUVEM!")){
            // Supabase não tem "delete all" simples sem where por segurança,
            // então deletamos onde ID não é nulo.
            const { error } = await supabase.from('atendimentos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if(error) alert("Erro: " + error.message);
            await DB.sincronizar();
            Router.refreshCurrent();
        }
    }
};

// --- GERENCIADOR DE PROCEDIMENTOS (ADAPTADO) ---
const ProcedimentosDB = {
    init: () => {
        // Extrai procedimentos únicos já usados no banco + lista padrão
        const usados = [...new Set(CACHE_DADOS.map(i => i.procedimento.nome))];
        const todos = [...new Set([...PROCEDIMENTOS_PADRAO, ...usados])];
        CACHE_PROCEDIMENTOS = todos.sort();
        ProcedimentosDB.renderSelects();
    },
    getAll: () => CACHE_PROCEDIMENTOS,
    add: (nome) => {
        if(!nome) return;
        const upper = nome.toUpperCase().trim();
        if(!CACHE_PROCEDIMENTOS.includes(upper)){
            CACHE_PROCEDIMENTOS.push(upper);
            CACHE_PROCEDIMENTOS.sort();
            ProcedimentosDB.renderSelects();
        }
    },
    adicionarNovoViaInterface: () => {
        const novo = prompt("Digite o nome do novo procedimento:");
        if(novo) {
            const upper = novo.toUpperCase().trim();
            ProcedimentosDB.add(upper);
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

// --- UTILITÁRIOS (MANTIDOS DO ORIGINAL) ---
const Utils = {
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

const Router = {
    current: 'cadastro',
    navigate: (page) => {
        if(page === 'logout') return Auth.logout();
        
        document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
        const menuItem = document.querySelector(`.sidebar li[onclick*="${page}"]`);
        if(menuItem) menuItem.classList.add('active');

        document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
        document.getElementById(page).classList.add('active');
        Router.current = page;
        
        Router.initModule(page);
    },
    initModule: (page) => {
        if(page !== 'cadastro' && page !== 'armazenamento') ProcedimentosDB.renderSelects();

        switch(page) {
            case 'cadastro': CadastroModule.init(); break;
            case 'acompanhamento': AcompanhamentoModule.render(); break;
            case 'concluidos': ConcluidosModule.render(); break;
            case 'faltosos': FaltososModule.render(); break;
            case 'espera': EsperaModule.render(); break;
            case 'relatorios': RelatoriosModule.init(); break;
            case 'armazenamento': StorageModule.init(); break;
        }
    },
    refreshCurrent: () => Router.initModule(Router.current)
};

// --- MÓDULOS DE LÓGICA (MANTIDOS 100% IGUAIS AO ANTIGO) ---

const CadastroModule = {
    init: () => {
        document.getElementById('dataRecebimento').valueAsDate = new Date();
    },
    buscarPaciente: (termo) => {
        const lista = document.getElementById('sugestoesPaciente');
        lista.innerHTML = '';
        if(termo.length < 3) return;
        
        // Busca no Cache Local
        const unicos = [...new Map(CACHE_DADOS.map(i => [i.paciente.nome, i.paciente])).values()];
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
    limparFormulario: () => {
        document.getElementById('formCadastro').reset();
        document.getElementById('editId').value = '';
        document.getElementById('dataRecebimento').valueAsDate = new Date();
    },
    salvar: async (e) => {
        e.preventDefault();
        const idEdicao = document.getElementById('editId').value;
        const dataProcedimento = document.getElementById('dataProcedimento').value;

        let status = 'agendado';
        if (!dataProcedimento) status = 'espera';

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
                dataProcedimento: dataProcedimento,
                tipo: document.getElementById('tipoMarcacao').value,
                isRetorno: document.getElementById('isRetorno').checked
            }
        };

        if (idEdicao) {
            await DB.update(idEdicao, registro);
            alert('Cadastro atualizado na nuvem!');
        } else {
            await DB.add(registro);
            if (status !== 'espera') alert("Agendado com sucesso!");
        }
        
        if (status === 'espera' && confirm("Enviado para Lista de Espera. Novo cadastro?")) {
            CadastroModule.limparFormulario();
        } else if (status !== 'espera') {
            CadastroModule.limparFormulario();
        }
    }
};

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

        // Cards de Procedimentos
        const counts = {};
        concluidos.forEach(item => {
            const nome = item.procedimento.nome;
            if(!counts[nome]) counts[nome] = 0;
            counts[nome]++;
        });

        const containerCards = document.getElementById('gridProcedimentosConcluidos');
        containerCards.innerHTML = '';
        
        Object.keys(counts).forEach((procNome) => {
            const qtd = counts[procNome];
            const div = document.createElement('div');
            div.className = 'proc-card';
            div.style.backgroundColor = Utils.getRandomColor();
            div.innerHTML = `
                <div><h4>${procNome}</h4><span>${qtd}</span></div>
                <div class="proc-card-icon" onclick="RelatoriosModule.abrirListaDetalhada('${procNome}')" title="Ver Lista">
                     <i class="ph ph-magnifying-glass" style="color:white; font-size:1.2rem;"></i>
                </div>
            `;
            containerCards.appendChild(div);
        });

        RelatoriosModule.dadosConcluidosCache = concluidos;
        document.getElementById('containerHistorico').style.display = 'none';
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
        
        // Mantido simples para o exemplo, pode ser expandido igual ao original
        doc.text("Relatório de Saúde", 10, 10);
        doc.text("Marcados: " + document.getElementById('dashMarcados').innerText, 10, 20);
        doc.text("Concluídos: " + document.getElementById('dashConcluidos').innerText, 10, 30);
        
        doc.autoTable({
            startY: 40,
            head: [['Procedimento', 'Paciente', 'Status']],
            body: DB.getAll().map(i => [i.procedimento.nome, i.paciente.nome, i.status])
        });

        doc.save('relatorio.pdf');
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
        historico.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${Utils.formatDate(item.procedimento.dataProcedimento || item.procedimento.dataRecebimento)}</td>
                <td>${item.procedimento.nome}</td>
                <td>${item.procedimento.tipo}</td>
                <td>${item.status}</td>
                <td><i class="ph ph-magnifying-glass icon-btn" onclick="Utils.verDetalhes('${item.id}')"></i></td>
            `;
            tbody.appendChild(tr);
        });
    }
};

const StorageModule = {
    init: () => { StorageModule.atualizarGrafico(); },
    atualizarGrafico: () => {
        // Mostra o uso relativo ao tamanho da lista (simbólico na nuvem)
        const qtd = CACHE_DADOS.length;
        document.getElementById('storagePercent').innerText = qtd + " reg.";
        document.querySelector('.dashboard-storage p').innerText = "Dados seguros na nuvem Supabase.";
    },
    baixarCSV: () => {
        const dados = DB.getAll();
        if (dados.length === 0) { alert("Sem dados."); return; }
        
        let csv = "ID;Status;Nome;Nascimento;Endereco;Contato;Procedimento;DataRec;DataSol;DataMarc;Tipo;Retorno;Justificativa;DataProcedimento\n";
        dados.forEach(i => {
            const linha = [
                i.id, i.status, i.paciente.nome, i.paciente.nascimento, 
                i.paciente.endereco.replace(/;/g, ","), i.paciente.contato,
                i.procedimento.nome, i.procedimento.dataRecebimento, i.procedimento.dataSolicitacao,
                i.procedimento.dataMarcacao, i.procedimento.tipo, i.procedimento.isRetorno,
                i.justificativa || '', i.procedimento.dataProcedimento || ''
            ];
            csv += linha.join(";") + "\n";
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "backup_nuvem.csv";
        link.click();
    },
    importarCSV: (input) => {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(e) {
            const text = e.target.result;
            const lines = text.split("\n");
            let count = 0;
            
            if(!confirm("Deseja importar esses dados para a nuvem? Isso pode demorar um pouco.")) return;

            for (let i = 1; i < lines.length; i++) {
                const row = lines[i].trim();
                if (!row) continue;
                const cols = row.split(";");
                
                const registro = {
                    status: cols[1],
                    paciente: {
                        nome: cols[2], nascimento: cols[3], endereco: cols[4], contato: cols[5]
                    },
                    procedimento: {
                        nome: cols[6], dataRecebimento: cols[7], dataSolicitacao: cols[8],
                        dataMarcacao: cols[9], tipo: cols[10], isRetorno: cols[11] === 'true',
                        dataProcedimento: cols[13] || ''
                    },
                    justificativa: cols[12]
                };
                await DB.add(registro); // Adiciona um por um no Supabase
                count++;
            }
            alert(`Importação de ${count} registros concluída!`);
            input.value = '';
        };
        reader.readAsText(file);
    },
    limparTudo: () => DB.clear()
};

// --- INICIALIZAÇÃO ---
window.onload = () => {
    document.getElementById('formCadastro').addEventListener('submit', CadastroModule.salvar);
    Auth.init();
};

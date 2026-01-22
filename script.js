/*************************************************
 * SUPABASE CONFIG
 *************************************************/
const SUPABASE_URL = "https://zzvzxvejoargfqrlmxfq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6dnp4dmVqb2FyZ2ZxcmxteGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTU5ODIsImV4cCI6MjA4NDU5MTk4Mn0._ew5X-XraLq1PxHIn413KrwdcwTMSMg1pOSvm0gaZ4o";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/*************************************************
 * STATE — FONTE ÚNICA DA VERDADE
 *************************************************/
const State = {
  procedimentos: [
    "Consulta",
    "Exame",
    "Cirurgia",
    "Retorno",
    "Avaliação"
  ],
  registros: []
};

/*************************************************
 * DATA SYNC — ÚNICO LUGAR QUE FALA COM SUPABASE
 *************************************************/
const DataSync = {
  async carregar() {
    State.loading = true;

    const { data, error } = await supabaseClient
      .from("atendimentos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert("Erro ao carregar dados");
      return;
    }

    State.registros = data;
    State.loading = false;
  },

  async adicionar(registro) {
    const { error } = await supabaseClient
      .from("atendimentos")
      .insert([registro]);

    if (error) {
      alert("Erro ao salvar");
      return;
    }

    await DataSync.carregar();
  },

  async atualizar(id, dados) {
    const { error } = await supabaseClient
      .from("atendimentos")
      .update(dados)
      .eq("id", id);

    if (error) {
      alert("Erro ao atualizar");
      return;
    }

    await DataSync.carregar();
  },

  async remover(id) {
    const { error } = await supabaseClient
      .from("atendimentos")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Erro ao excluir");
      return;
    }

    await DataSync.carregar();
  }
};

/*************************************************
 * STORAGE
 *************************************************/
const Storage = {
  load() {
    const data = localStorage.getItem("registros");
    State.registros = data ? JSON.parse(data) : [];
  },
  save() {
    localStorage.setItem("registros", JSON.stringify(State.registros));
  }
};

/*************************************************
 * DATA (REGRAS DE NEGÓCIO)
 *************************************************/
const Data = {
  addRegistro(registro) {
    registro.id = crypto.randomUUID();
    State.registros.push(registro);
    Storage.save();
  },

  updateRegistro(id, novosDados) {
    const idx = State.registros.findIndex(r => r.id === id);
    if (idx === -1) return;
    State.registros[idx] = { ...State.registros[idx], ...novosDados };
    Storage.save();
  },

  getAll() {
    return State.registros;
  }
};

/*************************************************
 * RENDER — ÚNICO LUGAR QUE TOCA NO DOM
 *************************************************/
const Render = {
  procedimentos() {
    const select = document.getElementById("procedimento");
    if (!select) return;

    select.innerHTML = "<option value=''>Selecione</option>";
    State.procedimentos.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      select.appendChild(opt);
    });
  },

  tabela() {
    const tbody = document.getElementById("tabelaAcompanhamento");
    if (!tbody) return;

    tbody.innerHTML = "";

    State.registros.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.nome_paciente}</td>
        <td>${r.procedimento}</td>
        <td>${r.data_procedimento || "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  },

  relatorios() {
    document.getElementById("dashMarcados").innerText =
      State.registros.length;
  },

  tudo() {
    Render.procedimentos();
    Render.tabela();
    Render.relatorios();
  }
};

/*************************************************
 * EVENTS — AÇÕES DO USUÁRIO
 *************************************************/
const Events = {
  async salvarCadastro(e) {
    e.preventDefault();

    const registro = {
      nome_paciente: document.getElementById("nomePaciente").value,
      procedimento: document.getElementById("procedimento").value,
      data_procedimento: document.getElementById("dataProcedimento").value
    };

    if (!registro.nome_paciente || !registro.procedimento) return;

    await DataSync.adicionar(registro);
    Render.tudo();
    e.target.reset();
  }
};

/*************************************************
 * AUTH CONTROLLER — SUPABASE
 *************************************************/
const Auth = {
  async init() {
    const { data } = await supabaseClient.auth.getSession();

    if (data.session) {
      Auth.onLogin();
    } else {
      Auth.onLogout();
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session) {
        Auth.onLogin();
      } else {
        Auth.onLogout();
      }
    });
  },

  async login(email, password) {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      alert(error.message);
    }
  },

  async logout() {
    await supabaseClient.auth.signOut();
  },

  onLogin() {
    document.getElementById("loginOverlay").style.display = "none";
    App.start(); // 🚨 IMPORTANTE
  },

  onLogout() {
    document.getElementById("loginOverlay").style.display = "flex";
  }
};

/*************************************************
 * INIT
 *************************************************/
const App = {
  async init() {
    await DataSync.carregar();
    Render.tudo();

    document
      .getElementById("formCadastro")
      ?.addEventListener("submit", Events.salvarCadastro);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  Auth.init();

  document.getElementById("btnAuthMain").onclick = () => {
    const email = document.getElementById("emailLogin").value;
    const senha = document.getElementById("senhaLogin").value;
    Auth.login(email, senha);
  };
});

const App = {
  async start() {
    await DataSync.carregar();
    Render.tudo();

    document
      .getElementById("formCadastro")
      ?.addEventListener("submit", Events.salvarCadastro);
  }
};


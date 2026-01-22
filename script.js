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
  session: null,
  procedimentos: [
    "Consulta",
    "Exame",
    "Cirurgia",
    "Retorno",
    "Avaliação"
  ],
  registros: [],
  loading: false
};

/*************************************************
 * AUTH — CONTROLE TOTAL DE LOGIN
 *************************************************/
const Auth = {
  async init() {
    const { data } = await supabaseClient.auth.getSession();
    State.session = data.session;

    supabaseClient.auth.onAuthStateChange((_, session) => {
      State.session = session;
      UI.toggleLogin(!session);
      if (session) App.start();
    });

    UI.toggleLogin(!State.session);
    if (State.session) App.start();
  },

  async login(email, password) {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    if (error) alert(error.message);
  },

  async logout() {
    await supabaseClient.auth.signOut();
  }
};

/*************************************************
 * DATA — ACESSO AO SUPABASE
 *************************************************/
const Data = {
  async carregar() {
    State.loading = true;

    const { data, error } = await supabaseClient
      .from("atendimentos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert("Erro ao carregar dados");
      console.error(error);
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
      console.error(error);
      return;
    }

    await Data.carregar();
  },

  async remover(id) {
    await supabaseClient.from("atendimentos").delete().eq("id", id);
    await Data.carregar();
  }
};

/*************************************************
 * RENDER — TUDO QUE MEXE NO DOM
 *************************************************/
const Render = {
  procedimentos() {
    const select = document.getElementById("procedimento");
    if (!select) return;

    select.innerHTML = "<option value=''>Selecione</option>";
    State.procedimentos.forEach(p => {
      const o = document.createElement("option");
      o.value = p;
      o.textContent = p;
      select.appendChild(o);
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
        <td>
          <button data-id="${r.id}" class="btnExcluir">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll(".btnExcluir").forEach(btn => {
      btn.onclick = () => Data.remover(btn.dataset.id).then(Render.tudo);
    });
  },

  relatorios() {
    const el = document.getElementById("dashMarcados");
    if (el) el.innerText = State.registros.length;
  },

  tudo() {
    Render.procedimentos();
    Render.tabela();
    Render.relatorios();
  }
};

/*************************************************
 * UI — VISIBILIDADE
 *************************************************/
const UI = {
  toggleLogin(show) {
    document.getElementById("loginOverlay").style.display =
      show ? "flex" : "none";

    document.getElementById("appContainer").style.display =
      show ? "none" : "block";
  }
};

/*************************************************
 * EVENTS — USUÁRIO
 *************************************************/
const Events = {
  async salvar(e) {
    e.preventDefault();

    const registro = {
      nome_paciente: nomePaciente.value,
      procedimento: procedimento.value,
      data_procedimento: dataProcedimento.value
    };

    if (!registro.nome_paciente || !registro.procedimento) return;

    await Data.adicionar(registro);
    Render.tudo();
    e.target.reset();
  }
};

/*************************************************
 * APP — CICLO DE VIDA
 *************************************************/
const App = {
  async start() {
    await Data.carregar();
    Render.tudo();

    document
      .getElementById("formCadastro")
      ?.addEventListener("submit", Events.salvar);
  }
};

/*************************************************
 * BOOTSTRAP
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  Auth.init();

  document.getElementById("btnAuthMain").onclick = () =>
    Auth.login(emailLogin.value, senhaLogin.value);
});


import fs from "fs";
import path from "path";

const API_ENDPOINT = "http://localhost:3001/api/send";
const EVOLUTION_API_URL = "https://api.malptech.com.br";
const EVOLUTION_API_KEY = "malp_tech_2026_API_KEY";
const EVOLUTION_INSTANCE = "malptech";

// Gera a mensagem personalizada de alta conversão para Pizzarias
function gerarMensagemPizzaria(nomePizzaria) {
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : "Boa tarde";

  return `${saudacao}, tudo bem? Marco por aqui, fundador da Malp Tech.

Estava analisando a operação da ${nomePizzaria} e uma dúvida rápida de negócio:

Nos dias de maior movimento, a equipe de vocês ainda perde tempo entregando cardápio físico e anotando pedido à mão na mesa ou pelo WhatsApp?

Desenvolvemos um cardápio digital em site, com acesso prático por QR Code, justamente para cortar essa espera e desafogar a equipe de atendimento.

Podemos bater um papo de 3 a 5 minutos essa semana para eu te mostrar como está rodando?`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomEntre = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Valida na Evolution API se o número possui WhatsApp ativo
async function verificarWhatsApp(numeros) {
  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/chat/whatsappNumbers/${EVOLUTION_INSTANCE}`,
      {
        method: "POST",
        headers: {
          apikey: EVOLUTION_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ numbers: numeros }),
      },
    );
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    for (const item of data) {
      map[item.number] = item.exists === true;
    }
    return map;
  } catch (err) {
    console.error("Erro ao validar números no WhatsApp:", err.message);
    return {};
  }
}

// Carrega leads de arquivo CSV ou de lista padrão
function carregarLeads(caminhoArquivo) {
  if (caminhoArquivo && fs.existsSync(caminhoArquivo)) {
    const conteudo = fs
      .readFileSync(caminhoArquivo, "utf-8")
      .replace(/^\uFEFF/, "");
    const linhas = conteudo.split("\n").filter((l) => l.trim() !== "");
    if (linhas.length <= 1) return [];

    const headers = linhas[0]
      .split(",")
      .map((h) => h.trim().toLowerCase().replace(/"/g, ""));
    const idxNome = headers.findIndex((h) => h.includes("nome"));
    const idxTel = headers.findIndex(
      (h) => h.includes("tel") || h.includes("cel") || h.includes("whats"),
    );

    const lista = [];
    for (let i = 1; i < linhas.length; i++) {
      // Regex para split de CSV respeitando aspas
      const colunas =
        linhas[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) ||
        linhas[i].split(",");
      const rawNome = colunas[idxNome] || "";
      const rawTel = colunas[idxTel] || "";

      const nome = rawNome.replace(/"/g, "").trim();
      const telClean = rawTel.replace(/\D/g, "");

      if (nome && telClean.length >= 10) {
        lista.push({ nome, phone: telClean });
      }
    }
    return lista;
  }

  // Se nenhum arquivo for passado, carrega lista inicial de pizzarias da região
  return [
    { nome: "Pizzaria e Choperia Bolinha", phone: "11987562722" },
    { nome: "New Luck Pizzaria e Esfiharia", phone: "1146428734" },
  ];
}

async function iniciarDisparos() {
  const arquivoCSV = process.argv[2] || "pizzarias.csv";
  console.log(`\n🍕 INICIANDO AGENTE DE DISPAROS - ESPECIALISTA EM PIZZARIAS`);
  console.log(`📂 Arquivo alvo: ${arquivoCSV}`);

  const todosLeads = carregarLeads(arquivoCSV);

  if (todosLeads.length === 0) {
    console.log(`⚠️ Nenhum lead encontrado no arquivo ${arquivoCSV}.`);
    console.log(`Crie o arquivo ${arquivoCSV} com as colunas: nome,telefone`);
    return;
  }

  console.log(`🔍 Validando números na API do WhatsApp...`);
  const numerosParaChecar = todosLeads.map((l) =>
    l.phone.startsWith("55") ? l.phone : `55${l.phone}`,
  );
  const statusWhats = await verificarWhatsApp(numerosParaChecar);

  const leadsValidos = todosLeads.filter((l) => {
    const full = l.phone.startsWith("55") ? l.phone : `55${l.phone}`;
    return statusWhats[full] === true;
  });

  console.log(
    `📋 Total de leads: ${todosLeads.length} | WhatsApp Ativo: ${leadsValidos.length}`,
  );
  console.log(
    `⏱️ Configuração: 50s de digitação + 15s de intervalo entre envios\n`,
  );

  const relatorio = [];

  for (let i = 0; i < leadsValidos.length; i++) {
    const lead = leadsValidos[i];
    const numero = i + 1;
    const hora = new Date().toLocaleTimeString("pt-BR");

    console.log(`------------------------------------------------------------`);
    console.log(
      `[${hora}] [${numero}/${leadsValidos.length}] Disparando para: ${lead.nome} (${lead.phone})`,
    );
    const tempoDigitandoSegundos = randomEntre(30, 72);
    console.log(
      `⏳ Mantendo status "digitando..." por ${tempoDigitandoSegundos}s (randômico entre 30s e 1m12s)...`,
    );

    const mensagem = gerarMensagemPizzaria(lead.nome);
    const inicio = Date.now();

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: lead.phone,
          message: mensagem,
          typingDelayMs: tempoDigitandoSegundos * 1000,
        }),
      });

      const data = await response.json();
      const tempoTotal = Math.round((Date.now() - inicio) / 1000);

      if (response.ok && data.success) {
        console.log(
          `✅ [${numero}/${leadsValidos.length}] SUCESSO: ${lead.nome} (${tempoTotal}s) | ID: ${data.data?.key?.id || "OK"}`,
        );
        relatorio.push({
          empresa: lead.nome,
          telefone: lead.phone,
          status: "ENVIADO",
          tempoSegundos: tempoTotal,
          idMensagem: data.data?.key?.id,
          horario: new Date().toISOString(),
        });
      } else {
        console.error(
          `❌ [${numero}/${leadsValidos.length}] Erro ao enviar para ${lead.nome}:`,
          data.error || data,
        );
        relatorio.push({
          empresa: lead.nome,
          telefone: lead.phone,
          status: "ERRO",
          erro: data.error || data,
          horario: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(
        `💥 [${numero}/${leadsValidos.length}] Falha de conexão:`,
        err.message,
      );
      relatorio.push({
        empresa: lead.nome,
        telefone: lead.phone,
        status: "ERRO_CONEXAO",
        erro: err.message,
        horario: new Date().toISOString(),
      });
    }

    fs.writeFileSync(
      "relatorio_pizzarias.json",
      JSON.stringify(relatorio, null, 2),
    );

    if (i < leadsValidos.length - 1) {
      const pausaSegundos = randomEntre(12, 25);
      console.log(
        `⏸️ Aguardando ${pausaSegundos} segundos de intervalo antes do próximo...`,
      );
      await sleep(pausaSegundos * 1000);
    }
  }

  console.log(`\n🏁 DISPARO DE PIZZARIAS CONCLUÍDO!`);
  console.log(
    `Total: ${relatorio.length} | Sucessos: ${relatorio.filter((r) => r.status === "ENVIADO").length}`,
  );
  console.log(`Relatório salvo em relatorio_pizzarias.json\n`);
}

iniciarDisparos();

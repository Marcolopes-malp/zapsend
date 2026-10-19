import fs from "fs";
import { salvarContatoGoogle } from "./google_contacts.mjs";

const API_ENDPOINT = "http://localhost:3001/api/send";
const EVOLUTION_API_URL = "https://api.malptech.com.br";
const EVOLUTION_API_KEY = "malp_tech_2026_API_KEY";
const EVOLUTION_INSTANCE = "malptech";

// Conjunto com todos os telefones já contactados para NUNCA repetir
const JA_ENVIADOS = new Set([
  "5511942928117",
  "5511984789395",
  "5511910346965",
  "5511975981148",
  "551146551346",
  "5511917846917",
  "5511973045131",
  "5511971115804",
  "551146809487",
  "5511947440830",
  "5511982000516",
  "5511947960679",
]);

// Carrega os já enviados do relatório em disco
if (fs.existsSync("relatorio_disparos.json")) {
  try {
    const rel = JSON.parse(fs.readFileSync("relatorio_disparos.json", "utf-8"));
    for (const r of rel) {
      if (r.telefone) {
        const c = r.telefone.replace(/\D/g, "");
        JA_ENVIADOS.add(c.startsWith("55") ? c : `55${c}`);
      }
    }
  } catch (e) {}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomEntre = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

function gerarMensagem(nomeEmpresa) {
  const hora = new Date().getHours();
  const saudacao =
    hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  return `${saudacao}, tudo bem? Marco da Malp Tech por aqui.

Estava vendo a ${nomeEmpresa} aqui em Arujá e notei que vocês ainda não têm site no Google.

Desenvolvemos páginas rápidas para oficinas passarem mais autoridade e cortarem aquele cliente que só pede orçamento no WhatsApp e some.

Podemos bater um papo de 3 a 5 minutos essa semana?`;
}

// Checa na Evolution API se o número existe no WhatsApp (em lotes de 10)
async function verificarWhatsApp(numeros) {
  const map = {};
  for (let i = 0; i < numeros.length; i += 10) {
    const chunk = numeros.slice(i, i + 10);
    try {
      const res = await fetch(
        `${EVOLUTION_API_URL}/chat/whatsappNumbers/${EVOLUTION_INSTANCE}`,
        {
          method: "POST",
          headers: {
            apikey: EVOLUTION_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ numbers: chunk }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const item of data) {
            map[item.number] = item.exists === true;
          }
        }
      }
    } catch (err) {
      console.error("Erro ao verificar WhatsApp:", err.message);
    }
  }
  return map;
}

// Carrega os próximos N leads não contactados do CSV
async function carregarProximosLeads(limite = 10) {
  if (!fs.existsSync("leads_sem_site.csv")) {
    console.error("Arquivo leads_sem_site.csv não encontrado!");
    return [];
  }

  const raw = fs
    .readFileSync("leads_sem_site.csv", "utf-8")
    .replace(/^\uFEFF/, "");
  const linhas = raw.split("\n").filter((l) => l.trim() !== "");
  function parseCSVLine(text) {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (c === "," && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else cur += c;
    }
    result.push(cur.trim());
    return result;
  }

  const candidatos = [];

  for (let i = 1; i < linhas.length; i++) {
    const colunas = parseCSVLine(linhas[i]);
    const nome = (colunas[2] || "").replace(/"/g, "").trim();
    const tel = (colunas[3] || "").replace(/"/g, "").trim();
    const clean = tel.replace(/\D/g, "");

    if (nome && clean.length >= 10) {
      const full = clean.startsWith("55") ? clean : `55${clean}`;
      if (!JA_ENVIADOS.has(full)) {
        candidatos.push({ nome, phone: clean, full });
      }
    }
  }

  console.log(
    `🔍 Validando ${candidatos.length} leads restantes na API do WhatsApp...`,
  );
  const selecionados = [];

  // Checa em lotes de 10
  for (let i = 0; i < candidatos.length; i += 10) {
    const chunk = candidatos.slice(i, i + 10);
    const map = await verificarWhatsApp(chunk.map((c) => c.full));

    for (const c of chunk) {
      if (map[c.full] === true) {
        selecionados.push({ nome: c.nome, phone: c.phone });
        if (selecionados.length === limite) {
          return selecionados;
        }
      }
    }
  }

  return selecionados;
}

async function dispararLote() {
  const limite = Number(process.argv[2]) || 10;
  console.log(
    `\n🚀 INICIANDO AGENTE DE DISPARO AUTOMÁTICO - MECÂNICAS (ARUJÁ)`,
  );
  console.log(`🎯 Meta do lote: ${limite} novos leads não contactados`);
  console.log(`🎲 Configuração anti-bloqueio:`);
  console.log(`   - Status digitando: randômico entre 30s e 72s (1m12s)`);
  console.log(`   - Pausa entre envios: randômico entre 12s e 25s\n`);

  const leads = await carregarProximosLeads(limite);

  if (leads.length === 0) {
    console.log(`⚠️ Nenhum lead novo com WhatsApp ativo restante na lista.`);
    return;
  }

  console.log(
    `📋 ${leads.length} leads validados selecionados para este lote:`,
  );
  leads.forEach((l, idx) =>
    console.log(`   ${idx + 1}. ${l.nome} (${l.phone})`),
  );
  console.log(``);

  // Lê relatório existente para manter histórico acumulado
  let relatorioGeral = [];
  if (fs.existsSync("relatorio_disparos.json")) {
    try {
      relatorioGeral = JSON.parse(
        fs.readFileSync("relatorio_disparos.json", "utf-8"),
      );
    } catch (e) {}
  }

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const numero = i + 1;
    const horaInicio = new Date().toLocaleTimeString("pt-BR");
    const tempoDigitandoSegundos = randomEntre(30, 72);

    console.log(`------------------------------------------------------------`);
    console.log(
      `[${horaInicio}] [${numero}/${leads.length}] Processando: ${lead.nome} (${lead.phone})`,
    );
    console.log(
      `⏳ Mantendo status "digitando..." por ${tempoDigitandoSegundos}s (randômico 30s-1m12s)...`,
    );

    const mensagem = gerarMensagem(lead.nome);
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
          `✅ [${numero}/${leads.length}] ENVIADO para ${lead.nome}! (${tempoTotal}s) | ID: ${data.data?.key?.id || "OK"}`,
        );

        // Sincronização direta com Google Contatos (se autenticado)
        const nomeCliente = `${lead.nome} Cliente`;
        const resGoogle = await salvarContatoGoogle(nomeCliente, lead.phone);
        if (resGoogle.success) {
          console.log(
            `☁️  [Google Contatos] "${nomeCliente}" sincronizado na sua nuvem!`,
          );
        } else if (!resGoogle.error?.includes("Token não encontrado")) {
          console.log(`⚠️  [Google Contatos] ${resGoogle.error}`);
        }

        relatorioGeral.push({
          empresa: lead.nome,
          telefone: lead.phone,
          status: "ENVIADO",
          tempoSegundos: tempoTotal,
          idMensagem: data.data?.key?.id,
          horario: new Date().toISOString(),
        });
      } else {
        console.error(
          `❌ [${numero}/${leads.length}] Falha no envio para ${lead.nome}:`,
          data.error || data,
        );
        relatorioGeral.push({
          empresa: lead.nome,
          telefone: lead.phone,
          status: "ERRO",
          erro: data.error || data,
          horario: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(
        `💥 [${numero}/${leads.length}] Erro de conexão ao enviar para ${lead.nome}:`,
        err.message,
      );
      relatorioGeral.push({
        empresa: lead.nome,
        telefone: lead.phone,
        status: "ERRO_CONEXAO",
        erro: err.message,
        horario: new Date().toISOString(),
      });
    }

    fs.writeFileSync(
      "relatorio_disparos.json",
      JSON.stringify(relatorioGeral, null, 2),
    );

    // Atualiza automaticamente o arquivo .vcf com todos os contatos como "{nome} Cliente"
    const vcfLines = [];
    for (const d of relatorioGeral) {
      const nomeC = (d.empresa || "Cliente").trim();
      const telC = (d.telefone || "").trim().replace(/\D/g, "");
      const fullC = telC.startsWith("55") ? telC : `55${telC}`;
      vcfLines.push("BEGIN:VCARD");
      vcfLines.push("VERSION:3.0");
      vcfLines.push(`FN:${nomeC} Cliente`);
      vcfLines.push(`TEL;TYPE=CELL,VOICE:+${fullC}`);
      vcfLines.push("END:VCARD");
    }
    fs.writeFileSync("contatos_clientes.vcf", vcfLines.join("\n"), "utf-8");

    if (i < leads.length - 1) {
      const pausaSegundos = randomEntre(12, 25);
      console.log(
        `⏸️ Aguardando ${pausaSegundos}s de intervalo orgânico antes do próximo...`,
      );
      await sleep(pausaSegundos * 1000);
    }
  }

  console.log(`\n🏁 LOTE DE MECÂNICAS CONCLUÍDO!`);
  console.log(`Total acumulado no relatório: ${relatorioGeral.length}`);
  console.log(
    `Sucessos acumulados: ${relatorioGeral.filter((r) => r.status === "ENVIADO").length}`,
  );
  console.log(`Relatório atualizado em relatorio_disparos.json`);
  console.log(`Agenda exportada com sucesso em contatos_clientes.vcf\n`);
}

dispararLote();

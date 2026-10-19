import fs from "fs";
import { salvarContatoGoogle } from "./google_contacts.mjs";

const EVOLUTION_API_URL = "https://api.malptech.com.br";
const EVOLUTION_API_KEY = "malp_tech_2026_API_KEY";
const EVOLUTION_INSTANCE = "malptech";

const RELATORIO_FILE = "relatorio_disparos_restaurantes.json";
const JA_ENVIADOS = new Set();

// Carrega os já enviados do relatório em disco para NUNCA repetir
if (fs.existsSync(RELATORIO_FILE)) {
  try {
    const rel = JSON.parse(fs.readFileSync(RELATORIO_FILE, "utf-8"));
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

function limparNomeEmpresa(nome) {
  return nome
    .split(" - ")[0]
    .split(" | ")[0]
    .split(" — ")[0]
    .replace(
      /\s+(Almoço e Marmitex|Delivery|Barreto|Arujá|Mogi das Cruzes)$/i,
      "",
    )
    .trim();
}

function gerarMensagem(nomeEmpresaBruto) {
  const nomeEmpresa = limparNomeEmpresa(nomeEmpresaBruto);
  const hora = new Date().getHours();
  const saudacao =
    hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  return `${saudacao}, tudo bem? Marco por aqui.

Uma dúvida rápida sobre o ${nomeEmpresa}: nas mesas de vocês o cliente já acessa o cardápio por QR Code ou a equipe ainda entrega o impresso?`;
}

// Envia mensagem direto na Evolution API com simulação de "digitando..."
async function enviarMensagemEvolution(phone, message, typingDelayMs) {
  const cleanDigits = phone.replace(/\D/g, "");
  const fullPhone = cleanDigits.startsWith("55")
    ? cleanDigits
    : `55${cleanDigits}`;

  const res = await fetch(
    `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: fullPhone,
        text: message,
        ...(typingDelayMs > 0 && { delay: typingDelayMs }),
      }),
    },
  );

  const data = await res.json();
  return { ok: res.ok, data };
}

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

// Carrega os próximos N leads com WhatsApp ATIVO do CSV
function carregarProximosRestaurantes(limite = 10) {
  const caminho = "leads_restaurante_aruja_mogi_sem_site.csv";
  if (!fs.existsSync(caminho)) {
    console.error(`Arquivo ${caminho} não encontrado!`);
    return [];
  }

  const raw = fs.readFileSync(caminho, "utf-8").replace(/^\uFEFF/, "");
  const linhas = raw.split("\n").filter((l) => l.trim() !== "");
  const selecionados = [];

  for (let i = 1; i < linhas.length; i++) {
    const colunas = parseCSVLine(linhas[i]);
    // colunas: nicho, cidade, nome, telefone, whatsapp_ativo, site_cadastrado, endereco, google_maps
    const nicho = (colunas[0] || "").replace(/"/g, "").trim();
    const cidade = (colunas[1] || "").replace(/"/g, "").trim();
    const nome = (colunas[2] || "").replace(/"/g, "").trim();
    const tel = (colunas[3] || "").replace(/"/g, "").trim();
    const zapAtivo = (colunas[4] || "").replace(/"/g, "").trim();
    const clean = tel.replace(/\D/g, "");

    if (zapAtivo === "SIM" && nome && clean.length >= 10) {
      const full = clean.startsWith("55") ? clean : `55${clean}`;
      if (!JA_ENVIADOS.has(full)) {
        selecionados.push({
          nicho,
          cidade,
          nome,
          telefoneOriginal: tel,
          phone: clean,
          fullPhone: full,
        });
        if (selecionados.length === limite) break;
      }
    }
  }

  return selecionados;
}

async function dispararLoteRestaurantes(limite = 10) {
  console.log("============================================================");
  console.log("🍕 AGENTE DE DISPARO AUTOMÁTICO — RESTAURANTES & PIZZARIAS");
  console.log(`🎯 Meta do lote: ${limite} estabelecimentos`);
  console.log("🎲 Configuração anti-bloqueio:");
  console.log("   - Status digitando: randômico entre 30s e 72s");
  console.log("   - Pausa entre envios: randômico entre 12s e 25s");
  console.log("☁️  Sincronização: Google Contatos em tempo real");
  console.log("============================================================\n");

  const leads = carregarProximosRestaurantes(limite);

  if (leads.length === 0) {
    console.log("✅ Todos os restaurantes da lista já foram contactados!");
    return;
  }

  console.log(`📋 ${leads.length} restaurantes selecionados para este lote:`);
  leads.forEach((l, idx) => {
    console.log(
      `   ${idx + 1}. ${limparNomeEmpresa(l.nome)} (${l.telefoneOriginal}) - ${l.cidade}`,
    );
  });
  console.log("\n------------------------------------------------------------");

  let relatorioGeral = [];
  if (fs.existsSync(RELATORIO_FILE)) {
    try {
      relatorioGeral = JSON.parse(fs.readFileSync(RELATORIO_FILE, "utf-8"));
    } catch (e) {}
  }

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const numero = i + 1;
    const horaInicio = new Date().toLocaleTimeString("pt-BR");
    const tempoDigitandoSegundos = randomEntre(30, 72);
    const nomeLimpo = limparNomeEmpresa(lead.nome);

    console.log(
      `\n[${horaInicio}] [${numero}/${leads.length}] Processando: ${nomeLimpo} (${lead.telefoneOriginal})`,
    );
    console.log(
      `⏳ Mantendo status "digitando..." por ${tempoDigitandoSegundos}s (randômico 30s-1m12s)...`,
    );

    const mensagem = gerarMensagem(lead.nome);
    const inicio = Date.now();

    try {
      const { ok, data } = await enviarMensagemEvolution(
        lead.phone,
        mensagem,
        tempoDigitandoSegundos * 1000,
      );

      const tempoTotal = Math.round((Date.now() - inicio) / 1000);

      if (ok && (data.key?.id || data.id || data.status === "SUCCESS")) {
        const idMsg = data.key?.id || data.id || "OK";
        console.log(
          `✅ [${numero}/${leads.length}] ENVIADO para ${nomeLimpo}! (${tempoTotal}s) | ID: ${idMsg}`,
        );

        // Sincronização direta com Google Contatos
        const nomeCliente = `${nomeLimpo} Cliente`;
        const resGoogle = await salvarContatoGoogle(nomeCliente, lead.phone);
        if (resGoogle.success) {
          console.log(
            `☁️  [Google Contatos] "${nomeCliente}" sincronizado na sua nuvem!`,
          );
        } else if (!resGoogle.error?.includes("Token não encontrado")) {
          console.log(`⚠️  [Google Contatos] ${resGoogle.error}`);
        }

        relatorioGeral.push({
          empresa: nomeLimpo,
          empresaOriginal: lead.nome,
          telefone: lead.phone,
          cidade: lead.cidade,
          nicho: lead.nicho,
          status: "ENVIADO",
          tempoSegundos: tempoTotal,
          idMensagem: idMsg,
          horario: new Date().toISOString(),
        });
      } else {
        console.error(
          `❌ [${numero}/${leads.length}] Falha no envio para ${nomeLimpo}:`,
          data.error || data,
        );
        relatorioGeral.push({
          empresa: nomeLimpo,
          telefone: lead.phone,
          cidade: lead.cidade,
          status: "ERRO",
          erro: data.error || data,
          horario: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(
        `💥 [${numero}/${leads.length}] Erro ao enviar para ${nomeLimpo}:`,
        err.message,
      );
      relatorioGeral.push({
        empresa: nomeLimpo,
        telefone: lead.phone,
        cidade: lead.cidade,
        status: "ERRO_CONEXAO",
        erro: err.message,
        horario: new Date().toISOString(),
      });
    }

    fs.writeFileSync(RELATORIO_FILE, JSON.stringify(relatorioGeral, null, 2));

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

  console.log(`\n🏁 LOTE DE RESTAURANTES CONCLUÍDO!`);
  console.log(`Total acumulado no relatório: ${relatorioGeral.length}`);
  console.log(
    `Sucessos acumulados: ${relatorioGeral.filter((r) => r.status === "ENVIADO").length}`,
  );
  console.log(`Relatório atualizado em ${RELATORIO_FILE}`);
  console.log(`Agenda exportada em contatos_clientes.vcf\n`);
}

const limiteArg = parseInt(process.argv[2] || "10", 10);
dispararLoteRestaurantes(limiteArg).catch(console.error);

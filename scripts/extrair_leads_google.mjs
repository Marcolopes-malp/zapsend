import fs from "fs";
import path from "path";

const EVOLUTION_API_URL = "https://api.malptech.com.br";
const EVOLUTION_API_KEY = "malp_tech_2026_API_KEY";
const EVOLUTION_INSTANCE = "malptech";

const CACHE_PATH = path.resolve("saida", "cache_buscas.json");
const LLL_CACHE_PATH = path.resolve(
  process.env.HOME || "",
  "lll",
  "saida",
  "cache_buscas.json",
);

// Valida lote de telefones na Evolution API para confirmar WhatsApp ativo
async function validarWhatsAppLote(telefones) {
  const map = {};
  for (let i = 0; i < telefones.length; i += 15) {
    const chunk = telefones.slice(i, i + 15);
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
      console.error("Erro ao validar lote no WhatsApp:", err.message);
    }
  }
  return map;
}

// Busca no Google Places API (se chave configurada)
async function buscarGooglePlacesAPI(termo, cidade, apiKey, pageToken = null) {
  const url = "https://places.googleapis.com/v1/places:searchText";
  const body = {
    textQuery: `${termo} em ${cidade} - SP`,
    languageCode: "pt-BR",
    regionCode: "BR",
    pageSize: 20,
  };
  if (pageToken) body.pageToken = pageToken;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus,nextPageToken",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Places API Erro (${res.status}): ${errText}`);
  }

  return await res.json();
}

// Carrega lugares da base em cache local
function carregarDoCacheLocal(cidadeFiltro = null) {
  let cacheFile = null;
  if (fs.existsSync(CACHE_PATH)) {
    cacheFile = CACHE_PATH;
  } else if (fs.existsSync(LLL_CACHE_PATH)) {
    cacheFile = LLL_CACHE_PATH;
  }

  if (!cacheFile) return [];

  const raw = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
  const lugares = [];
  const vistos = new Set();

  for (const [busca, dados] of Object.entries(raw)) {
    const places = dados.places || [];
    for (const p of places) {
      if (!p.id || vistos.has(p.id)) continue;
      vistos.add(p.id);

      if (p.businessStatus === "CLOSED_PERMANENTLY") continue;

      const end = p.formattedAddress || "";
      if (
        cidadeFiltro &&
        !end.toLowerCase().includes(cidadeFiltro.toLowerCase())
      ) {
        continue;
      }

      lugares.push(p);
    }
  }

  return lugares;
}

async function main() {
  const args = process.argv.slice(2);
  const nicho = args[0] || "Mecânicas";
  const cidade = args[1] || "Mogi das Cruzes";
  const meta = parseInt(args[2] || "15", 10);

  console.log("=======================================================");
  console.log("🔍 EXTRATOR DE LEADS DO GOOGLE MAPS (SEM SITE)");
  console.log("=======================================================");
  console.log(`🎯 Nicho: ${nicho}`);
  console.log(`📍 Cidade: ${cidade}`);
  console.log(`📊 Meta de leads sem site: ${meta}`);
  console.log("=======================================================\n");

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    (fs.existsSync(".env") &&
      fs
        .readFileSync(".env", "utf-8")
        .match(/GOOGLE_MAPS_API_KEY=(.*)/)?.[1]
        ?.trim());

  let lugaresBrutos = [];

  if (apiKey) {
    console.log("🌐 Conectando à Google Places API (New) ao vivo...");
    try {
      const data = await buscarGooglePlacesAPI(nicho, cidade, apiKey);
      lugaresBrutos = data.places || [];
      console.log(
        `✅ Busca concluída via API: ${lugaresBrutos.length} lugares encontrados.`,
      );
    } catch (err) {
      console.warn(`⚠️ Aviso da API: ${err.message}`);
      console.log("📁 Recorrendo à base de dados em cache...");
      lugaresBrutos = carregarDoCacheLocal(cidade);
    }
  } else {
    console.log(
      "📁 Carregando base de dados do Google Maps (cache inteligente)...",
    );
    lugaresBrutos = carregarDoCacheLocal(cidade);
    console.log(
      `✅ ${lugaresBrutos.length} comércios catalogados encontrados em ${cidade}.`,
    );
  }

  // Filtrar apenas comércios SEM SITE e COM TELEFONE
  console.log("\n🧹 Aplicando filtros:");
  console.log("   - Status: Apenas estabelecimentos abertos");
  console.log("   - Site: Excluir quem já tem website oficial");
  console.log("   - Contato: Exigir telefone nacional válido");

  const semSite = [];
  for (const p of lugaresBrutos) {
    const site = (p.websiteUri || "").trim();
    const tel = (p.nationalPhoneNumber || "").trim();
    const nome = p.displayName?.text || "";

    if (!site && tel && nome) {
      const cleanPhone = tel.replace(/\D/g, "");
      const fullPhone = cleanPhone.startsWith("55")
        ? cleanPhone
        : `55${cleanPhone}`;
      semSite.push({
        id: p.id,
        nome,
        telefone: tel,
        cleanPhone,
        fullPhone,
        endereco: p.formattedAddress || "",
        googleMaps: p.googleMapsUri || "",
      });
      if (semSite.length >= meta * 2) break; // Pega margem para filtrar WhatsApp
    }
  }

  console.log(
    `\n🎯 Encontrados ${semSite.length} comércios SEM SITE em ${cidade}!`,
  );

  // Validação em lote com a Evolution API
  console.log(
    "\n📲 Validando na Evolution API quais possuem WhatsApp ativo...",
  );
  const validacaoZap = await validarWhatsAppLote(
    semSite.map((s) => s.fullPhone),
  );

  const leadsFinais = [];
  for (const s of semSite) {
    const temZap = validacaoZap[s.fullPhone] === true;
    s.temWhatsApp = temZap;
    if (temZap && leadsFinais.length < meta) {
      leadsFinais.push(s);
    }
  }

  console.log(
    `✅ ${leadsFinais.length} leads COM WhatsApp ativo selecionados para a meta de ${meta}.\n`,
  );

  // Exibir resumo na tela
  console.log("📋 LISTA DE LEADS EXTRAÍDOS E PRONTOS PARA PROSPECÇÃO:");
  console.log("------------------------------------------------------------");
  leadsFinais.forEach((l, idx) => {
    console.log(`${idx + 1}. ${l.nome}`);
    console.log(`   📞 Telefone: ${l.telefone} | WhatsApp: ✅ ATIVO`);
    console.log(`   📍 Endereço: ${l.endereco}`);
    console.log(`   🗺️  Maps: ${l.googleMaps}`);
    console.log("------------------------------------------------------------");
  });

  // Salvar em CSV
  const nomeArquivo = `leads_${nicho.toLowerCase()}_${cidade.toLowerCase().replace(/\s+/g, "_")}.csv`;
  const cabecalho =
    "nicho,cidade,nome,telefone,whatsapp,endereco,google_maps\n";
  const linhasCSV = leadsFinais.map((l) => {
    const endEscape = `"${l.endereco.replace(/"/g, '""')}"`;
    return `"${nicho}","${cidade}","${l.nome}","${l.telefone}","ATIVO",${endEscape},"${l.googleMaps}"`;
  });

  fs.writeFileSync(nomeArquivo, cabecalho + linhasCSV.join("\n"), "utf-8");
  console.log(`\n💾 Planilha exportada com sucesso: ${nomeArquivo}`);
  console.log(
    `🚀 Pronta para ser importada ou usada direto no disparador do ZapSend!`,
  );
}

main().catch(console.error);

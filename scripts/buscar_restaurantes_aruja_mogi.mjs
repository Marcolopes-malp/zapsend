import fs from "fs";
import path from "path";

const API_KEY = "AIzaSyB1LcjTbvhK3PWCi8bffZ9L-Fh-FJP1xZs";
const URL = "https://places.googleapis.com/v1/places:searchText";
const CAMPOS =
  "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus,nextPageToken";

const EVOLUTION_API_URL = "https://api.malptech.com.br";
const EVOLUTION_API_KEY = "malp_tech_2026_API_KEY";
const EVOLUTION_INSTANCE = "malptech";

const REDES_SOCIAIS = [
  "facebook.com",
  "instagram.com",
  "fb.com",
  "linktr.ee",
  "wa.me",
  "whatsapp.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "ifood.com.br",
  "deliverydireto.com.br",
];

function ehSemSite(websiteUri) {
  if (!websiteUri || !websiteUri.trim()) return true;
  const lower = websiteUri.toLowerCase();
  for (const rede of REDES_SOCIAIS) {
    if (lower.includes(rede)) return true;
  }
  return false;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function buscarPagina(query, pageToken = null) {
  const body = {
    textQuery: query,
    languageCode: "pt-BR",
    regionCode: "BR",
    pageSize: 20,
  };
  if (pageToken) body.pageToken = pageToken;

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": CAMPOS,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google API ${res.status}: ${err}`);
  }

  return await res.json();
}

// Valida telefones em lote na Evolution API
async function validarWhatsAppLote(telefones) {
  const map = {};
  for (let i = 0; i < telefones.length; i += 20) {
    const chunk = telefones.slice(i, i + 20);
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
      console.error("Erro na validação do WhatsApp:", err.message);
    }
  }
  return map;
}

async function main() {
  const META_LEADS = 500;
  console.log("=======================================================");
  console.log("🚀 MINERAÇÃO DE RESTAURANTES SEM SITE (ARUJÁ + MOGI)");
  console.log(`🎯 Meta: Até ${META_LEADS} estabelecimentos sem site`);
  console.log("=======================================================\n");

  const termos = [
    "restaurante",
    "restaurante delivery",
    "pizzaria",
    "hamburgueria",
    "lanchonete",
    "churrascaria",
    "comida japonesa sushi",
    "bar e restaurante",
    "petiscaria e espetinho",
    "pastelaria",
  ];

  const cidadesEBairros = [
    // Arujá
    "Arujá - SP",
    "Centro, Arujá - SP",
    "Parque Rodrigo Barreto, Arujá - SP",
    "Jardim Planalto, Arujá - SP",
    "Jardim Rincão, Arujá - SP",
    "Arujá América, Arujá - SP",
    "Caputera, Arujá - SP",

    // Mogi das Cruzes
    "Mogi das Cruzes - SP",
    "Centro, Mogi das Cruzes - SP",
    "Braz Cubas, Mogi das Cruzes - SP",
    "Jundiapeba, Mogi das Cruzes - SP",
    "César de Souza, Mogi das Cruzes - SP",
    "Vila Oliveira, Mogi das Cruzes - SP",
    "Vila Mogilar, Mogi das Cruzes - SP",
    "Alto Ipiranga, Mogi das Cruzes - SP",
    "Vila Mogi Moderno, Mogi das Cruzes - SP",
    "Vila Industrial, Mogi das Cruzes - SP",
    "Ponte Grande, Mogi das Cruzes - SP",
  ];

  const encontrados = new Map();

  for (const loc of cidadesEBairros) {
    if (encontrados.size >= META_LEADS) break;
    const cidadeNome = loc.includes("Arujá") ? "Arujá" : "Mogi das Cruzes";

    for (const termo of termos) {
      if (encontrados.size >= META_LEADS) break;
      const q = `${termo} em ${loc}`;
      process.stdout.write(`🔍 Buscando: "${q}"... `);

      let token = null;
      let contagemTermo = 0;

      for (let p = 0; p < 3; p++) {
        // até 3 páginas por busca (60 resultados)
        try {
          const res = await buscarPagina(q, token);
          const places = res.places || [];

          for (const pl of places) {
            if (pl.businessStatus === "CLOSED_PERMANENTLY") continue;
            const tel = pl.nationalPhoneNumber?.trim();
            if (!tel) continue; // Sem telefone não tem como contatar

            const site = (pl.websiteUri || "").trim();
            if (!ehSemSite(site)) continue; // Tem site próprio, descartamos

            if (!encontrados.has(pl.id)) {
              encontrados.set(pl.id, {
                id: pl.id,
                termo,
                cidade: cidadeNome,
                nome: pl.displayName?.text || "",
                telefone: tel,
                siteOriginal: site || "Nenhum",
                endereco: pl.formattedAddress || "",
                googleMaps: pl.googleMapsUri || "",
              });
              contagemTermo++;
              if (encontrados.size >= META_LEADS) break;
            }
          }

          token = res.nextPageToken;
          if (!token || encontrados.size >= META_LEADS) break;
          await sleep(500); // pequeno intervalo entre páginas
        } catch (err) {
          process.stdout.write(`[Erro: ${err.message}] `);
          break;
        }
      }
      process.stdout.write(
        `+${contagemTermo} leads (Total: ${encontrados.size}/${META_LEADS})\n`,
      );
    }
  }

  const listaLeads = Array.from(encontrados.values());
  console.log(`\n=======================================================`);
  console.log(
    `✅ Mineração concluída! ${listaLeads.length} restaurantes sem site encontrados.`,
  );
  console.log(`=======================================================\n`);

  // Extrair números para validação de WhatsApp
  console.log(
    "📲 Validando na Evolution API quais números possuem WhatsApp ativo...",
  );
  const telefonesFormatados = listaLeads.map((l) => {
    const clean = l.telefone.replace(/\D/g, "");
    return clean.startsWith("55") ? clean : `55${clean}`;
  });

  const validacaoZap = await validarWhatsAppLote(telefonesFormatados);

  let comZap = 0;
  for (let i = 0; i < listaLeads.length; i++) {
    const full = telefonesFormatados[i];
    const ativo = validacaoZap[full] === true;
    listaLeads[i].fullPhone = full;
    listaLeads[i].whatsappAtivo = ativo ? "SIM" : "NAO";
    if (ativo) comZap++;
  }

  console.log(
    `📱 Validação concluída: ${comZap} estabelecimentos possuem WhatsApp ATIVO!`,
  );

  // Ordenar para colocar os com WhatsApp ativo no topo
  listaLeads.sort((a, b) => {
    if (a.whatsappAtivo === "SIM" && b.whatsappAtivo !== "SIM") return -1;
    if (a.whatsappAtivo !== "SIM" && b.whatsappAtivo === "SIM") return 1;
    return 0;
  });

  // Salvar em CSV
  const NOME_ARQUIVO = "leads_restaurante_aruja_mogi_sem_site.csv";
  const cabecalho =
    "nicho,cidade,nome,telefone,whatsapp_ativo,site_cadastrado,endereco,google_maps\n";
  const linhasCSV = listaLeads.map((l) => {
    const nomeEsc = `"${l.nome.replace(/"/g, '""')}"`;
    const endEsc = `"${l.endereco.replace(/"/g, '""')}"`;
    const siteEsc = `"${l.siteOriginal.replace(/"/g, '""')}"`;
    return `"${l.termo}","${l.cidade}",${nomeEsc},"${l.telefone}","${l.whatsappAtivo}",${siteEsc},${endEsc},"${l.googleMaps}"`;
  });

  const csvCompleto = cabecalho + linhasCSV.join("\n");
  fs.writeFileSync(NOME_ARQUIVO, csvCompleto, "utf-8");

  // Também salvar cópia em ~/lll/saida/ para conveniência
  try {
    const lllPath = path.resolve(
      process.env.HOME || "",
      "lll",
      "saida",
      NOME_ARQUIVO,
    );
    fs.writeFileSync(lllPath, csvCompleto, "utf-8");
  } catch (e) {}

  console.log(`\n💾 Arquivo salvo com sucesso: ${NOME_ARQUIVO}`);
  console.log(`📊 Estatísticas do Arquivo:`);
  console.log(`   - Total de leads: ${listaLeads.length}`);
  console.log(`   - Com WhatsApp ativo: ${comZap}`);
  console.log(
    `   - Arujá: ${listaLeads.filter((l) => l.cidade === "Arujá").length}`,
  );
  console.log(
    `   - Mogi das Cruzes: ${listaLeads.filter((l) => l.cidade === "Mogi das Cruzes").length}`,
  );
  console.log(`\n🚀 Tudo pronto para a prospecção de Cardápio Digital / Site!`);
}

main().catch(console.error);

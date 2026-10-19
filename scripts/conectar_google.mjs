import fs from "fs";
import http from "http";
import url from "url";
import { exec } from "child_process";
import { getOAuth2Client, salvarContatoGoogle } from "./google_contacts.mjs";

const SCOPES = ["https://www.googleapis.com/auth/contacts"];

async function main() {
  const oAuth2Client = getOAuth2Client();
  if (!oAuth2Client) {
    console.error("❌ Arquivo credentials.json não encontrado na raiz!");
    process.exit(1);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = url.parse(req.url, true);
      if (parsedUrl.pathname === "/") {
        const code = parsedUrl.query.code;
        if (code) {
          console.log(
            "\n📥 Código de autorização recebido do Google! Obtendo tokens...",
          );
          const { tokens } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);
          fs.writeFileSync("token.json", JSON.stringify(tokens, null, 2));

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #0f172a; color: #f8fafc;">
                <div style="text-align: center; background: #1e293b; padding: 40px; border-radius: 16px; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 480px;">
                  <div style="font-size: 54px; margin-bottom: 12px;">✅</div>
                  <h1 style="color: #10b981; font-size: 24px; margin: 0 0 12px 0;">Google Contatos Conectado!</h1>
                  <p style="color: #94a3b8; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
                    Sua conta Google foi vinculada ao ZapSend com sucesso.<br/>
                    A partir de agora, cada lead disparado será salvo automaticamente na sua agenda como <b>{nome} Cliente</b>.
                  </p>
                  <p style="color: #64748b; font-size: 13px;">Pode fechar esta aba com segurança.</p>
                </div>
              </body>
            </html>
          `);

          console.log("✅ Token salvo em token.json com sucesso!");

          // Verificar se há leads no relatorio_disparos.json para sincronizar
          if (fs.existsSync("relatorio_disparos.json")) {
            try {
              const rel = JSON.parse(
                fs.readFileSync("relatorio_disparos.json", "utf-8"),
              );
              console.log(
                `\n📋 Sincronizando ${rel.length} leads já disparados anteriormente para o seu Google Contatos...`,
              );
              let syncCount = 0;
              for (const r of rel) {
                if (r.empresa && r.telefone) {
                  const nomeCliente = `${r.empresa} Cliente`;
                  process.stdout.write(
                    `   ➕ Sincronizando: ${nomeCliente}... `,
                  );
                  const resG = await salvarContatoGoogle(
                    nomeCliente,
                    r.telefone,
                  );
                  if (resG.success) {
                    process.stdout.write("✅ OK\n");
                    syncCount++;
                  } else {
                    process.stdout.write(`⚠️ (${resG.error})\n`);
                  }
                }
              }
              console.log(
                `\n🎉 Sincronização concluída! ${syncCount}/${rel.length} contatos inseridos na sua conta Google.`,
              );
            } catch (err) {
              console.error("Erro ao sincronizar histórico:", err.message);
            }
          }

          setTimeout(() => {
            server.close();
            console.log(
              "\n🚀 Tudo pronto! Agora os disparos salvarão direto na sua nuvem.",
            );
            process.exit(0);
          }, 2000);
          return;
        }
      }
      res.writeHead(404);
      res.end("Não encontrado");
    } catch (e) {
      console.error("Erro na requisição:", e);
      res.writeHead(500);
      res.end("Erro interno: " + e.message);
    }
  });

  server.listen(3500, () => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
    });

    console.log("=======================================================");
    console.log("🔗 CONEXÃO COM GOOGLE CONTATOS");
    console.log("=======================================================");
    console.log("Abrindo navegador para autorizar a sincronização...\n");
    console.log("Caso não abra automaticamente, clique ou copie este link:");
    console.log(authUrl);
    console.log("\n=======================================================");
    console.log("⏳ Aguardando autorização no navegador...");

    exec(`open "${authUrl}"`);
  });
}

main().catch(console.error);

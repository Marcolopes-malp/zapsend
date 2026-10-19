import fs from "fs";
import path from "path";
import { google } from "googleapis";

const CREDENTIALS_PATH = path.resolve("credentials.json");
const TOKEN_PATH = path.resolve("token.json");

export function getOAuth2Client() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    return null;
  }
  const content = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const keys = content.installed || content.web;
  if (!keys) return null;

  const oAuth2Client = new google.auth.OAuth2(
    keys.client_id,
    keys.client_secret,
    "http://localhost:3500",
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    oAuth2Client.setCredentials(token);

    oAuth2Client.on("tokens", (newTokens) => {
      try {
        const currentToken = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
        fs.writeFileSync(
          TOKEN_PATH,
          JSON.stringify({ ...currentToken, ...newTokens }, null, 2),
        );
      } catch (err) {
        console.error("Erro ao atualizar token:", err);
      }
    });
  }

  return oAuth2Client;
}

export function formatarTelefone(telefone) {
  let clean = telefone.replace(/\D/g, "");
  if (clean.startsWith("55") && (clean.length === 12 || clean.length === 13)) {
    clean = clean.slice(2);
  }
  if (clean.length === 11) {
    return {
      formatted: `+55 ${clean.slice(0, 2)} ${clean.slice(2, 7)}-${clean.slice(7)}`,
      e164: `+55${clean}`,
    };
  }
  if (clean.length === 10) {
    return {
      formatted: `+55 ${clean.slice(0, 2)} ${clean.slice(2, 6)}-${clean.slice(6)}`,
      e164: `+55${clean}`,
    };
  }
  return { formatted: `+55 ${clean}`, e164: `+55${clean}` };
}

export async function salvarContatoGoogle(nome, telefone) {
  try {
    if (!fs.existsSync(TOKEN_PATH)) {
      return {
        success: false,
        error:
          "Token não encontrado. Execute 'node scripts/conectar_google.mjs' primeiro.",
      };
    }

    const auth = getOAuth2Client();
    if (!auth) {
      return { success: false, error: "Arquivo credentials.json inválido." };
    }

    const people = google.people({ version: "v1", auth });
    const phones = formatarTelefone(telefone);

    let givenName = nome;
    let familyName = "";
    if (nome.endsWith(" Cliente")) {
      givenName = nome.replace(/ Cliente$/, "").trim();
      familyName = "Cliente";
    }

    const res = await people.people.createContact({
      requestBody: {
        names: [
          {
            givenName,
            familyName,
          },
        ],
        phoneNumbers: [
          {
            value: phones.formatted,
            type: "mobile",
          },
          {
            value: phones.e164,
            type: "main",
          },
        ],
        userDefined: [
          {
            key: "Origem",
            value: "ZapSend",
          },
        ],
      },
    });

    return { success: true, resourceName: res.data.resourceName };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

import { NextResponse } from 'next/server';

interface SendPayload {
  phone: string;
  message: string;
  config?: {
    provider?: 'evolution' | 'zapi' | 'meta' | 'custom';
    apiUrl?: string;
    apiToken?: string;
    instanceName?: string;
    clientToken?: string;
  };
}

export async function GET() {
  const hasEnvConfig = Boolean(process.env.WHATSAPP_API_URL);
  return NextResponse.json({
    status: 'ok',
    configured: hasEnvConfig,
    provider: process.env.WHATSAPP_PROVIDER || 'not_configured',
    senderPhone: '11993259396',
  });
}

export async function POST(request: Request) {
  try {
    const body: SendPayload = await request.json();
    const { phone, message, config } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { success: false, error: 'Número de telefone e mensagem são obrigatórios.' },
        { status: 400 }
      );
    }

    // Sanitiza o número para formato internacional (ex: 5511993259396)
    const cleanDigits = phone.replace(/\D/g, '');
    const fullPhone = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`;

    // Configurações: Prioriza parâmetros passados pela UI, senão pega do .env
    const provider = config?.provider || process.env.WHATSAPP_PROVIDER || 'evolution';
    const apiUrl = config?.apiUrl || process.env.WHATSAPP_API_URL;
    const apiToken = config?.apiToken || process.env.WHATSAPP_API_TOKEN;
    const instanceName = config?.instanceName || process.env.WHATSAPP_INSTANCE;
    const clientToken = config?.clientToken || process.env.WHATSAPP_CLIENT_TOKEN;

    if (!apiUrl) {
      return NextResponse.json(
        {
          success: false,
          needsConfig: true,
          error: 'Nenhuma API do WhatsApp conectada ainda. Configure a URL e Token da sua API (Z-API, Evolution ou Meta) para disparo 100% automático em segundo plano.',
        },
        { status: 400 }
      );
    }

    let endpoint = apiUrl.trim();
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    let requestBody: any = {};

    // 1. Provedor: Evolution API
    if (provider === 'evolution') {
      if (instanceName && !endpoint.includes('/message/sendText')) {
        endpoint = `${endpoint.replace(/\/$/, '')}/message/sendText/${instanceName}`;
      }
      headers['apikey'] = apiToken || '';
      requestBody = {
        number: fullPhone,
        text: message,
      };
    }
    // 2. Provedor: Z-API
    else if (provider === 'zapi') {
      if (!endpoint.includes('/send-text')) {
        endpoint = `${endpoint.replace(/\/$/, '')}/send-text`;
      }
      if (clientToken) headers['Client-Token'] = clientToken;
      headers['Authorization'] = `Bearer ${apiToken}`;
      requestBody = {
        phone: fullPhone,
        message: message,
      };
    }
    // 3. Provedor: Meta Cloud API (Oficial)
    else if (provider === 'meta') {
      headers['Authorization'] = `Bearer ${apiToken}`;
      requestBody = {
        messaging_product: 'whatsapp',
        to: fullPhone,
        type: 'text',
        text: { body: message },
      };
    }
    // 4. Provedor: Custom / Genérico
    else {
      if (apiToken) {
        headers['Authorization'] = `Bearer ${apiToken}`;
        headers['apikey'] = apiToken;
      }
      requestBody = {
        number: fullPhone,
        phone: fullPhone,
        message: message,
        text: message,
      };
    }

    // Realiza a chamada HTTP direta para a API do WhatsApp
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Erro retornado pela API do WhatsApp (${response.status}): ${JSON.stringify(responseData)}`,
          details: responseData,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      phone: fullPhone,
      provider,
      data: responseData,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/send:', error);
    return NextResponse.json(
      {
        success: false,
        error: `Falha na conexão com a API do WhatsApp: ${error.message}`,
      },
      { status: 500 }
    );
  }
}

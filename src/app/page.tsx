'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  RotateCcw,
  Clock,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Settings,
  X,
  Shuffle,
  ListOrdered,
  ShieldCheck,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { InteractiveHoverButton } from '../components/InteractiveHoverButton';
import { spin, randomBetween } from '../lib/spintax';

const DEFAULT_MESSAGE =
  "{Olá|Oi|{saudacao}}! {Tudo bem?|Tudo certo?|Como vai?} Vi seu interesse e {gostaria de|queria} falar com você. {Como posso te ajudar?|Posso te ajudar em algo?|Me conta o que você procura?}";

const NEXT_ALLOWED_KEY = 'leadzap_next_allowed_at';

interface HistoryItem {
  id: string;
  phone: string;
  timestamp: string;
}

interface ApiConfig {
  provider: 'evolution' | 'zapi' | 'meta' | 'custom';
  apiUrl: string;
  apiToken: string;
  instanceName?: string;
  clientToken?: string;
}

// Intervalos em segundos
interface AntiBanConfig {
  minInterval: number;
  maxInterval: number;
  minTyping: number;
  maxTyping: number;
}

const DEFAULT_ANTIBAN: AntiBanConfig = {
  minInterval: 15,
  maxInterval: 45,
  minTyping: 2,
  maxTyping: 5,
};

interface QueueItem {
  id: string;
  phone: string;
  message: string;
  status: 'waiting' | 'sending';
}

class SendError extends Error {
  constructor(message: string, public needsConfig = false) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Home() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string; details?: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    provider: 'evolution',
    apiUrl: '',
    apiToken: '',
    instanceName: '',
    clientToken: '',
  });
  const [antiBan, setAntiBan] = useState<AntiBanConfig>(DEFAULT_ANTIBAN);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [nextSendAt, setNextSendAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [preview, setPreview] = useState<string | null>(null);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  // Refs para o worker da fila sempre ler os valores atuais
  const queueRef = useRef<QueueItem[]>([]);
  const apiConfigRef = useRef(apiConfig);
  const antiBanRef = useRef(antiBan);
  const workerRunning = useRef(false);
  const nextAllowedAt = useRef(0);

  apiConfigRef.current = apiConfig;
  antiBanRef.current = antiBan;

  // Carregar dados salvos
  useEffect(() => {
    const savedMsg = localStorage.getItem('leadzap_custom_message');
    if (savedMsg) setMessage(savedMsg);

    const savedHistory = localStorage.getItem('leadzap_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Erro ao ler histórico', e);
      }
    }

    const savedConfig = localStorage.getItem('leadzap_api_config');
    if (savedConfig) {
      try {
        setApiConfig(JSON.parse(savedConfig));
      } catch (e) {
        console.error('Erro ao ler configuração de API', e);
      }
    }

    const savedAntiBan = localStorage.getItem('leadzap_antiban');
    if (savedAntiBan) {
      try {
        setAntiBan({ ...DEFAULT_ANTIBAN, ...JSON.parse(savedAntiBan) });
      } catch (e) {
        console.error('Erro ao ler configuração anti-bloqueio', e);
      }
    }

    // Mantém o intervalo mesmo se a página for recarregada
    nextAllowedAt.current = Number(localStorage.getItem(NEXT_ALLOWED_KEY)) || 0;

    phoneInputRef.current?.focus();
  }, []);

  // Contagem regressiva do próximo envio
  useEffect(() => {
    if (!nextSendAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [nextSendAt]);

  // Avisa antes de fechar a aba com mensagens na fila
  useEffect(() => {
    if (queue.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [queue.length]);

  // Formatação do telefone brasileiro
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '');

    if (raw.length > 11 && raw.startsWith('55')) {
      raw = raw.substring(2);
    }
    if (raw.length > 11) {
      raw = raw.substring(0, 11);
    }

    let formatted = raw;
    if (raw.length > 2 && raw.length <= 6) {
      formatted = `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    } else if (raw.length > 6 && raw.length <= 10) {
      formatted = `(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
    } else if (raw.length > 10) {
      formatted = `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7, 11)}`;
    } else if (raw.length > 0) {
      formatted = `(${raw}`;
    }

    setPhone(formatted);
    if (status) setStatus(null);
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessage(val);
    localStorage.setItem('leadzap_custom_message', val);
    if (preview !== null) setPreview(spin(val));
  };

  const handleResetMessage = () => {
    setMessage(DEFAULT_MESSAGE);
    localStorage.setItem('leadzap_custom_message', DEFAULT_MESSAGE);
    if (preview !== null) setPreview(spin(DEFAULT_MESSAGE));
  };

  const handleSaveConfig = () => {
    localStorage.setItem('leadzap_api_config', JSON.stringify(apiConfig));
    localStorage.setItem('leadzap_antiban', JSON.stringify(antiBan));
    setIsModalOpen(false);
    setStatus({
      type: 'success',
      text: 'Configurações de API salvas com sucesso!',
    });
  };

  const updateQueue = (fn: (q: QueueItem[]) => QueueItem[]) => {
    queueRef.current = fn(queueRef.current);
    setQueue(queueRef.current);
  };

  const addToHistory = (targetPhone: string) => {
    const timeString = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const newEntry: HistoryItem = {
      id: Date.now().toString(),
      phone: targetPhone,
      timestamp: timeString,
    };

    setHistory((prev) => {
      const updated = [newEntry, ...prev.filter((h) => h.phone !== targetPhone)].slice(0, 10);
      localStorage.setItem('leadzap_history', JSON.stringify(updated));
      return updated;
    });
  };

  // Disparo 100% no fundo via API (Sem abrir WhatsApp)
  const sendOne = async (item: QueueItem, typingDelayMs: number) => {
    const config = apiConfigRef.current;
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: item.phone,
        message: item.message,
        typingDelayMs,
        config: config.apiUrl ? config : undefined,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new SendError(data.error || 'Falha ao enviar mensagem pela API.', Boolean(data.needsConfig));
    }
  };

  // Processa a fila um por vez, respeitando o intervalo aleatório entre envios
  const processQueue = async () => {
    if (workerRunning.current) return;
    workerRunning.current = true;

    try {
      while (queueRef.current.length > 0) {
        const wait = nextAllowedAt.current - Date.now();
        if (wait > 0) {
          setNextSendAt(nextAllowedAt.current);
          await sleep(wait);
          setNextSendAt(null);
          continue; // a fila pode ter sido alterada durante a espera
        }

        const item = queueRef.current[0];
        const { minTyping, maxTyping, minInterval, maxInterval } = antiBanRef.current;
        updateQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: 'sending' } : i)));

        try {
          await sendOne(item, randomBetween(minTyping, maxTyping) * 1000);
          addToHistory(item.phone);
          setStatus({
            type: 'success',
            text: `Mensagem enviada com sucesso no WhatsApp do lead ${item.phone}!`,
          });

          nextAllowedAt.current = Date.now() + randomBetween(minInterval, maxInterval) * 1000;
          localStorage.setItem(NEXT_ALLOWED_KEY, String(nextAllowedAt.current));
        } catch (err: any) {
          setStatus({
            type: 'error',
            text: `${item.phone}: ${err.message || 'Erro inesperado ao disparar mensagem.'}`,
          });
          if (err instanceof SendError && err.needsConfig) {
            setIsModalOpen(true);
            updateQueue(() => []);
          }
        } finally {
          updateQueue((q) => q.filter((i) => i.id !== item.id));
        }
      }
    } finally {
      workerRunning.current = false;
      setNextSendAt(null);
    }
  };

  const handleSend = (phoneToSend?: string) => {
    const targetPhone = phoneToSend || phone;
    const cleanNumbers = targetPhone.replace(/\D/g, '');

    if (!cleanNumbers || cleanNumbers.length < 10) {
      setStatus({
        type: 'error',
        text: 'Por favor, digite um número com DDD válido (ex: 11 99325-9396).',
      });
      phoneInputRef.current?.focus();
      return;
    }

    if (!message.trim()) {
      setStatus({
        type: 'error',
        text: 'Por favor, escreva uma mensagem para o lead.',
      });
      return;
    }

    if (queueRef.current.some((i) => i.phone.replace(/\D/g, '') === cleanNumbers)) {
      setStatus({
        type: 'error',
        text: `O número ${targetPhone} já está na fila de envio.`,
      });
      return;
    }

    // Cada lead recebe uma variação diferente da mensagem
    updateQueue((q) => [
      ...q,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        phone: targetPhone,
        message: spin(message.trim()),
        status: 'waiting',
      },
    ]);

    setStatus(null);
    if (!phoneToSend) setPhone('');
    phoneInputRef.current?.focus();
    processQueue();
  };

  const handleCancelQueueItem = (id: string) => {
    updateQueue((q) => q.filter((i) => i.id !== id || i.status === 'sending'));
  };

  const handleClearQueue = () => {
    updateQueue((q) => q.filter((i) => i.status === 'sending'));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextAreaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('leadzap_history');
  };

  const isConfigured = Boolean(apiConfig.apiUrl);
  const isQueueBusy = queue.length > 0 || nextSendAt !== null;
  const secondsToNext = nextSendAt ? Math.max(0, Math.ceil((nextSendAt - now) / 1000)) : 0;

  const updateAntiBan = (field: keyof AntiBanConfig, value: string) => {
    setAntiBan({ ...antiBan, [field]: Math.max(0, Number(value) || 0) });
  };

  return (
    <>
      {/* Header */}
      <header className="site-header">
        <div className="container">
          <div className="brand">
            <Logo />
            <span className="brand-product">LeadZap</span>
          </div>

          <div className="header-actions">
            <div className={`status ${isConfigured ? 'online' : ''}`} title={isConfigured ? 'API conectada' : 'Sem API'}>
              <span className="status-square" aria-hidden="true" />
              <span className="status-label">{isConfigured ? 'API conectada' : 'Sem API'}</span>
            </div>
            <InteractiveHoverButton variant="outlineLight" size="sm" onClick={() => setIsModalOpen(true)}>
              <Settings size={14} strokeWidth={2.5} />
              Configurar API
            </InteractiveHoverButton>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero on-dark">
        <div className="container hero-grid">
          <div className="hero-main">
            <p className="eyebrow">Disparo de WhatsApp para leads</p>
            <h1 className="headline h2">
              Do telefone ao WhatsApp do lead em <span className="highlight">segundos</span>.
            </h1>
            <p className="hero-body">
              Digite o número e aperte Enter. O LeadZap envia pela sua instância, com intervalo aleatório,
              digitação simulada e uma variação diferente da mensagem para cada lead.
            </p>
          </div>

          <dl className="hero-specs">
            <div className="spec-row">
              <dt>Intervalo entre envios</dt>
              <dd>
                {antiBan.minInterval}–{antiBan.maxInterval}s
              </dd>
            </div>
            <div className="spec-row">
              <dt>Digitando…</dt>
              <dd>
                {antiBan.minTyping}–{antiBan.maxTyping}s
              </dd>
            </div>
            <div className="spec-row">
              <dt>Na fila</dt>
              <dd>{queue.length}</dd>
            </div>
            <div className="spec-row">
              <dt>Provedor</dt>
              <dd>{isConfigured ? apiConfig.provider : '—'}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Área de trabalho */}
      <main className="section">
        <div className="container workspace">
          <section className="card workspace-main" aria-label="Novo disparo">
            {/* Campo 1: Telefone */}
            <div className="form-group">
              <div className="label-row">
                <label className="form-label" htmlFor="phone-input">
                  Telefone do lead
                </label>
                <span className="label-hint">Com DDD (ex: 11 99325-9396)</span>
              </div>

              <div className="phone-field">
                <span className="phone-prefix">+55</span>
                <input
                  id="phone-input"
                  ref={phoneInputRef}
                  type="tel"
                  inputMode="numeric"
                  className="input phone-input"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={handlePhoneChange}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                  aria-invalid={status?.type === 'error' && status.text.includes('DDD') ? true : undefined}
                />
              </div>
            </div>

            {/* Campo 2: Mensagem */}
            <div className="form-group">
              <div className="label-row">
                <label className="form-label" htmlFor="message-input">
                  Mensagem com variações
                </label>
                <div style={{ display: 'flex', gap: 16 }}>
                  <button
                    type="button"
                    className="link"
                    onClick={() => setPreview(spin(message))}
                    title="Gerar um exemplo de como o lead vai receber"
                  >
                    <Shuffle size={14} strokeWidth={2.5} />
                    Ver variação
                  </button>
                  <button
                    type="button"
                    className="link"
                    onClick={handleResetMessage}
                    title="Restaurar mensagem padrão"
                  >
                    <RotateCcw size={14} strokeWidth={2.5} />
                    Restaurar padrão
                  </button>
                </div>
              </div>

              <textarea
                id="message-input"
                className="textarea"
                value={message}
                onChange={handleMessageChange}
                onKeyDown={handleTextAreaKeyDown}
                placeholder="Digite aqui o texto que o lead receberá..."
                aria-invalid={status?.type === 'error' && status.text.includes('mensagem para o lead') ? true : undefined}
              />

              <div className="textarea-actions">
                <span>
                  <code>{'{Olá|Oi}'}</code> varia o texto · <code>{'{saudacao}'}</code> vira Bom dia/Boa tarde/Boa noite
                </span>
                <span className="mono">Ctrl + Enter envia</span>
              </div>

              {preview !== null && (
                <div className="preview-box">
                  <div className="preview-header">
                    <span className="eyebrow">Exemplo de variação</span>
                    <button type="button" className="icon-btn" onClick={() => setPreview(null)} title="Fechar">
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                  <p>{preview}</p>
                </div>
              )}
            </div>

            {/* Feedback */}
            {status && (
              <div
                className={`feedback ${status.type === 'success' ? 'feedback-success' : 'feedback-error'}`}
                role={status.type === 'error' ? 'alert' : 'status'}
              >
                {status.type === 'success' ? (
                  <CheckCircle2 size={18} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
                ) : (
                  <AlertCircle size={18} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
                )}
                <p>{status.text}</p>
              </div>
            )}

            {/* Botão de disparo */}
            <InteractiveHoverButton variant="ink" size="lg" onClick={() => handleSend()} disabled={!phone.trim()}>
              {isQueueBusy ? 'Adicionar à fila' : 'Disparar mensagem'}
              <span className="kbd">Enter ↵</span>
            </InteractiveHoverButton>
          </section>

          <div className="workspace-side">
            {/* Fila de Envio */}
            <section className="list-section" aria-label="Fila de envio">
              <div className="list-header">
                <span className="eyebrow">
                  <ListOrdered size={14} strokeWidth={2.5} />
                  Fila ({queue.length})
                </span>
                {nextSendAt && <span className="countdown">próximo em {secondsToNext}s</span>}
              </div>

              {queue.length === 0 ? (
                <p className="list-empty">Nenhum envio pendente.</p>
              ) : (
                queue.map((item) => (
                  <div key={item.id} className="list-row">
                    <div className="list-phone">
                      {item.status === 'sending' ? <span className="spinner" aria-hidden="true" /> : <Clock size={14} strokeWidth={2.5} />}
                      <span>{item.phone}</span>
                    </div>
                    <div className="list-meta">
                      <span>{item.status === 'sending' ? 'digitando…' : 'aguardando'}</span>
                      {item.status === 'waiting' && (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => handleCancelQueueItem(item.id)}
                          title="Remover da fila"
                        >
                          <X size={14} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
              {queue.some((i) => i.status === 'waiting') && (
                <button type="button" className="link" style={{ marginTop: 12, alignSelf: 'flex-start' }} onClick={handleClearQueue}>
                  Cancelar fila
                </button>
              )}
            </section>

            {/* Histórico */}
            <section className="list-section" aria-label="Últimos envios">
              <div className="list-header">
                <span className="eyebrow">
                  <Clock size={14} strokeWidth={2.5} />
                  Últimos envios
                </span>
                {history.length > 0 && (
                  <button type="button" className="link" onClick={handleClearHistory} title="Limpar histórico">
                    <Trash2 size={14} strokeWidth={2.5} />
                    Limpar
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <p className="list-empty">Os envios feitos aparecem aqui.</p>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="list-row">
                    <div className="list-phone">
                      <Phone size={14} strokeWidth={2.5} />
                      <span>{item.phone}</span>
                    </div>
                    <div className="list-meta">
                      <span>{item.timestamp}</span>
                      <button type="button" className="row-action" onClick={() => handleSend(item.phone)}>
                        Reenviar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <div className="container">
          <span>malp tech · LeadZap</span>
          <span>Envio via API · intervalo aleatório · spintax</span>
        </div>
      </footer>

      {/* Modal de Configuração da API */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-header">
              <h2 id="modal-title" className="headline modal-title">
                Conectar API
              </h2>
              <button type="button" className="icon-btn" onClick={() => setIsModalOpen(false)} title="Fechar">
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-intro">Conecte a sua API do WhatsApp para enviar em segundo plano.</p>

              {/* Seletor de Provedor */}
              <div className="provider-selector" role="group" aria-label="Provedor">
                {(
                  [
                    ['evolution', 'Evolution API'],
                    ['zapi', 'Z-API'],
                    ['meta', 'Meta Cloud'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`provider-btn ${apiConfig.provider === value ? 'active' : ''}`}
                    aria-pressed={apiConfig.provider === value}
                    onClick={() => setApiConfig({ ...apiConfig, provider: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Campos dinâmicos conforme provedor */}
              {apiConfig.provider === 'evolution' && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="cfg-url">URL da Evolution API</label>
                    <input
                      id="cfg-url"
                      type="url"
                      className="input"
                      placeholder="https://sua-evolution.com"
                      value={apiConfig.apiUrl}
                      onChange={(e) => setApiConfig({ ...apiConfig, apiUrl: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="cfg-instance">Nome da instância</label>
                    <input
                      id="cfg-instance"
                      type="text"
                      className="input"
                      placeholder="minha-instancia"
                      value={apiConfig.instanceName || ''}
                      onChange={(e) => setApiConfig({ ...apiConfig, instanceName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="cfg-token">API Key (token da instância)</label>
                    <input
                      id="cfg-token"
                      type="password"
                      className="input"
                      placeholder="Token da instância"
                      value={apiConfig.apiToken}
                      onChange={(e) => setApiConfig({ ...apiConfig, apiToken: e.target.value })}
                    />
                  </div>
                </>
              )}

              {apiConfig.provider === 'zapi' && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="cfg-url">URL da instância Z-API</label>
                    <input
                      id="cfg-url"
                      type="url"
                      className="input"
                      placeholder="https://api.z-api.io/instances/SUA_INSTANCIA/token/SEU_TOKEN"
                      value={apiConfig.apiUrl}
                      onChange={(e) => setApiConfig({ ...apiConfig, apiUrl: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="cfg-client">Client Token (segurança)</label>
                    <input
                      id="cfg-client"
                      type="password"
                      className="input"
                      placeholder="Seu Client Token"
                      value={apiConfig.clientToken || ''}
                      onChange={(e) => setApiConfig({ ...apiConfig, clientToken: e.target.value })}
                    />
                  </div>
                </>
              )}

              {apiConfig.provider === 'meta' && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="cfg-url">URL do Graph Meta</label>
                    <input
                      id="cfg-url"
                      type="url"
                      className="input"
                      placeholder="https://graph.facebook.com/v21.0/PHONE_NUMBER_ID/messages"
                      value={apiConfig.apiUrl}
                      onChange={(e) => setApiConfig({ ...apiConfig, apiUrl: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="cfg-token">Bearer Token de acesso</label>
                    <input
                      id="cfg-token"
                      type="password"
                      className="input"
                      placeholder="EAAB..."
                      value={apiConfig.apiToken}
                      onChange={(e) => setApiConfig({ ...apiConfig, apiToken: e.target.value })}
                    />
                  </div>
                </>
              )}

              {/* Proteção anti-bloqueio */}
              <div className="antiban-section">
                <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck size={14} strokeWidth={2.5} />
                  Proteção anti-bloqueio
                </span>

                <div className="form-group">
                  <span className="form-label">Intervalo aleatório entre envios (segundos)</span>
                  <div className="grid-2">
                    <input
                      type="number"
                      min={0}
                      className="input"
                      aria-label="Intervalo mínimo"
                      value={antiBan.minInterval}
                      onChange={(e) => updateAntiBan('minInterval', e.target.value)}
                    />
                    <input
                      type="number"
                      min={0}
                      className="input"
                      aria-label="Intervalo máximo"
                      value={antiBan.maxInterval}
                      onChange={(e) => updateAntiBan('maxInterval', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <span className="form-label">Tempo &quot;digitando…&quot; antes de enviar (segundos)</span>
                  <div className="grid-2">
                    <input
                      type="number"
                      min={0}
                      max={15}
                      className="input"
                      aria-label="Digitação mínima"
                      value={antiBan.minTyping}
                      onChange={(e) => updateAntiBan('minTyping', e.target.value)}
                    />
                    <input
                      type="number"
                      min={0}
                      max={15}
                      className="input"
                      aria-label="Digitação máxima"
                      value={antiBan.maxTyping}
                      onChange={(e) => updateAntiBan('maxTyping', e.target.value)}
                    />
                  </div>
                  <p className="field-note">A simulação de digitação funciona com a Evolution API.</p>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <InteractiveHoverButton variant="outline" size="md" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </InteractiveHoverButton>
              <InteractiveHoverButton variant="ink" size="md" onClick={handleSaveConfig}>
                Salvar
              </InteractiveHoverButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

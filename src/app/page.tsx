'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Phone, 
  RotateCcw, 
  Clock, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Settings, 
  X, 
  HelpCircle,
  Zap,
  Shuffle,
  ListOrdered,
  ShieldCheck
} from 'lucide-react';
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
    <main className="main-container">
      {/* Top Header */}
      <header className="header-wrapper">
        <div className="brand-info">
          <div className="brand-icon">
            <Zap size={24} />
          </div>
          <div>
            <h1 className="brand-title">LeadZap</h1>
            <p className="brand-subtitle">Disparo 100% automático em segundo plano</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn-settings"
            onClick={() => setIsModalOpen(true)}
            title="Configurar API do WhatsApp"
          >
            <Settings size={14} />
            <span>Configurar API</span>
          </button>

          <div className={`status-badge ${isConfigured ? 'online' : 'warning'}`}>
            <span className={`pulse-dot ${isConfigured ? '' : 'warning'}`}></span>
            <span>{isConfigured ? 'API Conectada' : 'Sem API'}</span>
          </div>
        </div>
      </header>

      {/* Main Form Card */}
      <section className="card">
        {/* Campo 1: Telefone */}
        <div className="form-group">
          <div className="label-row">
            <label className="form-label" htmlFor="phone-input">
              Telefone do Lead
            </label>
            <span className="label-hint">Com DDD (ex: 11 99325-9396)</span>
          </div>

          <div className="input-wrapper">
            <div className="phone-prefix">
              <span>🇧🇷</span>
              <span>+55</span>
            </div>
            <input
              id="phone-input"
              ref={phoneInputRef}
              type="tel"
              className="phone-input"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={handlePhoneChange}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Campo 2: Mensagem */}
        <div className="form-group">
          <div className="label-row">
            <label className="form-label" htmlFor="message-input">
              Mensagem com Variações
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="btn-text"
                onClick={() => setPreview(spin(message))}
                title="Gerar um exemplo de como o lead vai receber"
              >
                <Shuffle size={12} style={{ display: 'inline', marginRight: 4 }} />
                Ver variação
              </button>
              <button
                type="button"
                className="btn-text"
                onClick={handleResetMessage}
                title="Restaurar mensagem padrão"
              >
                <RotateCcw size={12} style={{ display: 'inline', marginRight: 4 }} />
                Restaurar padrão
              </button>
            </div>
          </div>

          <textarea
            id="message-input"
            className="textarea-input"
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleTextAreaKeyDown}
            placeholder="Digite aqui o texto que o lead receberá..."
          />

          <div className="textarea-actions">
            <span>{'Use {Olá|Oi} para variar o texto e {saudacao} para Bom dia/Boa tarde/Boa noite'}</span>
            <span>Ctrl + Enter para enviar</span>
          </div>

          {preview !== null && (
            <div className="preview-box">
              <div className="preview-header">
                <span>Exemplo de variação</span>
                <button type="button" className="btn-close" onClick={() => setPreview(null)} title="Fechar">
                  <X size={14} />
                </button>
              </div>
              <p>{preview}</p>
            </div>
          )}
        </div>

        {/* Feedback Alert */}
        {status && (
          <div className={`feedback-box ${status.type === 'success' ? 'feedback-success' : 'feedback-error'}`}>
            {status.type === 'success' ? (
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            ) : (
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            )}
            <div>
              <p>{status.text}</p>
            </div>
          </div>
        )}

        {/* Botão de Disparo */}
        <button
          type="button"
          className="btn-submit"
          onClick={() => handleSend()}
          disabled={!phone.trim()}
        >
          <Send size={20} />
          <span>{isQueueBusy ? 'Adicionar à Fila' : 'Disparar Mensagem Agora'}</span>
          <span className="shortcut-badge">Enter ↵</span>
        </button>
      </section>

      {/* Fila de Envio */}
      {queue.length > 0 && (
        <section className="history-section">
          <div className="history-header">
            <div className="history-title">
              <ListOrdered size={14} />
              <span>Fila de Envio ({queue.length})</span>
              {nextSendAt && <span className="queue-countdown">próximo em {secondsToNext}s</span>}
            </div>
            {queue.some((i) => i.status === 'waiting') && (
              <button type="button" className="btn-text" onClick={handleClearQueue} title="Cancelar envios pendentes">
                <X size={12} style={{ display: 'inline', marginRight: 4 }} />
                Cancelar fila
              </button>
            )}
          </div>

          <div className="history-list">
            {queue.map((item) => (
              <div key={item.id} className="history-item">
                <div className="history-phone">
                  {item.status === 'sending' ? <div className="spinner spinner-sm"></div> : <Clock size={14} color="#94a3b8" />}
                  <span>{item.phone}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="history-time">
                    {item.status === 'sending' ? 'Digitando e enviando...' : 'Aguardando'}
                  </span>
                  {item.status === 'waiting' && (
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => handleCancelQueueItem(item.id)}
                      title="Remover da fila"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Histórico Recente */}
      {history.length > 0 && (
        <section className="history-section">
          <div className="history-header">
            <div className="history-title">
              <Clock size={14} />
              <span>Últimos Envios</span>
            </div>
            <button
              type="button"
              className="btn-text"
              onClick={handleClearHistory}
              title="Limpar histórico"
            >
              <Trash2 size={12} style={{ display: 'inline', marginRight: 4 }} />
              Limpar
            </button>
          </div>

          <div className="history-list">
            {history.map((item) => (
              <div key={item.id} className="history-item">
                <div className="history-phone">
                  <Phone size={14} color="#25d366" />
                  <span>{item.phone}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="history-time">{item.timestamp}</span>
                  <button
                    type="button"
                    className="btn-resend"
                    onClick={() => handleSend(item.phone)}
                  >
                    Reenviar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modal de Configuração da API */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">
                <Settings size={18} />
                Conectar API do WhatsApp
              </h2>
              <button
                type="button"
                className="btn-close"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Para enviar sem abrir o WhatsApp, conecte a sua API (Z-API, Evolution API ou Meta Cloud):
              </p>

              {/* Seletor de Provedor */}
              <div className="provider-selector">
                <button
                  type="button"
                  className={`provider-btn ${apiConfig.provider === 'evolution' ? 'active' : ''}`}
                  onClick={() => setApiConfig({ ...apiConfig, provider: 'evolution' })}
                >
                  Evolution API
                </button>
                <button
                  type="button"
                  className={`provider-btn ${apiConfig.provider === 'zapi' ? 'active' : ''}`}
                  onClick={() => setApiConfig({ ...apiConfig, provider: 'zapi' })}
                >
                  Z-API
                </button>
                <button
                  type="button"
                  className={`provider-btn ${apiConfig.provider === 'meta' ? 'active' : ''}`}
                  onClick={() => setApiConfig({ ...apiConfig, provider: 'meta' })}
                >
                  Meta Cloud
                </button>
              </div>

              {/* Campos dinâmicos conforme provedor */}
              {apiConfig.provider === 'evolution' && (
                <>
                  <div className="form-group">
                    <label className="form-label">URL da Evolution API</label>
                    <input
                      type="url"
                      className="config-input"
                      placeholder="https://sua-evolution.com"
                      value={apiConfig.apiUrl}
                      onChange={(e) => setApiConfig({ ...apiConfig, apiUrl: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nome da Instância</label>
                    <input
                      type="text"
                      className="config-input"
                      placeholder="minha-instancia"
                      value={apiConfig.instanceName || ''}
                      onChange={(e) => setApiConfig({ ...apiConfig, instanceName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">API Key (Token de Acesso)</label>
                    <input
                      type="password"
                      className="config-input"
                      placeholder="Sua Global API Key"
                      value={apiConfig.apiToken}
                      onChange={(e) => setApiConfig({ ...apiConfig, apiToken: e.target.value })}
                    />
                  </div>
                </>
              )}

              {apiConfig.provider === 'zapi' && (
                <>
                  <div className="form-group">
                    <label className="form-label">URL da Instância Z-API</label>
                    <input
                      type="url"
                      className="config-input"
                      placeholder="https://api.z-api.io/instances/SUA_INSTANCIA/token/SEU_TOKEN"
                      value={apiConfig.apiUrl}
                      onChange={(e) => setApiConfig({ ...apiConfig, apiUrl: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Client Token (Segurança)</label>
                    <input
                      type="password"
                      className="config-input"
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
                    <label className="form-label">URL do Graph Meta</label>
                    <input
                      type="url"
                      className="config-input"
                      placeholder="https://graph.facebook.com/v21.0/PHONE_NUMBER_ID/messages"
                      value={apiConfig.apiUrl}
                      onChange={(e) => setApiConfig({ ...apiConfig, apiUrl: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Bearer Token de Acesso</label>
                    <input
                      type="password"
                      className="config-input"
                      placeholder="EAAB..."
                      value={apiConfig.apiToken}
                      onChange={(e) => setApiConfig({ ...apiConfig, apiToken: e.target.value })}
                    />
                  </div>
                </>
              )}

              {/* Proteção anti-bloqueio */}
              <div className="antiban-section">
                <h3 className="antiban-title">
                  <ShieldCheck size={16} />
                  Proteção anti-bloqueio
                </h3>

                <div className="form-group">
                  <label className="form-label">Intervalo aleatório entre envios (segundos)</label>
                  <div className="grid-2">
                    <input
                      type="number"
                      min={0}
                      className="config-input"
                      aria-label="Intervalo mínimo"
                      value={antiBan.minInterval}
                      onChange={(e) => updateAntiBan('minInterval', e.target.value)}
                    />
                    <input
                      type="number"
                      min={0}
                      className="config-input"
                      aria-label="Intervalo máximo"
                      value={antiBan.maxInterval}
                      onChange={(e) => updateAntiBan('maxInterval', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Tempo &quot;digitando...&quot; antes de enviar (segundos)</label>
                  <div className="grid-2">
                    <input
                      type="number"
                      min={0}
                      max={15}
                      className="config-input"
                      aria-label="Digitação mínima"
                      value={antiBan.minTyping}
                      onChange={(e) => updateAntiBan('minTyping', e.target.value)}
                    />
                    <input
                      type="number"
                      min={0}
                      max={15}
                      className="config-input"
                      aria-label="Digitação máxima"
                      value={antiBan.maxTyping}
                      onChange={(e) => updateAntiBan('maxTyping', e.target.value)}
                    />
                  </div>
                  <span className="label-hint">A simulação de digitação funciona com a Evolution API.</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveConfig}
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer-info">
        <p>Configurado para envio silencioso • Seu número: <span>(11) 99325-9396</span></p>
        <p>Pronto para deploy na Vercel • Envio 100% headless via API</p>
      </footer>
    </main>
  );
}

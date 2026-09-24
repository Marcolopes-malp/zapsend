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
  Zap
} from 'lucide-react';

const DEFAULT_MESSAGE = "Olá! Tudo bem? Vi seu interesse e gostaria de falar com você. Como posso te ajudar?";

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

export default function Home() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [isSending, setIsSending] = useState(false);
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

  const phoneInputRef = useRef<HTMLInputElement>(null);

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

    phoneInputRef.current?.focus();
  }, []);

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
  };

  const handleResetMessage = () => {
    setMessage(DEFAULT_MESSAGE);
    localStorage.setItem('leadzap_custom_message', DEFAULT_MESSAGE);
  };

  const handleSaveConfig = () => {
    localStorage.setItem('leadzap_api_config', JSON.stringify(apiConfig));
    setIsModalOpen(false);
    setStatus({
      type: 'success',
      text: 'Configurações de API salvas com sucesso!',
    });
  };

  // Disparo 100% no fundo via API (Sem abrir WhatsApp)
  const handleSend = async (phoneToSend?: string) => {
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

    setIsSending(true);
    setStatus(null);

    try {
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: targetPhone,
          message: message.trim(),
          config: apiConfig.apiUrl ? apiConfig : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.needsConfig) {
          setIsModalOpen(true);
        }
        throw new Error(data.error || 'Falha ao enviar mensagem pela API.');
      }

      // Sucesso no disparo em segundo plano
      const now = new Date();
      const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const newEntry: HistoryItem = {
        id: Date.now().toString(),
        phone: targetPhone,
        timestamp: timeString,
      };

      const updatedHistory = [newEntry, ...history.filter((h) => h.phone !== targetPhone)].slice(0, 10);
      setHistory(updatedHistory);
      localStorage.setItem('leadzap_history', JSON.stringify(updatedHistory));

      setStatus({
        type: 'success',
        text: `Mensagem enviada com sucesso no WhatsApp do lead ${targetPhone}!`,
      });

      setPhone('');
      phoneInputRef.current?.focus();
    } catch (err: any) {
      setStatus({
        type: 'error',
        text: err.message || 'Erro inesperado ao disparar mensagem.',
      });
    } finally {
      setIsSending(false);
    }
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
              disabled={isSending}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Campo 2: Mensagem */}
        <div className="form-group">
          <div className="label-row">
            <label className="form-label" htmlFor="message-input">
              Mensagem Fixa
            </label>
            <button
              type="button"
              className="btn-text"
              onClick={handleResetMessage}
              title="Restaurar mensagem padrão"
              disabled={isSending}
            >
              <RotateCcw size={12} style={{ display: 'inline', marginRight: 4 }} />
              Restaurar padrão
            </button>
          </div>

          <textarea
            id="message-input"
            className="textarea-input"
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleTextAreaKeyDown}
            placeholder="Digite aqui o texto que o lead receberá..."
            disabled={isSending}
          />

          <div className="textarea-actions">
            <span>{message.length} caracteres</span>
            <span>Dica: Ctrl + Enter para enviar</span>
          </div>
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
          disabled={!phone.trim() || isSending}
        >
          {isSending ? (
            <>
              <div className="spinner"></div>
              <span>Disparando no WhatsApp do Lead...</span>
            </>
          ) : (
            <>
              <Send size={20} />
              <span>Disparar Mensagem Agora</span>
              <span className="shortcut-badge">Enter ↵</span>
            </>
          )}
        </button>
      </section>

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
                    disabled={isSending}
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

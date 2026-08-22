"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type ChatMessage = {
  id: string;
  sender: string;
  body: string;
  created_at: string;
};

type FourRegnLiveChatProps = {
  sellerId: string;
};

const OPEN_POLL_MS = 5_000;
const CLOSED_POLL_MS = 30_000;

function storageKey(sellerId: string, suffix: string) {
  return `4regn_live_chat_${sellerId}_${suffix}`;
}

function getOrCreateVisitorId(sellerId: string) {
  const key = storageKey(sellerId, "visitor");
  const saved = window.localStorage.getItem(key);
  if (saved) return saved;
  const visitorId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, visitorId);
  return visitorId;
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function FourRegnLiveChat({ sellerId }: FourRegnLiveChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() => typeof window === "undefined" ? null : window.localStorage.getItem(storageKey(sellerId, "conversation")));
  const [visitorId, setVisitorId] = useState(() => typeof window === "undefined" ? "" : getOrCreateVisitorId(sellerId));
  const [name, setName] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem(storageKey(sellerId, "name")) || "");
  const [email, setEmail] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem(storageKey(sellerId, "email")) || "");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("open");
  const [unreadReplies, setUnreadReplies] = useState(0);
  const openRef = useRef(open);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const markRepliesSeen = useCallback((nextMessages: ChatMessage[]) => {
    const replyCount = nextMessages.filter((message) => message.sender !== "visitor").length;
    window.localStorage.setItem(storageKey(sellerId, "seen_replies"), String(replyCount));
    setUnreadReplies(0);
  }, [sellerId]);

  const refreshMessages = useCallback(async () => {
    if (!conversationId || !visitorId) return;
    try {
      const response = await fetch(
        `/api/support/messages?conversationId=${encodeURIComponent(conversationId)}&visitorId=${encodeURIComponent(visitorId)}`,
        { cache: "no-store" }
      );
      if (!response.ok) return;
      const data = await response.json();
      const nextMessages = Array.isArray(data.messages) ? data.messages as ChatMessage[] : [];
      setMessages(nextMessages);
      setStatus(data.status || "open");
      if (openRef.current) {
        markRepliesSeen(nextMessages);
      } else {
        const seenReplies = Number(window.localStorage.getItem(storageKey(sellerId, "seen_replies")) || 0);
        const replyCount = nextMessages.filter((message) => message.sender !== "visitor").length;
        setUnreadReplies(Math.max(0, replyCount - seenReplies));
      }
    } catch {
      // A temporary network problem should not close or reset the chat.
    }
  }, [conversationId, markRepliesSeen, sellerId, visitorId]);

  useEffect(() => {
    if (!conversationId || !visitorId) return;
    const kickoff = window.setTimeout(() => { void refreshMessages(); }, 0);
    const interval = window.setInterval(refreshMessages, open ? OPEN_POLL_MS : CLOSED_POLL_MS);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [conversationId, open, refreshMessages, visitorId]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, [messages, open]);

  const toggleChat = () => {
    if (!open) markRepliesSeen(messages);
    setOpen((current) => !current);
    setError("");
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const body = input.trim();
    if (!body || sending) return;

    const activeVisitorId = visitorId || getOrCreateVisitorId(sellerId);
    if (!visitorId) setVisitorId(activeVisitorId);
    setSending(true);
    setError("");
    setInput("");

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      sender: "visitor",
      body,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);

    try {
      const response = await fetch("/api/support/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId: activeVisitorId,
          conversationId,
          message: body,
          name: name.trim(),
          email: email.trim(),
          category: "storefront",
          storefrontSellerId: sellerId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.conversationId) throw new Error(data.error || "Could not send your message.");

      if (!conversationId) {
        setConversationId(data.conversationId);
        window.localStorage.setItem(storageKey(sellerId, "conversation"), data.conversationId);
      }
      window.localStorage.setItem(storageKey(sellerId, "name"), name.trim());
      window.localStorage.setItem(storageKey(sellerId, "email"), email.trim());
      setStatus("open");
    } catch (sendError) {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setInput(body);
      setError(sendError instanceof Error ? sendError.message : "Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`fr-live-chat${open ? " is-open" : ""}`}>
      {open && (
        <section className="fr-live-chat-panel" role="dialog" aria-modal="false" aria-label="Chat with 4REGN">
          <header className="fr-live-chat-header">
            <div className="fr-live-chat-brand" aria-hidden="true">4R</div>
            <div className="fr-live-chat-heading">
              <strong>4REGN SUPPORT</strong>
              <span><i /> Direct from our team</span>
            </div>
            <button type="button" className="fr-live-chat-close" onClick={toggleChat} aria-label="Close chat">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </header>

          <div className="fr-live-chat-body" aria-live="polite">
            <div className="fr-live-chat-intro">
              <span>HEY, FAMILY.</span>
              <p>Need help with a product or your order? Send us a message and the 4REGN team will reply here.</p>
            </div>

            {messages.length === 0 && (
              <div className="fr-live-chat-details">
                <label>
                  <span>Your name <em>optional</em></span>
                  <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" placeholder="How should we address you?" />
                </label>
                <label>
                  <span>Email <em>optional</em></span>
                  <input value={email} onChange={(event) => setEmail(event.target.value)} maxLength={120} type="email" autoComplete="email" placeholder="For order-related help" />
                </label>
              </div>
            )}

            <div className="fr-live-chat-messages">
              {messages.map((message) => (
                <div key={message.id} className={`fr-live-chat-message ${message.sender === "visitor" ? "is-visitor" : "is-team"}`}>
                  {message.sender !== "visitor" && <span className="fr-live-chat-sender">4REGN</span>}
                  <p>{message.body}</p>
                  <time dateTime={message.created_at}>{messageTime(message.created_at)}</time>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="fr-live-chat-footer">
            {status === "closed" && <p className="fr-live-chat-status">This conversation was closed. A new message will reopen it.</p>}
            {error && <p className="fr-live-chat-error">{error}</p>}
            <form onSubmit={sendMessage}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                maxLength={2000}
                rows={1}
                placeholder="Write a message..."
                aria-label="Message"
              />
              <button type="submit" disabled={sending || !input.trim()} aria-label="Send message">
                {sending ? <span className="fr-live-chat-spinner" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" /></svg>}
              </button>
            </form>
            <small>SECURE CHAT · POWERED BY CATALOGSTORE</small>
          </footer>
        </section>
      )}

      <button type="button" className="fr-live-chat-launcher" onClick={toggleChat} aria-expanded={open} aria-label={open ? "Close 4REGN chat" : "Chat with 4REGN"}>
        <span className="fr-live-chat-launcher-icon">
          {open ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5 3.5 22l4.6-1.6c1.2.5 2.5.8 3.9.8 5.2 0 9.5-3.8 9.5-8.6S17.2 4 12 4s-9.5 3.8-9.5 8.6c0 2.3 1 4.4 2.5 5.9Z" /><path d="M8 12.5h.01M12 12.5h.01M16 12.5h.01" /></svg>
          )}
        </span>
        {!open && <span className="fr-live-chat-label"><strong>CHAT WITH US</strong><small>4REGN SUPPORT</small></span>}
        {!open && unreadReplies > 0 && <span className="fr-live-chat-badge">{unreadReplies > 9 ? "9+" : unreadReplies}</span>}
      </button>

      <style>{`
        .fr-live-chat{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:calc(92px + env(safe-area-inset-bottom));z-index:980;font-family:Arial,Helvetica,sans-serif;color:#16151b}
        .fr-live-chat *{box-sizing:border-box}
        .fr-live-chat-launcher{height:58px;min-width:58px;padding:0 17px 0 8px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:#080808;color:#fff;display:flex;align-items:center;gap:10px;box-shadow:0 14px 36px rgba(0,0,0,.3);cursor:pointer;transition:transform .2s ease,box-shadow .2s ease;margin-left:auto;position:relative}
        .fr-live-chat-launcher:hover{transform:translateY(-2px);box-shadow:0 18px 44px rgba(0,0,0,.36)}
        .fr-live-chat.is-open .fr-live-chat-launcher{width:48px;height:48px;min-width:48px;padding:0;justify-content:center;background:#e34234;border-color:#e34234}
        .fr-live-chat-launcher-icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#e34234;flex:0 0 auto}
        .fr-live-chat.is-open .fr-live-chat-launcher-icon{width:100%;height:100%;background:transparent}
        .fr-live-chat-launcher svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
        .fr-live-chat-label{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding-right:2px;white-space:nowrap;text-align:left}
        .fr-live-chat-label strong{font-size:11px;letter-spacing:.12em;font-weight:800}
        .fr-live-chat-label small{font-size:8px;letter-spacing:.16em;color:rgba(255,255,255,.55)}
        .fr-live-chat-badge{position:absolute;right:-4px;top:-5px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#fff;color:#e34234;border:2px solid #e34234;display:grid;place-items:center;font-size:10px;font-weight:900}
        .fr-live-chat-panel{position:absolute;right:0;bottom:70px;width:min(390px,calc(100vw - 28px));height:min(590px,calc(100vh - 180px));min-height:430px;border-radius:22px;background:#f8f7f5;border:1px solid rgba(0,0,0,.11);box-shadow:0 24px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:fr-chat-in .24s ease-out}
        @keyframes fr-chat-in{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
        .fr-live-chat-header{background:#080808;color:#fff;min-height:82px;padding:15px 16px;display:flex;align-items:center;gap:12px;position:relative;overflow:hidden}
        .fr-live-chat-header:after{content:"";position:absolute;width:150px;height:150px;border:1px solid rgba(227,66,52,.45);border-radius:50%;right:-74px;top:-92px;box-shadow:0 0 0 24px rgba(227,66,52,.05)}
        .fr-live-chat-brand{position:relative;z-index:1;width:44px;height:44px;border:1px solid rgba(255,255,255,.22);border-radius:50%;display:grid;place-items:center;font-family:Georgia,serif;font-size:18px;font-style:italic;background:#171717}
        .fr-live-chat-heading{display:flex;flex-direction:column;gap:6px;position:relative;z-index:1}
        .fr-live-chat-heading strong{font-size:13px;letter-spacing:.12em;font-weight:900}
        .fr-live-chat-heading span{font-size:10px;color:rgba(255,255,255,.58);display:flex;align-items:center;gap:6px}
        .fr-live-chat-heading i{width:7px;height:7px;border-radius:50%;background:#4bc878;box-shadow:0 0 0 3px rgba(75,200,120,.12)}
        .fr-live-chat-close{margin-left:auto;position:relative;z-index:2;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;display:grid;place-items:center;cursor:pointer}
        .fr-live-chat-close svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
        .fr-live-chat-body{flex:1;overflow-y:auto;padding:18px 16px 14px;scrollbar-width:thin}
        .fr-live-chat-intro{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:16px;padding:14px 15px;margin-bottom:14px;box-shadow:0 7px 24px rgba(0,0,0,.04)}
        .fr-live-chat-intro span{display:block;color:#e34234;font-size:9px;line-height:1;letter-spacing:.18em;font-weight:900;margin-bottom:8px}
        .fr-live-chat-intro p{margin:0;font-family:Georgia,serif;font-size:13px;line-height:1.55;color:#343139}
        .fr-live-chat-details{display:grid;gap:10px;margin-bottom:14px}
        .fr-live-chat-details label{display:grid;gap:6px}
        .fr-live-chat-details label>span{font-size:9px;letter-spacing:.11em;text-transform:uppercase;font-weight:800;color:#5d5962;padding-left:2px}
        .fr-live-chat-details em{font-weight:400;color:#9a969c;font-style:normal;letter-spacing:.04em;text-transform:none}
        .fr-live-chat-details input{width:100%;border:1px solid rgba(0,0,0,.1);background:#fff;border-radius:12px;padding:11px 12px;outline:none;font:12px Arial,sans-serif;color:#17151b}
        .fr-live-chat-details input:focus{border-color:#111;box-shadow:0 0 0 3px rgba(0,0,0,.05)}
        .fr-live-chat-messages{display:flex;flex-direction:column;gap:9px}
        .fr-live-chat-message{max-width:84%;border-radius:15px;padding:10px 12px;box-shadow:0 4px 12px rgba(0,0,0,.04)}
        .fr-live-chat-message p{margin:0;font-size:12px;line-height:1.48;white-space:pre-wrap;overflow-wrap:anywhere}
        .fr-live-chat-message time{display:block;font-size:8px;margin-top:6px;opacity:.55;letter-spacing:.04em}
        .fr-live-chat-message.is-visitor{align-self:flex-end;background:#0a0a0a;color:#fff;border-bottom-right-radius:4px}
        .fr-live-chat-message.is-team{align-self:flex-start;background:#fff;color:#27242b;border:1px solid rgba(0,0,0,.08);border-bottom-left-radius:4px}
        .fr-live-chat-sender{display:block;color:#e34234;font-size:8px;letter-spacing:.14em;font-weight:900;margin-bottom:5px}
        .fr-live-chat-footer{padding:10px 12px 11px;background:#fff;border-top:1px solid rgba(0,0,0,.08)}
        .fr-live-chat-footer form{display:flex;align-items:flex-end;gap:8px;background:#f4f3f1;border:1px solid rgba(0,0,0,.09);border-radius:15px;padding:5px 5px 5px 12px}
        .fr-live-chat-footer textarea{flex:1;min-width:0;max-height:82px;resize:none;border:0;background:transparent;outline:0;padding:8px 0;font:12px/1.4 Arial,sans-serif;color:#17151b}
        .fr-live-chat-footer form button{width:38px;height:38px;border:0;border-radius:11px;background:#e34234;color:#fff;display:grid;place-items:center;cursor:pointer;flex:0 0 auto}
        .fr-live-chat-footer form button:disabled{opacity:.4;cursor:not-allowed}
        .fr-live-chat-footer form svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
        .fr-live-chat-footer>small{display:block;text-align:center;font-size:7px;letter-spacing:.13em;color:#aaa5ab;margin-top:8px}
        .fr-live-chat-error,.fr-live-chat-status{margin:0 2px 7px;font-size:9px;line-height:1.35}
        .fr-live-chat-error{color:#c42d24}.fr-live-chat-status{color:#6c6870}
        .fr-live-chat-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:fr-chat-spin .7s linear infinite}
        @keyframes fr-chat-spin{to{transform:rotate(360deg)}}
        @media(min-width:901px){.fr-live-chat{right:28px;bottom:28px}}
        @media(max-width:520px){
          .fr-live-chat{right:12px;bottom:calc(88px + env(safe-area-inset-bottom))}
          .fr-live-chat-panel{position:fixed;left:12px;right:12px;bottom:calc(154px + env(safe-area-inset-bottom));width:auto;height:min(600px,calc(100dvh - 180px));max-height:calc(100dvh - 180px);min-height:390px;border-radius:20px}
          .fr-live-chat-launcher{height:54px;padding-right:14px}.fr-live-chat-launcher-icon{width:38px;height:38px}
        }
        @media(max-height:620px) and (max-width:520px){.fr-live-chat-panel{bottom:calc(92px + env(safe-area-inset-bottom));height:calc(100dvh - 110px);max-height:calc(100dvh - 110px)}}
        @media(prefers-reduced-motion:reduce){.fr-live-chat-panel,.fr-live-chat-launcher{animation:none;transition:none}}
      `}</style>
    </div>
  );
}

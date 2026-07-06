"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * SupportChat
 *
 * Floating visitor live-chat widget for CatalogStore marketing/auth pages.
 *
 * - Launcher bubble bottom-right; opens a dark glass chat panel
 * - Anonymous identity via localStorage visitorId (`cs_support_visitor`)
 * - Conversation persisted in localStorage (`cs_support_conv`) after first send
 * - Polls /api/support/messages every 5s while open, 30s while closed
 *   (unread admin replies show a red badge on the launcher; last-seen admin
 *   message count is tracked in `cs_support_seen`)
 * - Hidden on /store, /dashboard, /admin, /affiliate/dashboard and /checkout
 *   (store pages have their own WhatsApp bubbles; dashboards don't need it)
 */

type ChatMessage = {
  id: string;
  sender: "visitor" | "admin";
  body: string;
  created_at: string;
};

const HIDDEN_PREFIXES = [
  "/store",
  "/dashboard",
  "/admin",
  "/affiliate/dashboard",
  "/checkout",
];

const VISITOR_KEY = "cs_support_visitor";
const CONV_KEY = "cs_support_conv";
const SEEN_KEY = "cs_support_seen";
const MAX_LEN = 2000;

function generateVisitorId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  // Fallback: Math.random-based, comfortably longer than 16 chars
  let id = "";
  while (id.length < 24) {
    id += Math.random().toString(36).slice(2);
  }
  return id.slice(0, 24);
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function SupportChat() {
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const listRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // ---- identity bootstrap ------------------------------------------------
  useEffect(() => {
    setMounted(true);
    try {
      let vid = localStorage.getItem(VISITOR_KEY);
      if (!vid || vid.length < 16) {
        vid = generateVisitorId();
        localStorage.setItem(VISITOR_KEY, vid);
      }
      setVisitorId(vid);
      const conv = localStorage.getItem(CONV_KEY);
      if (conv) setConversationId(conv);
    } catch {
      // localStorage unavailable — widget still works for the session
      setVisitorId(generateVisitorId());
    }
  }, []);

  // ---- polling -----------------------------------------------------------
  const fetchMessages = useCallback(async () => {
    if (!conversationId || !visitorId) return;
    try {
      const res = await fetch(
        `/api/support/messages?conversationId=${encodeURIComponent(
          conversationId
        )}&visitorId=${encodeURIComponent(visitorId)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.messages)) return;
      setMessages(data.messages as ChatMessage[]);
      if (data.status === "open" || data.status === "closed") {
        setStatus(data.status);
      }
      const adminCount = (data.messages as ChatMessage[]).filter(
        (m) => m.sender === "admin"
      ).length;
      if (openRef.current) {
        // Panel is visible — everything is seen
        setUnread(0);
        try {
          localStorage.setItem(SEEN_KEY, String(adminCount));
        } catch {}
      } else {
        let seen = 0;
        try {
          seen = parseInt(localStorage.getItem(SEEN_KEY) || "0", 10) || 0;
        } catch {}
        setUnread(Math.max(0, adminCount - seen));
      }
    } catch {
      // network hiccup — retry on next tick
    }
  }, [conversationId, visitorId]);

  useEffect(() => {
    if (!conversationId || !visitorId) return;
    fetchMessages();
    const interval = open ? 5000 : 30000;
    const timer = setInterval(fetchMessages, interval);
    return () => clearInterval(timer);
  }, [open, conversationId, visitorId, fetchMessages]);

  // ---- autoscroll --------------------------------------------------------
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, messages.length]);

  // ---- actions -----------------------------------------------------------
  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      setUnread(0);
      try {
        const adminCount = messages.filter((m) => m.sender === "admin").length;
        localStorage.setItem(SEEN_KEY, String(adminCount));
      } catch {}
    }
  }

  async function send() {
    const text = input.trim().slice(0, MAX_LEN);
    if (!text || sending || !visitorId) return;
    setSending(true);
    setError(null);

    // Optimistic append
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      sender: "visitor",
      body: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    try {
      const res = await fetch("/api/support/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId,
          conversationId: conversationId || undefined,
          message: text,
          name: name.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });

      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInput(text);
        setError(
          res.status === 429
            ? "You're sending messages too quickly. Please wait a moment."
            : "Couldn't send your message. Please try again."
        );
        return;
      }

      const data = await res.json();
      if (data?.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        try {
          localStorage.setItem(CONV_KEY, data.conversationId);
        } catch {}
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
      setError("Couldn't send your message. Please check your connection.");
    } finally {
      setSending(false);
    }
  }

  // ---- visibility --------------------------------------------------------
  if (!mounted || !pathname) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const hasMessages = messages.length > 0;
  const showIdentityFields = !conversationId && !hasMessages;

  return (
    <>
      <style>{`
        @media (max-width: 480px) {
          .cs-support-panel {
            left: 16px !important;
            right: 16px !important;
            width: auto !important;
            max-width: none !important;
          }
        }
        .cs-support-input::placeholder { color: rgba(245,245,245,0.35); }
        .cs-support-input:focus { border-color: rgba(255,107,53,0.5) !important; }
      `}</style>

      {/* Panel */}
      {open && (
        <div className="cs-support-panel" style={styles.panel} role="dialog" aria-label="Support chat">
          {/* Header */}
          <div style={styles.header}>
            <span style={styles.headerDot} />
            <div style={{ minWidth: 0 }}>
              <div style={styles.headerTitle}>CatalogStore Support</div>
              <div style={styles.headerSub}>
                Ask us anything — we reply as soon as we can.
              </div>
            </div>
          </div>

          {/* Messages */}
          <div ref={listRef} style={styles.messages}>
            {!hasMessages && (
              <div style={styles.empty}>
                <div style={styles.emptyTitle}>Hi there 👋</div>
                <div style={styles.emptyText}>
                  Send us a message and we&apos;ll get back to you as soon as
                  we can.
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  ...styles.msgRow,
                  justifyContent:
                    m.sender === "visitor" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={
                    m.sender === "visitor"
                      ? styles.msgVisitor
                      : styles.msgAdmin
                  }
                >
                  <div style={styles.msgBody}>{m.body}</div>
                  <div
                    style={{
                      ...styles.msgTime,
                      color:
                        m.sender === "visitor"
                          ? "rgba(255,255,255,0.7)"
                          : "rgba(245,245,245,0.35)",
                    }}
                  >
                    {formatTime(m.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            {status === "closed" && (
              <div style={styles.closedNote}>
                This conversation was closed. Send a new message to continue.
              </div>
            )}
            {error && <div style={styles.error}>{error}</div>}
            {showIdentityFields && (
              <div style={styles.identityWrap}>
                <div style={styles.identityHint}>So we can get back to you</div>
                <div style={styles.identityRow}>
                  <input
                    className="cs-support-input"
                    style={styles.identityInput}
                    placeholder="Name (optional)"
                    value={name}
                    maxLength={120}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <input
                    className="cs-support-input"
                    style={styles.identityInput}
                    type="email"
                    placeholder="Email (optional)"
                    value={email}
                    maxLength={200}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div style={styles.composer}>
              <input
                className="cs-support-input"
                style={styles.composerInput}
                placeholder="Type your message…"
                value={input}
                maxLength={MAX_LEN}
                disabled={sending}
                onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                aria-label="Send message"
                style={{
                  ...styles.sendBtn,
                  opacity: sending || !input.trim() ? 0.5 : 1,
                  cursor: sending || !input.trim() ? "default" : "pointer",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 16, height: 16 }}
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Launcher */}
      <button
        onClick={toggleOpen}
        aria-label={open ? "Close support chat" : "Open support chat"}
        style={styles.launcher}
      >
        {open ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 22, height: 22 }}
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 24, height: 24 }}
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
        {!open && unread > 0 && (
          <span style={styles.badge}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  launcher: {
    position: "fixed",
    bottom: 24,
    right: 24,
    zIndex: 90,
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg, #ff6b35, #ff3d6e)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow:
      "0 8px 24px rgba(255,61,110,0.35), 0 2px 8px rgba(0,0,0,0.4)",
    fontFamily: "'Schibsted Grotesk', sans-serif",
    padding: 0,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    background: "#ff2d2d",
    border: "2px solid #030303",
    color: "#fff",
    fontSize: 10,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
    lineHeight: 1,
  },
  panel: {
    position: "fixed",
    bottom: 92,
    right: 24,
    zIndex: 90,
    width: 360,
    maxWidth: "calc(100vw - 32px)",
    height: 480,
    maxHeight: "70vh",
    borderRadius: 20,
    background: "#0a0a0c",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily: "'Schibsted Grotesk', sans-serif",
    color: "#f5f5f5",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "16px 18px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.02)",
    flexShrink: 0,
  },
  headerDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #ff6b35, #ff3d6e)",
    boxShadow: "0 0 8px rgba(255,107,53,0.6)",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: "-0.01em",
    lineHeight: 1.2,
  },
  headerSub: {
    fontSize: 11,
    color: "rgba(245,245,245,0.5)",
    marginTop: 2,
    lineHeight: 1.3,
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  empty: {
    margin: "auto",
    textAlign: "center",
    padding: "0 24px",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: "rgba(245,245,245,0.5)",
    lineHeight: 1.5,
  },
  msgRow: {
    display: "flex",
    width: "100%",
  },
  msgVisitor: {
    maxWidth: "80%",
    background: "linear-gradient(135deg, #ff6b35, #ff3d6e)",
    color: "#fff",
    borderRadius: "14px 14px 4px 14px",
    padding: "8px 12px",
  },
  msgAdmin: {
    maxWidth: "80%",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.06)",
    color: "#f5f5f5",
    borderRadius: "14px 14px 14px 4px",
    padding: "8px 12px",
  },
  msgBody: {
    fontSize: 13.5,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  msgTime: {
    fontSize: 9,
    marginTop: 3,
    textAlign: "right",
    lineHeight: 1,
  },
  footer: {
    flexShrink: 0,
    borderTop: "1px solid rgba(255,255,255,0.06)",
    padding: "10px 12px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "rgba(255,255,255,0.02)",
  },
  closedNote: {
    fontSize: 11,
    color: "rgba(245,245,245,0.45)",
    textAlign: "center",
  },
  error: {
    fontSize: 11,
    color: "#ff6b6b",
    textAlign: "center",
  },
  identityWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  identityHint: {
    fontSize: 10,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    fontWeight: 700,
    color: "rgba(245,245,245,0.4)",
  },
  identityRow: {
    display: "flex",
    gap: 8,
  },
  identityInput: {
    flex: 1,
    minWidth: 0,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 12,
    color: "#f5f5f5",
    outline: "none",
    fontFamily: "inherit",
  },
  composer: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  composerInput: {
    flex: 1,
    minWidth: 0,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    color: "#f5f5f5",
    outline: "none",
    fontFamily: "inherit",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #ff6b35, #ff3d6e)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    padding: 0,
  },
};

import React, { useEffect, useMemo, useState, useRef } from "react";
import { RefreshCw, Search, X, Send, Bot, Play, Pause, User, ChevronRight, MessageSquare, Paperclip, File, Download } from "lucide-react";
import { io } from "socket.io-client";
import { CustomerDetailDrawer } from "../../CustomerDetailDrawer";
import { MAIN_REALTIME_SOCKET_PATH } from "../../../realtime/constants";

type InboxV2PageProps = { userId: string; isOpen: boolean; onClose: () => void; };

function formatInboxDate(value: any, includeTime = false) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString(undefined, includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

function customerIdOf(customer: any, fallback = 0) {
  return String(customer?.$id || customer?.id || customer?.customer_id || customer?.jid || `customer-${fallback}`);
}

export function InboxV2Page({ userId, isOpen, onClose }: InboxV2PageProps) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [selectedConv, setSelectedConv] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");
  // Memory-only upload buffer state
  const [selectedFile, setSelectedFile] = useState<{ buffer: ArrayBuffer; name: string; type: string } | null>(null);
  const [profileCustomer, setProfileCustomer] = useState<any | null>(null);
  const [mediaErrors, setMediaErrors] = useState<Record<string, boolean>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingAI, setUpdatingAI] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msgError, setMsgError] = useState<string | null>(null);

  // Unread tracking: map from customerJid -> lastMessageAt of last seen message
  const [lastSeenAt, setLastSeenAt] = useState<Record<string, number>>({});

  // Pagination states
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // In-flight query guards
  const conversationsLoadingRef = useRef(false);
  const messagesLoadingRef = useRef(false);
  const isNearBottomRef = useRef(true);

  // Authentication error tracking
  const consecutiveAuthErrorsRef = useRef(0);
  const [isAuthExpired, setIsAuthExpired] = useState(false);

  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<any>(null);

  const selectedConvRef = useRef<any>(null);
  selectedConvRef.current = selectedConv;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    isNearBottomRef.current = distanceToBottom < 120;
  };

  useEffect(() => {
    if (isNearBottomRef.current && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  // Robust credentials-compliant on-demand fetch wrapper
  const inboxFetch = async (url: string, options: RequestInit = {}, isBackground = false) => {
    if (isAuthExpired && isBackground) {
      throw new Error("Session expired. Please log in again.");
    }

    const mergedOptions: RequestInit = {
      credentials: "same-origin",
      ...options,
      headers: {
        "Accept": "application/json",
        ...(options.headers || {})
      }
    };

    try {
      const res = await fetch(url, mergedOptions);
      if (res.status === 401 || res.status === 403) {
        consecutiveAuthErrorsRef.current++;
        if (consecutiveAuthErrorsRef.current >= 3) {
          setIsAuthExpired(true);
        }
        if (!isBackground) {
          setError("Session expired. Please refresh and log in again.");
        }
        throw new Error("Authentication required");
      }
      consecutiveAuthErrorsRef.current = 0;
      return res;
    } catch (e: any) {
      if (e.message !== "Authentication required" && !isBackground) {
        setError(e.message || "Network error occurred");
      }
      throw e;
    }
  };

  const loadBaselineData = async () => {
    if (!userId) return;
    try {
      const [botsRes, customersRes] = await Promise.all([
        inboxFetch("/api/bots/list"),
        inboxFetch(`/api/user/customers?userId=${encodeURIComponent(userId)}`)
      ]);
      if (botsRes && botsRes.ok) {
        const botsData = await botsRes.json();
        setBots(Array.isArray(botsData) ? botsData : []);
      }
      if (customersRes && customersRes.ok) {
        const customersData = await customersRes.json();
        setCustomers(Array.isArray(customersData) ? customersData : []);
      }
    } catch (e) {
      console.error("[Inbox V2] Failed loading baseline data:", e);
    }
  };

  const loadConversations = async (background = false, append = false) => {
    if (!userId) return;
    if (conversationsLoadingRef.current) return;
    conversationsLoadingRef.current = true;
    if (!background && !append) setIsLoading(true);
    if (!background) setError(null);
    if (append) setIsFetchingNextPage(true);

    try {
      const limit = 30;
      let url = `/api/inbox/conversations?q=${encodeURIComponent(debouncedQuery)}&botId=${encodeURIComponent(selectedBotId)}&limit=${limit}`;
      if (append && nextCursor) {
        url += `&cursor=${encodeURIComponent(nextCursor)}`;
      }
      if (selectedLabel) {
        url += `&label=${encodeURIComponent(selectedLabel)}`;
      }
      if (filterUnreadOnly) {
        url += `&unread=true`;
      }

      const res = await inboxFetch(url, {}, background);
      if (res && res.ok) {
        const data = await res.json();
        const incoming = Array.isArray(data.rows) ? data.rows : [];
        const newCursor = data.nextCursor || null;
        const newHasMore = data.hasMore || false;

        setConversations((prev) => {
          if (append) {
            const existingKeys = new Set(prev.map((c) => c.customerJid));
            const filteredIncoming = incoming.filter((c) => !existingKeys.has(c.customerJid));
            return [...prev, ...filteredIncoming];
          } else if (background) {
            const incomingKeys = new Set(incoming.map((c) => c.customerJid));
            const remainingPrev = prev.filter((c) => !incomingKeys.has(c.customerJid));
            return [...incoming, ...remainingPrev];
          } else {
            return incoming;
          }
        });

        if (!background) {
          setNextCursor(newCursor);
          setHasMore(newHasMore);
        }

        // Baseline unread initialization on first load
        setLastSeenAt((prev) => {
          const next = { ...prev };
          for (const c of incoming) {
            if (next[c.customerJid] === undefined) {
              next[c.customerJid] = c.unread ? 0 : (c.lastMessageAt || 0);
            }
          }
          return next;
        });

        // Mark any currently-selected conversation as seen immediately
        if (selectedConvRef.current) {
          const sel = selectedConvRef.current;
          const updated = incoming.find((c) => c.customerJid === sel.customerJid);
          if (updated) {
            setLastSeenAt((prev) => ({
              ...prev,
              [sel.customerJid]: updated.lastMessageAt || 0,
            }));
          }
        }
      } else if (res) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "Failed to load conversations");
      }
    } catch (e) {
      if (!background) {
        setError("Failed to connect to server");
      }
    } finally {
      conversationsLoadingRef.current = false;
      if (!background && !append) setIsLoading(false);
      if (append) setIsFetchingNextPage(false);
    }
  };

  const loadMessages = async (conv: any, background = false) => {
    if (!conv) return;
    if (messagesLoadingRef.current) return;
    messagesLoadingRef.current = true;
    if (!background) setLoadingMsgs(true);
    if (!background) setMsgError(null);
    try {
      const res = await inboxFetch(
        `/api/inbox/conversations/${encodeURIComponent(conv.customerJid)}/messages?botId=${encodeURIComponent(
          conv.botId || ""
        )}&dataOwnerKey=${encodeURIComponent(conv.dataOwnerKey || "")}`,
        {},
        background
      );
      if (res && res.ok) {
        const data = await res.json();
        // Preserving pending messages during history rebuilds
        setMessages((prev) => {
          const pending = prev.filter((m) => m.status === "pending" || m.status === "failed");
          const incomingIds = new Set(data.map((m: any) => m.messageId));
          const uniquePending = pending.filter((p) => !incomingIds.has(p.messageId));
          return [...data, ...uniquePending];
        });
      } else if (res) {
        const errData = await res.json().catch(() => ({}));
        setMsgError(errData.error || "Failed to load messages");
      }
    } catch (e) {
      if (!background) {
        setMsgError("Connection error loading messages");
      }
    } finally {
      messagesLoadingRef.current = false;
      if (!background) setLoadingMsgs(false);
    }
  };

  const handleSelectConv = (conv: any) => {
    setSelectedConv(conv);
    loadMessages(conv);
    setReplyText("");
    setSelectedFile(null);
    setMediaErrors({});
    isNearBottomRef.current = true;

    // Mark as read in frontend state
    setLastSeenAt((prev) => ({
      ...prev,
      [conv.customerJid]: Date.now(),
    }));
    setConversations((prev) =>
      prev.map((c) =>
        c.customerJid === conv.customerJid ? { ...c, unread: false } : c
      )
    );

    // Call backend to persist read status
    inboxFetch(`/api/inbox/conversations/${encodeURIComponent(conv.customerJid)}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botId: conv.botId }),
    }).catch((e) => console.error("Failed to persist read status:", e));
  };

  const handleSendReply = async () => {
    if (!selectedConv || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    setError(null);

    const textToSend = replyText;
    setReplyText(""); // Instant compose field reset

    const tempId = `temp-${Date.now()}`;
    const tempMsg = {
      id: tempId,
      messageId: tempId,
      role: "model",
      text: textToSend,
      timestamp: Date.now(),
      direction: "outbound",
      status: "pending"
    };

    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await inboxFetch(`/api/inbox/conversations/${encodeURIComponent(selectedConv.customerJid)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: selectedConv.botId,
          text: textToSend,
          dataOwnerKey: selectedConv.dataOwnerKey,
          sendTargetJid: selectedConv.sendTargetJid || selectedConv.sendableJid || selectedConv.customerJid
        }),
      });
      if (res && res.ok) {
        const data = await res.json();
        if (data.success && data.message) {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...data.message, status: "success" } : m))
          );
          setConversations((prev) =>
            prev.map((c) =>
              c.customerJid === selectedConv.customerJid
                ? { ...c, lastMessagePreview: textToSend, lastMessageAt: Date.now(), lastDirection: "model" }
                : c
            )
          );
          loadMessages(selectedConv, true);
          loadConversations(true);
        }
      } else {
        const errData = await res?.json().catch(() => ({}));
        setError(errData?.error || "Failed to send message");
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m))
        );
      }
    } catch (e: any) {
      setError(e.message || "Network error sending message");
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m))
      );
    } finally {
      setSendingReply(false);
    }
  };

  const handleSendAttachment = async () => {
    if (!selectedConv || !selectedFile || sendingReply) return;
    setSendingReply(true);
    setError(null);

    const fileToUpload = selectedFile;
    const textToCaption = replyText;

    // Instant compose field resets
    setReplyText("");
    setSelectedFile(null);

    const tempId = `temp-${Date.now()}`;
    const tempMsg = {
      id: tempId,
      messageId: tempId,
      role: "model",
      text: textToCaption ? `[Media] ${textToCaption}` : "[Media]",
      timestamp: Date.now(),
      direction: "outbound",
      status: "pending",
      messageType: fileToUpload.type.split("/")[0],
      hasMedia: true,
      caption: textToCaption,
      fileName: fileToUpload.name,
      mimeType: fileToUpload.type,
      mediaUrl: ""
    };

    setMessages((prev) => [...prev, tempMsg]);

    try {
      const url = `/api/inbox/conversations/${encodeURIComponent(selectedConv.customerJid)}/attachment?botId=${encodeURIComponent(selectedConv.botId || "")}&dataOwnerKey=${encodeURIComponent(selectedConv.dataOwnerKey || "")}&sendableJid=${encodeURIComponent(selectedConv.sendTargetJid || selectedConv.sendableJid || selectedConv.customerJid)}`;

      const res = await inboxFetch(url, {
        method: "POST",
        headers: {
          "x-file-name": encodeURIComponent(fileToUpload.name),
          "x-mime-type": fileToUpload.type,
          "x-caption": encodeURIComponent(textToCaption),
          "Content-Type": "application/octet-stream"
        },
        body: fileToUpload.buffer
      });

      if (res && res.ok) {
        const data = await res.json();
        if (data.success && data.message) {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...data.message, status: "success" } : m))
          );
          setConversations((prev) =>
            prev.map((c) =>
              c.customerJid === selectedConv.customerJid
                ? { ...c, lastMessagePreview: data.message.text, lastMessageAt: Date.now(), lastDirection: "model" }
                : c
            )
          );
          loadMessages(selectedConv, true);
          loadConversations(true);
        }
      } else {
        let errMsg = "Failed to send attachment";
        try {
          const errData = await res?.clone().json().catch(() => null);
          if (errData?.error) {
            errMsg = errData.error;
          } else {
            const txt = await res?.text().catch(() => "");
            if (txt) errMsg = txt;
          }
        } catch {
          const txt = await res?.text().catch(() => "");
          if (txt) errMsg = txt;
        }
        setError(errMsg);
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m))
        );
      }
    } catch (e: any) {
      setError(e.message || "Network error sending attachment");
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m))
      );
    } finally {
      setSendingReply(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 16 * 1024 * 1024) {
      setError("File is too large. Maximum size is 16MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFile({
        buffer: reader.result as ArrayBuffer,
        name: file.name,
        type: file.type
      });
    };
    reader.readAsArrayBuffer(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (sendingReply) return;
      if (selectedFile) {
        handleSendAttachment();
      } else if (replyText.trim()) {
        handleSendReply();
      }
    }
  };

  const handleToggleAI = async (action: "pause" | "resume") => {
    if (!selectedConv || updatingAI) return;
    setUpdatingAI(true);
    setError(null);
    try {
      const res = await inboxFetch(`/api/inbox/conversations/${encodeURIComponent(selectedConv.customerJid)}/reply-control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: selectedConv.botId,
          action,
          dataOwnerKey: selectedConv.dataOwnerKey
        }),
      });
      if (res && res.ok) {
        const data = await res.json();
        if (data.success && data.profile) {
          const isPaused = action === "pause";
          setSelectedConv((prev: any) => prev ? { ...prev, aiPaused: isPaused, replyControlStatus: data.profile.botReplyControl } : null);
          setConversations((prev) =>
            prev.map((c) =>
              c.customerJid === selectedConv.customerJid
                ? { ...c, aiPaused: isPaused, replyControlStatus: data.profile.botReplyControl }
                : c
            )
          );
        }
      } else {
        setError("Failed to update AI reply control status");
      }
    } catch (e) {
      setError("Network error updating AI control");
    } finally {
      setUpdatingAI(false);
    }
  };

  const handleMarkRead = async (conv: any) => {
    if (!conv) return;
    setLastSeenAt((prev) => ({
      ...prev,
      [conv.customerJid]: Date.now(),
    }));
    setConversations((prev) =>
      prev.map((c) =>
        c.customerJid === conv.customerJid ? { ...c, unread: false } : c
      )
    );

    try {
      await inboxFetch(`/api/inbox/conversations/${encodeURIComponent(conv.customerJid)}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: conv.botId }),
      });
    } catch (e) {
      console.error("Failed to mark conversation as read:", e);
    }
  };

  const handleMarkUnread = async (conv: any) => {
    if (!conv) return;
    setLastSeenAt((prev) => ({
      ...prev,
      [conv.customerJid]: 0,
    }));
    setConversations((prev) =>
      prev.map((c) =>
        c.customerJid === conv.customerJid ? { ...c, unread: true } : c
      )
    );

    try {
      await inboxFetch(`/api/inbox/conversations/${encodeURIComponent(conv.customerJid)}/unread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: conv.botId }),
      });
    } catch (e) {
      console.error("Failed to mark conversation as unread:", e);
    }
  };

  const handleAddLabel = async (conv: any, label: string) => {
    if (!conv || !label) return;
    const nextLabels = [...(conv.labels || []), label];

    setSelectedConv((prev: any) => prev ? { ...prev, labels: nextLabels } : null);
    setConversations((prev) =>
      prev.map((c) =>
        c.customerJid === conv.customerJid ? { ...c, labels: nextLabels } : c
      )
    );

    try {
      await inboxFetch(`/api/inbox/conversations/${encodeURIComponent(conv.customerJid)}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: conv.botId, labels: nextLabels }),
      });
    } catch (e) {
      console.error("Failed to add label:", e);
    }
  };

  const handleRemoveLabel = async (conv: any, label: string) => {
    if (!conv || !label) return;
    const nextLabels = (conv.labels || []).filter((l: string) => l !== label);

    setSelectedConv((prev: any) => prev ? { ...prev, labels: nextLabels } : null);
    setConversations((prev) =>
      prev.map((c) =>
        c.customerJid === conv.customerJid ? { ...c, labels: nextLabels } : c
      )
    );

    try {
      await inboxFetch(`/api/inbox/conversations/${encodeURIComponent(conv.customerJid)}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: conv.botId, labels: nextLabels }),
      });
    } catch (e) {
      console.error("Failed to remove label:", e);
    }
  };

  const handleSync = async () => {
    setNextCursor(null);
    setHasMore(false);
    await loadConversations();
    if (selectedConv) {
      await loadMessages(selectedConv);
    }
  };

  // High-performance background polling & Realtime fallback
  useEffect(() => {
    if (!isOpen || isAuthExpired) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    if (!socketRef.current) {
      const socket = io("/", {
        path: MAIN_REALTIME_SOCKET_PATH,
        transports: ["websocket", "polling"],
        withCredentials: true,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setSocketConnected(true);
        // Force a sync upon reconnect to catch missed messages
        loadConversations(true).catch(() => {});
        if (selectedConvRef.current) {
          loadMessages(selectedConvRef.current, true).catch(() => {});
        }
      });

      socket.on("disconnect", () => {
        setSocketConnected(false);
      });

      socket.on("message.created", (ev: any) => {
        loadConversations(true).catch(() => {});
        if (selectedConvRef.current && selectedConvRef.current.customerJid === ev.customerJid) {
          loadMessages(selectedConvRef.current, true).catch(() => {});
        }
      });

      socket.on("conversation.updated", () => {
        loadConversations(true).catch(() => {});
      });
    }

    const messagesPollInterval = setInterval(() => {
      if (!socketConnected && selectedConvRef.current && isOpen && !isAuthExpired) {
        loadMessages(selectedConvRef.current, true).catch(() => {});
      }
    }, 2500);

    const conversationsPollInterval = setInterval(() => {
      if (!socketConnected && isOpen && !isAuthExpired) {
        loadConversations(true).catch(() => {});
      }
    }, 5500);

    return () => {
      clearInterval(messagesPollInterval);
      clearInterval(conversationsPollInterval);
    };
  }, [isOpen, isAuthExpired, socketConnected]);

  useEffect(() => {
    if (socketRef.current && socketConnected && selectedConv) {
      socketRef.current.emit("join_conversation", {
        dataOwnerKey: selectedConv.dataOwnerKey,
        customerJid: selectedConv.customerJid
      });
      return () => {
        if (socketRef.current && selectedConv) {
          socketRef.current.emit("leave_conversation", {
            dataOwnerKey: selectedConv.dataOwnerKey,
            customerJid: selectedConv.customerJid
          });
        }
      };
    }
  }, [selectedConv, socketConnected]);

  const customerMap = useMemo(() => new Map(customers.map((c, index) => [customerIdOf(c, index), c])), [customers]);

  const handleOpenCustomer360 = () => {
    if (!selectedConv) return;
    const matched = customerMap.get(selectedConv.customerId);
    if (matched) {
      setProfileCustomer(matched);
    } else {
      setProfileCustomer({
        id: selectedConv.customerId,
        customer_id: selectedConv.customerId,
        phone: selectedConv.phone,
        name: selectedConv.displayName,
        bot_id: selectedConv.botId,
        profile: {
          name: selectedConv.displayName,
          sourceDetail: selectedConv.source,
          botReplyControl: selectedConv.replyControlStatus,
          manualReviewRequired: selectedConv.aiPaused
        }
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBaselineData();
      setNextCursor(null);
      setHasMore(false);
      loadConversations();
    }
  }, [isOpen, userId, debouncedQuery, selectedBotId, selectedLabel, filterUnreadOnly]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[65] flex flex-col bg-[#f7f8f8] text-gray-950 dark:bg-neutral-950 dark:text-neutral-50 lg:left-[18rem]">
      {/* Header bar */}
      <div className="flex flex-col justify-between gap-3 border-b border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">Workspace Inbox</p>
          <h1 className="text-xl font-black">Inbox Command Center</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedBotId}
            onChange={(e) => setSelectedBotId(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-black dark:border-neutral-800 dark:bg-neutral-950"
          >
            <option value="">All Instances</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || b.jid || b.id}
              </option>
            ))}
          </select>
          <div className="relative flex items-center rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
            <Search className="h-3.5 w-3.5 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations..."
              className="ml-2 w-48 bg-transparent text-xs font-semibold outline-none"
            />
          </div>
          <select
            value={selectedLabel}
            onChange={(e) => setSelectedLabel(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-black dark:border-neutral-800 dark:bg-neutral-950"
          >
            <option value="">All Labels</option>
            {[
              "Hot Lead",
              "Follow Up",
              "Pricing Asked",
              "Order Issue",
              "Support",
              "Paid Customer",
              "Not Interested",
              "Spam"
            ].map(lbl => (
              <option key={lbl} value={lbl}>{lbl}</option>
            ))}
          </select>
          <select
            value={filterUnreadOnly ? "unread" : "all"}
            onChange={(e) => setFilterUnreadOnly(e.target.value === "unread")}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-black dark:border-neutral-800 dark:bg-neutral-950"
          >
            <option value="all">All Messages</option>
            <option value="unread">Unread Only</option>
          </select>
          <button
            onClick={handleSync}
            disabled={isLoading}
            className="rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-black hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900"
          >
            <RefreshCw className={`mr-1.5 inline h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Sync
          </button>
          <button
            onClick={onClose}
            className="rounded-xl bg-gray-950 px-3.5 py-1.5 text-xs font-black text-white hover:bg-gray-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-100"
          >
            <X className="mr-1.5 inline h-3.5 w-3.5" />
            Close
          </button>
        </div>
      </div>

      {/* Main 3-Column Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* COLUMN 1: Conversation List */}
        <div className="w-full flex-col border-r border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 lg:flex lg:w-80">
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-bold text-gray-400">No active conversations found</p>
              </div>
            ) : (
              <>
                {conversations.map((c) => {
                  const isActive = selectedConv?.customerJid === c.customerJid;
                  const seenAt = lastSeenAt[c.customerJid] || 0;
                  const isUnread = !isActive && (c.unread || (c.lastDirection === "user" && (c.lastMessageAt || 0) > seenAt));
                  return (
                    <div
                      key={`${c.dataOwnerKey}:${c.canonicalCustomerKey}:${c.botId || "no-bot"}`}
                      onClick={() => handleSelectConv(c)}
                      className={`cursor-pointer border-b border-gray-100 p-4 transition-colors hover:bg-gray-50 dark:border-neutral-800/40 dark:hover:bg-neutral-800/40 ${
                        isActive ? "bg-emerald-50/50 dark:bg-emerald-950/20" : isUnread ? "bg-blue-50/30 dark:bg-blue-950/10 border-l-2 border-l-blue-400" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          {isUnread && (
                            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-blue-500" />
                          )}
                          <h4 className={`truncate text-sm flex items-center gap-1.5 ${isUnread ? "font-black" : "font-black"}`}>
                            {c.displayName}
                          </h4>
                        </div>
                        <span className="shrink-0 text-[10px] font-semibold text-gray-400">
                          {c.lastMessageAt ? formatInboxDate(c.lastMessageAt) : ""}
                        </span>
                      </div>
                      {c.whatsappName && c.whatsappName !== c.displayName && (
                        <p className="truncate text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          WA Name: {c.whatsappName}
                        </p>
                      )}
                      <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-gray-400">
                        <span>{c.phone === "Phone not available" ? "Phone not available · WhatsApp ID" : c.phone}</span>
                        {c.contactLabel && (
                          <span className="rounded bg-gray-100 px-1 py-0.5 text-[8px] font-black dark:bg-neutral-800">
                            {c.contactLabel}
                          </span>
                        )}
                      </div>
                      {c.labels && c.labels.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {c.labels.map((lbl: string) => (
                            <span
                              key={lbl}
                              className="rounded bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                            >
                              {lbl}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className={`mt-1.5 line-clamp-2 text-xs dark:text-neutral-400 ${isUnread ? "font-bold text-gray-800 dark:text-neutral-200" : "font-medium text-gray-500"}`}>
                        {c.lastMessagePreview || "No messages yet"}
                      </p>
                      <div className="mt-2.5 flex items-center justify-between">
                        {c.aiPaused ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                            AI Paused
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                            AI Active
                          </span>
                        )}
                        {c.lastDirection === "model" && (
                          <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                            <Bot className="h-3 w-3" /> Replied
                          </span>
                        )}
                        {isUnread && (
                          <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[9px] font-black text-white">
                            New
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {hasMore && (
                  <div className="p-3 text-center">
                    <button
                      onClick={() => loadConversations(false, true)}
                      disabled={isFetchingNextPage}
                      className="w-full rounded-xl bg-gray-50 dark:bg-neutral-800/60 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {isFetchingNextPage ? "Loading..." : "Load more"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* COLUMN 2: Chat panel */}
        <div className="flex flex-1 flex-col bg-[#fcfcfc] dark:bg-neutral-900/40">
          {selectedConv ? (
            <>
              {/* Active Conversation Header */}
              <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div>
                  <h3 className="text-sm font-black">{selectedConv.displayName}</h3>
                  <p className="text-[10px] font-bold text-gray-400">
                    {selectedConv.phone === "Phone not available" ? "WhatsApp ID" : selectedConv.phone}
                  </p>
                </div>
                <button
                  onClick={() => loadMessages(selectedConv)}
                  disabled={loadingMsgs}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-800"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingMsgs ? "animate-spin" : ""}`} />
                </button>
              </div>

              {/* Message Timeline */}
              <div
                ref={chatContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-3"
              >
                {msgError ? (
                  <div className="flex h-full items-center justify-center p-4">
                    <p className="text-xs font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-4 py-3 rounded-xl border border-red-200 dark:border-red-950/30">
                      {msgError}
                    </p>
                  </div>
                ) : loadingMsgs && messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-xs font-bold text-gray-400">Loading chat history...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-xs font-bold text-gray-400">No message history available.</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isUser = m.role === "user";
                    return (
                      <div key={m.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[70%] rounded-2xl p-3 text-sm font-semibold shadow-sm relative ${
                            isUser
                              ? "bg-white text-gray-900 dark:bg-neutral-800 dark:text-neutral-50"
                              : "bg-emerald-600 text-white dark:bg-emerald-700"
                          }`}
                        >
                          {/* Rich Media Renderers (On-demand WhatsApp media stream) */}
                          {m.hasMedia ? (
                            <div className="space-y-2">
                              {mediaErrors[m.id] ? (
                                <div className="text-xs font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 rounded border border-amber-100 dark:border-amber-950/30">
                                  Media unavailable. Refresh or reconnect instance.
                                </div>
                              ) : (
                                <>
                                  {m.messageType === "image" && (
                                    <img
                                      src={m.mediaUrl}
                                      alt="Image"
                                      onError={() => {
                                        setMediaErrors((prev) => ({ ...prev, [m.id]: true }));
                                      }}
                                      onClick={() => window.open(m.mediaUrl, "_blank")}
                                      className="max-h-60 rounded-lg cursor-pointer object-cover border border-gray-100 hover:opacity-95"
                                    />
                                  )}
                                  {m.messageType === "video" && (
                                    <video
                                      controls
                                      src={m.mediaUrl}
                                      onError={() => {
                                        setMediaErrors((prev) => ({ ...prev, [m.id]: true }));
                                      }}
                                      className="max-h-60 max-w-full rounded-lg"
                                    />
                                  )}
                                  {m.messageType === "audio" && (
                                    <audio
                                      controls
                                      src={m.mediaUrl}
                                      onError={() => {
                                        setMediaErrors((prev) => ({ ...prev, [m.id]: true }));
                                      }}
                                      className="max-w-full"
                                    />
                                  )}
                                  {m.messageType === "document" && (
                                    <div className="flex items-center gap-2 rounded-xl bg-gray-50 p-2.5 dark:bg-neutral-800/80 border border-gray-100 dark:border-neutral-700/60">
                                      <File className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-black text-gray-900 dark:text-neutral-100">{m.fileName || "document"}</p>
                                        <p className="text-[10px] text-gray-400">PDF/Document</p>
                                      </div>
                                      <a
                                        href={m.mediaUrl}
                                        download={m.fileName}
                                        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-700"
                                      >
                                        <Download className="h-4 w-4" />
                                      </a>
                                    </div>
                                  )}
                                  {m.messageType === "sticker" && (
                                    <img
                                      src={m.mediaUrl}
                                      alt="Sticker"
                                      onError={() => {
                                        setMediaErrors((prev) => ({ ...prev, [m.id]: true }));
                                      }}
                                      className="max-h-36 rounded"
                                    />
                                  )}
                                  {!["image", "video", "audio", "document", "sticker"].includes(m.messageType) && (
                                    <div className="flex items-center gap-2 rounded-xl bg-gray-50 p-2.5 dark:bg-neutral-800 border border-gray-100 dark:border-neutral-700">
                                      <File className="h-5 w-5 text-gray-400" />
                                      <span className="text-xs">Media File</span>
                                      <a href={m.mediaUrl} download className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-neutral-700">
                                        <Download className="h-4 w-4" />
                                      </a>
                                    </div>
                                  )}
                                </>
                              )}
                              {m.caption && <p className="whitespace-pre-wrap text-xs mt-1.5">{m.caption}</p>}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{m.text}</p>
                          )}
                          <div className="flex items-center justify-between gap-2 mt-1.5">
                            <span className="text-[8px] font-black tracking-wider uppercase opacity-80">
                              {m.status === "pending" && "Sending..."}
                              {m.status === "failed" && "Failed"}
                              {m.status === "success" && "Sent"}
                            </span>
                            <div
                              className={`text-[9px] text-right font-bold opacity-60 ${
                                isUser ? "text-gray-400" : "text-emerald-100"
                              }`}
                            >
                              {m.timestamp ? formatInboxDate(m.timestamp, true) : ""}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Error display */}
              {error && (
                <div className="bg-red-50 px-4 py-2 text-xs font-bold text-red-700 dark:bg-red-950/20 dark:text-red-300 border-t border-red-200 dark:border-red-950/30">
                  {error}
                </div>
              )}

              {/* Reply composition panel */}
              <div className="border-t border-gray-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                {selectedConv && selectedConv.lastMessageAt && (
                  (() => {
                    const isWindowOpen = (Date.now() - selectedConv.lastMessageAt) <= 24 * 60 * 60 * 1000;
                    const hoursLeft = Math.max(0, Math.round((24 * 60 * 60 * 1000 - (Date.now() - selectedConv.lastMessageAt)) / (60 * 60 * 1000)));
                    if (isWindowOpen) {
                      return (
                        <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            24h Service Window Open ({hoursLeft}h remaining)
                          </span>
                          <span className="text-[10px] text-gray-400">Free-form reply active</span>
                        </div>
                      );
                    } else {
                      return (
                        <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                          <div className="flex items-center justify-between gap-2 font-bold">
                            <span>24h Service Window Closed</span>
                            <span className="text-[10px] text-amber-700 dark:text-amber-300">Meta Template Required</span>
                          </div>
                          <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
                            Meta requires an approved WhatsApp HSM template to message this customer outside the 24-hour customer service window.
                          </p>
                        </div>
                      );
                    }
                  })()
                )}
                {selectedConv.canReply === false ? (
                  <div className="rounded-xl bg-amber-50 p-3 text-center text-xs font-black text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
                    {selectedConv.replyDisabledReason || "Replying is disabled for this conversation"}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {/* Selected attachment preview */}
                    {selectedFile && (
                      <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5 text-xs font-semibold dark:bg-neutral-800 dark:border-neutral-700">
                        <div className="flex items-center gap-1.5 truncate">
                          <File className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="truncate max-w-[220px]">{selectedFile.name}</span>
                        </div>
                        <button onClick={() => setSelectedFile(null)} className="text-gray-400 hover:text-gray-600">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center justify-center rounded-xl border border-gray-200 p-2.5 text-gray-500 hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-950"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <div className="flex-1 flex flex-col">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={selectedFile ? "Add caption for attachment..." : "Type message to send..."}
                          rows={2}
                          className="w-full resize-none rounded-xl border border-gray-200 bg-white p-2.5 text-xs font-semibold outline-none focus:border-emerald-500 dark:border-neutral-800 dark:bg-neutral-950"
                        />
                        <span className="text-[9px] text-gray-400 font-bold mt-1 ml-0.5">
                          Enter to send • Shift+Enter for newline
                        </span>
                      </div>
                      <button
                        onClick={selectedFile ? handleSendAttachment : handleSendReply}
                        disabled={sendingReply || (!selectedFile && !replyText.trim())}
                        className="flex items-center justify-center rounded-xl bg-emerald-600 p-2.5 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8">
              <MessageSquare className="h-12 w-12 text-gray-300 mb-2" />
              <p className="text-sm font-bold text-gray-400">Select a conversation to start messaging</p>
            </div>
          )}
        </div>

        {/* COLUMN 3: Customer profile & Action Panel */}
        {selectedConv && (
          <div className="hidden w-64 flex-col border-l border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 lg:flex overflow-y-auto">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">Customer profile</h3>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h4 className="truncate text-sm font-black">{selectedConv.displayName}</h4>
                {selectedConv.whatsappName && selectedConv.whatsappName !== selectedConv.displayName && (
                  <p className="truncate text-[10px] font-bold text-emerald-600 dark:text-emerald-400">WA Name: {selectedConv.whatsappName}</p>
                )}
                <p className="truncate text-xs font-semibold text-gray-400 flex items-center gap-1">
                  {selectedConv.phone === "Phone not available" ? "WhatsApp ID" : selectedConv.phone}
                  {selectedConv.contactLabel && (
                    <span className="rounded bg-gray-100 px-1 py-0.5 text-[8px] font-black dark:bg-neutral-800">
                      {selectedConv.contactLabel}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3.5 border-t border-gray-100 pt-4 dark:border-neutral-800/40">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Source provider</p>
                <p className="mt-0.5 text-xs font-bold">{selectedConv.source || "Direct chat"}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">WhatsApp Instance</p>
                <p className="mt-0.5 text-xs font-bold">{selectedConv.botName || "Unknown"}</p>
                {selectedConv.instanceNumber && (
                  <p className="mt-0.5 font-mono text-[10px] text-gray-400">Number: {selectedConv.instanceNumber}</p>
                )}
              </div>
              {selectedConv.rawCustomerJid && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">WhatsApp ID</p>
                  <p className="mt-0.5 font-mono text-[9px] text-gray-400 break-all">{selectedConv.rawCustomerJid}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">AI replies status</p>
                <div className="mt-1">
                  {selectedConv.aiPaused ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                      AI replies paused
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                      AI replying active
                    </span>
                  )}
                </div>
              </div>

              {/* Labels section */}
              <div className="mt-5 border-t border-gray-100 pt-4 dark:border-neutral-800/40">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Labels</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(selectedConv.labels || []).map((lbl: string) => (
                    <span
                      key={lbl}
                      className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                    >
                      {lbl}
                      <button
                        onClick={() => handleRemoveLabel(selectedConv, lbl)}
                        className="text-emerald-500 hover:text-emerald-700 dark:text-emerald-400"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                  {(selectedConv.labels || []).length === 0 && (
                    <span className="text-xs text-gray-400 font-semibold">No labels</span>
                  )}
                </div>

                {/* Add label dropdown */}
                <div className="mt-3">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddLabel(selectedConv, e.target.value);
                        e.target.value = "";
                      }
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold dark:border-neutral-800 dark:bg-neutral-950"
                  >
                    <option value="">+ Add Label...</option>
                    {[
                      "Hot Lead",
                      "Follow Up",
                      "Pricing Asked",
                      "Order Issue",
                      "Support",
                      "Paid Customer",
                      "Not Interested",
                      "Spam"
                    ].filter(lbl => !(selectedConv.labels || []).includes(lbl))
                     .map(lbl => (
                      <option key={lbl} value={lbl}>{lbl}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-8 space-y-2 border-t border-gray-100 pt-4 dark:border-neutral-800/40">
              {(selectedConv.unread || (lastSeenAt[selectedConv.customerJid] || 0) === 0) ? (
                <button
                  onClick={() => handleMarkRead(selectedConv)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2 text-xs font-black hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
                >
                  Mark as read
                </button>
              ) : (
                <button
                  onClick={() => handleMarkUnread(selectedConv)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2 text-xs font-black hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
                >
                  Mark as unread
                </button>
              )}
              {selectedConv.aiPaused ? (
                <button
                  onClick={() => handleToggleAI("resume")}
                  disabled={updatingAI}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  Resume AI replies
                </button>
              ) : (
                <button
                  onClick={() => handleToggleAI("pause")}
                  disabled={updatingAI}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-2 text-xs font-black text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause AI replies
                </button>
              )}
              <button
                onClick={handleOpenCustomer360}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2 text-xs font-black hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
              >
                Customer 360 Details
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <CustomerDetailDrawer
        customer={profileCustomer}
        userId={userId}
        isOpen={Boolean(profileCustomer)}
        onClose={() => setProfileCustomer(null)}
        onSaved={(customer, nextProfile) => {
          setCustomers((prev) =>
            prev.map((item, index) =>
              customerIdOf(item, index) === customerIdOf(customer) ? { ...item, profile: nextProfile } : item
            )
          );
          setProfileCustomer(null);
        }}
        formatDate={formatInboxDate}
      />
    </div>
  );
}

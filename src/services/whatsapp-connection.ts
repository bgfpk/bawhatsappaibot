import { openWhatsAppSocket } from '../connections/socket';
import { fetchLatestBaileysVersion, makeCacheableSignalKeyStore, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { BotState, logger } from "./bot-context.ts";
import { createWhatsAppProxyAgents, verifyWhatsAppProxyTunnel } from "./proxy-agent-service.ts";

export async function createWhatsAppConnection(
    BOT_ID: string,
    proxyUrl: string | null,
    msgRetryCounterCache: any,
    onQR: (qr: string) => void,
    onConnecting: () => void,
    onConnected: (sock: any) => void,
    onDisconnected: (reason: any) => void
) {
    if(process.env.BLACKARROW_STAGE==='1')throw new Error('Use the scoped ConnectionEngine; legacy auth folders are unavailable');
    const authPath = `auth_info_baileys_${BOT_ID}`;
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const proxy = createWhatsAppProxyAgents(proxyUrl);
    const proxyLatency = await verifyWhatsAppProxyTunnel(proxy.fetchAgent);
    logger.info({ proxy: proxy.maskedProxyUrl, latency: proxyLatency }, "WhatsApp proxy tunnel verified");
    const { version } = await fetchLatestBaileysVersion({ dispatcher: proxy.fetchAgent } as any);

    BotState.waAuthState = { state, saveCreds };

    const { default: makeWASocket, Browsers } = await import("@whiskeysockets/baileys");

    const browsers = [
      Browsers.macOS("Desktop"),
      Browsers.ubuntu("Desktop"),
      Browsers.windows("Desktop")
    ];
    const randomBrowser = browsers[Math.floor(Math.random() * browsers.length)];

    let connectWa = typeof makeWASocket === "function" ? makeWASocket : (makeWASocket as any)?.default || makeWASocket;

    const binding = openWhatsAppSocket({permit:()=>{if(process.env.BLACKARROW_STAGE==='1')throw new Error('Converted connections require scoped ConnectionEngine authorization');}, makeSocket:connectWa,saveCreds,connection:(update:any)=>{
      const {connection,lastDisconnect,qr}=update;
      if(connection==='connecting')onConnecting();if(qr)onQR(qr);if(connection==='close')onDisconnected(lastDisconnect);if(connection==='open')onConnected(binding.socket);
    }, options:{
      version,
      browser: randomBrowser,
      agent: proxy.wsAgent as any,
      fetchAgent: proxy.fetchAgent as any,
      options: { dispatcher: proxy.fetchAgent } as any,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      msgRetryCounterCache,
      printQRInTerminal: false,
      logger,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      connectTimeoutMs: 180000,
      defaultQueryTimeoutMs: 90000,
      keepAliveIntervalMs: 20000,
      generateHighQualityLinkPreview: false,
      retryRequestDelayMs: 8000,
      getMessage: async (key: any) => { return { conversation: "GenAI internal history" }; }
    }});
    const sock=binding.socket;
    (sock as any).fetchAgent = proxy.fetchAgent;
    (sock as any).whatsappProxyUrl = proxy.proxyUrl;
    (sock as any).whatsappProxyLabel = proxy.maskedProxyUrl;
    
    return sock;
}

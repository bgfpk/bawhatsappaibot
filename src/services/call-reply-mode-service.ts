export function isEnabledFlag(value: any) {
    return value === true || value === 1 || value === "1";
}

export function shouldRejectIncomingCall(config: any) {
    return isEnabledFlag(config?.reject_calls ?? config?.rejectCalls);
}

export function isIncomingCallOffer(call: any) {
    return call?.status === "offer" && !call?.isGroup && Boolean(call?.id);
}

export function getCallChatJid(call: any) {
    return String(call?.chatId || call?.from || "").trim();
}

export function getCallRejectFromJid(call: any) {
    return String(call?.from || call?.chatId || "").trim();
}

export function buildCallRejectionMessage(config: any = {}) {
    const preferred = String(config?.preferredLanguage || config?.preferred_language || "").toLowerCase();
    if (preferred.includes("urdu")) {
        return "Assalam o Alaikum, main abhi call receive nahi kar sakta. Please apna message yahin bhej dein, ya voice note send kar dein. Main yahin reply kar dunga.";
    }
    return "Sorry, I can't receive calls right now. Please send your message here, or send a voice note, and I'll reply in chat.";
}

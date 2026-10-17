function clean(value: any, max = 600) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalize(text: any) {
  return clean(text, 600).toLowerCase();
}

const STOP_WORDS = new Set([
  "what", "why", "did", "you", "mean", "with", "that", "this", "about", "please", "tell",
  "me", "the", "and", "for", "have", "your", "from", "said", "ask", "asked", "was", "were",
  "hai", "kya", "matlab", "kyun", "ka", "ki", "ke", "ye", "woh", "aur",
]);

function extractInterestingTokens(text: string) {
  return Array.from(new Set(
    normalize(text)
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
  ));
}

export function isBotTermClarificationQuestion(text: string) {
  const value = normalize(text);
  if (!value) return false;
  return /\b(what do you mean|why did you ask|why did you say|what is|what was)\b/i.test(value) ||
    /\b(kya matlab|kyun pocha|kyun poocha|kyun kaha|ye kya)\b/i.test(value);
}

type BotIntroducedTermResult = {
  term: string;
  latestUserText: string;
  latestBotText: string;
  latestMessageAsksAboutBotTerm: boolean;
  guidance: string;
};

function detectClarificationTerm(latestUserText: string, latestBotText: string, priorMessages: any[]) {
  const customerTokens = new Set(extractInterestingTokens(latestUserText));
  const priorCustomerTokens = new Set(
    priorMessages
      .filter((message: any) => message?.key?.fromMe === false)
      .flatMap((message: any) => extractInterestingTokens(
        message?.message?.conversation || message?.message?.extendedTextMessage?.text || ""
      ))
  );
  const botTokens = extractInterestingTokens(latestBotText);
  return botTokens.find((token) => customerTokens.has(token) && !priorCustomerTokens.has(token)) || "";
}

function buildGuidance(term: string) {
  return `The customer is asking about the assistant term "${term}" from the previous bot message. Treat it as assistant-introduced context, not as customer intent. If it was mistaken or unsupported, acknowledge the mistake briefly before continuing.`;
}

export function detectBotIntroducedTermContext(historyArray: any[] = []): BotIntroducedTermResult | null {
  const recent = Array.isArray(historyArray) ? historyArray.filter(Boolean) : [];
  let latestUserIndex = -1;
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    if (recent[index]?.key?.fromMe === false) {
      latestUserIndex = index;
      break;
    }
  }
  if (latestUserIndex <= 0) return null;
  const latestUserText = clean(
    recent[latestUserIndex]?.message?.conversation ||
      recent[latestUserIndex]?.message?.extendedTextMessage?.text ||
      "",
    600
  );
  if (!isBotTermClarificationQuestion(latestUserText)) return null;

  const latestBotMessage = recent
    .slice(0, latestUserIndex)
    .reverse()
    .find((message: any) => message?.key?.fromMe === true);
  if (!latestBotMessage) return null;

  const latestBotText = clean(
    latestBotMessage?.message?.conversation ||
      latestBotMessage?.message?.extendedTextMessage?.text ||
      "",
    600
  );
  if (!latestBotText) return null;
  const introducedTerm = detectClarificationTerm(latestUserText, latestBotText, recent.slice(0, latestUserIndex));
  if (!introducedTerm) return null;

  return {
    term: introducedTerm,
    latestUserText,
    latestBotText,
    latestMessageAsksAboutBotTerm: true,
    guidance: buildGuidance(introducedTerm),
  };
}

export function findRecentBotIntroducedTerm(historyArray: any[] = []): BotIntroducedTermResult | null {
  const recent = Array.isArray(historyArray) ? historyArray.filter(Boolean) : [];
  if (recent.length < 2) return null;
  const latestUserMessage = [...recent].reverse().find((message: any) => message?.key?.fromMe === false);
  const latestUserText = clean(
    latestUserMessage?.message?.conversation ||
      latestUserMessage?.message?.extendedTextMessage?.text ||
      "",
    600
  );

  for (let index = recent.length - 1; index > 0; index -= 1) {
    const message = recent[index];
    if (message?.key?.fromMe !== false) continue;
    const userText = clean(
      message?.message?.conversation ||
        message?.message?.extendedTextMessage?.text ||
        "",
      600
    );
    if (!isBotTermClarificationQuestion(userText)) continue;
    const latestBotMessage = recent
      .slice(0, index)
      .reverse()
      .find((entry: any) => entry?.key?.fromMe === true);
    if (!latestBotMessage) continue;
    const latestBotText = clean(
      latestBotMessage?.message?.conversation ||
        latestBotMessage?.message?.extendedTextMessage?.text ||
        "",
      600
    );
    const term = detectClarificationTerm(userText, latestBotText, recent.slice(0, index));
    if (!term) continue;
    return {
      term,
      latestUserText,
      latestBotText,
      latestMessageAsksAboutBotTerm: userText === latestUserText,
      guidance: buildGuidance(term),
    };
  }
  return null;
}

export function suppressBotIntroducedTermText(text: string, term: string) {
  const value = String(text ?? "").slice(0, 600);
  if (!value || !term) return value;
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return value;
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !normalize(line).includes(normalizedTerm));
  return lines.join("\n").trim();
}

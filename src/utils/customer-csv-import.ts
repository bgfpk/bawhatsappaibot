export type ParsedCustomerCsvRow = {
  phone: string;
  jid?: string;
  lidJid?: string;
  fullName?: string;
  city?: string;
  country?: string;
  address?: string;
  extra: Record<string, string>;
};

const PHONE_HEADERS = new Set(["phone", "number", "mobile", "whatsapp", "whatsapp_number", "whatsapp number", "customer phone"]);
const NAME_HEADERS = new Set(["name", "full name", "full_name", "customer name", "customer_name"]);
const JID_HEADERS = new Set(["jid", "customer jid", "customer_jid", "whatsapp jid", "whatsapp_jid"]);
const LID_HEADERS = new Set(["lid", "lid jid", "lid_jid", "lid number", "lid_number"]);

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function cleanHeader(value: string) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function cleanPhone(value: string) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function looksLikeHeader(cells: string[]) {
  return cells.some((cell) => PHONE_HEADERS.has(cleanHeader(cell))) ||
    cells.some((cell) => NAME_HEADERS.has(cleanHeader(cell))) ||
    cells.some((cell) => JID_HEADERS.has(cleanHeader(cell))) ||
    cells.some((cell) => LID_HEADERS.has(cleanHeader(cell)));
}

function readRow(headers: string[], cells: string[]): ParsedCustomerCsvRow | null {
  const raw: Record<string, string> = {};
  headers.forEach((header, index) => {
    raw[header] = String(cells[index] || "").trim();
  });

  const findValue = (headerSet: Set<string>) => {
    const key = headers.find((header) => headerSet.has(cleanHeader(header)));
    return key ? raw[key] : "";
  };

  const phone = cleanPhone(findValue(PHONE_HEADERS) || cells[0] || "");
  const jid = findValue(JID_HEADERS);
  const lidJid = findValue(LID_HEADERS);
  if (!phone && !jid && !lidJid) return null;

  const fullName = findValue(NAME_HEADERS);
  const city = findValue(new Set(["city"]));
  const country = findValue(new Set(["country"]));
  const address = findValue(new Set(["address"]));
  const known = new Set([...PHONE_HEADERS, ...NAME_HEADERS, ...JID_HEADERS, ...LID_HEADERS, "city", "country", "address"]);
  const extra: Record<string, string> = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (value && !known.has(cleanHeader(key))) extra[key] = value;
  });

  return {
    phone,
    ...(jid ? { jid } : {}),
    ...(lidJid ? { lidJid } : {}),
    ...(fullName ? { fullName } : {}),
    ...(city ? { city } : {}),
    ...(country ? { country } : {}),
    ...(address ? { address } : {}),
    extra,
  };
}

export function parseCustomerCsv(text: string): ParsedCustomerCsvRow[] {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstCells = parseCsvLine(lines[0]);
  const hasHeader = looksLikeHeader(firstCells);
  const headers = hasHeader ? firstCells : ["phone", "full_name", "city", "country", "address"];
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => readRow(headers, parseCsvLine(line)))
    .filter((row): row is ParsedCustomerCsvRow => Boolean(row));
}

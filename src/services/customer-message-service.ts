type CustomerLanguage = string;

const URDU_SCRIPT_RE = /[\u0600-\u06ff]/;
const ROMAN_URDU_HINTS = [
  "aap",
  "ap",
  "hai",
  "hain",
  "kya",
  "chahiye",
  "karna",
  "krna",
  "mujhe",
  "muje",
  "mjy",
  "bhej",
  "bhejna",
  "kitna",
  "salam",
  "assalam",
  "ji",
];

function clean(value: any, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function money(value: any) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return String(amount);
}

function stripStockCount(value: any) {
  return clean(value)
    .replace(/\s*\(\s*\d+\s+available\s*\)\s*$/i, "")
    .trim();
}

export function detectCustomerLanguage(input: {
  latestText?: string;
  preferredLanguage?: string;
}) {
  const latest = clean(input.latestText);
  if (URDU_SCRIPT_RE.test(latest)) return "urdu" as CustomerLanguage;

  const preferred = clean(input.preferredLanguage).toLowerCase();
  if (preferred.includes("urdu")) return "roman_urdu" as CustomerLanguage;

  const words = latest.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const hintCount = ROMAN_URDU_HINTS.filter(hint => words.includes(hint)).length;
  return hintCount >= 2 ? "roman_urdu" as CustomerLanguage : "english" as CustomerLanguage;
}

export function buildOrderConfirmationMessage(orderData: any, savedRef: any, language: CustomerLanguage) {
  const ref = clean(savedRef?.order_id || orderData?.orderReferenceNumber, "N/A");
  const item = clean(orderData?.productName || orderData?.product_name, "Item");
  const qty = clean(orderData?.quantity || orderData?.items, "1");
  const total = money(orderData?.totalPrice || orderData?.codAmount || orderData?.total_price);
  const address = clean(orderData?.deliveryAddress || orderData?.orderAddress || orderData?.address);

  if (language === "urdu") {
    return [
      "آپ کا آرڈر کنفرم ہو گیا ہے۔",
      `Ref: ${ref}`,
      `آئٹم: ${item}`,
      `تعداد: ${qty}${total ? `, ٹوٹل: ${total}` : ""}`,
      address ? `ایڈریس: ${address}` : "",
      "ہم اسے جلد پروسیس کر دیں گے۔",
    ].filter(Boolean).join("\n");
  }

  if (language === "roman_urdu") {
    return [
      "Aap ka order confirm ho gaya hai.",
      `Ref: ${ref}`,
      `Item: ${item}`,
      `Qty: ${qty}${total ? `, Total: ${total}` : ""}`,
      address ? `Address: ${address}` : "",
      "Hum isay shortly process kar denge.",
    ].filter(Boolean).join("\n");
  }

  return [
    "Order confirmed.",
    `Ref: ${ref}`,
    `Item: ${item}`,
    `Qty: ${qty}${total ? `, Total: ${total}` : ""}`,
    address ? `Address: ${address}` : "",
    "We'll process it shortly.",
  ].filter(Boolean).join("\n");
}

export function buildStockUnavailableMessage(stockResult: any, language: CustomerLanguage) {
  const bestAlternative = stripStockCount(stockResult?.alternatives?.[0]);
  const hasSomeStock = Number(stockResult?.available || 0) > 0;

  if (language === "urdu") {
    if (bestAlternative) {
      return `یہ والا آپشن ابھی دستیاب نہیں ہے۔\nآپ یہ لے سکتے ہیں: ${bestAlternative}\nکیا یہ کنفرم کر دیں؟`;
    }
    return hasSomeStock
      ? "یہ quantity پوری دستیاب نہیں ہے۔ کم quantity کنفرم کرنی ہے؟"
      : "یہ والا آپشن ابھی stock میں نہیں ہے۔ کوئی اور color/option چاہیے؟";
  }

  if (language === "roman_urdu") {
    if (bestAlternative) {
      return `Ye option abhi available nahi hai.\nMain stock wapas aate hi aapko update kar dunga.\nAap ye le sakte hain: ${bestAlternative}\nYe confirm kar dein?`;
    }
    return hasSomeStock
      ? "Ye quantity poori available nahi hai. Kam quantity confirm karni hai?"
      : "Ye option abhi stock mein nahi hai. Main stock wapas aate hi aapko update kar dunga. Koi aur color/option chahiye?";
  }

  if (bestAlternative) {
    return `That option is not available right now.\nI'll update you automatically when it is back in stock.\nYou can buy: ${bestAlternative}\nShould I confirm this one?`;
  }
  return hasSomeStock
    ? "That quantity is not fully available. Would you like to confirm a lower quantity?"
    : "That option is out of stock right now. I'll update you automatically when it is back in stock. Would you like another color or option?";
}

export function buildSequenceAlreadySentMessage(language: CustomerLanguage) {
  if (language === "urdu") {
    return "میں نے یہ تفصیلات پہلے شیئر کر دی تھیں۔ آپ بتا دیں کون سا option confirm کرنا ہے؟";
  }
  if (language === "roman_urdu") {
    return "Ji, ye details pehle share kar di thi. Aap bata dein konsa option confirm karna hai?";
  }
  return "I already shared those details earlier. Which option would you like to confirm?";
}

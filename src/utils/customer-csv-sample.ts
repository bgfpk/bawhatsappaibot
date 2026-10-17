export const CUSTOMER_CSV_SAMPLE = [
  "phone,full_name,jid,lid_jid,city,country,address,notes",
  "12025550123,Alex Morgan,contact-ecad9a6cc345@example.invalid,123456789012345@lid,New York,United States,\"12 Market Street\",VIP customer",
  "442071234567,Jordan Lee,,,London,United Kingdom,,Imported lead",
].join("\n");

export function downloadCsvText(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Google now issues authorization keys as well as standard API keys. Treat keys
// as opaque credentials: bound size and header-safe characters, not an old prefix.
export function validGeminiKey(value:string) {
  return /^[A-Za-z0-9._~+/=-]{24,1024}$/.test(value);
}

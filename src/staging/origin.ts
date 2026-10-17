export const isPublicConversion = process.env.BLACKARROW_PUBLIC === '1';
export const publicOrigin = 'https://app.blackgoldfertilizer.com';
export function allowedOrigin(origin: unknown) {
  return isPublicConversion ? origin === publicOrigin : ['http://localhost:3412','http://127.0.0.1:3412'].includes(String(origin || ''));
}

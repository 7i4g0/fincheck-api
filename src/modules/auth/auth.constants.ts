export const ACCESS_TOKEN_COOKIE = 'granaemordem_token';

export const ACCESS_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (Express uses maxAge in ms)
  path: '/',
};

/**
 * Cookie with domain from frontend: proxy (X-Forwarded-Host) or subdomain (FRONTEND_COOKIE_DOMAIN).
 * Ex.: API em api.granaemordem.app + FRONTEND_COOKIE_DOMAIN=granaemordem.app → cookie shared, same-site, PWA ok.
 */
export function getCookieOptionsForProxy(forwardedHost: string) {
  return {
    ...ACCESS_TOKEN_COOKIE_OPTIONS,
    domain: forwardedHost,
    sameSite: 'lax' as const,
  };
}

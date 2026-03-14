export const ACCESS_TOKEN_COOKIE = 'granaemordem_token';

export const ACCESS_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (Express uses maxAge in ms)
  path: '/',
};

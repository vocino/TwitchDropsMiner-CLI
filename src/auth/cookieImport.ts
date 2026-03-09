export interface ImportedCookies {
  rawHeader: string;
}

export function normalizeCookieHeader(input: string): ImportedCookies {
  const header = input.trim();
  if (!header) {
    throw new Error("Empty cookie header.");
  }
  return { rawHeader: header };
}


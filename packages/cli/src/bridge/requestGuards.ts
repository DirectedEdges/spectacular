// Request guards for the bridge's two listeners (see server.ts). Both servers bind to
// 127.0.0.1, so nothing off this machine reaches them — these guards close what a
// loopback bind cannot: a browser on this machine is local too, and any website it
// visits can fire requests at localhost ports. Pure functions, so the rules are
// testable without opening a port.

/**
 * Hosts a request may legitimately name. Anything else is DNS rebinding: a hostile
 * page resolves its own domain to 127.0.0.1 after the browser's same-origin check,
 * and the request arrives here carrying that domain in its Host header.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Whether a Host header names this machine's loopback, on any port. */
export function hostAllowed(host: string | undefined): boolean {
  if (!host) return false;
  // Strip one trailing `:port` — but not from a bare IPv6 literal, whose colons are
  // part of the address and which the bracketed form exists to disambiguate.
  const name = host.startsWith('[')
    ? host.replace(/^(\[[^\]]*\]).*$/, '$1')
    : host.replace(/:\d+$/, '');
  return LOCAL_HOSTS.has(name.toLowerCase());
}

/**
 * Whether a WebSocket handshake may become a plugin connection.
 *
 * The Figma plugin UI runs in a sandboxed iframe: its handshake carries no Origin, the
 * literal `null`, or a figma.com origin — never an ordinary website's. A browser page
 * always sends its real origin on a WebSocket handshake and cannot forge another, so
 * admitting only these shapes shuts out every website while admitting every plugin.
 */
export function wsOriginAllowed(origin: string | undefined): boolean {
  if (!origin || origin === 'null') return true;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'https:') return false;
    return hostname === 'figma.com' || hostname.endsWith('.figma.com');
  } catch {
    return false;
  }
}

export interface HttpRejection {
  status: number;
  error: string;
}

/**
 * Why an HTTP request must be refused before routing, or null to let it through.
 *
 * Three rules, each closing one browser-side vector:
 * - A request carrying any Origin header came from a web page — the CLI and scripts
 *   never send one, and a cross-site caller cannot omit it. Refused outright rather
 *   than matched against an allowlist, because no web page has business here.
 * - A Host header that does not name loopback is DNS rebinding (see `hostAllowed`).
 * - A POST must declare `application/json`. A cross-site form or fetch that avoids
 *   the CORS preflight can only send simple content types, so requiring the one the
 *   real clients already send refuses those bodies without costing any caller.
 */
export function httpRejection(headers: {
  origin?: string;
  host?: string;
  'content-type'?: string;
}, method: string | undefined): HttpRejection | null {
  if (headers.origin !== undefined) {
    return { status: 403, error: 'Requests from web pages are not accepted.' };
  }
  if (!hostAllowed(headers.host)) {
    return { status: 403, error: 'Host must be localhost.' };
  }
  if (method === 'POST') {
    const contentType = (headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      return { status: 415, error: 'Content-Type must be application/json.' };
    }
  }
  return null;
}

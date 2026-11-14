// Minimal SMTP client (implicit TLS, port 465) used to send notification
// emails through a Gmail account with an App Password.
//
// One protocol implementation, two socket transports:
//   - Cloudflare Workers → `cloudflare:sockets` (the only TCP API in workerd)
//   - Node.js (local dev) → `node:tls`
//
// Configuration (env vars / wrangler secrets):
//   SMTP_USER  Gmail address that sends the mail, e.g. someone@gmail.com
//   SMTP_PASS  Google App Password for that account (NOT the login password)
//   SMTP_HOST  optional, default smtp.gmail.com
//   SMTP_PORT  optional, default 465 (must be an implicit-TLS port)

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

const TIMEOUT_MS = 20_000;

/** Returns the SMTP configuration, or null when credentials are not set. */
export function getSmtpConfig(): SmtpConfig | null {
  const user = (process.env.SMTP_USER || "").trim();
  // App Passwords are displayed as "abcd efgh ijkl mnop" — spaces are not part of it.
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");
  if (!user || !pass) return null;
  return {
    host: (process.env.SMTP_HOST || "smtp.gmail.com").trim(),
    port: Number(process.env.SMTP_PORT) || 465,
    user,
    pass,
    fromName: (process.env.SMTP_FROM_NAME || "MSquare Professionals Support").trim(),
  };
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

interface Transport {
  /** Resolves with the next chunk of bytes, or null when the peer closed. */
  read(): Promise<Uint8Array | null>;
  write(data: Uint8Array): Promise<void>;
  close(): void;
}

const onCloudflareWorkers =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

async function openWorkersTransport(host: string, port: number): Promise<Transport> {
  // Variable specifier + ignore hints: the Next.js bundler must not try to
  // resolve this workerd built-in; it is imported natively at runtime.
  const specifier = "cloudflare:sockets";
  const { connect } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ specifier);
  const socket = connect({ hostname: host, port }, { secureTransport: "on", allowHalfOpen: false });
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  return {
    async read() {
      const { value, done } = await reader.read();
      return done ? null : (value as Uint8Array);
    },
    async write(data) {
      await writer.write(data);
    },
    close() {
      socket.close().catch(() => undefined);
    },
  };
}

async function openNodeTransport(host: string, port: number): Promise<Transport> {
  const tls = await import("node:tls");
  const socket = tls.connect({ host, port, servername: host });
  const chunks: Uint8Array[] = [];
  let ended = false;
  let failure: Error | null = null;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };
  socket.on("data", (chunk: Uint8Array) => {
    chunks.push(chunk);
    notify();
  });
  socket.on("end", () => {
    ended = true;
    notify();
  });
  socket.on("close", () => {
    ended = true;
    notify();
  });
  socket.on("error", (err: Error) => {
    failure = err;
    notify();
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });
  return {
    async read() {
      for (;;) {
        const chunk = chunks.shift();
        if (chunk) return chunk;
        if (failure) throw failure;
        if (ended) return null;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    },
    write(data) {
      return new Promise<void>((resolve, reject) => {
        socket.write(data, (err) => (err ? reject(err) : resolve()));
      });
    },
    close() {
      socket.destroy();
    },
  };
}

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

/** RFC 2047 encoded-word, so non-ASCII subjects/names survive transport. */
function encodeHeader(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${base64(clean)}?=`;
}

function assertAddress(address: string): string {
  const clean = address.trim();
  if (!/^[^\s<>@,;:"]+@[^\s<>@,;:"]+\.[^\s<>@,;:"]+$/.test(clean)) {
    throw new Error(`Invalid email address: ${clean.slice(0, 80)}`);
  }
  return clean;
}

function buildMessage(config: SmtpConfig, to: string, message: MailMessage): string {
  const domain = config.user.split("@")[1] || "localhost";
  const id = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
  // Base64 body: safe for any UTF-8 text, no dot-stuffing or line-length issues.
  const body = (base64(message.text.replace(/\r?\n/g, "\r\n")).match(/.{1,76}/g) || []).join("\r\n");
  return [
    `From: ${encodeHeader(config.fromName)} <${config.user}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n");
}

async function converse(transport: Transport, config: SmtpConfig, message: MailMessage): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  // Reads one complete (possibly multi-line) SMTP reply and checks its code.
  async function expect(codes: number[], step: string): Promise<void> {
    for (;;) {
      const lines = buffer.split("\r\n");
      // The final line of a reply is "NNN text" (space, not dash, after the code).
      const last = lines.findIndex((line) => /^\d{3}(\s|$)/.test(line));
      if (last !== -1 && last < lines.length - 1) {
        const reply = lines.slice(0, last + 1).join(" ");
        buffer = lines.slice(last + 1).join("\r\n");
        const code = Number(lines[last].slice(0, 3));
        if (!codes.includes(code)) throw new Error(`SMTP ${step} failed: ${reply.slice(0, 300)}`);
        return;
      }
      const chunk = await transport.read();
      if (chunk === null) throw new Error(`SMTP connection closed during ${step}`);
      buffer += decoder.decode(chunk, { stream: true });
    }
  }

  const send = (line: string) => transport.write(encoder.encode(`${line}\r\n`));
  const to = assertAddress(message.to);
  const from = assertAddress(config.user);

  await expect([220], "greeting");
  await send("EHLO msquare-support");
  await expect([250], "EHLO");
  await send(`AUTH PLAIN ${base64(`\u0000${config.user}\u0000${config.pass}`)}`);
  await expect([235], "login (check SMTP_USER and the App Password in SMTP_PASS)");
  await send(`MAIL FROM:<${from}>`);
  await expect([250], "MAIL FROM");
  await send(`RCPT TO:<${to}>`);
  await expect([250, 251], "RCPT TO");
  await send("DATA");
  await expect([354], "DATA");
  await send(`${buildMessage(config, to, message)}\r\n.`);
  await expect([250], "message delivery");
  await send("QUIT").catch(() => undefined);
}

/** Sends one plain-text email. Throws with a readable reason on any failure. */
export async function sendMail(message: MailMessage, config = getSmtpConfig()): Promise<void> {
  if (!config) throw new Error("SMTP is not configured (set SMTP_USER and SMTP_PASS).");

  let transport: Transport | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`SMTP timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
  });
  const work = (async () => {
    transport = onCloudflareWorkers
      ? await openWorkersTransport(config.host, config.port)
      : await openNodeTransport(config.host, config.port);
    await converse(transport, config, message);
  })();

  try {
    await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    (transport as Transport | null)?.close();
    work.catch(() => undefined); // a late failure after a timeout must not go unhandled
  }
}

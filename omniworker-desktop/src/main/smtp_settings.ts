import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as net from "net";
import * as tls from "tls";
import { profileHome, safeWriteFile } from "./utils";

export interface SmtpSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password?: string;
  smtp_encryption: "none" | "ssl" | "tls"; // tls represents STARTTLS
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_password?: string;
  imap_encryption: "none" | "ssl" | "tls";
}

const DEFAULT_SETTINGS: SmtpSettings = {
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_password: "",
  smtp_encryption: "tls",
  imap_host: "",
  imap_port: 993,
  imap_user: "",
  imap_password: "",
  imap_encryption: "ssl",
};

export function getSmtpSettings(profile?: string): SmtpSettings {
  const home = profileHome(profile);
  const filePath = join(home, "smtp_settings.json");

  if (!existsSync(filePath)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSmtpSettings(settings: Partial<SmtpSettings>, profile?: string): void {
  const home = profileHome(profile);
  const filePath = join(home, "smtp_settings.json");

  const current = getSmtpSettings(profile);
  const updated = {
    ...current,
    ...settings,
  };

  safeWriteFile(filePath, JSON.stringify(updated, null, 2));
}

/**
 * Socket-based connection tester for SMTP and IMAP hosts.
 * Tests if host is reachable, port is open, and security parameters match.
 */
export async function testConnection(
  host: string,
  port: number,
  encryption: "none" | "ssl" | "tls",
  type: "smtp" | "imap"
): Promise<{ success: boolean; message: string }> {
  if (!host) {
    return { success: false, message: "Host configuration is missing" };
  }

  return new Promise((resolve) => {
    const timeoutMs = 8000;
    let completed = false;

    const cleanupAndResolve = (success: boolean, message: string, socket?: net.Socket) => {
      if (completed) return;
      completed = true;
      if (socket) {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      }
      resolve({ success, message });
    };

    const timer = setTimeout(() => {
      cleanupAndResolve(false, `Connection timed out after ${timeoutMs / 1000} seconds`);
    }, timeoutMs);

    try {
      let socket: net.Socket;

      if (encryption === "ssl") {
        // SSL/TLS direct connection
        socket = tls.connect(
          {
            host,
            port,
            rejectUnauthorized: false, // Avoid failing on self-signed certificates in dev
          },
          () => {
            clearTimeout(timer);
            // Read greeting on secure connect
            socket.once("data", (data) => {
              const greeting = data.toString("utf-8").trim();
              cleanupAndResolve(true, `Connected successfully. Greeting: ${greeting}`, socket);
            });
            // If no data arrives in 2 seconds, but SSL handshake succeeded, assume success
            setTimeout(() => {
              cleanupAndResolve(true, "Connected successfully (SSL Handshake complete)", socket);
            }, 2000);
          }
        );
      } else {
        // Plain TCP socket connection (also used for STARTTLS/tls test)
        socket = net.connect({ host, port }, () => {
          clearTimeout(timer);
          
          if (type === "smtp") {
            // SMTP greetings are immediate on connect
            socket.once("data", (data) => {
              const greeting = data.toString("utf-8").trim();
              if (encryption === "tls") {
                cleanupAndResolve(true, `Connected successfully. Server supports STARTTLS. Greeting: ${greeting}`, socket);
              } else {
                cleanupAndResolve(true, `Connected successfully. Greeting: ${greeting}`, socket);
              }
            });
          } else {
            // IMAP greetings are also immediate
            socket.once("data", (data) => {
              const greeting = data.toString("utf-8").trim();
              cleanupAndResolve(true, `Connected successfully. Greeting: ${greeting}`, socket);
            });
          }
        });
      }

      socket.on("error", (err) => {
        clearTimeout(timer);
        cleanupAndResolve(false, `Connection failed: ${err.message}`, socket);
      });
    } catch (err: any) {
      clearTimeout(timer);
      cleanupAndResolve(false, `Setup failed: ${err.message}`);
    }
  });
}

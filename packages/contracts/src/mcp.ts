import * as z from "zod";

/** Shown when a provider's auth server offers no client registration (GitHub): the user brings their own OAuth app or a token. */
export const NO_ONE_CLICK_SIGNIN_MESSAGE =
  "This service does not support one-click sign-in. Add it under MCP servers with an access token, or sign in with your own OAuth app.";

export const McpTransportSchema = z.enum(["streamable_http", "sse", "stdio"]);
export type McpTransport = z.infer<typeof McpTransportSchema>;

export function isLocalMcpHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

export const McpRemoteEndpointSchema = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      if (value.endsWith("#")) return false;
      const url = new URL(value);
      if (url.username || url.password || url.hash) return false;
      // Persist HTTP(S). Runtime SSRF still requires HTTPS for public hosts and
      // blocks private LAN targets unless the deployment-owner escape is on.
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "MCP remote endpoint must be an HTTP(S) URL without credentials or a fragment");

export const McpHeadersSchema = z
  .record(z.string().regex(/^[A-Za-z0-9-]+$/), z.string().max(4096))
  .superRefine((value, ctx) => {
    if (Object.keys(value).length > 32) {
      ctx.addIssue({ code: "custom", message: "At most 32 headers are allowed" });
    }
  });

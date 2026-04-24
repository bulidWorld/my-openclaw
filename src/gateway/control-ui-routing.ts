import { isReadHttpMethod } from "./control-ui-http-utils.js";

export type ControlUiRequestClassification =
  | { kind: "not-control-ui" }
  | { kind: "not-found" }
  | { kind: "redirect"; location: string }
  | { kind: "serve" };

const ROOT_MOUNTED_GATEWAY_PROBE_PATHS = new Set(["/health", "/healthz", "/ready", "/readyz"]);

export function classifyControlUiRequest(params: {
  basePath: string;
  pathname: string;
  search: string;
  method: string | undefined;
}): ControlUiRequestClassification {
  const { basePath, pathname, search, method } = params;
  if (!basePath) {
    if (pathname === "/ui" || pathname.startsWith("/ui/")) {
      return { kind: "not-found" };
    }
    // Keep core probe routes outside the root-mounted SPA catch-all so the
    // gateway probe handler can answer them even when the Control UI owns `/`.
    if (ROOT_MOUNTED_GATEWAY_PROBE_PATHS.has(pathname)) {
      return { kind: "not-control-ui" };
    }
    // Keep plugin-owned HTTP routes outside the root-mounted Control UI SPA
    // fallback so untrusted plugins cannot claim arbitrary UI paths.
    if (pathname === "/plugins" || pathname.startsWith("/plugins/")) {
      return { kind: "not-control-ui" };
    }
    // Allow LDAP authentication endpoints
    if (pathname === "/api/ldap/login" || pathname === "/api/ldap/test") {
      return { kind: "serve" };
    }
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return { kind: "not-control-ui" };
    }
    // Exclude download endpoint from Control UI catch-all
    if (pathname === "/download/workspace") {
      console.log("[control-ui-routing] excluding /download/workspace from Control UI");
      return { kind: "not-control-ui" };
    }
    if (!isReadHttpMethod(method)) {
      return { kind: "not-control-ui" };
    }
    return { kind: "serve" };
  }

  if (!pathname.startsWith(`${basePath}/`) && pathname !== basePath) {
    return { kind: "not-control-ui" };
  }
  // Allow LDAP authentication endpoints even with base path
  const ldapLoginPath = basePath ? `${basePath}/api/ldap/login` : "/api/ldap/login";
  const ldapTestPath = basePath ? `${basePath}/api/ldap/test` : "/api/ldap/test";
  if (pathname === ldapLoginPath || pathname === ldapTestPath) {
    return { kind: "serve" };
  }
  if (!isReadHttpMethod(method)) {
    return { kind: "not-control-ui" };
  }
  if (pathname === basePath) {
    return { kind: "redirect", location: `${basePath}/${search}` };
  }
  return { kind: "serve" };
}

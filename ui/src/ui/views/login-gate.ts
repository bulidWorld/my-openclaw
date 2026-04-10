import { html } from "lit";
import { state } from "lit/decorators.js";
import { t } from "../../i18n/index.ts";
import type { AppViewState } from "../app-view-state.ts";
import { icons } from "../icons.ts";
import { normalizeBasePath } from "../navigation.ts";
import { agentLogoUrl } from "./agents-utils.ts";

export function renderLoginGate(state: AppViewState) {
  const basePath = normalizeBasePath(state.basePath ?? "");
  const faviconSrc = agentLogoUrl(basePath);

  return html`
    <div class="login-gate">
      <div class="login-gate__card">
        <div class="login-gate__header">
          <img class="login-gate__logo" src=${faviconSrc} alt="OpenClaw" />
          <div class="login-gate__title">OpenClaw</div>
          <div class="login-gate__sub">${t("login.subtitle")}</div>
        </div>
        
        <div class="login-gate__tabs">
          <button
            class="login-gate__tab ${state.loginMethod === "token" ? "active" : ""}"
            @click=${() => {
              state.loginMethod = "token";
            }}
          >
            ${t("login.tab.token")}
          </button>
          <button
            class="login-gate__tab ${state.loginMethod === "ldap" ? "active" : ""}"
            @click=${() => {
              state.loginMethod = "ldap";
            }}
          >
            ${t("login.tab.ldap")}
          </button>
        </div>

        ${state.loginMethod === "ldap"
          ? html`
              <div class="login-gate__form">
                <label class="field">
                  <span>${t("login.ldap.username")}</span>
                  <input
                    type="text"
                    autocomplete="username"
                    spellcheck="false"
                    .value=${state.ldapUsername || ""}
                    @input=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      state.ldapUsername = v;
                    }}
                    placeholder="${t("login.ldap.usernamePlaceholder")}"
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === "Enter") {
                        state.connectLdap();
                      }
                    }}
                  />
                </label>
                <label class="field">
                  <span>${t("login.ldap.password")}</span>
                  <div class="login-gate__secret-row">
                    <input
                      type=${state.loginShowLdapPassword ? "text" : "password"}
                      autocomplete="current-password"
                      spellcheck="false"
                      .value=${state.ldapPassword || ""}
                      @input=${(e: Event) => {
                        const v = (e.target as HTMLInputElement).value;
                        state.ldapPassword = v;
                      }}
                      placeholder="${t("login.ldap.passwordPlaceholder")}"
                      @keydown=${(e: KeyboardEvent) => {
                        if (e.key === "Enter") {
                          state.connectLdap();
                        }
                      }}
                    />
                    <button
                      type="button"
                      class="btn btn--icon ${state.loginShowLdapPassword ? "active" : ""}"
                      title=${state.loginShowLdapPassword ? "Hide password" : "Show password"}
                      aria-label="Toggle password visibility"
                      aria-pressed=${state.loginShowLdapPassword}
                      @click=${() => {
                        state.loginShowLdapPassword = !state.loginShowLdapPassword;
                      }}
                    >
                      ${state.loginShowLdapPassword ? icons.eye : icons.eyeOff}
                    </button>
                  </div>
                </label>
                <button
                  class="btn primary login-gate__connect"
                  @click=${() => state.connectLdap()}
                >
                  ${t("common.connect")}
                </button>
              </div>
            `
          : html`
              <div class="login-gate__form">
                <label class="field">
                  <span>${t("overview.access.wsUrl")}</span>
                  <input
                    .value=${state.settings.gatewayUrl}
                    @input=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      state.applySettings({ ...state.settings, gatewayUrl: v });
                    }}
                    placeholder="ws://127.0.0.1:18789"
                  />
                </label>
                <label class="field">
                  <span>${t("overview.access.token")}</span>
                  <div class="login-gate__secret-row">
                    <input
                      type=${state.loginShowGatewayToken ? "text" : "password"}
                      autocomplete="off"
                      spellcheck="false"
                      .value=${state.settings.token}
                      @input=${(e: Event) => {
                        const v = (e.target as HTMLInputElement).value;
                        state.applySettings({ ...state.settings, token: v });
                      }}
                      placeholder="OPENCLAW_GATEWAY_TOKEN (${t("login.passwordPlaceholder")})"
                      @keydown=${(e: KeyboardEvent) => {
                        if (e.key === "Enter") {
                          state.connect();
                        }
                      }}
                    />
                    <button
                      type="button"
                      class="btn btn--icon ${state.loginShowGatewayToken ? "active" : ""}"
                      title=${state.loginShowGatewayToken ? "Hide token" : "Show token"}
                      aria-label="Toggle token visibility"
                      aria-pressed=${state.loginShowGatewayToken}
                      @click=${() => {
                        state.loginShowGatewayToken = !state.loginShowGatewayToken;
                      }}
                    >
                      ${state.loginShowGatewayToken ? icons.eye : icons.eyeOff}
                    </button>
                  </div>
                </label>
                <label class="field">
                  <span>${t("overview.access.password")}</span>
                  <div class="login-gate__secret-row">
                    <input
                      type=${state.loginShowGatewayPassword ? "text" : "password"}
                      autocomplete="off"
                      spellcheck="false"
                      .value=${state.password}
                      @input=${(e: Event) => {
                        const v = (e.target as HTMLInputElement).value;
                        state.password = v;
                      }}
                      placeholder="${t("login.passwordPlaceholder")}"
                      @keydown=${(e: KeyboardEvent) => {
                        if (e.key === "Enter") {
                          state.connect();
                        }
                      }}
                    />
                    <button
                      type="button"
                      class="btn btn--icon ${state.loginShowGatewayPassword ? "active" : ""}"
                      title=${state.loginShowGatewayPassword ? "Hide password" : "Show password"}
                      aria-label="Toggle password visibility"
                      aria-pressed=${state.loginShowGatewayPassword}
                      @click=${() => {
                        state.loginShowGatewayPassword = !state.loginShowGatewayPassword;
                      }}
                    >
                      ${state.loginShowGatewayPassword ? icons.eye : icons.eyeOff}
                    </button>
                  </div>
                </label>
                <button
                  class="btn primary login-gate__connect"
                  @click=${() => state.connect()}
                >
                  ${t("common.connect")}
                </button>
              </div>
            `}
        
        ${
          state.lastError
            ? html`<div class="callout danger" style="margin-top: 14px;">
                <div>${state.lastError}</div>
              </div>`
            : ""
        }
        <div class="login-gate__help">
          <div class="login-gate__title">${t("overview.connection.title")}</div>
          <ol class="login-gate__steps">
            <li>${t("overview.connection.step1")}<code>openclaw gateway run</code></li>
            <li>${t("overview.connection.step2")}<code>openclaw dashboard --no-open</code></li>
            <li>${t("overview.connection.step3")}</li>
          </ol>
          <div class="login-gate__docs">
            <a
              class="session-link"
              href="https://docs.openclaw.ai/web/dashboard"
              target="_blank"
              rel="noreferrer"
            >${t("overview.connection.docsLink")}</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

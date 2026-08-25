import { useCallback, useEffect, useRef, useState } from "react";
import { jsonRequest } from "../gravitybridge-request";
import { GRAVITY_LOCALES, useGravityI18n, useGravityT, type GravityLocale } from "../i18n/gravitybridge-provider";
import "../styles-gravitybridge.css";

type BridgeStatus = {
  platformSupported: boolean;
  codexConfigPresent: boolean;
  loggedIn: boolean;
  loginDone: boolean;
  loginError: string | null;
  account: string | null;
  providerConfigured: boolean;
  configured: boolean;
  configuredAt: string | null;
  riskAccepted: boolean;
  model: string;
  effort: string;
  multiAgentMode: string;
  nativeV2Enabled: boolean;
  restartRequired: boolean;
};

type OperationResult = {
  ok?: boolean;
  code?: string;
  error?: string;
  configured?: boolean;
  changed?: boolean;
  selfTest?: {
    ok: boolean;
    output?: string;
    provider?: string;
    model?: string;
    effort?: string;
    latencyMs?: number;
    code?: string;
    error?: string;
  };
  output?: string;
  provider?: string;
  model?: string;
  effort?: string;
  latencyMs?: number;
};

function StatusRow({ label, ok, waiting = false, detail }: { label: string; ok: boolean; waiting?: boolean; detail?: string }) {
  const t = useGravityT();
  const state = ok ? t("gravity.status.ready") : waiting ? t("gravity.status.waiting") : t("gravity.status.missing");
  return (
    <div className="gravity-status-row">
      <span className={`gravity-dot ${ok ? "ok" : waiting ? "waiting" : "missing"}`} aria-hidden="true" />
      <span className="gravity-status-label">{label}</span>
      {detail && <code>{detail}</code>}
      <span className="gravity-status-value">{state}</span>
    </div>
  );
}

export default function GravityBridge({ apiBase }: { apiBase: string }) {
  const t = useGravityT();
  const { locale, setLocale } = useGravityI18n();
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [acceptedRisk, setAcceptedRisk] = useState(false);
  const [busy, setBusy] = useState<"login" | "apply" | "test" | "restore" | null>(null);
  const [result, setResult] = useState<OperationResult | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [deleteCredential, setDeleteCredential] = useState(false);
  const pollRef = useRef<number | null>(null);

  const loadStatus = useCallback(async () => {
    const next = await jsonRequest<BridgeStatus>(`${apiBase}/api/gravitybridge/status`);
    setStatus(next);
    if (next.riskAccepted) setAcceptedRisk(true);
    return next;
  }, [apiBase]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadStatus().catch(err => setError({ message: err instanceof Error ? err.message : String(err) }));
    }, 0);
    return () => {
      window.clearTimeout(initialLoad);
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [loadStatus]);

  const startLoginPoll = useCallback(() => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => {
      void loadStatus().then(next => {
        if (next.loggedIn) {
          if (pollRef.current !== null) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(null);
        } else if (next.loginDone && next.loginError) {
          if (pollRef.current !== null) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(null);
          setError({ message: next.loginError, code: "AUTH_REQUIRED" });
        }
      }).catch(() => undefined);
    }, 1_500);
  }, [loadStatus]);

  const login = async () => {
    if (!acceptedRisk || busy) return;
    setBusy("login"); setError(null); setResult(null);
    try {
      await jsonRequest(`${apiBase}/api/gravitybridge/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptedRisk: true, force: status?.loggedIn === true }),
      });
      startLoginPoll();
    } catch (err) {
      const typed = err as Error & { payload?: { code?: string } };
      setBusy(null);
      setError({ message: typed.message, code: typed.payload?.code });
    }
  };

  const runOperation = async (kind: "apply" | "test") => {
    if (busy) return;
    setBusy(kind); setError(null); setResult(null);
    try {
      const endpoint = kind === "apply" ? "apply" : "self-test";
      const next = await jsonRequest<OperationResult>(`${apiBase}/api/gravitybridge/${endpoint}`, { method: "POST" });
      setResult(next);
      await loadStatus();
    } catch (err) {
      const typed = err as Error & { payload?: OperationResult };
      setResult(typed.payload ?? null);
      setError({ message: typed.message, code: typed.payload?.code ?? typed.payload?.selfTest?.code });
      await loadStatus().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (busy || !window.confirm(t("gravity.restoreConfirm"))) return;
    setBusy("restore"); setError(null); setResult(null);
    try {
      await jsonRequest(`${apiBase}/api/gravitybridge/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deleteCredential }),
      });
      setResult({ ok: true, output: t("gravity.restored") });
      await loadStatus();
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const testResult = result?.selfTest ?? result;
  const succeeded = testResult?.ok === true;

  return (
    <main className="gravity-shell">
      <div className="gravity-orb gravity-orb-one" />
      <div className="gravity-orb gravity-orb-two" />
      <header className="gravity-topbar">
        <div className="gravity-brand"><span className="gravity-brand-mark">{t("gravity.brandMark")}</span> {t("gravity.brand")} <span>{t("gravity.beta")}</span></div>
        <select value={locale} onChange={event => setLocale(event.target.value as GravityLocale)} aria-label={t("gravity.language")}>
          {GRAVITY_LOCALES.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      </header>

      <section className="gravity-hero">
        <p className="gravity-eyebrow">{t("gravity.eyebrow")}</p>
        <h1>{t("gravity.title")}</h1>
        <p className="gravity-subtitle">{t("gravity.subtitle")}</p>
        <div className="gravity-promise"><span aria-hidden="true">✓</span>{t("gravity.promise")}</div>
      </section>

      <section className="gravity-grid">
        <article className="gravity-card gravity-status-card">
          <div className="gravity-card-heading">
            <h2>{t("gravity.status.title")}</h2>
            <button type="button" className="gravity-link" onClick={() => { void loadStatus(); }}>{t("gravity.refresh")}</button>
          </div>
          <StatusRow label={t("gravity.status.platform")} ok={status?.platformSupported === true} />
          <StatusRow label={t("gravity.status.codex")} ok={status?.codexConfigPresent === true} waiting={status === null} />
          <StatusRow label={t("gravity.status.google")} ok={status?.loggedIn === true} waiting={busy === "login"} detail={status?.account ?? undefined} />
          <StatusRow label={t("gravity.status.route")} ok={status?.configured === true} waiting={busy === "apply"} />
          <div className="gravity-specs">
            <div><span>{t("gravity.model")}</span><code>google-antigravity/gemini-3.7-flash</code></div>
            <div><span>{t("gravity.effort")}</span><strong>{t("gravity.effortValue")}</strong></div>
            <div><span>{t("gravity.mode")}</span><strong>{t("gravity.modeValue")}</strong></div>
          </div>
        </article>

        <div className="gravity-actions">
          <article className="gravity-card">
            <span className="gravity-step">{t("gravity.step.login")}</span>
            <p className="gravity-risk-detail">{t("gravity.riskDetail")}</p>
            <label className="gravity-check">
              <input type="checkbox" checked={acceptedRisk} onChange={event => setAcceptedRisk(event.target.checked)} />
              <span>{t("gravity.risk")}</span>
            </label>
            <button type="button" className="gravity-button gravity-google" disabled={!acceptedRisk || busy !== null} onClick={() => { void login(); }}>
              <span className="gravity-google-g">{t("gravity.brandMark")}</span>
              {busy === "login" ? t("gravity.loggingIn") : status?.loggedIn ? t("gravity.loginAgain") : t("gravity.login")}
            </button>
          </article>

          <article className="gravity-card">
            <span className="gravity-step">{t("gravity.step.configure")}</span>
            <button type="button" className="gravity-button gravity-primary" disabled={!status?.loggedIn || busy !== null} onClick={() => { void runOperation("apply"); }}>
              {busy === "apply" ? t("gravity.configuring") : t("gravity.configure")}
            </button>
            <button type="button" className="gravity-button gravity-secondary" disabled={!status?.loggedIn || busy !== null} onClick={() => { void runOperation("test"); }}>
              {busy === "test" ? t("gravity.testing") : t("gravity.test")}
            </button>
          </article>
        </div>
      </section>

      {(result || error) && (
        <section className={`gravity-result ${succeeded && !error ? "success" : "failure"}`} aria-live="polite">
          <div className="gravity-result-icon">{succeeded && !error ? "✓" : "!"}</div>
          <div>
            <h2>{succeeded && !error ? t("gravity.success") : t("gravity.failure")}</h2>
            {succeeded && !error && <p>{t("gravity.successDetail", { model: testResult?.model ?? status?.model ?? "", effort: testResult?.effort ?? status?.effort ?? "" })}</p>}
            {error && <p>{error.message}</p>}
            {(error?.code || testResult?.code) && <p className="gravity-diagnostic"><span>{t("gravity.diagnostics")}</span><code>{error?.code ?? testResult?.code}</code></p>}
            {testResult?.output && <details><summary>{t("gravity.output")}</summary><pre>{testResult.output}</pre></details>}
          </div>
        </section>
      )}

      <section className="gravity-card gravity-restore">
        <div><h2>{t("gravity.restore.title")}</h2><p>{t("gravity.restore.detail")}</p></div>
        <label className="gravity-check compact"><input type="checkbox" checked={deleteCredential} onChange={event => setDeleteCredential(event.target.checked)} /><span>{t("gravity.deleteCredential")}</span></label>
        <button type="button" className="gravity-button gravity-danger" disabled={busy !== null} onClick={() => { void restore(); }}>
          {busy === "restore" ? t("gravity.restoring") : t("gravity.restore")}
        </button>
      </section>

      <footer>{t("gravity.localOnly")}</footer>
    </main>
  );
}

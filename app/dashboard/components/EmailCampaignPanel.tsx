"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { formatMarketingSchedule, parseMarketingSchedule } from "../../../lib/marketing-schedule";

type Campaign = {
  id: string;
  name: string;
  subject: string;
  preview_text: string | null;
  resend_broadcast_id: string | null;
  recipient_count: number;
  status: string;
  sent_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  last_error: string | null;
  batch_number?: number;
};

type Overview = {
  audienceCount: number;
  planExcludedCount: number;
  genericGreetingCount: number;
  remainingCount: number;
  maxBatchSize: number;
  defaultScheduleLocal: string;
  sellerEmail: string;
  settings: null | { resend_segment_id: string | null; synced_contact_count: number; last_synced_at: string | null };
  campaigns: Campaign[];
  template: { key: string; name: string; subject: string; previewText: string; previewUrl: string };
};

import { MARKETING_CAMPAIGNS, R229_REMINDER_CAMPAIGN } from "../../../lib/marketing-campaigns";

const panel = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 18 };
const CAMPAIGN_BATCH_SIZE = 575;

export default function EmailCampaignPanel() {
  const [templateKey, setTemplateKey] = useState(R229_REMINDER_CAMPAIGN.key);
  const [locked, setLocked] = useState(false);
  return <>
    <label style={{ display: "block", marginBottom: 16, fontSize: 14 }}>
      Campaign
      <select aria-label="Campaign" disabled={locked} value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} style={{ ...inputStyle, display: "block", marginTop: 8, width: "100%", fontSize: 14 }}>
        {MARKETING_CAMPAIGNS.map((campaign) => <option key={campaign.key} value={campaign.key}>{campaign.name}</option>)}
      </select>
    </label>
    <CampaignWorkspace key={templateKey} templateKey={templateKey} onBusyChange={setLocked} />
  </>;
}

function CampaignWorkspace({ templateKey, onBusyChange }: { templateKey: string; onBusyChange: (busy: boolean) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [prepareProgress, setPrepareProgress] = useState({ current: 0, total: 0 });
  const [confirmation, setConfirmation] = useState("");
  const [capacityConfirmation, setCapacityConfirmation] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("send");
  const [scheduleLocal, setScheduleLocal] = useState("");

  useEffect(() => { onBusyChange(!!busy); }, [busy, onBusyChange]);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Your session expired. Please sign in again.");
    const response = await fetch("/api/dashboard/email-marketing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token, action, ...extra, template_key: templateKey }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Email marketing request failed");
    return result;
  }, [templateKey]);

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await call("overview");
      setOverview(result);
      setScheduleLocal((value) => value || result.defaultScheduleLocal);
      setTestEmail((value) => value || result.sellerEmail || "");
    } catch (loadError: any) {
      setError(loadError?.message || "Could not load email campaigns.");
    }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  const createDraft = async () => {
    setBusy("draft"); setError(""); setNotice(""); setPrepareProgress({ current: 0, total: Math.min(CAMPAIGN_BATCH_SIZE, overview?.remainingCount || 0) });
    try {
      const existing = overview?.campaigns.find((campaign) => campaign.status === "preparing");
      const started = existing
        ? { campaign: existing, total: existing.recipient_count }
        : await call("create_draft", { recipient_limit: Math.min(CAMPAIGN_BATCH_SIZE, overview?.remainingCount || CAMPAIGN_BATCH_SIZE) });
      const campaignId = started.campaign.id;
      setPrepareProgress({ current: 0, total: started.total });
      let complete = false;
      while (!complete) {
        const result = await call("prepare_draft", { campaign_id: campaignId });
        complete = result.complete;
        setPrepareProgress({ current: result.prepared, total: result.total });
      }
      setNotice(`Batch prepared for ${started.total.toLocaleString("en-ZA")} subscribers. Nothing has been sent yet.`);
      await load();
    } catch (draftError: any) {
      setError(draftError?.message || "Could not prepare the Broadcast batch.");
    } finally { setBusy(""); }
  };

  const sendTest = async () => {
    setBusy("test"); setError(""); setNotice("");
    try {
      await call("test", { to: testEmail });
      setNotice(`Test email sent to ${testEmail}.`);
    } catch (testError: any) { setError(testError?.message || "Test send failed."); }
    finally { setBusy(""); }
  };

  const sendCampaign = async (campaign: Campaign) => {
    setBusy(`send:${campaign.id}`); setError(""); setNotice("");
    try {
      const result = await call(deliveryMode === "schedule" ? "schedule" : "send", {
        campaign_id: campaign.id, confirmation, schedule_local: scheduleLocal,
      });
      setConfirmation("");
      setNotice(result.scheduledAt
        ? `Batch ${campaign.batch_number || ""} scheduled for ${formatMarketingSchedule(result.scheduledAt)}. You can now prepare the next batch for the same time.`
        : "The selected campaign has been handed to Resend for delivery.");
      await load();
    } catch (sendError: any) {
      await load();
      setError(sendError?.message || "Campaign send failed.");
    }
    finally { setBusy(""); }
  };

  const recoverDraft = async (campaign: Campaign) => {
    setBusy(`recover:${campaign.id}`); setError(""); setNotice("");
    try {
      const result = await call("recover_draft", { campaign_id: campaign.id });
      await load();
      setDeliveryMode("send"); setConfirmation("");
      setNotice(`Batch ${campaign.batch_number} restored to draft. Nothing was sent. ${result.previousError ? `Resolve the previous error before retrying: ${result.previousError}` : "Review the batch before sending."}`);
    } catch (recoverError: any) { setError(recoverError?.message || "Could not recover the draft."); }
    finally { setBusy(""); }
  };

  const freeResendContactCapacity = async () => {
    const held = overview?.planExcludedCount || 0;
    setBusy("free-capacity"); setError(""); setNotice("");
    try {
      const result = await call("free_contact_capacity", { confirmation: capacityConfirmation });
      setCapacityConfirmation("");
      setNotice(`${result.deleted.toLocaleString("en-ZA")} held contacts were removed from Resend. Your CatalogStore customer records were not changed.`);
      await load();
    } catch (capacityError: any) { setError(capacityError?.message || "Could not free Resend contact capacity."); }
    finally { setBusy(""); }
  };

  const discardCampaign = async (campaign: Campaign) => {
    if (!window.confirm(`Discard the unsent ${campaign.recipient_count}-subscriber draft? No email will be sent, and you can prepare the corrected batch straight away.`)) return;
    setBusy(`discard:${campaign.id}`); setError(""); setNotice("");
    try {
      await call("discard", { campaign_id: campaign.id });
      setConfirmation("");
      setNotice("Unsent draft discarded. You can now prepare a new batch.");
      await load();
    } catch (discardError: any) { setError(discardError?.message || "Could not discard the draft."); }
    finally { setBusy(""); }
  };

  if (!overview && !error) return <div style={{ ...panel, padding: 24, marginBottom: 18, color: "var(--muted-2)", fontSize: 12 }}>Loading email marketing…</div>;

  const latestDraft = overview?.campaigns.find((campaign) => campaign.status === "draft");
  const preparingBatch = overview?.campaigns.find((campaign) => campaign.status === "preparing");
  const unsentBatch = latestDraft || preparingBatch;
  const confirmPhrase = `${deliveryMode === "schedule" ? "SCHEDULE" : "SEND"} ${latestDraft?.recipient_count || 0}`;
  let scheduleError = "";
  let scheduleLabel = "";
  if (deliveryMode === "schedule") {
    try { scheduleLabel = formatMarketingSchedule(parseMarketingSchedule(scheduleLocal)); }
    catch (error: any) { scheduleError = error.message; }
  }

  return <>
    <section style={{ ...panel, padding: "clamp(16px,3vw,24px)", marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: ".12em", color: "#f472b6", textTransform: "uppercase" }}>4REGN Email Studio</div>
          <h2 style={{ margin: "7px 0 5px", fontSize: 20, fontWeight: 900, letterSpacing: "-.03em", textTransform: "uppercase" }}>{overview?.template.name || "Email campaign"}</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 12, maxWidth: 680 }}>Consent-safe Resend Broadcast workflow. Preview, test and sync first; sending stays locked behind an exact confirmation phrase.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={!!busy} onClick={() => void load()} style={secondaryButton}>Refresh status</button>
          <button onClick={() => setPreviewOpen(true)} style={secondaryButton}>Preview email</button>
        </div>
      </div>

      {error && <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "#f87171", fontSize: 11 }}>{error}</div>}
      {notice && <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.2)", color: "#22c55e", fontSize: 11 }}>{notice}</div>}

      {overview && <div className="email-pipeline-grid" style={{ display: "grid", gridTemplateColumns: "1.25fr .9fr", gap: 14, marginTop: 18 }}>
        <div style={{ ...innerCard, padding: 18 }}>
          <div style={eyebrow}>Campaign</div>
          <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.35 }}>{overview.template.subject}</div>
          <div style={{ marginTop: 7, color: "var(--muted-2)", fontSize: 11, lineHeight: 1.55 }}>{overview.template.previewText}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 15 }}>
            <span style={statusPill}>From: 4REGN &lt;info@4regn.com&gt;</span>
            <span style={statusPill}>{overview.audienceCount.toLocaleString("en-ZA")} opted-in subscribers eligible</span>
            <span style={{ ...statusPill, color: "#22c55e" }}>{overview.remainingCount.toLocaleString("en-ZA")} available for the next batch</span>
            {overview.genericGreetingCount > 0 && <span style={{ ...statusPill, color: "#fbbf24" }}>{overview.genericGreetingCount.toLocaleString("en-ZA")} receive a generic greeting</span>}
            {overview.planExcludedCount > 0 && <span style={{ ...statusPill, color: "#fbbf24" }}>{overview.planExcludedCount.toLocaleString("en-ZA")} held for the contact limit</span>}
          </div>
        </div>

        <div style={{ ...innerCard, padding: 18 }}>
          <div style={eyebrow}>1 · Prepare today&apos;s batch</div>
          <p style={stepCopy}>Selects up to 575 opted-in subscribers who are not already in another batch for this campaign. Schedule the first batch, then prepare the remaining subscribers and schedule them for the same time.</p>
          {busy === "draft" && <div style={{ margin: "12px 0" }}>
            <div style={{ height: 6, background: "var(--input-bg)", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${prepareProgress.total ? Math.round(prepareProgress.current / prepareProgress.total * 100) : 0}%`, background: "#a78bfa" }} /></div>
            <div style={{ fontSize: 9, color: "var(--muted-2)", marginTop: 6 }}>{prepareProgress.current.toLocaleString("en-ZA")} / {prepareProgress.total.toLocaleString("en-ZA")}</div>
          </div>}
          <button disabled={!!busy || (overview.remainingCount === 0 && !preparingBatch) || !!latestDraft} onClick={createDraft} style={primaryButton}>{busy === "draft" ? "Preparing batch — keep this page open…" : preparingBatch ? "Resume batch preparation" : latestDraft ? "Draft ready below" : `Prepare ${Math.min(CAMPAIGN_BATCH_SIZE, overview.remainingCount).toLocaleString("en-ZA")} subscribers`}</button>
          {unsentBatch && <button disabled={!!busy} onClick={() => discardCampaign(unsentBatch)} style={{ ...secondaryButton, width: "100%", marginTop: 8, color: "#ef4444", borderColor: "rgba(239,68,68,.35)" }}>{busy === `discard:${unsentBatch.id}` ? "Discarding…" : "Discard unsent draft"}</button>}
        </div>

        <div style={{ ...innerCard, padding: 18 }}>
          <div style={eyebrow}>2 · Send a test</div>
          <p style={stepCopy}>Sends one test through the 4REGN sender. No subscriber receives anything.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="Test email address" style={inputStyle} />
            <button disabled={!!busy || !testEmail} onClick={sendTest} style={secondaryButton}>{busy === "test" ? "Sending…" : "Send test"}</button>
          </div>
        </div>

        <div style={{ ...innerCard, padding: 18 }}>
          <div style={eyebrow}>3 · Review before sending</div>
          <p style={stepCopy}>After preparation, the batch appears as a Resend Broadcast draft below. No subscriber receives anything until you type the exact confirmation phrase.</p>
          <button disabled style={{ ...primaryButton, opacity: .6 }}>{latestDraft ? "Draft ready below" : "Prepare a batch first"}</button>
        </div>
      </div>}

      {!!overview && overview.audienceCount > CAMPAIGN_BATCH_SIZE && <div style={{ marginTop: 14, padding: 13, borderRadius: 12, background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.24)", color: "#fbbf24", fontSize: 10, lineHeight: 1.55 }}>
        This campaign is split into batches of up to 575 recipients. Prepared, scheduled and sent batches reserve their subscribers, so the next batch excludes them automatically. {overview.remainingCount.toLocaleString("en-ZA")} subscribers are available for the next batch.
      </div>}

      {!!overview?.planExcludedCount && <div style={{ ...innerCard, padding: 18, marginTop: 14, borderColor: "rgba(251,191,36,.35)" }}>
        <div style={eyebrow}>Before the next batch</div>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Free Resend contact capacity</div>
        <p style={stepCopy}>Resend is over its 1,000-contact Free-plan limit. This removes only the {overview.planExcludedCount.toLocaleString("en-ZA")} contacts held out of this campaign from Resend. Your CatalogStore customer records and consent history stay safe.</p>
        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 7 }}>Type <strong style={{ color: "var(--text)" }}>REMOVE {overview.planExcludedCount}</strong> to confirm.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={capacityConfirmation} onChange={(event) => setCapacityConfirmation(event.target.value)} placeholder={`REMOVE ${overview.planExcludedCount}`} style={inputStyle} />
          <button disabled={!!busy || capacityConfirmation !== `REMOVE ${overview.planExcludedCount}`} onClick={freeResendContactCapacity} style={{ ...primaryButton, background: "#b45309", marginTop: 0, width: "auto" }}>{busy === "free-capacity" ? "Removing from Resend…" : `Remove ${overview.planExcludedCount} from Resend`}</button>
        </div>
      </div>}

      {overview?.campaigns.filter((campaign) => campaign.status === "failed").map((campaign) => <div key={campaign.id} style={{ ...innerCard, padding: 18, marginTop: 14, borderColor: "rgba(239,68,68,.35)" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Batch {campaign.batch_number} · {campaign.recipient_count} contacts · Send failed</div>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>{campaign.last_error || "The previous send failed."}</p>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--muted)" }}>Check the existing broadcast in Resend before retrying. Restoring a draft keeps this batch’s recipients and sends nothing.</p>
        <button disabled={!!busy} onClick={() => recoverDraft(campaign)} style={secondaryButton}>{busy === `recover:${campaign.id}` ? "Checking Resend…" : "Check Resend and restore draft"}</button>
      </div>)}

      {latestDraft && <div style={{ ...innerCard, padding: 18, marginTop: 14, borderColor: "rgba(244,114,182,.35)" }}>
        <div style={eyebrow}>4 · Schedule or send batch {latestDraft.batch_number}</div>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{latestDraft.subject}</div>
        <p style={stepCopy}>This batch contains {latestDraft.recipient_count.toLocaleString("en-ZA")} synced contacts. Resend automatically suppresses contacts who unsubscribed.</p>
        <label style={{ display: "block", fontSize: 14, marginTop: 16 }}>
          Delivery
          <select aria-label="Delivery" disabled={!!busy} value={deliveryMode} onChange={(event) => { setDeliveryMode(event.target.value); setConfirmation(""); }} style={{ ...inputStyle, display: "block", marginTop: 6, fontSize: 14 }}>
            <option value="schedule">Schedule for later</option>
            <option value="send">Send immediately</option>
          </select>
        </label>
        {deliveryMode === "schedule" && <div style={{ margin: "14px 0" }}>
          <label style={{ display: "block", fontSize: 14 }}>
            Date and time — South Africa (SAST, UTC+2)
            <input aria-label="Scheduled date and time in South Africa" type="datetime-local" disabled={!!busy} value={scheduleLocal} onChange={(event) => { setScheduleLocal(event.target.value); setConfirmation(""); }} style={{ ...inputStyle, display: "block", marginTop: 6, fontSize: 14 }} />
          </label>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: scheduleError ? "#f87171" : "var(--muted)", marginBottom: 0 }}>
            {scheduleError || `Resend will start sending at ${scheduleLabel}. You can close the browser after scheduling.`}
          </p>
        </div>}
        <div style={{ fontSize: 14, color: "var(--muted)", margin: "14px 0 7px" }}>Type <strong style={{ color: "var(--text)" }}>{confirmPhrase}</strong> to confirm {deliveryMode === "schedule" ? "this schedule" : "sending now"}.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input aria-label="Batch confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={confirmPhrase} style={inputStyle} />
          <button disabled={!!busy || confirmation !== confirmPhrase || !!scheduleError} onClick={() => sendCampaign(latestDraft)} style={{ ...primaryButton, background: deliveryMode === "schedule" ? "#7c3aed" : "#e11d48" }}>{busy === `send:${latestDraft.id}` ? "Handing to Resend…" : deliveryMode === "schedule" ? "Schedule batch" : "Send campaign now"}</button>
        </div>
      </div>}

      {!!overview?.campaigns.length && <div style={{ marginTop: 18 }}>
        <div style={eyebrow}>Campaign history</div>
        {overview.campaigns.map((campaign) => <div key={campaign.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "11px 0", borderTop: "1px solid var(--border)" }}>
          <div><div style={{ fontSize: 13, fontWeight: 800 }}>Batch {campaign.batch_number} · {campaign.subject}</div><div style={{ fontSize: 14, color: "var(--muted-2)", marginTop: 3 }}>{campaign.status === "scheduled" && campaign.scheduled_at ? `Scheduled: ${formatMarketingSchedule(campaign.scheduled_at)}` : formatMarketingSchedule(campaign.sent_at || campaign.created_at)} · {campaign.recipient_count.toLocaleString("en-ZA")} contacts{campaign.last_error ? ` · ${campaign.last_error}` : ""}</div></div>
          <span style={{ ...statusPill, alignSelf: "center", textTransform: "uppercase" }}>{campaign.status}</span>
        </div>)}
      </div>}
    </section>

    {previewOpen && <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.82)", padding: "clamp(10px,3vw,28px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "min(760px,100%)", height: "min(900px,92vh)", background: "#fff", borderRadius: 18, overflow: "hidden", position: "relative" }}>
        <button aria-label="Close preview" onClick={() => setPreviewOpen(false)} style={{ position: "absolute", zIndex: 2, right: 12, top: 12, width: 40, height: 40, borderRadius: "50%", border: 0, background: "#111", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
        <iframe title={`${overview?.template.name || "Campaign"} email preview`} src={overview?.template.previewUrl} style={{ width: "100%", height: "100%", border: 0 }} />
      </div>
    </div>}

    <style jsx>{`@media(max-width:800px){.email-pipeline-grid{grid-template-columns:1fr!important}}`}</style>
  </>;
}

const innerCard = { background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 14 };
const eyebrow = { fontSize: 9, fontWeight: 900, letterSpacing: ".1em", color: "var(--muted-2)", textTransform: "uppercase" as const, marginBottom: 8 };
const stepCopy = { margin: "7px 0 0", color: "var(--muted-2)", fontSize: 10, lineHeight: 1.55 };
const statusPill = { display: "inline-block", padding: "5px 8px", borderRadius: 99, background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--muted)", fontSize: 8, fontWeight: 800 };
const primaryButton = { width: "100%", marginTop: 12, padding: "11px 14px", border: 0, borderRadius: 10, background: "#7c3aed", color: "#fff", fontSize: 9, fontWeight: 900, letterSpacing: ".06em", textTransform: "uppercase" as const, cursor: "pointer" };
const secondaryButton = { padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--input-bg)", color: "var(--text)", fontSize: 9, fontWeight: 900, letterSpacing: ".05em", textTransform: "uppercase" as const, cursor: "pointer" };
const inputStyle = { flex: "1 1 220px", minWidth: 0, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--input-bg)", color: "var(--text)", fontSize: 11, outline: "none" };

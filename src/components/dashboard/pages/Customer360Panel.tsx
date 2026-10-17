import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  FileText,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  User,
  UserCheck,
  X,
} from "lucide-react";
import { CustomerNotesEditor } from "../../CustomerNotesEditor";
import { getCustomerSummaryDisplayState } from "../../../services/customer-display-state-service";
import {
  buildCustomer360Profile,
  type Customer360Profile,
  type Customer360TimelineItem,
} from "../../../services/customer-360-service";
import { containsSensitiveText, redactSensitiveText } from "../../../utils/privacy-redaction";
import { getCustomerContactIdentity } from "../../../utils/contact-identity";

type Props = {
  customer: any;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (customer: any, profile: any) => void;
  onSummaryRefreshQueued?: () => void;
  formatDate: (value: any, includeTime?: boolean) => string;
};

function profileOf(customer: any) {
  const raw = customer?.profile;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function firstValue(...values: any[]) {
  return values.map(clean).find(Boolean) || "";
}

function orderDataOf(order: any) {
  const raw = order?.order_data || order?.data || order?.details || {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function money(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "amber" | "red" | "blue"; key?: React.Key }) {
  const className = tone === "green"
    ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50"
    : tone === "amber"
      ? "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50"
      : tone === "red"
        ? "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/50"
        : tone === "blue"
          ? "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/50"
          : "bg-gray-50 text-gray-600 border-gray-200 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-800";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black ${className}`}>{children}</span>;
}

function RedactionHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <Badge tone="amber">Sensitive content hidden</Badge>;
}

function Detail({ label, value, icon }: { label: string; value: any; icon?: React.ReactNode }) {
  const text = clean(value);
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-500">
        {icon}
        {label}
      </div>
      <p className="break-words text-sm font-bold text-gray-900 dark:text-neutral-50">{text || "Not available"}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900/88">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-emerald-600 dark:text-emerald-300">{icon}</span>
        <h3 className="text-sm font-black text-gray-950 dark:text-neutral-50">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-950/50">
      <p className="font-black text-gray-700 dark:text-neutral-200">{title}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-gray-500 dark:text-neutral-500">{body}</p>
    </div>
  );
}

function timelineTone(type: Customer360TimelineItem["type"]) {
  if (type === "order") return "bg-blue-500";
  if (type === "lead") return "bg-emerald-500";
  if (type === "followup") return "bg-amber-500";
  if (type === "activity") return "bg-violet-500";
  return "bg-gray-400";
}

export function Customer360Panel({ customer, userId, isOpen, onClose, onSaved, onSummaryRefreshQueued, formatDate }: Props) {
  const [orders, setOrders] = useState<any[]>([]);
  const [crmOverview, setCrmOverview] = useState<any>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [replyControlState, setReplyControlState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!isOpen || !customer || !userId) return;
    let cancelled = false;
    setIsLoadingContext(true);
    Promise.all([
      fetch(`/api/user/orders?userId=${encodeURIComponent(userId)}`).then((res) => res.ok ? res.json() : []).catch(() => []),
      fetch("/api/user/crm/overview").then((res) => res.ok ? res.json() : null).catch(() => null),
    ]).then(([ordersData, crmData]) => {
      if (cancelled) return;
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setCrmOverview(crmData || null);
    }).finally(() => {
      if (!cancelled) setIsLoadingContext(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, customer, userId]);

  const profile = useMemo<Customer360Profile>(() => buildCustomer360Profile({
    customer,
    orders,
    leads: crmOverview?.leads || [],
    followUps: crmOverview?.followUps || [],
    activities: crmOverview?.activities || [],
  }), [customer, orders, crmOverview]);

  if (!isOpen || !customer) return null;

  const rawProfile = profileOf(customer);
  const summaryState = getCustomerSummaryDisplayState({ ...customer, profile: rawProfile });
  const summary = profile.aiSummary || summaryState.summary || "";
  const redactedSummary = redactSensitiveText(summary);
  const summaryWasRedacted = containsSensitiveText(summary);
  const replyOffReason = firstValue(
    rawProfile.botReplyStopSource === ".00" ? ".00 permanent stop" : "",
    rawProfile.botReplyStopSource === ".0" ? ".0 temporary pause" : "",
    rawProfile.botReplyControl === "paused_permanent" ? "Permanent AI stop" : "",
    rawProfile.botReplyControl === "paused_temp" ? "Temporary AI pause" : "",
    rawProfile.aiPaused || rawProfile.ai_paused ? "Manual review / AI paused" : "",
    rawProfile.manualReviewReason,
    rawProfile.lastAiRetryBlockedReason,
  );

  const resumeAiReplies = async () => {
    setReplyControlState("saving");
    try {
      const res = await fetch("/api/user/customers/reply-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.$id || customer.id || customer.customer_id, action: "resume" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to resume replies");
      onSaved(customer, data.profile || {});
      setReplyControlState("saved");
    } catch {
      setReplyControlState("error");
    }
  };

  const contactIdentity = getCustomerContactIdentity({ ...customer, profile: rawProfile }, profile.activeLead, profile.latestOrder);
  const displayName = contactIdentity.displayName;
  const displayPhone = contactIdentity.displayPhone || "No phone linked";
  const whatsappProfile = profile.whatsappProfile || contactIdentity.whatsappProfile;
  const whatsappProfileSyncedAt = whatsappProfile?.syncedAt ? (whatsappProfile.syncedAt < 100000000000 ? whatsappProfile.syncedAt * 1000 : whatsappProfile.syncedAt) : 0;
  const safeProfilePicture = /^https?:\/\//i.test(clean(whatsappProfile?.profilePictureUrl)) ? clean(whatsappProfile?.profilePictureUrl) : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close customer profile" />
      <aside className="relative h-full w-full max-w-7xl overflow-y-auto bg-[#FAFAFA] shadow-2xl dark:bg-neutral-950">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Customer 360</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-neutral-50">{displayName}</h2>
              <p className="mt-1 text-xs font-mono font-semibold text-gray-500 dark:text-neutral-400">{displayPhone}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isLoadingContext ? <Badge tone="blue">Syncing profile context</Badge> : <Badge tone="green">Existing data sources</Badge>}
              {whatsappProfile ? <Badge tone="blue">WhatsApp profile</Badge> : null}
              {profile.activeLead ? <Badge tone="green">Lead linked</Badge> : <Badge>No linked lead</Badge>}
              {profile.orderCount > 0 ? <Badge tone="blue">{profile.orderCount} order(s)</Badge> : <Badge>No linked orders</Badge>}
              {profile.overdueFollowUps.length > 0 ? <Badge tone="red">Overdue follow-up</Badge> : null}
              <button onClick={onClose} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            <Section title="Identity" icon={<User className="h-4 w-4" />}>
              <div className="space-y-3">
                <Detail label="Name" value={displayName} icon={<User className="h-3.5 w-3.5" />} />
                <Detail label="Phone" value={displayPhone} icon={<Phone className="h-3.5 w-3.5" />} />
                <Detail label="Email" value={profile.email} icon={<Mail className="h-3.5 w-3.5" />} />
                <Detail label="Location" value={profile.location} icon={<MapPin className="h-3.5 w-3.5" />} />
                <Detail label="Source" value={profile.source || firstValue(rawProfile.originBotId, rawProfile.lastInboundBotId, customer?.bot_id)} icon={<Activity className="h-3.5 w-3.5" />} />
                <Detail label="Assigned to" value={profile.assignedTo} icon={<UserCheck className="h-3.5 w-3.5" />} />
              </div>
              {profile.tags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {profile.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                </div>
              ) : null}
            </Section>

            <Section title="Business context" icon={<Activity className="h-4 w-4" />}>
              {profile.businessContext && (profile.businessContext.businessName || profile.businessContext.businessType || profile.businessContext.businessSize || profile.businessContext.website) ? (
                <div className="space-y-3">
                  {profile.businessContext.businessName ? <Detail label="Company / store" value={profile.businessContext.businessName} /> : null}
                  {profile.businessContext.businessType ? <Detail label="Industry / type" value={profile.businessContext.businessType} /> : null}
                  {profile.businessContext.businessSize ? <Detail label="Team size" value={profile.businessContext.businessSize} /> : null}
                  {profile.businessContext.website ? <Detail label="Website" value={profile.businessContext.website} /> : null}
                  {profile.conversationIntelligence?.preferredLanguage ? (
                    <Detail label="Language" value={profile.conversationIntelligence.preferredLanguage.toUpperCase()} />
                  ) : null}
                </div>
              ) : (
                <EmptyState title="No business context captured" body="Conversational business facts will appear here as the customer mentions them." />
              )}
            </Section>

            <Section title="WhatsApp profile" icon={<UserCheck className="h-4 w-4" />}>
              {whatsappProfile ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
                    {safeProfilePicture ? <img src={safeProfilePicture} alt="WhatsApp profile" className="h-12 w-12 rounded-2xl object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><User className="h-5 w-5" /></div>}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-gray-950 dark:text-neutral-50">{redactSensitiveText(firstValue(whatsappProfile.verifiedName, whatsappProfile.businessName, whatsappProfile.pushName, whatsappProfile.displayName, "WhatsApp profile"))}</p>
                      <p className="text-[11px] font-bold text-gray-500 dark:text-neutral-500">{redactSensitiveText(firstValue(whatsappProfile.businessCategory, whatsappProfile.source, "Stored profile intelligence"))}</p>
                    </div>
                  </div>
                  <Detail label="WhatsApp name" value={redactSensitiveText(firstValue(whatsappProfile.displayName, whatsappProfile.pushName, whatsappProfile.notifyName))} />
                  <Detail label="Verified / business name" value={redactSensitiveText(firstValue(whatsappProfile.verifiedName, whatsappProfile.businessName))} />
                  <Detail label="Category" value={redactSensitiveText(whatsappProfile.businessCategory)} />
                  <Detail label="About / description" value={redactSensitiveText(whatsappProfile.businessDescription)} />
                  <Detail label="Website" value={redactSensitiveText(whatsappProfile.businessWebsite)} />
                  <Detail label="Email" value={redactSensitiveText(whatsappProfile.businessEmail)} />
                  <Detail label="Address" value={redactSensitiveText(whatsappProfile.businessAddress)} />
                  <Detail label="Last synced" value={whatsappProfileSyncedAt ? formatDate(whatsappProfileSyncedAt, true) : "Stored profile data"} />
                  <p className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-[11px] font-bold leading-5 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-blue-300">
                    Used as customer-specific context only. It does not override your business instructions, prices, policies, delivery rules, or refund rules.
                  </p>
                </div>
              ) : (
                <EmptyState title="No WhatsApp profile details synced yet" body="Customer 360 will show stored WhatsApp profile enrichment when available. No customer message is sent from this card." />
              )}
            </Section>

            <Section title="Value" icon={<ShoppingCart className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-3">
                <Detail label="Lifetime value" value={money(profile.lifetimeValue)} />
                <Detail label="Orders" value={profile.orderCount} />
              </div>
            </Section>
          </div>

          <div className="space-y-5">
            <Section title="AI summary" icon={<Sparkles className="h-4 w-4" />}>
              {summary ? (
                <div className={`rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm leading-6 dark:border-neutral-800 dark:bg-neutral-950/50 ${summaryState.pending ? "text-amber-700 dark:text-amber-300" : "text-gray-700 dark:text-neutral-200"}`}>
                  <div className="mb-3 flex justify-end"><RedactionHint visible={summaryWasRedacted} /></div>
                  {redactedSummary.split(/\n{2,}|\n-/).map((paragraph: string, index: number) => {
                    const text = paragraph.replace(/^\s*[-*]\s*/, "").trim();
                    return text ? <p key={`summary-${index}`} className="mb-3 last:mb-0">{text}</p> : null;
                  })}
                </div>
              ) : (
                <EmptyState title="No AI summary yet" body="Customer 360 will show the saved AI summary when conversation intelligence is available." />
              )}
            </Section>

            <Section title="Timeline" icon={<MessageSquareText className="h-4 w-4" />}>
              {profile.timelineItems.length > 0 ? (
                <div className="space-y-3">
                  {profile.timelineItems.map((item) => {
                    const safeTitle = redactSensitiveText(item.title);
                    const safeDescription = redactSensitiveText(item.description);
                    const safeMeta = redactSensitiveText(item.meta);
                    const itemWasRedacted = containsSensitiveText(item.title) || containsSensitiveText(item.description) || containsSensitiveText(item.meta);
                    return (
                      <div key={item.id} className="grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-gray-100 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
                        <div className={`mt-1 h-3 w-3 rounded-full ${timelineTone(item.type)}`} />
                        <div className="min-w-0">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="truncate text-sm font-black text-gray-900 dark:text-neutral-50">{safeTitle}</p>
                            <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">{item.timestamp ? formatDate(item.timestamp, true) : "No date"}</span>
                          </div>
                          <p className="mt-1 line-clamp-3 text-xs font-semibold leading-5 text-gray-600 dark:text-neutral-300">{safeDescription}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {safeMeta ? <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">{safeMeta}</p> : null}
                            <RedactionHint visible={itemWasRedacted} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="Conversation source not connected yet" body="No real conversation timeline is available in this profile context yet. This panel does not generate fake chat history." />
              )}
            </Section>

            {profile.salesContext && (profile.salesContext.productInterest || profile.salesContext.quantity || profile.salesContext.budget || profile.salesContext.buyingStage) ? (
              <Section title="Sales & buying context" icon={<Sparkles className="h-4 w-4" />}>
                <div className="space-y-3">
                  {profile.salesContext.productInterest ? <Detail label="Product / service interest" value={profile.salesContext.productInterest} /> : null}
                  {profile.salesContext.quantity ? <Detail label="Requested quantity" value={profile.salesContext.quantity} /> : null}
                  {profile.salesContext.budget ? <Detail label="Explicit budget" value={profile.salesContext.budget} /> : null}
                  {profile.salesContext.buyingStage ? (
                    <Detail label="Buying stage" value={profile.salesContext.buyingStage.replace(/_/g, " ").toUpperCase()} />
                  ) : null}
                  {profile.salesContext.purchaseTimeframe ? <Detail label="Timeframe" value={profile.salesContext.purchaseTimeframe} /> : null}
                </div>
              </Section>
            ) : null}

            {profile.orderSupportContext && (profile.orderSupportContext.existingOrderReference || profile.orderSupportContext.deliveryConcerns || profile.orderSupportContext.supportIssue || profile.orderSupportContext.requestedFollowUp) ? (
              <Section title="Order & support insights" icon={<ClipboardList className="h-4 w-4" />}>
                <div className="space-y-3">
                  {profile.orderSupportContext.existingOrderReference ? <Detail label="Referenced order" value={profile.orderSupportContext.existingOrderReference} /> : null}
                  {profile.orderSupportContext.deliveryConcerns ? <Detail label="Delivery concern" value={profile.orderSupportContext.deliveryConcerns} /> : null}
                  {profile.orderSupportContext.supportIssue ? <Detail label="Support issue" value={profile.orderSupportContext.supportIssue} /> : null}
                  {profile.orderSupportContext.requestedFollowUp ? <Detail label="Follow-up request" value={profile.orderSupportContext.requestedFollowUp} /> : null}
                </div>
              </Section>
            ) : null}

            <Section title="Internal notes" icon={<FileText className="h-4 w-4" />}>
              <p className="mb-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-neutral-800 dark:bg-neutral-950/50 dark:text-neutral-400">
                Admin-only notes stay separate from customer-facing summaries and bot-visible conversation context.
              </p>
              <CustomerNotesEditor
                customer={{ ...customer, profile: rawProfile }}
                userId={userId}
                showSummary={false}
                onSummaryRefreshQueued={onSummaryRefreshQueued}
                onSaved={(nextProfile) => onSaved(customer, nextProfile)}
              />
            </Section>
          </div>

          <div className="space-y-5">
            <Section title="Lead status" icon={<ClipboardList className="h-4 w-4" />}>
              <div className="space-y-3">
                <Detail label="Lead status" value={profile.leadStatus || "No active lead"} />
                <Detail label="Deal stage" value={profile.dealStage || "Not set"} />
                <Detail label="Next follow-up" value={profile.nextFollowUpAt ? formatDate(profile.nextFollowUpAt, true) : "No next follow-up"} />
                {profile.overdueFollowUps.length > 0 ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-300">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {profile.overdueFollowUps.length} overdue follow-up item(s) need review.
                    </div>
                  </div>
                ) : null}
              </div>
            </Section>

            <Section title="Recent orders" icon={<ShoppingCart className="h-4 w-4" />}>
              {profile.linkedOrders.length > 0 ? (
                <div className="space-y-3">
                  {profile.linkedOrders.slice(0, 5).map((order, index) => {
                    const data = orderDataOf(order);
                    return (
                      <div key={order?.$id || order?.id || index} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
                        <p className="text-sm font-black text-gray-900 dark:text-neutral-50">{firstValue(data.productName, data.serviceName, data.orderReferenceNumber, order?.order_id, "Order / lead")}</p>
                        <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-neutral-500">{firstValue(data.recordStatus, data.orderStatus, data.transactionStatus, "Recorded")}</p>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-black text-gray-400 dark:text-neutral-600">
                          <span>{formatDate(order?.updated_at || order?.$updatedAt || order?.created_at || order?.$createdAt, true)}</span>
                          <span>{money(Number(String(firstValue(data.totalPrice, data.codAmount, data.invoicePayment, 0)).replace(/[^0-9.-]/g, "")))}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No linked orders found yet" body="Customer 360 will show recent orders when customer phone, email, or record ids match existing order data." />
              )}
            </Section>

            <Section title="Suggested manual actions" icon={<Bot className="h-4 w-4" />}>
              <div className="space-y-3">
                {replyOffReason ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/25">
                    <p className="text-xs font-black text-amber-800 dark:text-amber-200">AI replies are paused: {replyOffReason}</p>
                    <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Resume only clears profile pause flags.</p>
                    <button
                      type="button"
                      onClick={resumeAiReplies}
                      disabled={replyControlState === "saving"}
                      className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {replyControlState === "saving" ? "Resuming..." : "Resume AI"}
                    </button>
                    {replyControlState === "saved" ? <p className="mt-2 text-[11px] font-black text-emerald-700 dark:text-emerald-300">AI reply control resumed for linked profiles.</p> : null}
                    {replyControlState === "error" ? <p className="mt-2 text-[11px] font-black text-red-700 dark:text-red-300">Could not resume AI replies. Try again from the customer record.</p> : null}
                  </div>
                ) : null}
                {profile.suggestedActions.length > 0 ? profile.suggestedActions.map((action) => {
                  const safeLabel = redactSensitiveText(action.label);
                  const safeReason = redactSensitiveText(action.reason);
                  const actionWasRedacted = containsSensitiveText(action.label) || containsSensitiveText(action.reason);
                  return (
                    <div key={action.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-gray-900 dark:text-neutral-50">{safeLabel}</p>
                        <Badge tone={action.priority === "high" ? "red" : action.priority === "medium" ? "amber" : "gray"}>{action.priority}</Badge>
                      </div>
                      <p className="text-xs font-semibold leading-5 text-gray-500 dark:text-neutral-500">{safeReason}</p>
                      <div className="mt-2"><RedactionHint visible={actionWasRedacted} /></div>
                    </div>
                  );
                }) : (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-300">
                    <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> No urgent manual action detected from current linked data.</div>
                  </div>
                )}
              </div>
            </Section>
          </div>
        </div>
      </aside>
    </div>
  );
}

export async function saveCustomerProfileNotes(input: {
  userId: string;
  customerId: string;
  customerInstructions: string;
}) {
  const res = await fetch("/api/user/customers/update-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: input.userId,
      customerId: input.customerId,
      profile: {
        customerInstructions: input.customerInstructions
      }
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to save customer notes");
  return data.profile;
}

export async function requestCustomerSummaryRefresh(input: {
  userId: string;
  customerId: string;
}) {
  const res = await fetch("/api/user/customers/refresh-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: input.userId,
      customerId: input.customerId,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to refresh customer summary");
  return data;
}

import test from "node:test";
import assert from "node:assert/strict";

import { collectSuccessfulFollowupStats } from "./marketing-followup-stats-service.ts";

test("follow-up profile stats can attribute orders without counting sent", () => {
  const campaign = {
    sent: 0,
    orders: 0,
    sentKeys: new Set<string>(),
    orderKeys: new Set<string>(),
  };

  collectSuccessfulFollowupStats({
    customer: {
      $id: "customer-1",
      customer_id: "129112294030",
      last_order_at: 1710000300,
      profile: JSON.stringify({
        followupDeliveries: {
          "followup-1": {
            status: "sent",
            sentAt: 1710000200,
            attemptKey: "attempt-1",
          },
        },
      }),
    },
    botId: "bot-1",
    getCampaign: (key) => key === "bot-1:followup-1" ? campaign : undefined,
    hasCustomerOrder: () => true,
    countSent: false,
  });

  assert.equal(campaign.sent, 0);
  assert.equal(campaign.orders, 1);
});

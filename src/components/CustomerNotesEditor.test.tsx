import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CustomerNotesEditor } from "./CustomerNotesEditor.tsx";

test("customer notes editor hides fallback summary labels in normal UI", () => {
  const html = renderToStaticMarkup(
    <CustomerNotesEditor
      customer={{
        $id: "cust_1",
        profile: {
          chatSummary: "Current:\n- Phone: 03001234567\nRemaining:\n- Address",
          chatSummarySource: "software_fallback",
        },
      }}
      userId=""
      onSaved={() => {}}
    />
  );

  assert.doesNotMatch(html, /Fallback summary/i);
  assert.doesNotMatch(html, /AI summary/i);
  assert.match(html, /Current:/);
  assert.match(html, /Remaining:/);
});

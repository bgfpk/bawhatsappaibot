import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TextLimitCounter } from "./TextLimitCounter.tsx";

test("text limit counter renders used limit and remaining characters", () => {
  const html = renderToStaticMarkup(<TextLimitCounter value="hello" limit={10} />);

  assert.match(html, /5 \/ 10 characters/);
  assert.match(html, /Remaining: 5/);
});

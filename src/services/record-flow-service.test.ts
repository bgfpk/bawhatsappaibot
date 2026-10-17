import test from "node:test";
import assert from "node:assert/strict";

import { getMissingLeadFields, normalizeBusinessFlow, normalizeRecordStatus, withRecordMetadata } from "./record-flow-service.ts";

test("clinic, appointment, school, and support business types normalize as service flows", () => {
  for (const businessType of ["clinic", "doctor appointment", "school admission", "customer support", "agency consultation"]) {
    assert.equal(normalizeBusinessFlow(businessType), "service");
  }

  assert.equal(normalizeBusinessFlow("fashion ecommerce"), "product");
});

test("service lead stays incomplete when default lead fields are missing", () => {
  const missing = getMissingLeadFields({
    serviceName: "AC repair",
    customFields: {},
  }, []);

  assert.deepEqual(missing, ["Phone"]);
});

test("service booking lead requires preferred date time when booking context exists", () => {
  const missing = getMissingLeadFields({
    serviceName: "Clinic appointment booking",
    customerPhone: "15811061380",
    notes: "Customer wants appointment booking tomorrow morning.",
    customFields: {},
  }, []);

  assert.deepEqual(missing, ["Location", "Preferred Date/Time"]);
});

test("required custom fields still keep service lead incomplete", () => {
  const missing = getMissingLeadFields({
    serviceName: "Dental appointment",
    customerPhone: "15811061380",
    customFields: {},
  }, [
    { name: "Preferred Doctor", instructions: "Ask customer preferred doctor." },
  ]);

  assert.deepEqual(missing, ["Preferred Date/Time", "Preferred Doctor"]);
});

test("incomplete status text is not treated as complete", () => {
  assert.equal(normalizeRecordStatus("incomplete", {}, []), "incomplete");
  assert.equal(normalizeRecordStatus("not complete", {}, []), "incomplete");
  assert.equal(normalizeRecordStatus("Order incomplete", {}, []), "incomplete");
  assert.equal(normalizeRecordStatus("incomplete order", {}, []), "incomplete");
  assert.equal(normalizeRecordStatus("pending", {}, []), "incomplete");
});

test("positive completion statuses still normalize to complete", () => {
  for (const status of ["complete", "completed", "ready", "confirmed", "done"]) {
    assert.equal(normalizeRecordStatus(status, {}, []), "complete");
  }

  assert.equal(normalizeRecordStatus("", { transactionStatus: "Confirmed order" }, []), "complete");
  assert.equal(normalizeRecordStatus("", { transactionStatus: "Order ready" }, []), "complete");
});

test("stale incomplete record status does not block completion when required fields are filled", () => {
  const record = withRecordMetadata({
    recordData: {
      recordType: "lead",
      serviceName: "Consultation",
      customerPhone: "15811061380",
      recordStatus: "incomplete",
    },
    businessFlow: "service",
    recordType: "lead",
    missingFields: [],
    recordStatus: "incomplete",
  });

  assert.equal(normalizeRecordStatus(record.recordStatus, record, []), "complete");
  assert.equal(record.recordStatus, "complete");
});

test("transaction incomplete text keeps a filled record incomplete", () => {
  const record = withRecordMetadata({
    recordData: {
      recordType: "lead",
      serviceName: "Consultation",
      customerPhone: "15811061380",
      recordStatus: "incomplete",
      transactionStatus: "Lead incomplete",
    },
    businessFlow: "service",
    recordType: "lead",
    missingFields: [],
    recordStatus: "incomplete",
  });

  assert.equal(record.recordStatus, "incomplete");
});

test("optional custom fields do not block completion but required custom fields do", () => {
  const lead = {
    serviceName: "Dental appointment",
    customerPhone: "15811061380",
    customFields: {},
  };

  assert.deepEqual(getMissingLeadFields(lead, [
    { name: "Notes", instructions: "Optional, can be filled later." },
  ]), ["Preferred Date/Time"]);

  assert.deepEqual(getMissingLeadFields(lead, [
    { name: "Preferred Doctor", instructions: "Ask customer preferred doctor." },
  ]), ["Preferred Date/Time", "Preferred Doctor"]);
});

test("instruction-like fields are ignored and existing CRM values prevent repeated missing-field prompts", () => {
  const missing = getMissingLeadFields({
    serviceName: "Clinic consultation",
    customerPhone: "15811061380",
    customFields: {
      Gender: "Male",
    },
  }, [
    { name: "FINAL COMPLETION RULE", instructions: "Collect all fields before payment." },
    { name: "Gender", instructions: "Ask customer gender." },
  ]);

  assert.deepEqual(missing, ["Location", "Preferred Date/Time"]);
});

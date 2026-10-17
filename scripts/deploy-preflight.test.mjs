import test from 'node:test';
import assert from 'node:assert/strict';

function runPreflightMock({ availGb, freePct, inodeFreePct, minGb = 10, minPct = 15, minInodePct = 10 }) {
  let failed = false;
  const reasons = [];

  if (availGb < minGb) {
    failed = true;
    reasons.push(`Available disk space (${availGb} GB) below ${minGb} GB`);
  }
  if (freePct < minPct) {
    failed = true;
    reasons.push(`Available disk space percentage (${freePct}%) below ${minPct}%`);
  }
  if (inodeFreePct < minInodePct) {
    failed = true;
    reasons.push(`Available inode percentage (${inodeFreePct}%) below ${minInodePct}%`);
  }

  return { pass: !failed, reasons };
}

test('preflight guard passes under healthy capacity (48 GB free, 51% free, 91% inode free)', () => {
  const result = runPreflightMock({ availGb: 48, freePct: 51, inodeFreePct: 91 });
  assert.equal(result.pass, true);
  assert.equal(result.reasons.length, 0);
});

test('preflight guard blocks deployment when disk is full (0 GB free, 0% free)', () => {
  const result = runPreflightMock({ availGb: 0, freePct: 0, inodeFreePct: 91 });
  assert.equal(result.pass, false);
  assert.match(result.reasons[0], /below 10 GB/i);
});

test('preflight guard blocks deployment when inodes are exhausted (<10% free)', () => {
  const result = runPreflightMock({ availGb: 30, freePct: 40, inodeFreePct: 5 });
  assert.equal(result.pass, false);
  assert.match(result.reasons[0], /inode percentage/i);
});

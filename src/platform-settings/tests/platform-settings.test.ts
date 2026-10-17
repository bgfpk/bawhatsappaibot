import test from "node:test";
import assert from "node:assert/strict";
import {
  filterTeamMembers,
  filterSessions,
  type TeamMemberRecord,
  type SessionRecord,
} from "../platform-model";

test("filterTeamMembers: filters members by query and role", () => {
  const members: TeamMemberRecord[] = [
    {
      id: "m1",
      name: "Alice Owner",
      email: "contact-22c9943ba6fd@example.invalid",
      role: "owner",
      roleLabel: "Owner",
      status: "active",
    },
    {
      id: "m2",
      name: "Bob Agent",
      email: "contact-045979b85581@example.invalid",
      role: "agent",
      roleLabel: "Agent",
      status: "active",
    },
  ];

  const searchBob = filterTeamMembers(members, "bob", "all");
  assert.equal(searchBob.length, 1);
  assert.equal(searchBob[0].id, "m2");

  const filterRole = filterTeamMembers(members, "", "owner");
  assert.equal(filterRole.length, 1);
  assert.equal(filterRole[0].id, "m1");

  const emptyFilter = filterTeamMembers(members, "", "all");
  assert.equal(emptyFilter.length, 2);
});

test("filterSessions: filters active user sessions by device or IP query", () => {
  const sessions: SessionRecord[] = [
    {
      id: "s1",
      device: "Windows Desktop (Chrome)",
      browser: "Chrome",
      ipAddress: "192.168.1.1",
      isCurrent: true,
      lastActive: Date.now(),
    },
    {
      id: "s2",
      device: "iPhone (Safari)",
      browser: "Safari",
      ipAddress: "10.0.0.1",
      isCurrent: false,
      lastActive: Date.now() - 1000,
    },
  ];

  const searchSafari = filterSessions(sessions, "safari");
  assert.equal(searchSafari.length, 1);
  assert.equal(searchSafari[0].id, "s2");

  const emptySearch = filterSessions(sessions, "");
  assert.equal(emptySearch.length, 2);
});

/**
 * Personal Contacts View Component
 * 
 * Dashboard interface to inspect Personal Contacts, memory facts,
 * owner notes, and relationships.
 */

import React, { useState, useEffect, useCallback } from "react";
import type {
  PersonalContact,
  PersonalContactRelationship,
  PersonalContactFactCategory,
} from "../../../services/personal-contact-types.ts";
import {
  fetchPersonalContacts,
  fetchPersonalContactDetails,
  updatePersonalContactRelationship,
  addPersonalContactFactApi,
  removePersonalContactFactApi,
  addPersonalContactNoteApi,
  removePersonalContactNoteApi,
  clearPersonalContactMemoryApi,
} from "./personal-contact-api.ts";

export const PersonalContactsView: React.FC = () => {
  const [contacts, setContacts] = useState<PersonalContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<PersonalContact | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New fact form state
  const [factLabel, setFactLabel] = useState("");
  const [factValue, setFactValue] = useState("");
  const [factCategory, setFactCategory] = useState<PersonalContactFactCategory>("custom");

  // New note form state
  const [noteText, setNoteText] = useState("");

  // Relationship edit state
  const [relCategory, setRelCategory] = useState<PersonalContactRelationship>("acquaintance");
  const [customRelLabel, setCustomRelLabel] = useState("");

  const loadContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPersonalContacts({ search });
      setContacts(data);
      if (selectedContact) {
        const refreshed = data.find((c) => c.contactId === selectedContact.contactId);
        if (refreshed) setSelectedContact(refreshed);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [search, selectedContact?.contactId]);

  useEffect(() => {
    loadContacts();
  }, [search]);

  const handleSelectContact = async (contact: PersonalContact) => {
    try {
      setDetailLoading(true);
      setError(null);
      const details = await fetchPersonalContactDetails(contact.contactId);
      setSelectedContact(details.contact);
      setRelCategory(details.contact.relationship);
      setCustomRelLabel(details.contact.customRelationshipLabel || "");
    } catch (e: any) {
      setError(e.message || "Failed to load contact details");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveRelationship = async () => {
    if (!selectedContact) return;
    try {
      setError(null);
      const updated = await updatePersonalContactRelationship(selectedContact.contactId, relCategory, customRelLabel);
      setSelectedContact(updated);
      setSuccessMessage("Relationship updated successfully.");
      setTimeout(() => setSuccessMessage(null), 3000);
      loadContacts();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact || !factLabel.trim() || !factValue.trim()) return;
    try {
      setError(null);
      const updated = await addPersonalContactFactApi(selectedContact.contactId, {
        label: factLabel.trim(),
        value: factValue.trim(),
        category: factCategory,
      });
      setSelectedContact(updated);
      setFactLabel("");
      setFactValue("");
      setSuccessMessage("Fact added successfully.");
      setTimeout(() => setSuccessMessage(null), 3000);
      loadContacts();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDeleteFact = async (factId: string) => {
    if (!selectedContact) return;
    try {
      setError(null);
      const updated = await removePersonalContactFactApi(selectedContact.contactId, factId);
      setSelectedContact(updated);
      setSuccessMessage("Fact removed.");
      setTimeout(() => setSuccessMessage(null), 3000);
      loadContacts();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact || !noteText.trim()) return;
    try {
      setError(null);
      const updated = await addPersonalContactNoteApi(selectedContact.contactId, noteText.trim());
      setSelectedContact(updated);
      setNoteText("");
      setSuccessMessage("Note added.");
      setTimeout(() => setSuccessMessage(null), 3000);
      loadContacts();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!selectedContact) return;
    try {
      setError(null);
      const updated = await removePersonalContactNoteApi(selectedContact.contactId, noteId);
      setSelectedContact(updated);
      setSuccessMessage("Note removed.");
      setTimeout(() => setSuccessMessage(null), 3000);
      loadContacts();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleClearMemory = async () => {
    if (!selectedContact) return;
    const confirmed = window.confirm(`Are you sure you want to clear all memory facts and owner notes for "${selectedContact.displayName}"? WhatsApp conversation messages will NOT be deleted.`);
    if (!confirmed) return;

    try {
      setError(null);
      const updated = await clearPersonalContactMemoryApi(selectedContact.contactId);
      setSelectedContact(updated);
      setSuccessMessage("Contact memory cleared.");
      setTimeout(() => setSuccessMessage(null), 3000);
      loadContacts();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>👥</span> Personal Contacts & Memory
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Private contacts, verified identities, durable facts, and owner notes.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded-lg border border-red-200 dark:border-red-800">
          ⚠️ {error}
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm rounded-lg border border-emerald-200 dark:border-emerald-800">
          ✅ {successMessage}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <span>Contacts ({contacts.length})</span>
          </div>

          {loading ? (
            <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              Loading contacts...
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              No personal contacts found.
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {contacts.map((c) => {
                const isSelected = selectedContact?.contactId === c.contactId;
                const phone = c.whatsappIdentities.find((a) => a.canonicalPhone)?.canonicalPhone || "LID Contact";
                return (
                  <div
                    key={c.contactId}
                    onClick={() => handleSelectContact(c)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-600 shadow-sm"
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="font-semibold text-gray-900 dark:text-white text-sm">
                        {c.displayName}
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 capitalize">
                        {c.customRelationshipLabel || c.relationship}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                      <span>📞 {phone}</span>
                      <span>•</span>
                      <span>🧠 {c.durableFacts?.length || 0} facts</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Contact Details Panel */}
        <div className="lg:col-span-2">
          {detailLoading ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              Loading contact memory...
            </div>
          ) : !selectedContact ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              Select a contact on the left to view identity details, memory facts, and private notes.
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
              {/* Top Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {selectedContact.displayName}
                  </h3>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Contact ID: <code className="text-xs font-mono">{selectedContact.contactId}</code> • Revision {selectedContact.revision}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearMemory}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 transition"
                >
                  Clear Memory Facts
                </button>
              </div>

              {/* Relationship Section */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Relationship
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <select
                    value={relCategory}
                    onChange={(e) => setRelCategory(e.target.value as PersonalContactRelationship)}
                    className="w-full sm:w-48 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="friend">Friend</option>
                    <option value="family">Family</option>
                    <option value="colleague">Colleague</option>
                    <option value="client">Client</option>
                    <option value="supplier">Supplier</option>
                    <option value="service_provider">Service Provider</option>
                    <option value="professional_contact">Professional</option>
                    <option value="acquaintance">Acquaintance</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Custom label (e.g. accountant, tax advisor)"
                    value={customRelLabel}
                    onChange={(e) => setCustomRelLabel(e.target.value)}
                    className="flex-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleSaveRelationship}
                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Durable Facts Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Durable Facts ({selectedContact.durableFacts?.length || 0})
                  </label>
                </div>

                {selectedContact.durableFacts && selectedContact.durableFacts.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/60 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    {selectedContact.durableFacts.map((f) => (
                      <div key={f.factId} className="p-3 flex items-start justify-between bg-white dark:bg-gray-800">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {f.label}: <span className="font-normal text-gray-700 dark:text-gray-300">{f.value}</span>
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-2">
                            <span className="capitalize">{f.category}</span>
                            <span>•</span>
                            <span>Source: {f.source}</span>
                            {f.status !== "current" && (
                              <span className="text-amber-500 capitalize">({f.status})</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteFact(f.factId)}
                          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400 italic">No durable facts recorded yet.</div>
                )}

                {/* Add Fact Form */}
                <form onSubmit={handleAddFact} className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                  <select
                    value={factCategory}
                    onChange={(e) => setFactCategory(e.target.value as PersonalContactFactCategory)}
                    className="w-full sm:w-36 px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="custom">Custom</option>
                    <option value="identity">Identity</option>
                    <option value="role">Role</option>
                    <option value="preference">Preference</option>
                    <option value="schedule">Schedule</option>
                    <option value="location">Location</option>
                    <option value="pricing">Pricing</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Label (e.g. Opening hours)"
                    value={factLabel}
                    onChange={(e) => setFactLabel(e.target.value)}
                    className="flex-1 w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Value (e.g. 10 AM to 6 PM)"
                    value={factValue}
                    onChange={(e) => setFactValue(e.target.value)}
                    className="flex-1 w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition whitespace-nowrap"
                  >
                    Add Fact
                  </button>
                </form>
              </div>

              {/* Owner Notes Section */}
              <div className="space-y-4">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Private Owner Notes ({selectedContact.ownerNotes?.length || 0})
                </label>

                {selectedContact.ownerNotes && selectedContact.ownerNotes.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/60 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    {selectedContact.ownerNotes.map((n) => (
                      <div key={n.noteId} className="p-3 flex items-start justify-between bg-white dark:bg-gray-800">
                        <div className="text-sm text-gray-800 dark:text-gray-200">{n.text}</div>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(n.noteId)}
                          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400 italic">No private notes recorded.</div>
                )}

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="Add private note (e.g. discussed potential bulk order)..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition whitespace-nowrap"
                  >
                    Add Note
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

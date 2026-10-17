# BlackArrow Dashboard Design Foundation & Brand Principles

This document defines the visual and interaction foundation for the BlackArrow operational dashboard.

## Brand Principles for Operational Interfaces

1. **Shared BlackArrow Identity**
   The dashboard shares brand DNA with the BlackArrow public web presence—using the signature emerald palette, clean typography, and modern precision layout—while maintaining distinct operational utility.

2. **Restrained Visual Decoration**
   Gradients, glows, heavy shadows, and decorative background shapes are strictly minimized in the dashboard. Visual energy is preserved for data visualization, active system state, and actionable alerts.

3. **High Information Density & Scanning**
   Operational efficiency comes first. Typography, spacing, and surfaces are tuned for quick scanning, high data clarity, compact layout metrics, and tabbed workflow navigation.

4. **Clear Operational Hierarchy**
   Content uses explicit visual hierarchy: Page Title -> Section Header -> Surface/Card -> Table/Metric -> Action controls.

5. **Explicit Account vs. Instance Context**
   System status, account preferences, and instance-specific actions (e.g. WhatsApp instance connections, AI agent bots) are clearly demarcated using distinct surface levels and badge primitives.

6. **Accessible & Predictable Focus States**
   All interactive components provide high-contrast, visible focus indicators (`3px` ring offset) for keyboard navigation without layout reflow.

7. **Unambiguous Destructive Actions**
   Destructive actions utilize distinct semantic danger styling, confirmation triggers, and dual visual indicators (icon + clear text label).

8. **Motion with Intent**
   Animations are micro-interactions (`140ms - 220ms` cubic-bezier transitions) indicating state change or drawer/modal transitions. All animations respect `prefers-reduced-motion`.

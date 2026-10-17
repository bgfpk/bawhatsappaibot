import React, { useState } from 'react';
import {
  Button,
  Field,
  Label,
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  Switch,
  SearchField,
  Description,
  ErrorMessage,
  Badge,
  StatusIndicator,
  Alert,
  ProgressIndicator,
  Skeleton,
  EmptyState,
  ErrorState,
  LoadingState,
  Surface,
  Stack,
  Inline,
  Divider,
  PageHeading,
  SectionHeading,
  Toolbar,
  MetricTile,
  Dialog,
  Drawer,
  Popover,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Tooltip,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '../primitives';
import { DashboardShell } from '../../dashboard-shell';
import { Mail, Plus, Trash2, Zap, MoreVertical } from 'lucide-react';

/**
 * Development & Test Harness to demonstrate design primitives and validate accessibility.
 * Excluded from production routes.
 */
export const PrimitiveHarness: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [switchChecked, setSwitchChecked] = useState(true);
  const [searchValue, setSearchValue] = useState('');

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(next);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-12 bg-[var(--ca-canvas-0)] text-[var(--ca-text-primary)] min-h-screen">
      <PageHeading
        eyebrow="Development Harness"
        title="Dashboard Design Tokens & Shared UI Primitives"
        description="Interactive visual test harness demonstrating all primitive components, states, and accessibility compliance."
        actions={
          <Button variant="secondary" onClick={toggleTheme}>
            Toggle Theme ({theme})
          </Button>
        }
      />

      {/* Buttons */}
      <section className="space-y-4">
        <SectionHeading title="1. Button Primitive Variants & States" />
        <Surface level={1} className="p-6">
          <Stack gap={6}>
            <Inline gap={4}>
              <Button variant="primary">Primary Button</Button>
              <Button variant="secondary">Secondary Button</Button>
              <Button variant="quiet">Quiet/Ghost Button</Button>
              <Button variant="destructive">Destructive Button</Button>
              <Button variant="link">Link Button</Button>
            </Inline>
            <Inline gap={4}>
              <Button variant="primary" size="sm">Small</Button>
              <Button variant="primary" size="md">Medium</Button>
              <Button variant="primary" size="lg">Large</Button>
              <Button variant="primary" size="icon-only" aria-label="Add item">
                <Plus size={18} aria-hidden="true" />
              </Button>
            </Inline>
            <Inline gap={4}>
              <Button variant="primary" leadingIcon={<Plus size={16} />}>Leading Icon</Button>
              <Button variant="secondary" trailingIcon={<Zap size={16} />}>Trailing Icon</Button>
              <Button variant="primary" isLoading>Loading State</Button>
              <Button variant="secondary" disabled>Disabled State</Button>
            </Inline>
          </Stack>
        </Surface>
      </section>

      {/* Form Controls */}
      <section className="space-y-4">
        <SectionHeading title="2. Form Controls & Field Association" />
        <Surface level={1} className="p-6">
          <Stack gap={6}>
            <Field isRequired>
              <Label>Email Address</Label>
              <Input type="email" placeholder="contact-35d973d92927@example.invalid" defaultValue="contact-b4c9a289323b@example.invalid" />
              <Description>We will send account notifications to this address.</Description>
            </Field>

            <Field isInvalid>
              <Label>Instance Key</Label>
              <Input placeholder="inst_12345" defaultValue="invalid_key" />
              <ErrorMessage>Instance key is expired or invalid.</ErrorMessage>
            </Field>

            <Field>
              <Label>Service Region</Label>
              <Select defaultValue="us-east">
                <option value="us-east">US East (N. Virginia)</option>
                <option value="eu-west">EU West (Frankfurt)</option>
                <option value="ap-south">Asia Pacific (Mumbai)</option>
              </Select>
            </Field>

            <Field>
              <Label>System Prompt / Bio</Label>
              <Textarea placeholder="Enter prompt directives..." defaultValue="Default AI assistant persona..." />
            </Field>

            <SearchField
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onClear={() => setSearchValue('')}
              placeholder="Search instances, contacts, orders..."
            />

            <Inline gap={6}>
              <Checkbox label="Enable Auto-reply" defaultChecked />
              <Radio name="opt" label="Standard Speed" defaultChecked />
              <Radio name="opt" label="High Priority" />
              <Switch checked={switchChecked} onChange={setSwitchChecked} label="Live Dispatch Mode" />
            </Inline>
          </Stack>
        </Surface>
      </section>

      {/* Badges & Statuses */}
      <section className="space-y-4">
        <SectionHeading title="3. Status Vocabulary & Badges" />
        <Surface level={1} className="p-6">
          <Stack gap={4}>
            <Inline gap={3}>
              <Badge tone="brand">Brand</Badge>
              <Badge tone="success">Success</Badge>
              <Badge tone="warning">Warning</Badge>
              <Badge tone="danger">Danger</Badge>
              <Badge tone="info">Info</Badge>
              <Badge tone="neutral">Neutral</Badge>
            </Inline>
            <Divider />
            <Inline gap={6}>
              <StatusIndicator status="Connected" />
              <StatusIndicator status="Connecting" />
              <StatusIndicator status="QR Required" />
              <StatusIndicator status="Disconnected" />
              <StatusIndicator status="Paused" />
              <StatusIndicator status="Failed" />
            </Inline>
          </Stack>
        </Surface>
      </section>

      {/* Feedback & Alerts */}
      <section className="space-y-4">
        <SectionHeading title="4. Feedback, Alerts & Loading States" />
        <Stack gap={4}>
          <Alert severity="info" title="System Maintenance">
            Scheduled database upgrade on Sunday 02:00 UTC.
          </Alert>
          <Alert severity="success" title="Instance Verified">
            WhatsApp instance webhooks connected successfully.
          </Alert>
          <Alert severity="warning" title="API Quota Warning">
            You have used 85% of your allocated monthly message limit.
          </Alert>
          <Alert severity="error" title="Connection Interrupted">
            Failed to reach outbound message queue. Check network settings.
          </Alert>
          <ProgressIndicator value={68} label="Storage Sync Progress" />
          <Inline gap={4}>
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 w-24" />
          </Inline>
          <LoadingState label="Polling WhatsApp session status..." />
        </Stack>
      </section>

      {/* Overlays */}
      <section className="space-y-4">
        <SectionHeading title="5. Overlays & Tooltips" />
        <Surface level={1} className="p-6">
          <Inline gap={4}>
            <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
              Open Modal Dialog
            </Button>
            <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>
              Open Side Drawer
            </Button>
            <Popover
              isOpen={isPopoverOpen}
              onClose={() => setIsPopoverOpen(false)}
              ariaLabel="Quick Info Popover"
              trigger={
                <Button variant="secondary" onClick={() => setIsPopoverOpen(!isPopoverOpen)}>
                  Open Popover
                </Button>
              }
            >
              <Stack gap={2}>
                <p className="text-xs font-bold text-[var(--ca-text-primary)]">Quick Instance Filter</p>
                <p className="text-xs text-[var(--ca-text-muted)]">Filter bot logs by connection status and date.</p>
                <Button size="sm" variant="primary" onClick={() => setIsPopoverOpen(false)}>
                  Apply Filter
                </Button>
              </Stack>
            </Popover>
            <DropdownMenu
              isOpen={isDropdownOpen}
              onClose={() => setIsDropdownOpen(false)}
              ariaLabel="Instance Quick Actions Menu"
              trigger={
                <Button variant="quiet" iconOnly aria-label="Instance Quick Actions" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
                  <MoreVertical size={16} aria-hidden="true" />
                </Button>
              }
            >
              <DropdownMenuItem icon={<Zap size={14} />} onClick={() => setIsDropdownOpen(false)}>
                Test Connection
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Mail size={14} />} onClick={() => setIsDropdownOpen(false)}>
                Send Test Message
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive icon={<Trash2 size={14} />} onClick={() => setIsDropdownOpen(false)}>
                Disconnect Bot
              </DropdownMenuItem>
            </DropdownMenu>
            <Tooltip content="Provides live webhook diagnostics">
              <Button variant="quiet">Hover / Focus Tooltip</Button>
            </Tooltip>
          </Inline>
        </Surface>

        <Dialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          title="Confirm Action"
          description="Are you sure you want to disconnect this WhatsApp instance?"
          footer={
            <>
              <Button variant="quiet" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => setIsDialogOpen(false)}>
                Disconnect
              </Button>
            </>
          }
        >
          <p className="text-sm text-[var(--ca-text-secondary)]">
            Disconnecting will pause all ongoing bot auto-replies until re-authenticated via QR code.
          </p>
        </Dialog>

        <Drawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          title="Instance Settings"
          footer={
            <Button variant="primary" onClick={() => setIsDrawerOpen(false)}>
              Save Settings
            </Button>
          }
        >
          <Stack gap={4}>
            <Field>
              <Label>Session Name</Label>
              <Input defaultValue="Primary Support Bot" />
            </Field>
            <Field>
              <Label>Response Delay (ms)</Label>
              <Input type="number" defaultValue="1500" />
            </Field>
          </Stack>
        </Drawer>
      </section>

      {/* Table */}
      <section className="space-y-4">
        <SectionHeading title="6. Ordinary Table Foundation" />
        <Table caption="System Instances Overview">
          <TableHeader>
            <TableRow>
              <TableHeaderCell sortDirection="asc">Instance ID</TableHeaderCell>
              <TableHeaderCell>Phone Number</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Action</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-mono text-xs">inst_wa_0192</TableCell>
              <TableCell>+1 (555) 019-2834</TableCell>
              <TableCell><StatusIndicator status="Connected" /></TableCell>
              <TableCell><Button variant="quiet" size="sm">Manage</Button></TableCell>
            </TableRow>
            <TableRow isSelected>
              <TableCell className="font-mono text-xs">inst_wa_0842</TableCell>
              <TableCell>+1 (555) 084-2911</TableCell>
              <TableCell><StatusIndicator status="QR Required" /></TableCell>
              <TableCell><Button variant="primary" size="sm">Scan QR</Button></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      {/* Dashboard Shell Redesign Preview */}
      <section className="space-y-4 pt-6 border-t border-[var(--ca-border-default)]">
        <SectionHeading title="7. Dashboard Shell Architecture Preview" description="Full-bleed test harness rendering of the redesigned dashboard shell." />
        <div className="rounded-2xl border border-[var(--ca-border-default)] overflow-hidden shadow-[var(--ca-shadow-floating)] min-h-[500px]">
          <DashboardShell
            activeView="dashboard"
            currentAccountName="BlackArrow Enterprise"
            selectedBotLabel="+1 (555) 019-2834"
            connectionStatus="Connected"
            currentUser={{ name: 'Admin Account', email: 'contact-68098dfde210@example.invalid' }}
            isAdmin={true}
            isDarkMode={theme === 'dark'}
            onToggleDarkMode={toggleTheme}
            onSetView={() => {}}
            pageTitle="Dashboard Command Center"
            pageEyebrow="Workspace Overview"
            pageDescription="Monitor live WhatsApp customer interactions, bot status, and system operations."
            pageActions={
              <Button variant="primary" size="sm" leadingIcon={<Plus size={16} />}>
                New Campaign
              </Button>
            }
          >
            <div className="p-6 rounded-xl bg-[var(--ca-surface-1)] border border-[var(--ca-border-subtle)] space-y-4">
              <p className="text-sm text-[var(--ca-text-secondary)]">
                Dashboard Shell active content area rendered cleanly inside <code>DashboardPageFrame</code>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricTile label="Active Chats" value="128" delta="+12%" deltaTrend="up" />
                <MetricTile label="AI Handled" value="94.2%" delta="+3.1%" deltaTrend="up" />
                <MetricTile label="Wallet Credit" value="$420.50" />
              </div>
            </div>
          </DashboardShell>
        </div>
      </section>
    </div>
  );
};

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Toast } from "@/components/ui/toast";
import { EmptyState, LoadingState, ErrorState, SuccessState } from "@/components/ui/status-states";
import { Sun, Moon, Sparkles, MessageSquare, ShieldCheck, Zap, Layers, AlertTriangle, ArrowRight, CheckCircle2, Bot, SlidersHorizontal } from "lucide-react";

export function PrimitiveGallery() {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    if (next === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  };

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  return (
    <TooltipProvider>
      <div className={`min-h-screen bg-[var(--ca-canvas-0)] text-[var(--ca-text-primary)] transition-colors duration-200 ${theme === "dark" ? "dark" : "light"}`}>
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-[var(--ca-border-default)] bg-[var(--ca-surface-1)]/90 backdrop-blur px-8 py-5">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ca-brand-soft)] text-[var(--ca-brand)] ring-1 ring-[var(--ca-brand)]/20 shadow-sm">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[var(--ca-text-primary)]">BlackArrow Website Design System Proof</h1>
                <p className="text-xs font-medium text-[var(--ca-text-muted)]">M1.2 Expressive Shared Primitives Specification</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="hidden sm:inline-flex px-3 py-1 text-xs border-[var(--ca-border-strong)]">Expressive Marketing Density</Badge>
              <Button variant="outline" size="sm" onClick={toggleTheme} className="gap-2 px-4 h-9 shadow-sm" aria-label="Toggle theme mode">
                {theme === "dark" ? <Sun className="h-4 w-4 text-[var(--ca-amber)]" aria-hidden="true" /> : <Moon className="h-4 w-4 text-[var(--ca-cyan)]" aria-hidden="true" />}
                <span className="font-medium text-xs">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Hero Banner Section */}
        <section className="border-b border-[var(--ca-border-subtle)] bg-gradient-to-b from-[var(--ca-surface-1)] to-[var(--ca-canvas-0)] py-12 px-8">
          <div className="mx-auto max-w-7xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ca-brand)]/30 bg-[var(--ca-brand-soft)] px-3.5 py-1 text-xs font-semibold text-[var(--ca-brand)]">
              <Bot className="h-3.5 w-3.5" aria-hidden="true" /> Modular Design System Primitives
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl text-[var(--ca-text-primary)]">
              Expressive UI Foundations for High-Converting Web Journeys
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--ca-text-secondary)]">
              Shared token matrix binding expressive typography, rich accessibility primitives, and dynamic dark/light states without code redundancy.
            </p>
          </div>
        </section>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl space-y-16 px-8 py-12">

          {/* Section 1: Buttons */}
          <section className="space-y-6">
            <div className="border-b border-[var(--ca-border-subtle)] pb-3">
              <h3 className="text-2xl font-bold tracking-tight">1. Buttons & Call to Actions</h3>
              <p className="text-xs text-[var(--ca-text-muted)] mt-1">Primary marketing CTAs, secondary actions, outline triggers, and size variations.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="default" size="lg" className="shadow-md"><Zap className="h-4 w-4 mr-1" aria-hidden="true" /> Connect WhatsApp Bot <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" /></Button>
              <Button variant="secondary" size="lg">Explore Platform</Button>
              <Button variant="outline" size="lg">View Live Demo</Button>
              <Button variant="ghost" size="lg">Documentation</Button>
              <Button variant="destructive" size="lg">Disconnect Worker</Button>
              <Button disabled size="lg">Processing AI...</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button size="sm" variant="default">Small CTA</Button>
              <Button size="default" variant="default">Standard CTA</Button>
              <Button size="lg" variant="default">Large Marketing Hero CTA</Button>
            </div>
          </section>

          {/* Section 2: Form Controls */}
          <section className="space-y-6">
            <div className="border-b border-[var(--ca-border-subtle)] pb-3">
              <h3 className="text-2xl font-bold tracking-tight">2. Interactive Form Controls</h3>
              <p className="text-xs text-[var(--ca-text-muted)] mt-1">Form fields with explicit accessibility labels, selectors, toggles, checkboxes, and radio groups.</p>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              <Card className="border-[var(--ca-border-default)] shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Text Input & Textarea</CardTitle>
                  <CardDescription className="text-xs">Accessible form inputs with focus states.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="web-phone-input" className="text-xs font-semibold text-[var(--ca-text-secondary)]">Business Phone Number</label>
                    <Input id="web-phone-input" placeholder="+92 300 1234567" defaultValue="+92 300 9876543" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="web-persona-textarea" className="text-xs font-semibold text-[var(--ca-text-secondary)]">AI Persona Instructions</label>
                    <Textarea id="web-persona-textarea" placeholder="Describe how the AI should reply to customers..." defaultValue="Reply professionally in Urdu and English for sales inquiries." />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[var(--ca-border-default)] shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Select Dropdowns & Switches</CardTitle>
                  <CardDescription className="text-xs">Selection triggers and toggle controls.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="web-lang-select-trigger" className="text-xs font-semibold text-[var(--ca-text-secondary)]">Primary Language</label>
                    <Select defaultValue="en-ur">
                      <SelectTrigger id="web-lang-select-trigger" aria-label="Select Language">
                        <SelectValue placeholder="Select Language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en-ur">English + Roman Urdu</SelectItem>
                        <SelectItem value="en">English Only</SelectItem>
                        <SelectItem value="ur">Urdu Script Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-[var(--ca-border-subtle)] p-4 bg-[var(--ca-surface-2)]">
                    <div>
                      <label htmlFor="web-followup-switch" className="text-xs font-semibold cursor-pointer block">Automatic Follow-ups</label>
                      <p id="web-followup-desc" className="text-[11px] text-[var(--ca-text-muted)]">Send sequence after non-reply</p>
                    </div>
                    <Switch id="web-followup-switch" aria-describedby="web-followup-desc" defaultChecked />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[var(--ca-border-default)] shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Checkboxes & Radios</CardTitle>
                  <CardDescription className="text-xs">Multi-select and single choice items.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Checkbox id="web-check1" defaultChecked />
                      <label htmlFor="web-check1" className="text-xs font-medium cursor-pointer leading-tight">Enable Voice Note Transcript Analysis</label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Checkbox id="web-check2" defaultChecked />
                      <label htmlFor="web-check2" className="text-xs font-medium cursor-pointer leading-tight">Auto-capture Order Shipping Addresses</label>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[var(--ca-border-subtle)]">
                    <span id="web-radio-group-label" className="text-xs font-semibold text-[var(--ca-text-secondary)] mb-2 block">AI Provider Mode</span>
                    <RadioGroup defaultValue="hosted" aria-labelledby="web-radio-group-label" className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="hosted" id="web-r1" />
                        <label htmlFor="web-r1" className="text-xs cursor-pointer">Hosted BlackArrow Agent</label>
                      </div>
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="custom" id="web-r2" />
                        <label htmlFor="web-r2" className="text-xs cursor-pointer">Custom Gemini API Key</label>
                      </div>
                    </RadioGroup>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Section 3: Status Badges */}
          <section className="space-y-6">
            <div className="border-b border-[var(--ca-border-subtle)] pb-3">
              <h3 className="text-2xl font-bold tracking-tight">3. Status Chips & Badges</h3>
              <p className="text-xs text-[var(--ca-text-muted)] mt-1">Expressive status badges for instance state and marketing features.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="default" className="px-3 py-1 text-xs font-semibold">WhatsApp Connected</Badge>
              <Badge variant="success" className="px-3 py-1 text-xs font-semibold">AI Auto-Reply Active</Badge>
              <Badge variant="warning" className="px-3 py-1 text-xs font-semibold">Trial Status Active</Badge>
              <Badge variant="destructive" className="px-3 py-1 text-xs font-semibold">QR Code Expired</Badge>
              <Badge variant="secondary" className="px-3 py-1 text-xs font-semibold">Order Pending</Badge>
              <Badge variant="outline" className="px-3 py-1 text-xs font-semibold">Growth Plan</Badge>
            </div>
          </section>

          {/* Section 4: Marketing Bento Cards */}
          <section className="space-y-6">
            <div className="border-b border-[var(--ca-border-subtle)] pb-3">
              <h3 className="text-2xl font-bold tracking-tight">4. Marketing Bento Feature Cards</h3>
              <p className="text-xs text-[var(--ca-text-muted)] mt-1">Spacious bento containers with brand accent rings and subtle card elevations.</p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              <Card className="relative overflow-hidden border-[var(--ca-border-default)] shadow-sm hover:border-[var(--ca-brand)]/50 transition-all duration-200">
                <CardHeader className="pb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ca-brand-soft)] text-[var(--ca-brand)] mb-3 ring-1 ring-[var(--ca-brand)]/20">
                    <MessageSquare className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg">Instant WhatsApp AI</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">Help customers faster using AI trained on your business knowledge.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg bg-[var(--ca-surface-2)] p-4 text-xs text-[var(--ca-text-secondary)] border border-[var(--ca-border-subtle)] leading-relaxed">
                    &quot;Hello! Do you deliver to Lahore?&quot; &rarr; &quot;Yes! Delivery takes 2-3 working days across Pakistan.&quot;
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border-[var(--ca-border-default)] shadow-sm hover:border-[var(--ca-teal)]/50 transition-all duration-200">
                <CardHeader className="pb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ca-teal-soft)] text-[var(--ca-teal)] mb-3 ring-1 ring-[var(--ca-teal)]/20">
                    <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg">Human Takeover Guard</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">Pause AI instantly when a human agent joins the WhatsApp conversation.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between rounded-lg bg-[var(--ca-surface-2)] p-4 text-xs">
                    <span className="font-semibold text-[var(--ca-text-secondary)]">AI Agent Mode:</span>
                    <Badge variant="success">Human Active (AI Paused)</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border-[var(--ca-border-default)] shadow-sm hover:border-[var(--ca-cyan)]/50 transition-all duration-200">
                <CardHeader className="pb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ca-cyan-soft)] text-[var(--ca-cyan)] mb-3 ring-1 ring-[var(--ca-cyan)]/20">
                    <Layers className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg">Customer 360 & CRM</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">Automatically organize leads into CRM pipeline stages with order histories.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Progress value={68} aria-label="CRM Pipeline Sync Status" className="h-2" />
                  <p className="text-[11px] font-medium text-[var(--ca-text-muted)] text-right">68% Leads Synced to Pipeline</p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Section 5: Overlays & Tabs */}
          <section className="space-y-6">
            <div className="border-b border-[var(--ca-border-subtle)] pb-3">
              <h3 className="text-2xl font-bold tracking-tight">5. Dialogs, Overlays & Tab Navigation</h3>
              <p className="text-xs text-[var(--ca-text-muted)] mt-1">Interactive modal dialogs, slide-overs, dropdowns, and tabbed view controls.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="default" className="shadow-sm">Open Dialog Modal</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Connect WhatsApp Business Instance</DialogTitle>
                    <DialogDescription>Scan the QR code with WhatsApp Linked Devices to activate your AI assistant.</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col items-center justify-center p-8 border border-dashed border-[var(--ca-border-strong)] rounded-xl bg-[var(--ca-surface-2)]">
                    <div className="h-36 w-36 bg-[var(--ca-surface-3)] rounded-lg flex items-center justify-center text-xs text-[var(--ca-text-muted)] mb-3 font-medium">
                      [QR CODE PLACEHOLDER]
                    </div>
                    <p className="text-xs text-[var(--ca-text-muted)]">QR Code refreshes automatically</p>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button variant="default" onClick={() => setIsDialogOpen(false)}>I Have Scanned</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline">Open Side Sheet</Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>Customer 360 Context</SheetTitle>
                  </SheetHeader>
                  <div className="py-6 space-y-4 text-xs">
                    <div>
                      <span className="font-semibold text-[var(--ca-text-muted)] block mb-1">Customer Record:</span>
                      <p className="text-sm font-semibold">Active WhatsApp Lead</p>
                    </div>
                    <div>
                      <span className="font-semibold text-[var(--ca-text-muted)] block mb-1">WhatsApp Status:</span>
                      <Badge variant="success">Order Confirmed</Badge>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="secondary">Hover For Tooltip</Button>
                </TooltipTrigger>
                <TooltipContent>
                  <span>AI response configuration active</span>
                </TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">Options Menu ▾</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Instance Actions</DropdownMenuLabel>
                  <DropdownMenuItem>Refresh QR Code</DropdownMenuItem>
                  <DropdownMenuItem>Restart Bot Worker</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-[var(--ca-rose)]">Disconnect Instance</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="pt-4">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList aria-label="Design System Preview Tabs" className="mb-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="conversations">Conversations</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                  <Card className="p-6 text-sm text-[var(--ca-text-secondary)] border-[var(--ca-border-default)]">
                    Overview tab container demonstrating expressive BlackArrow feature summaries.
                  </Card>
                </TabsContent>
                <TabsContent value="conversations">
                  <Card className="p-6 text-sm text-[var(--ca-text-secondary)] border-[var(--ca-border-default)]">
                    Conversations tab container for active customer threads.
                  </Card>
                </TabsContent>
                <TabsContent value="settings">
                  <Card className="p-6 text-sm text-[var(--ca-text-secondary)] border-[var(--ca-border-default)]">
                    Settings tab container for AI persona and response rules.
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </section>

          {/* Section 6: Data Table */}
          <section className="space-y-6">
            <div className="border-b border-[var(--ca-border-subtle)] pb-3">
              <h3 className="text-2xl font-bold tracking-tight">6. Data Table Presentation</h3>
              <p className="text-xs text-[var(--ca-text-muted)] mt-1">Accessible data grid with hover highlighting and responsive scrolling.</p>
            </div>
            <div className="rounded-xl border border-[var(--ca-border-default)] overflow-hidden bg-[var(--ca-surface-1)]">
              <Table aria-label="Customer Lead Table">
                <TableHeader>
                  <TableRow className="bg-[var(--ca-surface-2)]">
                    <TableHead className="font-bold">Customer Lead</TableHead>
                    <TableHead className="font-bold">WhatsApp JID</TableHead>
                    <TableHead className="font-bold">Stage</TableHead>
                    <TableHead className="font-bold">AI Status</TableHead>
                    <TableHead className="text-right font-bold">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-semibold text-xs">Customer Lead A</TableCell>
                    <TableCell className="text-xs">+92 300 0000001</TableCell>
                    <TableCell><Badge variant="default">New Lead</Badge></TableCell>
                    <TableCell><Badge variant="success">Auto-Replying</Badge></TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm">Open Inbox</Button></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-xs">Customer Lead B</TableCell>
                    <TableCell className="text-xs">+92 300 0000002</TableCell>
                    <TableCell><Badge variant="success">Order Placed</Badge></TableCell>
                    <TableCell><Badge variant="secondary">Human Active</Badge></TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm">Open Inbox</Button></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Section 7: Banners & Toasts */}
          <section className="space-y-6">
            <div className="border-b border-[var(--ca-border-subtle)] pb-3">
              <h3 className="text-2xl font-bold tracking-tight">7. Banners & Notifications</h3>
              <p className="text-xs text-[var(--ca-text-muted)] mt-1">Alert banners and system toast notifications.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <Alert variant="default" className="border-[var(--ca-border-default)]">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>System Notice</AlertTitle>
                <AlertDescription>WhatsApp Web Baileys worker connected successfully.</AlertDescription>
              </Alert>
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Account Notice</AlertTitle>
                <AlertDescription>WhatsApp instance session active.</AlertDescription>
              </Alert>
            </div>
            <div className="grid gap-6 md:grid-cols-2 pt-2">
              <Toast variant="success" title="WhatsApp Connected" description="Instance bot_1 linked successfully." />
              <Toast variant="error" title="Connection Timeout" description="QR code pairing expired. Please refresh the QR code." />
            </div>
          </section>

          {/* Section 8: System Fallback States */}
          <section className="space-y-6">
            <div className="border-b border-[var(--ca-border-subtle)] pb-3">
              <h3 className="text-2xl font-bold tracking-tight">8. System Fallback States</h3>
              <p className="text-xs text-[var(--ca-text-muted)] mt-1">Deterministic state containers for empty, loading, error, and success feedback.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <EmptyState title="No Sequences Created" description="Create your first automated message sequence." actionLabel="Create Sequence" onAction={() => {}} />
              <LoadingState label="Synchronizing Customer 360..." />
              <ErrorState title="API Sync Failed" description="Could not connect to backend." onRetry={() => {}} />
              <SuccessState title="Settings Saved" description="AI persona rules updated successfully." />
            </div>
          </section>

          {/* Section 9: Skeletons & Progress */}
          <section className="space-y-6 pb-16">
            <div className="border-b border-[var(--ca-border-subtle)] pb-3">
              <h3 className="text-2xl font-bold tracking-tight">9. Animated Skeleton Placeholders</h3>
              <p className="text-xs text-[var(--ca-text-muted)] mt-1">Skeleton animation states during data loading.</p>
            </div>
            <div className="flex items-center space-x-5 p-6 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)]">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="space-y-2.5">
                <Skeleton className="h-4 w-[280px]" />
                <Skeleton className="h-4 w-[220px]" />
              </div>
            </div>
          </section>

        </main>
      </div>
    </TooltipProvider>
  );
}

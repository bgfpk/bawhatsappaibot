import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Button } from '../primitives/Button';
import { Field, Label, Input, Switch, Description, ErrorMessage } from '../primitives/Form';
import { Alert, StatusIndicator, ProgressIndicator, Skeleton } from '../primitives/Feedback';
import { Dialog, Drawer, Popover, DropdownMenu, DropdownMenuItem, Tooltip } from '../primitives/Overlays';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '../primitives/Table';

test('Primitives: Button renders correct semantic attributes', () => {
  const html = renderToString(
    <Button variant="primary" size="md" type="submit" isLoading loadingLabel="Submitting...">
      Save
    </Button>
  );

  assert.ok(html.includes('type="submit"'), 'Button must preserve explicit type');
  assert.ok(html.includes('aria-busy="true"'), 'Button loading state must set aria-busy');
  assert.ok(html.includes('Submitting...'), 'Button must render loading label');
  assert.ok(html.includes('disabled'), 'Loading button must be disabled');
});

test('Primitives: Icon-only Button defaults aria-label', () => {
  const html = renderToString(
    <Button variant="quiet" size="icon-only" aria-label="Settings">
      <span>⚙</span>
    </Button>
  );

  assert.ok(html.includes('aria-label="Settings"'), 'Icon-only button must set aria-label');
});

test('Primitives: Form Field & Label association', () => {
  const html = renderToString(
    <Field id="test-field-id" isRequired isInvalid>
      <Label>Username</Label>
      <Input />
      <Description>Choose a unique handle.</Description>
      <ErrorMessage>Username is taken.</ErrorMessage>
    </Field>
  );

  assert.ok(html.includes('for="test-field-id"'), 'Label must target field id');
  assert.ok(html.includes('id="test-field-id"'), 'Input must have assigned id');
  assert.ok(html.includes('aria-invalid="true"'), 'Invalid field must mark input aria-invalid');
  assert.ok(html.includes('aria-describedby='), 'Input must refer to description and error ids');
  assert.ok(html.includes('*</span>'), 'Required label must include asterisk indicator');
});

test('Primitives: Switch accessibility semantics', () => {
  const html = renderToString(
    <Switch checked={true} onChange={() => {}} label="Notifications" />
  );

  assert.ok(html.includes('role="switch"'), 'Switch must use role="switch"');
  assert.ok(html.includes('aria-checked="true"'), 'Checked switch must set aria-checked="true"');
});

test('Primitives: Feedback components ARIA roles', () => {
  const alertHtml = renderToString(<Alert severity="error" title="Error">Action failed</Alert>);
  assert.ok(alertHtml.includes('role="alert"'), 'Error alert must use role="alert"');

  const statusHtml = renderToString(<StatusIndicator status="Connected" />);
  assert.ok(statusHtml.includes('role="status"'), 'Status indicator must use role="status"');
  assert.ok(statusHtml.includes('Connected'), 'Status indicator must include visible text');

  const progressHtml = renderToString(<ProgressIndicator value={50} label="Uploading" />);
  assert.ok(progressHtml.includes('role="progressbar"'), 'Progress bar must use role="progressbar"');
  assert.ok(progressHtml.includes('aria-valuenow="50"'), 'Progress bar must indicate value');

  const skeletonHtml = renderToString(<Skeleton className="w-20 h-4" />);
  assert.ok(skeletonHtml.includes('aria-hidden="true"'), 'Skeleton must be hidden from accessibility tree');
});

test('Primitives: Overlays render correct accessibility roles', () => {
  const dialogHtml = renderToString(
    <Dialog isOpen={true} onClose={() => {}} title="Test Dialog">
      <p>Dialog body content</p>
    </Dialog>
  );

  assert.ok(dialogHtml.includes('role="dialog"'), 'Dialog must use role="dialog"');
  assert.ok(dialogHtml.includes('aria-modal="true"'), 'Dialog must set aria-modal="true"');
  assert.ok(dialogHtml.includes('Close dialog'), 'Close button must have aria-label');
});

test('Primitives: Popover & DropdownMenu render correct accessibility roles', () => {
  const popoverHtml = renderToString(
    <Popover isOpen={true} onClose={() => {}} ariaLabel="Quick Options" trigger={<button>Open</button>}>
      <p>Popover content</p>
    </Popover>
  );

  assert.ok(popoverHtml.includes('aria-haspopup="dialog"'), 'Popover trigger must set aria-haspopup="dialog"');
  assert.ok(popoverHtml.includes('role="dialog"'), 'Popover popup must set role="dialog"');

  const menuHtml = renderToString(
    <DropdownMenu isOpen={true} onClose={() => {}} ariaLabel="Actions Menu" trigger={<button>Options</button>}>
      <DropdownMenuItem>Edit</DropdownMenuItem>
      <DropdownMenuItem disabled>Delete</DropdownMenuItem>
    </DropdownMenu>
  );

  assert.ok(menuHtml.includes('aria-haspopup="menu"'), 'DropdownMenu trigger must set aria-haspopup="menu"');
  assert.ok(menuHtml.includes('role="menu"'), 'DropdownMenu container must set role="menu"');
  assert.ok(menuHtml.includes('role="menuitem"'), 'DropdownMenuItem must set role="menuitem"');
  assert.ok(menuHtml.includes('aria-disabled="true"'), 'Disabled menu item must set aria-disabled="true"');
});

test('Primitives: Table renders accessibility markup', () => {
  const tableHtml = renderToString(
    <Table caption="Users Table">
      <TableHeader>
        <TableRow>
          <TableCell>Name</TableCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Alice</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );

  assert.ok(tableHtml.includes('<caption class="sr-only">Users Table</caption>'), 'Table caption must be included');
});

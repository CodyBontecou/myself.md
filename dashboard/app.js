import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import { setNonce } from 'get-nonce';
import { Dialog } from 'radix-ui';
import {
  IconBrandApple,
  IconBrandGithub,
  IconDatabase,
  IconChartBar,
  IconListDetails,
  IconRobot,
  IconCloud,
  IconLogout,
  IconDotsVertical,
  IconRefresh,
  IconShieldCheck,
  IconDeviceMobile,
  IconChevronLeft,
  IconChevronRight,
  IconX,
  IconArrowUp,
  IconArrowDown,
} from '@tabler/icons-react';
import {
  FlexRender,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { api, initializeSession, hasSession, signIn, signOut } from './session.js';
import { Explorer } from './explorer.js';
import { ExportActivity } from './export-activity.js';
import { subscribeRoute, routeSnapshot, navigateRoute } from './navigation.js';
import { recordRoute } from './explorer-route.js';
import { Button } from './components/ui/button.js';
import { Badge } from './components/ui/badge.js';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './components/ui/card.js';
import { Input } from './components/ui/input.js';
import { Separator } from './components/ui/separator.js';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from './components/ui/sidebar.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu.js';
/** @typedef {import('./session.js').Workspace} Workspace */
/** @typedef {import('./session.js').StoredExport} StoredExport */
/** @typedef {'exports'|'explore'|'profiles'|'agents'} View */
/** @typedef {{title:string,description:string,label:string,action:()=>Promise<void>}} Confirmation */
const views = [
  { id: /** @type {const} */ ('exports'), title: 'Stored data', icon: IconDatabase },
  { id: /** @type {const} */ ('explore'), title: 'Explore data', icon: IconChartBar },
  { id: /** @type {const} */ ('profiles'), title: 'Profiles & permissions', icon: IconListDetails },
  { id: /** @type {const} */ ('agents'), title: 'Connected agents', icon: IconRobot },
];
/** @param {number} value */
function bytes(value) {
  return value < 1024 * 1024
    ? `${(value / 1024).toFixed(1)} KiB`
    : `${(value / 1024 / 1024).toFixed(1)} MiB`;
}
/** @param {Workspace} workspace @param {string} id */
function deviceName(workspace, id) {
  return workspace.devices.find((d) => d.id === id)?.name ?? 'Disconnected phone';
}
/** @param {{view:View,onNavigate:(view:View)=>void,workspace:Workspace|null,busy:boolean}} props */
function AppSidebar({ view, onNavigate, workspace, busy }) {
  const { setOpenMobile } = useSidebar();
  const navigate = (/** @type {View} */ next) => {
    onNavigate(next);
    setOpenMobile(false);
  };
  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              onClick={() => navigate('exports')}
            >
              <IconCloud className="size-5!" />
              <span className="text-base font-semibold">QR Connect</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {views.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={view === item.id}
                    aria-current={view === item.id ? 'page' : undefined}
                    onClick={() => navigate(item.id)}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Your cloud account</SidebarGroupLabel>
          <p className="px-2 text-xs leading-relaxed text-muted-foreground">
            The same data and permissions as QR Connect on your phone.
          </p>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" disabled={!workspace || busy}>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted font-semibold">
                    {workspace?.account.slice(0, 1).toUpperCase() ?? 'Q'}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {workspace?.account ?? 'Your workspace'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {workspace ? 'Personal account' : 'Sign in to continue'}
                    </span>
                  </div>
                  <IconDotsVertical className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-56">
                <DropdownMenuLabel>{workspace?.account}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}>
                  <IconLogout />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
/** @param {{title:string,busy:boolean,onRefresh:()=>void,authenticated:boolean}} props */
function SiteHeader({ title, busy, onRefresh, authenticated }) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="text-base font-medium">{title}</h1>
        {authenticated && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            aria-label="Refresh dashboard"
            disabled={busy}
            onClick={onRefresh}
          >
            <IconRefresh className={busy ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        )}
      </div>
    </header>
  );
}
/** @param {{workspace:Workspace}} props */
function SectionCards({ workspace }) {
  const total = workspace.exports.reduce((sum, item) => sum + item.bytes, 0);
  const cards = [
    {
      label: 'Cloud storage',
      value: bytes(total),
      badge: `${((total / 268435456) * 100).toFixed(1)}% used`,
      footer: '256 MiB account capacity',
      detail: 'Exports are encrypted at rest',
      icon: IconCloud,
    },
    {
      label: 'Stored exports',
      value: String(workspace.exports.length),
      badge: '30 days',
      footer: 'Daily snapshots from your phone',
      detail: 'Browse records or delete an export',
      icon: IconDatabase,
    },
    {
      label: 'Shared profiles',
      value: String(workspace.profiles.filter((p) => p.shared).length),
      badge: `${workspace.profiles.length} profiles`,
      footer: 'Available to allowed agents',
      detail: 'Your approved data selection applies',
      icon: IconShieldCheck,
    },
    {
      label: 'Allowed agents',
      value: String(workspace.agents.filter((a) => !a.blocked).length),
      badge: `${workspace.agents.filter((a) => a.blocked).length} blocked`,
      footer: 'Access is yours to control',
      detail: 'Connected OAuth clients on this account',
      icon: IconRobot,
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((item) => (
        <Card key={item.label} className="@container/card">
          <CardHeader>
            <CardDescription>{item.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {item.value}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <item.icon />
                {item.badge}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="flex gap-2 font-medium">{item.footer}</div>
            <div className="text-muted-foreground">{item.detail}</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
});
/** @typedef {{workspace:Workspace,busy:boolean,onView:(item:StoredExport)=>void,onDelete:(item:StoredExport)=>void}} TableActions */
const TableActionsContext = createContext(/** @type {TableActions|null} */ (null));
function useTableActions() {
  const actions = useContext(TableActionsContext);
  if (!actions) throw new Error('Missing table actions.');
  return actions;
}
/** @param {{row:{original:StoredExport}}} props */
function ProfileCell({ row }) {
  const { workspace } = useTableActions();
  return (
    <div>
      <span className="font-medium">{row.original.profileName}</span>
      <div className="text-xs text-muted-foreground">
        {deviceName(workspace, row.original.deviceId)}
      </div>
    </div>
  );
}
/** @param {{row:{original:StoredExport}}} props */
function FormatCell({ row }) {
  return <Badge variant="outline">{row.original.format.toUpperCase()}</Badge>;
}
/** @param {{row:{original:StoredExport}}} props */
function SizeCell({ row }) {
  return bytes(row.original.bytes);
}
/** @param {{row:{original:StoredExport}}} props */
function SharingCell({ row }) {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {row.original.shared ? 'Shared' : 'Private'}
    </Badge>
  );
}
/** @param {{row:{original:StoredExport}}} props */
function ActionsCell({ row }) {
  const { busy, onView, onDelete } = useTableActions();
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => onView(row.original)}>
        View records
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={`Actions for ${row.original.profileName} ${row.original.day}`}
          >
            <IconDotsVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(row.original)}>
            Delete export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
/** @type {import('@tanstack/react-table').ColumnDef<typeof features, StoredExport>[]} */
const columns = [
  {
    accessorKey: 'profileName',
    header: 'Profile',
    cell: ProfileCell,
  },
  { accessorKey: 'day', header: 'Export date' },
  {
    accessorKey: 'format',
    header: 'Format',
    cell: FormatCell,
  },
  {
    accessorKey: 'bytes',
    header: 'Size',
    cell: SizeCell,
  },
  {
    accessorKey: 'shared',
    header: 'Agent access',
    cell: SharingCell,
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ActionsCell,
  },
];
/** @param {TableActions} props */
function DataTable(props) {
  const { workspace } = props;
  const [filter, setFilter] = useState('');
  const [sorting, setSorting] = useState(
    /** @type {import('@tanstack/react-table').SortingState} */ ([]),
  );
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const data = workspace.exports.filter((item) =>
    `${item.profileName} ${item.day} ${item.format}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const table = useTable({
    features,
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId: (row) => row.id,
  });
  return (
    <TableActionsContext.Provider value={props}>
      <section className="flex flex-col gap-4 px-4 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted p-1">
            <span className="rounded-md bg-background px-3 py-1.5 text-sm font-medium shadow-xs">
              Export library{' '}
              <Badge variant="secondary" className="ml-2">
                {workspace.exports.length}
              </Badge>
            </span>
          </div>
          <Input
            aria-label="Search exports"
            placeholder="Filter profiles, dates, formats…"
            className="w-full sm:w-72"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPagination({ pageIndex: 0, pageSize: 10 });
            }}
          />
        </div>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableCaption className="sr-only">
              Stored cloud exports belonging to your account
            </TableCaption>
            <TableHeader className="bg-muted sticky top-0 z-10">
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                    >
                      {header.column.getCanSort() ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-3"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {<FlexRender header={header} />}
                          {header.column.getIsSorted() === 'asc' ? (
                            <IconArrowUp />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <IconArrowDown />
                          ) : null}
                        </Button>
                      ) : (
                        <FlexRender header={header} />
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id}>{<FlexRender cell={cell} />}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {filter
                      ? 'No exports match your search.'
                      : 'No cloud exports yet. Choose a cloud destination in the app, authorize uploads, and run an export.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="text-muted-foreground">{data.length} export(s) · encrypted at rest</div>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">
              Page {table.state.pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous export page"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <IconChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next export page"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <IconChevronRight />
            </Button>
          </div>
        </div>
      </section>
    </TableActionsContext.Provider>
  );
}
/** @param {{children:import('react').ReactNode,title:string,description:string,onClose:()=>void,wide?:boolean}} props */
function Modal({ children, title, description, onClose, wide = false }) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border bg-background p-6 shadow-lg outline-none ${wide ? 'max-w-6xl' : 'max-w-lg'}`}
        >
          <div className="pr-8">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {description}
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-4 top-4"
              aria-label="Close dialog"
            >
              <IconX />
            </Button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
/** @param {{workspace:Workspace,view:View,busy:boolean,onConfirm:(confirmation:Confirmation)=>void,onReload:()=>Promise<void>}} props */
function PermissionLists({ workspace, view, busy, onConfirm, onReload }) {
  return (
    <div className="px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {view === 'profiles' ? 'Cloud sharing permissions' : 'Connected agents'}
          </CardTitle>
          <CardDescription>
            {view === 'profiles'
              ? 'Control access to stored cloud exports. Changes use the same permissions as the app.'
              : 'Agents appear after their first MCP request. Block access at any time.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {view === 'profiles'
            ? workspace.profiles.map((profile) => (
                <div
                  key={`${profile.deviceId}/${profile.profileId}`}
                  className="flex flex-wrap items-center justify-between gap-4 py-5 first:pt-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium">{profile.name}</h2>
                      <Badge variant="outline">{profile.shared ? 'Shared' : 'Private'}</Badge>
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <IconDeviceMobile className="size-4" />
                      {deviceName(workspace, profile.deviceId)}
                    </p>
                    <p className="mt-3 break-words text-xs text-muted-foreground">
                      {Object.entries(profile.selection)
                        .flatMap(([domain, keys]) => keys.map((key) => `${domain} / ${key}`))
                        .join(' · ') || 'No data types selected'}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      Profile ID: {profile.profileId}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      onConfirm({
                        title: profile.shared ? 'Revoke cloud sharing?' : 'Share this profile?',
                        description: profile.shared
                          ? 'Agents will lose access to this profile’s stored exports. You can still view them here.'
                          : 'All allowed agents on your account will be able to read stored exports within the data selection shown for this profile.',
                        label: profile.shared ? 'Revoke sharing' : 'Allow agents',
                        action: async () => {
                          await api('/api/dashboard/permissions', 'PUT', {
                            deviceId: profile.deviceId,
                            profileId: profile.profileId,
                            shared: !profile.shared,
                          });
                          await onReload();
                        },
                      })
                    }
                  >
                    {profile.shared ? 'Revoke sharing' : 'Allow agents'}
                  </Button>
                </div>
              ))
            : workspace.agents.map((agent) => (
                <div
                  key={agent.client}
                  className="flex flex-wrap items-center justify-between gap-4 py-5 first:pt-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="break-all font-medium">{agent.client}</h2>
                      <Badge variant="outline">{agent.blocked ? 'Blocked' : 'Allowed'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last connection {new Date(agent.lastSeen).toLocaleString()}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {agent.blocked
                        ? 'All MCP access denied'
                        : 'Profile and live phone permissions apply'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      onConfirm({
                        title: agent.blocked ? 'Allow this agent?' : 'Block this agent?',
                        description: agent.blocked
                          ? 'This OAuth client will regain access to shared cloud profiles and explicitly permitted phone data.'
                          : 'This OAuth client will lose all MCP access for your account. Its pending live requests and retained responses will be discarded.',
                        label: agent.blocked ? 'Allow agent' : 'Block agent',
                        action: async () => {
                          await api('/api/dashboard/agents', 'PUT', {
                            client: agent.client,
                            blocked: !agent.blocked,
                          });
                          await onReload();
                        },
                      })
                    }
                  >
                    {agent.blocked ? 'Allow agent' : 'Block agent'}
                  </Button>
                </div>
              ))}
          {!(view === 'profiles' ? workspace.profiles.length : workspace.agents.length) && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {view === 'profiles'
                ? 'Authorize cloud uploads for a profile in the app to manage sharing here.'
                : 'Connect an agent to your cloud MCP server with this account to see it here.'}
            </p>
          )}
        </CardContent>
        <CardFooter className="border-t text-xs leading-relaxed text-muted-foreground">
          {view === 'profiles'
            ? 'Data selection, upload authorization, and live phone permissions are managed in the app.'
            : 'Agent names are OAuth client IDs. Blocks apply across the account; allowed agents can read shared profiles.'}
        </CardFooter>
      </Card>
    </div>
  );
}
/** @param {{ready:boolean}} props */
function LoginCard({ ready }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** @param {'apple'|'github'} provider */
  async function login(provider) {
    setBusy(true);
    setError('');
    try {
      await signIn(provider);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed. Please try again.');
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <IconCloud className="size-6" />
          </div>
          <CardTitle className="text-2xl">Sign in to your workspace</CardTitle>
          <CardDescription>Use the same account as QR Connect on your phone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="button"
            className="min-h-11 w-full border border-white bg-black text-white hover:bg-black/90"
            disabled={!ready || busy}
            onClick={() => void login('apple')}
          >
            <IconBrandApple aria-hidden="true" className="size-5" />
            Sign in with Apple
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            disabled={!ready || busy}
            onClick={() => void login('github')}
          >
            <IconBrandGithub aria-hidden="true" className="size-5" />
            Continue with GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
function App() {
  const [workspace, setWorkspace] = useState(/** @type {Workspace|null} */ (null));
  const [view, setView] = useState(/** @type {View} */ ('exports'));
  const search = useSyncExternalStore(subscribeRoute, routeSnapshot);
  const query = new URLSearchParams(search);
  const exportId = query.get('export');
  const exploring = Boolean(exportId) || query.has('explore');
  const [confirmation, setConfirmation] = useState(/** @type {Confirmation|null} */ (null));
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [updated, setUpdated] = useState('');
  async function reload() {
    const data = await api('/api/dashboard');
    setWorkspace(/** @type {Workspace} */ (data));
    setUpdated(new Date().toISOString());
  }
  /** @param {()=>Promise<void>} action */
  async function run(action) {
    setBusy(true);
    setNotice('');
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Request failed. Please try again.');
      if (!hasSession()) {
        setWorkspace(null);
      }
    } finally {
      setBusy(false);
    }
  }
  const expire = useCallback(() => {
    setWorkspace(null);
    setNotice('Your session expired. Please sign in again.');
  }, []);
  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const authenticated = await initializeSession();
        if (authenticated) {
          const data = await api('/api/dashboard');
          if (active) {
            setWorkspace(/** @type {Workspace} */ (data));
            setUpdated(new Date().toISOString());
          }
        }
      } catch (error) {
        if (active)
          setNotice(error instanceof Error ? error.message : 'Sign-in could not be completed.');
      } finally {
        if (active) {
          setReady(true);
          setBusy(false);
        }
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, []);
  const title = exploring
    ? 'Data explorer'
    : (views.find((item) => item.id === view)?.title ?? 'Stored data');
  return (
    <SidebarProvider className="dashboard-layout">
      <AppSidebar
        view={exploring ? 'explore' : view}
        onNavigate={(next) => {
          navigateRoute(next === 'explore' ? '?explore=1' : '');
          setView(next);
        }}
        workspace={workspace}
        busy={busy}
      />
      <SidebarInset>
        <SiteHeader
          title={title}
          busy={busy}
          authenticated={Boolean(workspace)}
          onRefresh={() => {
            void run(reload);
          }}
        />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              {notice && (
                <div role="status" className="mx-4 rounded-lg border bg-muted p-4 text-sm lg:mx-6">
                  {notice}
                </div>
              )}
              {workspace ? (
                <>
                  {exploring ? (
                    <Explorer
                      workspace={workspace}
                      search={search}
                      updated={updated}
                      onExpired={expire}
                    />
                  ) : (
                    <>
                      <SectionCards workspace={workspace} />
                      {view === 'exports' ? (
                        <>
                          <div className="px-4 lg:px-6">
                            <ExportActivity workspace={workspace} asOf={updated} />
                          </div>
                          <DataTable
                            workspace={workspace}
                            busy={busy}
                            onView={(item) => navigateRoute(recordRoute(item.id))}
                            onDelete={(item) =>
                              setConfirmation({
                                title: 'Delete this export?',
                                description: `${item.profileName} · ${item.day} · ${item.format.toUpperCase()}. This permanently removes the cloud file. Phone files are kept. A future scheduled upload can recreate it.`,
                                label: 'Delete export',
                                action: async () => {
                                  await api(`/api/dashboard/exports/${item.id}`, 'DELETE');
                                  await reload();
                                },
                              })
                            }
                          />
                        </>
                      ) : (
                        <PermissionLists
                          workspace={workspace}
                          view={view}
                          busy={busy}
                          onConfirm={setConfirmation}
                          onReload={reload}
                        />
                      )}
                    </>
                  )}
                  <p className="px-4 text-center text-xs text-muted-foreground lg:px-6">
                    Updated {new Date(updated).toLocaleTimeString()} · Stored exports remain
                    available while your phone is offline.
                  </p>
                </>
              ) : (
                <LoginCard ready={ready} />
              )}
            </div>
          </div>
        </div>
      </SidebarInset>
      {confirmation && (
        <Modal
          title={confirmation.title}
          description={confirmation.description}
          onClose={() => setConfirmation(null)}
        >
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const action = confirmation.action;
                setConfirmation(null);
                void run(action);
              }}
            >
              {confirmation.label}
            </Button>
          </div>
        </Modal>
      )}
    </SidebarProvider>
  );
}
const nonce = document.querySelector('meta[name="style-nonce"]')?.getAttribute('content');
if (nonce) setNonce(nonce);
const root = document.getElementById('root');
if (!root) throw new Error('Dashboard root is missing.');
createRoot(root).render(<App />);

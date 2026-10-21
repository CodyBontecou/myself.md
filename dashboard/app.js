import { ProfileEditor } from './profile-editor.js';
import { AccountError } from './account-error.js';
import { AnalyticsReport } from './analytics-report.js';
import { initializeWebAnalytics, trackWebAnalytics } from './analytics.js';
import { createMyselfClient } from './public-client.js';
import { registerPublicTools } from './webmcp.js';

import { errorJSON } from '../packages/support-chat/errors.js';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import { providerLogos } from '../server/provider-logos.js';
import { setNonce } from 'get-nonce';
import { Dialog } from 'radix-ui';
import {
  IconUser,
  IconDatabase,
  IconListDetails,
  IconRobot,
  IconCloud,
  IconHeart,
  IconClock,
  IconMapPin,
  IconLock,
  IconChevronDown,
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
import { AccountDeletion } from './account-deletion.js';
import { MigrationClaim } from './migration-claim.js';
import { cloudUsageLabel } from '../core/cloud-allowance.js';
import { CloudStorageCard, cloudStorageSummary } from './cloud-storage.js';
import { deviceName } from './workspace.js';
import { DatasetDocumentation } from './dataset-documentation.js';
import { Landing } from './landing.js';
import { GettingStarted } from './getting-started.js';
import { Explorer } from './explorer.js';
import { HistoryView } from './history.js';
import { ExportActivity } from './export-activity.js';
import { subscribeRoute, routeSnapshot, navigateRoute } from './navigation.js';
import { recordRoute } from './explorer-route.js';
import { Button } from './components/ui/button.js';
import { Badge } from './components/ui/badge.js';
import {
  Card,
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
/** @typedef {import('./workspace.js').Workspace} Workspace */
/** @typedef {import('./workspace.js').StoredExport} StoredExport */
/** @typedef {'start'|'exports'|'explore'|'profiles'|'agents'|'history'} View */
/** @typedef {{title:string,description:string,label:string,action:()=>Promise<void>}} Confirmation */
const views = [
  {
    id: /** @type {const} */ ('start'),
    title: 'Start',
    description: 'Connect your assistant and phone, then ask your first question.',
  },
  {
    id: /** @type {const} */ ('exports'),
    title: 'Files',
    description: 'Browse files exported from your phone and explore the records inside.',
  },
  {
    id: /** @type {const} */ ('history'),
    title: 'History',
    description: 'Review exports and agent access. Open an event to see what happened.',
  },
  {
    id: /** @type {const} */ ('explore'),
    title: 'Explore',
    description: 'Find records in your exports, compare them in charts and inspect their details.',
  },
  {
    id: /** @type {const} */ ('profiles'),
    title: 'Profiles',
    description: 'Choose what to export and control the data your assistants can read.',
  },
  {
    id: /** @type {const} */ ('agents'),
    title: 'Agents',
    description: 'Review connected assistants and manage their access to your workspace.',
  },
];
/** @param {number} value */
function bytes(value) {
  return value < 1024 * 1024
    ? `${(value / 1024).toFixed(1)} KiB`
    : `${(value / 1024 / 1024).toFixed(1)} MiB`;
}
/** @param {{view:View,onNavigate:(view:View)=>void,workspace:Workspace|null,busy:boolean}} props */
function AppSidebar({ view, onNavigate, workspace, busy }) {
  const { setOpenMobile } = useSidebar();
  const [operator, setOperator] = useState(false);
  useEffect(() => {
    if (!workspace) return;
    let active = true;
    void api('/api/analytics/access')
      .then((result) => {
        if (active) setOperator(/** @type {{operator:boolean}} */ (result).operator);
        return undefined;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [workspace]);
  const profile = workspace?.accountProfile;
  const accountName = profile?.name || profile?.email || 'Your account';
  const accountEmail = profile?.email || 'Personal account';
  const navigate = (/** @type {View} */ next) => {
    onNavigate(next);
    setOpenMobile(false);
  };
  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <a href="/">
                <BrandWordmark />
              </a>
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
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <nav className="flex gap-4 px-2 text-xs underline" aria-label="Privacy">
          <a href="/privacy">Privacy</a>
        </nav>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" disabled={!workspace || busy}>
                  <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted font-semibold">
                    {profile?.name || profile?.email ? (
                      accountName.slice(0, 1).toUpperCase()
                    ) : (
                      <IconUser className="size-4" aria-hidden="true" />
                    )}
                    {profile?.picture && (
                      <img
                        src={profile.picture}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 size-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {workspace ? accountName : 'Your workspace'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {workspace ? accountEmail : 'Sign in to continue'}
                    </span>
                  </div>
                  <IconDotsVertical className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-56">
                <DropdownMenuLabel className="grid gap-1">
                  <span className="truncate">{accountName}</span>
                  {profile?.email && (
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {profile.email}
                    </span>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    void api('/api/account-logins')
                      .then((result) => {
                        const logins = /** @type {{handoff:{url:string}}} */ (result);
                        location.assign(logins.handoff.url);
                        return null;
                      })
                      .catch((error) =>
                        window.alert(
                          error instanceof Error
                            ? error.message
                            : 'Connected logins could not open.',
                        ),
                      );
                  }}
                >
                  Connected logins
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => window.dispatchEvent(new Event('myself-analytics-preferences'))}
                >
                  Analytics preferences
                </DropdownMenuItem>
                {operator && (
                  <DropdownMenuItem asChild>
                    <a href="/operator/analytics">Product analytics</a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <a href="/delete-account">Delete account</a>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={signOut}>
                  <IconLogout /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
function BrandWordmark() {
  return (
    <span className="dashboard-wordmark text-xl font-semibold tracking-[-0.8px] text-foreground">
      myself<span className="text-muted-foreground">.md</span>
    </span>
  );
}
/** @param {{title:string,busy:boolean,onRefresh:()=>void,workspace:Workspace|null,view:View}} props */
function SiteHeader({ title, busy, onRefresh, workspace, view }) {
  return (
    <header className="dashboard-header flex min-h-(--header-height) shrink-0 items-center gap-2 border-b">
      <div className="flex w-full min-w-0 items-center gap-2 px-4 py-2 lg:px-6">
        <SidebarTrigger className="-ml-1 size-11 shrink-0 lg:size-7" />
        <Separator
          orientation="vertical"
          className="mx-2 hidden data-[orientation=vertical]:h-4 lg:block"
        />
        <a href="/" aria-label="myself.md home">
          <BrandWordmark />
        </a>
        {workspace && (
          <span className="ml-4 hidden truncate border-l pl-4 text-sm font-medium text-muted-foreground lg:block">
            {title}
          </span>
        )}
        {workspace && view !== 'start' && (
          <div className="ml-auto hidden lg:block">
            <SummaryPills workspace={workspace} view={view} />
          </div>
        )}

        {workspace && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto size-11 shrink-0 sm:w-auto lg:ml-0 lg:h-8"
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
/** @param {{workspace:Workspace,view:View,compact?:boolean}} props */
function SummaryPills({ workspace, view, compact = false }) {
  const storage = workspace.cloudStorage;
  const shared = workspace.profiles.filter((profile) => profile.shared).length;
  const allowed = workspace.agents.filter((agent) => !agent.blocked).length;
  const pills =
    view === 'profiles'
      ? [
          {
            label: `${shared} shared`,
            detail: `${shared} of ${workspace.profiles.length} profiles shared with allowed agents`,
            icon: IconShieldCheck,
          },
          {
            label: `${workspace.profiles.length} profiles`,
            detail: 'Total export profiles',
            icon: IconListDetails,
          },
        ]
      : view === 'agents'
        ? [
            {
              label: `${allowed} allowed`,
              detail: 'Agents allowed to access shared profiles',
              icon: IconRobot,
            },
            {
              label: `${workspace.agents.length - allowed} blocked`,
              detail: 'Agents with access blocked',
              icon: IconLock,
            },
          ]
        : [
            {
              label: `${workspace.exports.length} files`,
              detail: 'Stored export files',
              icon: IconDatabase,
            },
            {
              label: storage
                ? storage.eligible
                  ? cloudUsageLabel(storage)
                  : 'No active Cloud subscription'
                : 'Cloud storage unavailable',
              detail: storage
                ? cloudStorageSummary(storage)
                : 'Sign in to the app to subscribe to Cloud or restore access',
              icon: IconCloud,
            },
          ];
  return (
    <div
      aria-label="Workspace summary"
      className={
        compact ? 'flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground' : 'flex gap-2'
      }
    >
      {pills.map(({ label, detail, icon: Icon }) =>
        compact ? (
          <span
            key={label}
            title={detail}
            aria-label={`${label}: ${detail}`}
            className="tabular-nums"
          >
            {label}
          </span>
        ) : (
          <Badge
            key={label}
            variant="outline"
            title={detail}
            aria-label={`${label}: ${detail}`}
            className="rounded-full px-2.5 py-1 tabular-nums"
          >
            <Icon aria-hidden="true" /> {label}
          </Badge>
        ),
      )}
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
/** @param {TableActions & {selectedDays:string[]}} props */
function DataTable(props) {
  const { workspace, selectedDays } = props;
  const [filter, setFilter] = useState('');
  const [sorting, setSorting] = useState(
    /** @type {import('@tanstack/react-table').SortingState} */ ([]),
  );
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const dateKey = selectedDays.join(',');
  const [previousDateKey, setPreviousDateKey] = useState(dateKey);
  if (previousDateKey !== dateKey) {
    setPreviousDateKey(dateKey);
    setPagination({ pageIndex: 0, pageSize: 10 });
  }
  const data = workspace.exports.filter(
    (item) =>
      (!selectedDays.length || selectedDays.includes(item.day)) &&
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
                {data.length}
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
                          <FlexRender header={header} />
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
                      <TableCell key={cell.id}>
                        <FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {filter || selectedDays.length
                      ? 'No exports match your selected dates and search.'
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
/** @param {string} key */
function selectionLabel(key) {
  return key
    .replace(/^native:/, '')
    .replace(/^HK(?:Quantity|Category|Correlation|Data)TypeIdentifier/, '')
    .replace(/^HK(Workout|StateOfMind)TypeIdentifier$/, '$1')
    .replace(/^HK/, '')
    .replace(/Type$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
/** @param {{selection:Record<string,string[]>}} props */
function ProfileSelection({ selection }) {
  const groups = [
    { domain: 'health', label: 'Health', icon: IconHeart },
    { domain: 'time', label: 'Time', icon: IconClock },
    { domain: 'location', label: 'Location', icon: IconMapPin },
  ];
  return (
    <div className="grid items-start gap-3 md:grid-cols-3">
      {groups.map(({ domain, label, icon: Icon }) => {
        const keys = (selection[domain] ?? []).filter((key) => key.startsWith('native:'));
        const native = keys.filter((key) => key.startsWith('native:')).length;
        return (
          <div key={domain} className="min-w-0 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              {label}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {keys.length} selected
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {keys.length
                ? [native ? `${native} device ${native === 1 ? 'type' : 'types'}` : '']
                    .filter(Boolean)
                    .join(' · ')
                : 'No data selected'}
            </p>
            {keys.length > 0 && (
              <details className="group mt-3">
                <summary
                  aria-label={`View selected ${label.toLowerCase()} types`}
                  className="flex cursor-pointer list-none items-center justify-between rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
                >
                  View selected types
                  <IconChevronDown
                    className="size-4 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <ul
                  aria-label={`${label} export selection`}
                  className="mt-3 max-h-64 space-y-2 overflow-y-auto border-t pt-3"
                >
                  {keys.map((key) => (
                    <li key={key} className="flex items-start justify-between gap-2 text-xs">
                      <span className="min-w-0 break-words">{selectionLabel(key)}</span>
                      <span className="shrink-0 text-muted-foreground">Device</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
/** @param {{workspace:Workspace,view:View,busy:boolean,onConfirm:(confirmation:Confirmation)=>void,onReload:()=>Promise<void>}} props */
function PermissionLists({ workspace, view, busy, onConfirm, onReload }) {
  const [editing, setEditing] = useState('');
  const [refreshError, setRefreshError] = useState('');
  useEffect(() => {
    if (view !== 'profiles') return;
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || refreshing) return;
      refreshing = true;
      try {
        await onReload();
        if (active) setRefreshError('');
      } catch {
        if (active)
          setRefreshError('Could not refresh profile status. Showing the last saved snapshot.');
      } finally {
        refreshing = false;
      }
    };
    const timer = setInterval(() => void refresh(), 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [view, onReload]);
  const [suggestion, setSuggestion] = useState(
    /** @type {import('../server/profile-sync.js').ProfileRequest|undefined} */ (undefined),
  );
  return (
    <div className="px-4 lg:px-6">
      <Card>
        {refreshError && (
          <p role="status" className="px-6 pb-4 text-sm text-muted-foreground">
            {refreshError}
          </p>
        )}
        <CardContent className="divide-y">
          {view === 'profiles'
            ? workspace.profiles.map((profile) => (
                <div
                  key={`${profile.deviceId}/${profile.profileId}`}
                  className="space-y-5 py-6 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-lg font-semibold">{profile.name}</h2>
                        <Badge variant={profile.shared ? 'secondary' : 'outline'}>
                          {profile.shared ? (
                            <IconCloud aria-hidden="true" />
                          ) : (
                            <IconLock aria-hidden="true" />
                          )}
                          {profile.shared ? 'Agents enabled' : 'Agents disabled'}
                        </Badge>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                        <IconDeviceMobile className="size-4" />
                        {deviceName(workspace, profile.deviceId)}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {profile.shared
                          ? 'Agent permissions control these cloud exports. Turning a category off blocks its data; turning it back on restores access to selected data after your phone syncs.'
                          : 'Only you can view these stored exports. Agent access is off.'}
                      </p>
                      <div
                        className="mt-3 flex flex-wrap gap-2"
                        aria-label="Profile agent permission status"
                      >
                        {
                          /** @type {const} */ (['health', 'time', 'location']).map((domain) => (
                            <Badge
                              key={domain}
                              variant={
                                profile.permissionsSynced && profile.agentPermissions?.[domain]
                                  ? 'secondary'
                                  : 'outline'
                              }
                            >
                              {domain === 'health'
                                ? 'Health'
                                : domain === 'time'
                                  ? 'Screen time'
                                  : 'Location'}
                              :{' '}
                              {profile.permissionsSynced
                                ? profile.agentPermissions?.[domain]
                                  ? 'On'
                                  : 'Off'
                                : 'Unknown — sync phone'}
                            </Badge>
                          ))
                        }
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {profile.lastSeen
                          ? `Phone last synced ${new Date(profile.lastSeen).toLocaleString()}. `
                          : ''}
                        {profile.revision && profile.confirmedRevision !== profile.revision
                          ? 'Changes saved on web; waiting for this phone to sync.'
                          : profile.syncSupported
                            ? 'Profile is synced. Open myself.md on this phone to receive new changes.'
                            : 'Update and open the phone app to enable profile editing and synchronization.'}
                      </p>
                    </div>
                  </div>
                  {profile.profile && profile.syncSupported && (
                    <div className="space-y-3">
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setSuggestion(undefined);
                          setEditing(`${profile.deviceId}/${profile.profileId}`);
                        }}
                      >
                        Edit profile
                      </Button>
                      {profile.requests
                        ?.filter((r) => r.status === 'awaiting_user')
                        .map((request) => (
                          <div key={request.id} className="rounded-md border p-3 text-sm">
                            An agent suggested changes to this profile. Nothing has been applied.{' '}
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSuggestion(request);
                                setEditing(`${profile.deviceId}/${profile.profileId}`);
                              }}
                            >
                              Review suggestion
                            </Button>
                          </div>
                        ))}
                      {editing === `${profile.deviceId}/${profile.profileId}` && (
                        <ProfileEditor
                          key={`${editing}/${suggestion?.id ?? ''}`}
                          entry={profile}
                          suggestion={suggestion}
                          onConfirm={onConfirm}
                          onSaved={onReload}
                          onCancel={() => setEditing('')}
                        />
                      )}
                    </div>
                  )}
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Selected export data</h3>
                    <ProfileSelection selection={profile.selection} />
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <p>
                      Edit synced profile settings here or in myself.md. System permissions are
                      managed on the phone.
                    </p>
                    <p className="break-all">Profile ID: {profile.profileId}</p>
                  </div>
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
                          ? 'This agent will regain access to already-shared cloud profiles and explicitly permitted phone data. The agent and its AI providers use their own privacy and retention policies and may keep copies. Blocking it later stops future access; it cannot recall copies already received.'
                          : 'This agent will lose all MCP access for your account. Its pending live requests and responses retained by myself.md will be discarded. Blocking it cannot recall copies already received by the agent or its AI providers.',
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
                ? 'Open myself.md on a connected phone to sync its profiles here.'
                : 'Connect an agent to your cloud MCP server with this account to see it here.'}
            </p>
          )}
        </CardContent>
        <CardFooter className="border-t text-xs leading-relaxed text-muted-foreground">
          {view === 'profiles'
            ? 'Profiles sync between web and phone. System permissions, destination authorization and automatic-export opt-in are managed on the phone.'
            : 'Agent names are OAuth client IDs. Blocks apply across the account; allowed agents can read shared profiles.'}
        </CardFooter>
      </Card>
    </div>
  );
}
/** @param {{ready:boolean,notice?:string}} props */
function LoginCard({ ready, notice = '' }) {
  const standalone = ['/login', '/login/'].includes(location.pathname);
  const clientLogin = standalone && new URLSearchParams(location.search).has('client_id');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** @param {'apple'|'github'|'google'|'reviewer'} provider */
  async function login(provider) {
    setBusy(true);
    setError('');
    try {
      await signIn(provider);
    } catch (reason) {
      setError(errorJSON(reason));
      setBusy(false);
    }
  }
  return (
    <div className="dashboard-sign-in flex min-h-full flex-1 flex-col bg-background">
      {standalone && (
        <header className="flex min-h-14 shrink-0 items-center border-b bg-background px-5 sm:px-8">
          <BrandWordmark />
        </header>
      )}
      <div
        className={`flex flex-1 flex-col items-center justify-start px-4 py-6 sm:justify-center sm:px-6 sm:py-12 ${standalone ? 'min-h-[calc(100svh-3.5rem)]' : ''}`}
      >
        <Card className="w-full max-w-[440px] gap-5 rounded-[20px] border-border bg-card py-6 sm:gap-6 sm:py-8 text-card-foreground shadow-[0_4px_24px_rgb(0_0_0/0.03)]">
          <CardHeader className="gap-2 px-5 sm:gap-3 sm:px-8">
            <CardTitle className="text-2xl leading-tight tracking-[-0.8px] sm:text-[26px]">
              <h1>Sign in to myself.md</h1>
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Use the same account as the myself.md app to keep your exports and purchases together.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-5 sm:space-y-6 sm:px-8">
            {(error || notice) && (
              <AccountError
                error={error || notice}
                actionHref={clientLogin ? null : '/login'}
                actionLabel="Start sign-in again"
              />
            )}
            <div className="space-y-2.5">
              {
                /** @type {const} */ (['apple', 'github', 'google']).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    className="grid min-h-12 w-full touch-manipulation select-none active:bg-accent grid-cols-[20px_1fr_20px] items-center gap-2 rounded-[9px] border border-input text-foreground px-3 py-3 sm:gap-3 sm:px-[18px] text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-current disabled:pointer-events-none disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent"
                    disabled={!ready || busy}
                    onClick={() => void login(provider)}
                  >
                    <span
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: providerLogos[provider] }}
                    />
                    <span>
                      Continue with{' '}
                      {provider === 'github' ? 'GitHub' : provider === 'apple' ? 'Apple' : 'Google'}
                    </span>
                  </button>
                ))
              }
            </div>
            <nav
              className="flex flex-wrap items-center justify-between gap-x-4 text-[13px] text-muted-foreground"
              aria-label="Other sign-in options"
            >
              <button
                type="button"
                className="min-h-11 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-current disabled:pointer-events-none disabled:opacity-50"
                disabled={!ready || busy}
                onClick={() => void login('reviewer')}
              >
                Reviewer sign-in
              </button>
              <a
                href="/"
                className="flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-current"
              >
                Back to myself.md
              </a>
            </nav>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
function App() {
  const [workspace, setWorkspace] = useState(/** @type {Workspace|null} */ (null));
  const search = useSyncExternalStore(subscribeRoute, routeSnapshot);
  const query = new URLSearchParams(search);
  const view = query.has('history')
    ? 'history'
    : query.get('view') === 'profiles'
      ? 'profiles'
      : query.get('view') === 'agents'
        ? 'agents'
        : query.get('view') === 'start' || (!query.has('view') && !workspace?.devices.length)
          ? 'start'
          : 'exports';
  const viewingWorkspace = Boolean(workspace);
  useEffect(() => {
    if (viewingWorkspace) trackWebAnalytics('dashboard_viewed', view);
  }, [view, viewingWorkspace]);
  const exportId = query.get('export');
  const exploring = Boolean(exportId) || query.has('explore');
  const [confirmation, setConfirmation] = useState(/** @type {Confirmation|null} */ (null));
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [updated, setUpdated] = useState('');
  const [selectedDays, setSelectedDays] = useState(/** @type {string[]} */ ([]));
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
      setNotice(errorJSON(error));
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
        if (active) setNotice(errorJSON(error));
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
  const currentView = views.find((item) => item.id === (exploring ? 'explore' : view));
  const title = currentView?.title ?? 'Files';
  if (!workspace && ['/login', '/login/'].includes(location.pathname))
    return <LoginCard ready={ready} notice={notice} />;
  return (
    <SidebarProvider className="dashboard-layout">
      <AppSidebar
        view={exploring ? 'explore' : view}
        onNavigate={(next) => {
          navigateRoute(
            next === 'explore'
              ? '?explore=1'
              : next === 'history'
                ? '?history=1'
                : next === 'profiles' || next === 'agents' || next === 'start'
                  ? `?view=${next}`
                  : '?view=exports',
          );
        }}
        workspace={workspace}
        busy={busy}
      />
      <SidebarInset>
        <SiteHeader
          title={title}
          busy={busy}
          workspace={workspace}
          view={exploring ? 'explore' : view}
          onRefresh={() => {
            void run(reload);
          }}
        />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div
              className={
                workspace ? 'flex flex-col gap-4 py-4 md:gap-6 md:py-6' : 'flex flex-1 flex-col'
              }
            >
              {workspace && view !== 'start' && (
                <div className="px-4 lg:hidden">
                  <SummaryPills workspace={workspace} view={exploring ? 'explore' : view} compact />
                </div>
              )}
              {notice && (
                <div className="mx-4 lg:mx-6">
                  <AccountError error={notice} />
                </div>
              )}
              {workspace ? (
                <>
                  {(view !== 'start' || exploring) && currentView && (
                    <header className="dashboard-view-heading">
                      <div>
                        <h1>{title}</h1>
                        <p>{currentView.description}</p>
                      </div>
                    </header>
                  )}
                  {exploring ? (
                    <Explorer
                      workspace={workspace}
                      search={search}
                      updated={updated}
                      onExpired={expire}
                    />
                  ) : (
                    <>
                      {view === 'start' ? (
                        <GettingStarted workspace={workspace} />
                      ) : view === 'history' ? (
                        <HistoryView
                          workspace={workspace}
                          search={search}
                          updated={updated}
                          onExpired={expire}
                        />
                      ) : view === 'exports' ? (
                        <>
                          {workspace.cloudStorage && (
                            <div className="px-4 lg:px-6">
                              <CloudStorageCard
                                key={workspace.account}
                                account={workspace.account}
                                storage={workspace.cloudStorage}
                              />
                            </div>
                          )}
                          <div className="px-4 lg:px-6">
                            <ExportActivity
                              workspace={workspace}
                              asOf={updated}
                              selectedDays={selectedDays}
                              onSelectionChange={setSelectedDays}
                            />
                          </div>
                          <DataTable
                            selectedDays={selectedDays}
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
                  {view !== 'start' && (
                    <p className="px-4 text-center text-xs text-muted-foreground lg:px-6">
                      {`Updated ${new Date(updated).toLocaleTimeString()} · Stored exports remain available while your phone is offline.`}
                    </p>
                  )}
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
function pageSnapshot() {
  return location.pathname;
}
function Page() {
  const pathname = useSyncExternalStore(subscribeRoute, pageSnapshot);
  const datasetRoute = pathname.match(/^\/datasets(?:\/(health|screen-time|location|all))?\/?$/);
  const dataset = datasetRoute ? (datasetRoute[1] ?? 'all') : null;
  return pathname === '/' ? (
    <Landing />
  ) : pathname === '/operator/analytics' ? (
    <AnalyticsReport />
  ) : pathname === '/delete-account' ||
    (pathname === '/dashboard/callback' && sessionStorage.getItem('myself-delete-account')) ? (
    <AccountDeletion />
  ) : pathname === '/claim' ||
    (['/dashboard', '/dashboard/callback'].includes(pathname) &&
      sessionStorage.getItem('myself-migration-ticket')) ? (
    <MigrationClaim />
  ) : dataset ? (
    <DatasetDocumentation key={pathname} dataset={dataset} />
  ) : (
    <App />
  );
}
createRoot(root).render(<Page />);
initializeWebAnalytics();

const browserContext =
  /** @type {Document & {modelContext?:import('./webmcp.js').ModelContext}} */ (document)
    .modelContext ??
  /** @type {Navigator & {modelContext?:import('./webmcp.js').ModelContext}} */ (navigator)
    .modelContext;
void registerPublicTools(browserContext, createMyselfClient({ origin: location.origin })).catch(
  () => {
    console.warn('Public browser tools could not be registered. Use /mcp or /docs.');
  },
);

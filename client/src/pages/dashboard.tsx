import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  TrendingUp,
  TrendingDown,
  Wallet,
  Target,
  Upload,
  FileSpreadsheet,
  Users,
  ExternalLink,
  RefreshCw,
  Filter,
  ChevronDown,
} from "lucide-react";
import { formatBDT } from "@/lib/format";
import type { Client } from "@shared/schema";

const addClientSchema = z.object({
  clientId: z.coerce.number().min(1, "Client ID is required"),
  name: z.string().min(1, "Name is required"),
  status: z.string().default("Inactive"),
  executive: z.string().min(1, "Executive is required"),
  adsAccount: z.string().default(""),
  googleSheetUrl: z.string().optional(),
  balance: z.string().default("0"),
  totalDue: z.string().default("0"),
  campaignDue: z.string().default("0"),
});

const importSheetSchema = z.object({
  url: z.string().min(1, "Sheet URL is required").url("Must be a valid URL"),
});

type Stats = {
  totalBalance: string;
  totalOutstanding: string;
  totalPayReceived: string;
  totalCampaignDue: string;
  totalClients: number;
  activeCount: number;
  inactiveCount: number;
  holdCount: number;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "Active") {
    return <Badge data-testid={`badge-status-active`}>{status}</Badge>;
  }
  if (status === "Hold") {
    return (
      <Badge variant="secondary" data-testid={`badge-status-hold`}>
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" data-testid={`badge-status-inactive`}>
      {status}
    </Badge>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
}: {
  title: string;
  value: string;
  icon: any;
  subtitle?: string;
}) {
  const num = parseFloat(value);
  const isNegative = num < 0;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-1">
          <div className="space-y-1">
            <p
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              data-testid={`text-stat-label-${title.toLowerCase().replace(/\s/g, "-")}`}
            >
              {title}
            </p>
            <p
              className={`text-xl font-bold font-mono ${isNegative ? "text-destructive" : ""}`}
              data-testid={`text-stat-value-${title.toLowerCase().replace(/\s/g, "-")}`}
            >
              {formatBDT(value)}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-accent text-accent-foreground">
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [numField, setNumField] = useState<"balance" | "totalDue" | "campaignDue">("balance");
  const [numOp, setNumOp] = useState<"gt" | "lt" | "eq" | "gte" | "lte">("gt");
  const [numValue, setNumValue] = useState("");
  const [showAddClient, setShowAddClient] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const { toast } = useToast();

  const { data: allClients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const addClientForm = useForm<z.infer<typeof addClientSchema>>({
    resolver: zodResolver(addClientSchema),
    defaultValues: {
      clientId: 0,
      name: "",
      status: "Inactive",
      executive: "",
      adsAccount: "",
      googleSheetUrl: "",
      balance: "0",
      totalDue: "0",
      campaignDue: "0",
    },
  });

  const importForm = useForm<z.infer<typeof importSheetSchema>>({
    resolver: zodResolver(importSheetSchema),
    defaultValues: { url: "" },
  });

  const createClientMutation = useMutation({
    mutationFn: async (data: z.infer<typeof addClientSchema>) => {
      const res = await apiRequest("POST", "/api/clients", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setShowAddClient(false);
      addClientForm.reset();
      toast({ title: "Client added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add client", description: error.message, variant: "destructive" });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async (filter?: string) => {
      const res = await apiRequest("POST", "/api/sync-all", filter ? { filter } : {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Sync complete",
        description: `${data.succeeded} synced, ${data.failed} failed, ${data.skipped} skipped out of ${data.total} clients`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: z.infer<typeof importSheetSchema>) => {
      const res = await apiRequest("POST", "/api/import-sheet", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setShowImport(false);
      importForm.reset();
      toast({
        title: "Import complete",
        description: `${data.imported} new, ${data.updated} updated out of ${data.total} clients`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const numFilterActive = numValue !== "";
  const filteredClients = allClients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      String(client.clientId).includes(search) ||
      client.executive.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || client.status === statusFilter;
    if (!matchesSearch || !matchesStatus) return false;
    if (numFilterActive) {
      const val = parseFloat(client[numField] || "0");
      const target = parseFloat(numValue);
      if (isNaN(target)) return true;
      switch (numOp) {
        case "gt": return val > target;
        case "lt": return val < target;
        case "eq": return val === target;
        case "gte": return val >= target;
        case "lte": return val <= target;
      }
    }
    return true;
  }).sort((a, b) => a.clientId - b.clientId);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-6 pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage your ad campaign clients
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center">
              <Button
                variant="secondary"
                onClick={() => syncAllMutation.mutate('active-hold')}
                disabled={syncAllMutation.isPending}
                data-testid="button-sync-active"
                className="rounded-r-none border-r"
              >
                <RefreshCw className={`w-4 h-4 ${syncAllMutation.isPending ? "animate-spin" : ""}`} />
                {syncAllMutation.isPending ? "Syncing..." : "Sync Active & Hold"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    className="rounded-l-none px-2"
                    disabled={syncAllMutation.isPending}
                    data-testid="button-sync-dropdown"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => syncAllMutation.mutate('active-hold')}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Sync Active & Hold
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => syncAllMutation.mutate()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Sync All Clients
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowImport(true)}
              data-testid="button-import-sheet"
            >
              <Upload className="w-4 h-4" />
              Import Sheet
            </Button>
            <Button
              onClick={() => setShowAddClient(true)}
              data-testid="button-add-client"
            >
              <Plus className="w-4 h-4" />
              Add Client
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {statsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-7 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Balance"
              value={stats.totalBalance}
              icon={Wallet}
              subtitle={`${stats.totalClients} clients`}
            />
            <StatCard
              title="Outstanding"
              value={stats.totalOutstanding}
              icon={TrendingDown}
            />
            <StatCard
              title="Pay Received"
              value={stats.totalPayReceived}
              icon={TrendingUp}
              subtitle={`${stats.activeCount} active`}
            />
            <StatCard
              title="Campaign Due"
              value={stats.totalCampaignDue}
              icon={Target}
              subtitle={`${stats.holdCount} on hold`}
            />
          </div>
        ) : null}

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 w-64"
                placeholder="Search clients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-all">
                  All ({allClients.length})
                </TabsTrigger>
                <TabsTrigger value="Active" data-testid="tab-active">
                  Active
                </TabsTrigger>
                <TabsTrigger value="Inactive" data-testid="tab-inactive">
                  Inactive
                </TabsTrigger>
                <TabsTrigger value="Hold" data-testid="tab-hold">
                  Hold
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={numFilterActive ? "default" : "outline"} size="sm" data-testid="button-num-filter">
                  <Filter className="w-4 h-4 mr-1" />
                  {numFilterActive
                    ? `${numField === "balance" ? "Balance" : numField === "totalDue" ? "Total Due" : "Campaign Due"} ${numOp === "gt" ? ">" : numOp === "lt" ? "<" : numOp === "eq" ? "=" : numOp === "gte" ? ">=" : "<="} ${numValue}`
                    : "Value Filter"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Filter by value</p>
                  <Select value={numField} onValueChange={(v: any) => setNumField(v)}>
                    <SelectTrigger data-testid="select-num-field">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="balance">Balance</SelectItem>
                      <SelectItem value="totalDue">Total Due</SelectItem>
                      <SelectItem value="campaignDue">Campaign Due</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Select value={numOp} onValueChange={(v: any) => setNumOp(v)}>
                      <SelectTrigger className="w-24" data-testid="select-num-op">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gt">&gt;</SelectItem>
                        <SelectItem value="lt">&lt;</SelectItem>
                        <SelectItem value="eq">=</SelectItem>
                        <SelectItem value="gte">&gt;=</SelectItem>
                        <SelectItem value="lte">&lt;=</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="0"
                      value={numValue}
                      onChange={(e) => setNumValue(e.target.value)}
                      data-testid="input-num-value"
                    />
                  </div>
                  {numFilterActive && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setNumValue("")} data-testid="button-clear-num-filter">
                      Clear filter
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-sm text-muted-foreground">
            <Users className="w-4 h-4 inline mr-1" />
            {filteredClients.length} client{filteredClients.length !== 1 ? "s" : ""}
          </p>
        </div>

        {clientsLoading ? (
          <Card>
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </Card>
        ) : filteredClients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-4">
                <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1" data-testid="text-empty-title">
                No clients found
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
                {search || statusFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "Add your first client or import from a Google Sheet"}
              </p>
              {!search && statusFilter === "all" && (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setShowImport(true)}
                    data-testid="button-empty-import"
                  >
                    <Upload className="w-4 h-4" />
                    Import Sheet
                  </Button>
                  <Button
                    onClick={() => setShowAddClient(true)}
                    data-testid="button-empty-add"
                  >
                    <Plus className="w-4 h-4" />
                    Add Client
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Total Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Executive</TableHead>
                  <TableHead className="hidden lg:table-cell">Ads Account</TableHead>
                  <TableHead className="w-12">Sheet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => {
                  const bal = parseFloat(client.balance) || 0;
                  const due = parseFloat(client.totalDue) || 0;
                  return (
                    <TableRow
                      key={client.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/clients/${client.id}`)}
                      data-testid={`row-client-${client.id}`}
                    >
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {client.clientId}
                      </TableCell>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${bal < 0 ? "text-destructive" : ""}`}
                      >
                        {formatBDT(client.balance)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${due < 0 ? "text-destructive" : ""}`}
                      >
                        {formatBDT(client.totalDue)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={client.status} />
                      </TableCell>
                      <TableCell className="text-sm">{client.executive}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[180px] truncate">
                        {client.adsAccount}
                      </TableCell>
                      <TableCell>
                        {client.googleSheetUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            data-testid={`button-sheet-${client.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(client.googleSheetUrl!, "_blank");
                            }}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <Dialog open={showAddClient} onOpenChange={setShowAddClient}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>Enter the client details below. Optionally link a client sheet for transaction sync.</DialogDescription>
          </DialogHeader>
          <Form {...addClientForm}>
            <form
              onSubmit={addClientForm.handleSubmit((data) =>
                createClientMutation.mutate(data)
              )}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={addClientForm.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client ID</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="1403"
                          {...field}
                          data-testid="input-client-id"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addClientForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Client name"
                          {...field}
                          data-testid="input-client-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={addClientForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                          <SelectItem value="Hold">Hold</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addClientForm.control}
                  name="executive"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Executive</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Jisan"
                          {...field}
                          data-testid="input-executive"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={addClientForm.control}
                name="adsAccount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ads Account</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. RAFSHAN KHAN TSA"
                        {...field}
                        data-testid="input-ads-account"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addClientForm.control}
                name="googleSheetUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Sheet URL (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        {...field}
                        data-testid="input-google-sheet-url"
                      />
                    </FormControl>
                    <FormMessage />
                    <div className="rounded-md border bg-muted/50 p-2.5 space-y-1.5 mt-2" data-testid="example-client-sheet">
                      <p className="text-xs font-semibold text-muted-foreground">Expected client sheet format (PNL tab):</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px] border-collapse">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-1 font-medium text-muted-foreground">A: Date</th>
                              <th className="text-left p-1 font-medium text-muted-foreground">B: BDT</th>
                              <th className="text-left p-1 font-medium text-muted-foreground">C: USD</th>
                              <th className="text-left p-1 font-medium text-muted-foreground">D: Platform</th>
                              <th className="text-left p-1 font-medium text-muted-foreground">E: Remaining</th>
                              <th className="text-left p-1 font-medium text-muted-foreground">F: Spend</th>
                              <th className="text-left p-1 font-medium text-muted-foreground">G: Note</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono">
                            <tr className="border-b border-dashed text-muted-foreground">
                              <td className="p-1" colSpan={3}>Row 1: Header</td>
                              <td className="p-1" colSpan={4}></td>
                            </tr>
                            <tr className="border-b border-dashed text-muted-foreground">
                              <td className="p-1"></td>
                              <td className="p-1"></td>
                              <td className="p-1"></td>
                              <td className="p-1 font-semibold">D2: Balance</td>
                              <td className="p-1" colSpan={3}></td>
                            </tr>
                            <tr className="border-b border-dashed text-muted-foreground">
                              <td className="p-1" colSpan={7}>Row 3: Column titles</td>
                            </tr>
                            <tr className="border-b border-dashed">
                              <td className="p-1">08/03/26</td>
                              <td className="p-1">1500</td>
                              <td className="p-1">0</td>
                              <td className="p-1">Facebook</td>
                              <td className="p-1 italic text-muted-foreground">formula</td>
                              <td className="p-1 italic text-muted-foreground">formula</td>
                              <td className="p-1">bkash</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-muted-foreground">D2 = BDT balance. Data from Row 4. Columns E-F are formulas (not overwritten).</p>
                    </div>
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={createClientMutation.isPending}
                data-testid="button-submit-client"
              >
                {createClientMutation.isPending ? "Adding..." : "Add Client"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import from Dashboard Sheet</DialogTitle>
            <DialogDescription>
              Paste your main client list Google Sheet URL to bulk import all clients. The sheet should have a tab named <strong>"Client Dashboard"</strong> (or use the first tab).
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/50 p-3 space-y-2" data-testid="example-dashboard-sheet">
            <p className="text-xs font-semibold text-muted-foreground">Expected sheet format (Client Dashboard tab):</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-1.5 font-medium text-muted-foreground">A: Client ID</th>
                    <th className="text-left p-1.5 font-medium text-muted-foreground">B: Name</th>
                    <th className="text-left p-1.5 font-medium text-muted-foreground">C: (unused)</th>
                    <th className="text-left p-1.5 font-medium text-muted-foreground">D: Balance</th>
                    <th className="text-left p-1.5 font-medium text-muted-foreground">E: Campaign Due</th>
                    <th className="text-left p-1.5 font-medium text-muted-foreground">F: (unused)</th>
                    <th className="text-left p-1.5 font-medium text-muted-foreground">G: Status</th>
                    <th className="text-left p-1.5 font-medium text-muted-foreground">H: Executive</th>
                    <th className="text-left p-1.5 font-medium text-muted-foreground">I: Ads Account</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <tr className="border-b border-dashed">
                    <td className="p-1.5">1001</td>
                    <td className="p-1.5">Rafshan Khan</td>
                    <td className="p-1.5">-</td>
                    <td className="p-1.5">15000</td>
                    <td className="p-1.5">5000</td>
                    <td className="p-1.5">-</td>
                    <td className="p-1.5">Active</td>
                    <td className="p-1.5">Jisan</td>
                    <td className="p-1.5">RAFSHAN TSA</td>
                  </tr>
                  <tr className="border-b border-dashed">
                    <td className="p-1.5">1002</td>
                    <td className="p-1.5">Alam Trading</td>
                    <td className="p-1.5">-</td>
                    <td className="p-1.5">8500</td>
                    <td className="p-1.5">3000</td>
                    <td className="p-1.5">-</td>
                    <td className="p-1.5">Hold</td>
                    <td className="p-1.5">Saif</td>
                    <td className="p-1.5">ALAM TSA</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Row 1 = header row, Row 2 = column titles, Data starts from Row 3. Status must be Active, Inactive, or Hold.</p>
          </div>
          <Form {...importForm}>
            <form
              onSubmit={importForm.handleSubmit((data) =>
                importMutation.mutate(data)
              )}
              className="space-y-4"
            >
              <FormField
                control={importForm.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dashboard Sheet URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        {...field}
                        data-testid="input-import-url"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={importMutation.isPending}
                data-testid="button-submit-import"
              >
                {importMutation.isPending ? "Importing..." : "Import Clients"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

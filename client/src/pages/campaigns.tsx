import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RefreshCw, Search, Filter, Loader2, AlertCircle, ArrowUpDown, ChevronDown } from "lucide-react";
import { SiFacebook, SiGoogleads, SiTiktok } from "react-icons/si";
import { queryClient } from "@/lib/queryClient";

interface AdAccountSafe {
  id: number;
  platform: string;
  accountId: string;
  accountName: string;
  status: string;
  hasToken: boolean;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  objective?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  accountId: number;
  accountName: string;
  platform: string;
}

interface CampaignsResponse {
  campaigns: CampaignRow[];
  errors: Array<{ accountId: number; accountName: string; error: string }>;
  totalAccounts: number;
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  switch (platform) {
    case "facebook": return <SiFacebook className={`${className || "w-4 h-4"} text-blue-600`} />;
    case "google": return <SiGoogleads className={`${className || "w-4 h-4"} text-yellow-600`} />;
    case "tiktok": return <SiTiktok className={`${className || "w-4 h-4"}`} />;
    default: return null;
  }
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  if (normalized === "ACTIVE" || normalized === "ENABLE") return <Badge variant="default" className="bg-green-600">{status}</Badge>;
  if (normalized === "PAUSED" || normalized === "DISABLE") return <Badge variant="secondary">{status}</Badge>;
  if (normalized === "REMOVED" || normalized === "ARCHIVED" || normalized === "DELETED") return <Badge variant="destructive">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

type SortField = "name" | "status" | "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "accountName";
type SortDir = "asc" | "desc";

export default function Campaigns() {
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: accounts, isError: accountsError } = useQuery<AdAccountSafe[]>({
    queryKey: ["/api/ad-accounts"],
  });

  const queryString = selectedAccountIds.length > 0 ? `?accounts=${selectedAccountIds.join(",")}` : "";
  const { data, isLoading, isFetching, isError: campaignsError, error: campaignsErrorMsg, refetch } = useQuery<CampaignsResponse>({
    queryKey: ["/api/campaigns", selectedAccountIds.join(",")],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns${queryString}`);
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
    enabled: (accounts?.length || 0) > 0,
    staleTime: 60_000,
  });

  const allSelected = selectedAccountIds.length === 0 || selectedAccountIds.length === (accounts?.length || 0);

  const toggleAccount = (id: number) => {
    if (!accounts) return;
    if (selectedAccountIds.length === 0) {
      setSelectedAccountIds(accounts.filter(a => a.id !== id).map(a => a.id));
    } else {
      const next = selectedAccountIds.includes(id) ? selectedAccountIds.filter(a => a !== id) : [...selectedAccountIds, id];
      if (next.length === accounts.length) {
        setSelectedAccountIds([]);
      } else {
        setSelectedAccountIds(next);
      }
    }
  };

  const selectAll = () => {
    if (allSelected) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds([]);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const statuses = useMemo(() => {
    if (!data?.campaigns) return [];
    return [...new Set(data.campaigns.map(c => c.status))].sort();
  }, [data?.campaigns]);

  const accountNames = useMemo(() => {
    if (!data?.campaigns) return [];
    return [...new Set(data.campaigns.map(c => c.accountName))].sort();
  }, [data?.campaigns]);

  const filtered = useMemo(() => {
    if (!data?.campaigns) return [];
    let list = data.campaigns;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.accountName.toLowerCase().includes(q) || c.objective?.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      list = list.filter(c => c.status.toUpperCase() === statusFilter.toUpperCase());
    }
    if (platformFilter !== "all") {
      list = list.filter(c => c.platform === platformFilter);
    }

    list = [...list].sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case "name": aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case "status": aVal = a.status; bVal = b.status; break;
        case "accountName": aVal = a.accountName.toLowerCase(); bVal = b.accountName.toLowerCase(); break;
        case "spend": aVal = parseFloat(a.spend || "0"); bVal = parseFloat(b.spend || "0"); break;
        case "impressions": aVal = parseInt(a.impressions || "0"); bVal = parseInt(b.impressions || "0"); break;
        case "clicks": aVal = parseInt(a.clicks || "0"); bVal = parseInt(b.clicks || "0"); break;
        case "ctr": aVal = parseFloat(a.ctr || "0"); bVal = parseFloat(b.ctr || "0"); break;
        case "cpc": aVal = parseFloat(a.cpc || "0"); bVal = parseFloat(b.cpc || "0"); break;
        default: aVal = a.name; bVal = b.name;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [data?.campaigns, search, statusFilter, platformFilter, sortField, sortDir]);

  const totalSpend = useMemo(() =>
    filtered.reduce((sum, c) => sum + parseFloat(c.spend || "0"), 0),
    [filtered]
  );

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`w-3 h-3 ${sortField === field ? "text-foreground" : "text-muted-foreground/50"}`} />
      </div>
    </TableHead>
  );

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-7xl mx-auto space-y-4" data-testid="page-campaigns">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Campaigns</h1>
            <p className="text-sm text-muted-foreground">
              View and filter campaigns across all your ad accounts
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
              refetch();
            }}
            disabled={isFetching}
            data-testid="button-refresh-campaigns"
          >
            {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search campaigns..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-campaigns"
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1" data-testid="button-account-filter">
                <Filter className="w-3.5 h-3.5" />
                Accounts
                {selectedAccountIds.length > 0 && selectedAccountIds.length < (accounts?.length || 0) && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{selectedAccountIds.length}</Badge>
                )}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <div className="p-3 border-b">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Filter by account</p>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
                    {allSelected ? "Deselect all" : "Select all"}
                  </Button>
                </div>
              </div>
              <ScrollArea className="max-h-60">
                <div className="p-2 space-y-1">
                  {accounts?.map(acct => (
                    <label
                      key={acct.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                      data-testid={`checkbox-account-${acct.id}`}
                    >
                      <Checkbox
                        checked={selectedAccountIds.length === 0 ? true : selectedAccountIds.includes(acct.id)}
                        onCheckedChange={() => toggleAccount(acct.id)}
                      />
                      <PlatformIcon platform={acct.platform} className="w-3.5 h-3.5" />
                      <span className="text-sm truncate">{acct.accountName || acct.accountId}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-platform-filter">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="google">Google Ads</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {data?.errors && data.errors.length > 0 && (
          <div className="space-y-2">
            {data.errors.map(err => (
              <div key={err.accountId} className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-sm">
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-destructive font-medium">{err.accountName}:</span>
                <span className="text-muted-foreground">{err.error}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span data-testid="text-campaign-count">{filtered.length} campaign{filtered.length !== 1 ? "s" : ""}</span>
          <span>Total spend: ${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          {data && <span>from {data.totalAccounts} account{data.totalAccounts !== 1 ? "s" : ""}</span>}
        </div>

        {(accountsError || campaignsError) ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
              <AlertCircle className="w-10 h-10 text-destructive" />
              <div className="text-center">
                <h3 className="font-semibold">Failed to load campaigns</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {(campaignsErrorMsg as Error)?.message || "Could not connect to the server. Please try again."}
                </p>
              </div>
              <Button variant="outline" onClick={() => refetch()} data-testid="button-retry-campaigns">
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !accounts || accounts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <AlertCircle className="w-10 h-10 text-muted-foreground" />
              <div className="text-center">
                <h3 className="font-semibold">No ad accounts connected</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Go to Ad Accounts to connect your Facebook, Google, or TikTok accounts first.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : filtered.length === 0 && !isFetching ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
              <Search className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No campaigns match your filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-lg">
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader field="name">Campaign</SortHeader>
                    <SortHeader field="status">Status</SortHeader>
                    <TableHead>Objective</TableHead>
                    <SortHeader field="accountName">Account</SortHeader>
                    <SortHeader field="spend"><div className="text-right w-full">Spend</div></SortHeader>
                    <SortHeader field="impressions"><div className="text-right w-full">Impressions</div></SortHeader>
                    <SortHeader field="clicks"><div className="text-right w-full">Clicks</div></SortHeader>
                    <SortHeader field="ctr"><div className="text-right w-full">CTR</div></SortHeader>
                    <SortHeader field="cpc"><div className="text-right w-full">CPC</div></SortHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c, i) => (
                    <TableRow key={`${c.id}-${c.accountId}-${i}`} data-testid={`row-campaign-${c.id}`}>
                      <TableCell className="font-medium max-w-[220px] truncate">{c.name}</TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">{c.objective || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <PlatformIcon platform={c.platform} className="w-3.5 h-3.5" />
                          <span className="text-sm truncate max-w-[140px]">{c.accountName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{c.spend ? `$${parseFloat(c.spend).toLocaleString()}` : "-"}</TableCell>
                      <TableCell className="text-right">{c.impressions ? parseInt(c.impressions).toLocaleString() : "-"}</TableCell>
                      <TableCell className="text-right">{c.clicks ? parseInt(c.clicks).toLocaleString() : "-"}</TableCell>
                      <TableCell className="text-right">{c.ctr ? `${c.ctr}%` : "-"}</TableCell>
                      <TableCell className="text-right">{c.cpc ? `$${c.cpc}` : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, RefreshCw, Trash2, Loader2, BarChart3, Eye, EyeOff, AlertCircle, Zap, CheckCircle2, LogIn } from "lucide-react";
import { SiFacebook, SiGoogleads, SiTiktok } from "react-icons/si";
import { useLocation } from "wouter";

interface AdAccountSafe {
  id: number;
  platform: string;
  accountId: string;
  accountName: string;
  status: string;
  hasToken: boolean;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudget?: string;
  lifetimeBudget?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
}

interface CampaignData {
  account: { id: string; name: string; currency: string; timezone?: string; status?: string; spend?: string };
  campaigns: Campaign[];
}

const PLATFORM_CONFIG: Record<string, { label: string; icon: any; color: string; idLabel: string; idPlaceholder: string; tokenLabel: string; tokenHelp: string }> = {
  facebook: {
    label: "Facebook / Meta",
    icon: SiFacebook,
    color: "text-blue-600",
    idLabel: "Ad Account ID",
    idPlaceholder: "e.g. 123456789 or act_123456789",
    tokenLabel: "Access Token",
    tokenHelp: "Get from Meta Business Settings > System Users > Generate Token",
  },
  google: {
    label: "Google Ads",
    icon: SiGoogleads,
    color: "text-yellow-600",
    idLabel: "Customer ID",
    idPlaceholder: "e.g. 123-456-7890",
    tokenLabel: "OAuth Access Token",
    tokenHelp: "Generate via Google Ads API OAuth flow",
  },
  tiktok: {
    label: "TikTok Ads",
    icon: SiTiktok,
    color: "text-black dark:text-white",
    idLabel: "Advertiser ID",
    idPlaceholder: "e.g. 7123456789",
    tokenLabel: "Access Token",
    tokenHelp: "Get from TikTok Marketing API > App Management",
  },
};

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) return null;
  const Icon = config.icon;
  return <Icon className={`${className || "w-5 h-5"} ${config.color}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    connected: "default",
    error: "destructive",
    disconnected: "secondary",
  };
  return <Badge variant={variants[status] || "outline"} data-testid={`badge-status-${status}`}>{status}</Badge>;
}

function CampaignStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  if (normalized === "ACTIVE" || normalized === "ENABLE") return <Badge variant="default" className="bg-green-600">{status}</Badge>;
  if (normalized === "PAUSED" || normalized === "DISABLE") return <Badge variant="secondary">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function FacebookLoginButton({ size = "default" }: { size?: "default" | "lg" }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { data: fbStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/facebook/status"],
  });

  const handleLogin = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/facebook/login");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Error", description: data.message || "Could not start Facebook login", variant: "destructive" });
        setLoading(false);
      }
    } catch {
      toast({ title: "Error", description: "Failed to connect to server", variant: "destructive" });
      setLoading(false);
    }
  };

  if (fbStatus && !fbStatus.configured) {
    return null;
  }

  return (
    <Button
      onClick={handleLogin}
      disabled={loading}
      size={size}
      className="bg-[#1877F2] hover:bg-[#166FE5] text-white gap-2"
      data-testid="button-facebook-login"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SiFacebook className="w-4 h-4" />}
      Login with Facebook
    </Button>
  );
}

function QuickConnectDialog() {
  const [platform, setPlatform] = useState<"facebook" | "tiktok">("facebook");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ad-accounts/discover", {
        platform,
        accessToken: accessToken.trim(),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/ad-accounts"] });
      if (data.added > 0) {
        toast({ title: `${data.added} account${data.added > 1 ? 's' : ''} connected!` });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Connection Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setResult(null);
      setAccessToken("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button data-testid="button-quick-connect" size="lg" className="gap-2">
          <Zap className="w-4 h-4" />
          Quick Connect
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Quick Connect — Auto-discover Accounts
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-800 dark:text-green-200">
                  Found {result.discovered} account{result.discovered !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-green-700 dark:text-green-300">
                  {result.added} added{result.skipped > 0 ? `, ${result.skipped} already connected` : ""}
                </p>
              </div>
            </div>

            {result.accounts?.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Connected accounts:</p>
                {result.accounts.map((a: any) => (
                  <div key={a.accountId} className="flex items-center gap-3 p-3 rounded-lg border">
                    <PlatformIcon platform={a.platform} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{a.accountName}</p>
                      <p className="text-xs text-muted-foreground">ID: {a.accountId}</p>
                    </div>
                    {a.currency && <Badge variant="outline">{a.currency}</Badge>}
                  </div>
                ))}
              </div>
            )}

            <Button className="w-full" onClick={() => handleClose(false)} data-testid="button-done">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Paste your access token and we'll automatically find and connect all your ad accounts.
            </p>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Platform</label>
              <Select value={platform} onValueChange={(v: any) => setPlatform(v)}>
                <SelectTrigger data-testid="select-discover-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="facebook">
                    <span className="flex items-center gap-2">
                      <SiFacebook className="w-4 h-4 text-blue-600" /> Facebook / Meta
                    </span>
                  </SelectItem>
                  <SelectItem value="tiktok">
                    <span className="flex items-center gap-2">
                      <SiTiktok className="w-4 h-4" /> TikTok Ads
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Access Token</label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  placeholder="Paste your access token here"
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  className="pr-10"
                  data-testid="input-discover-token"
                />
                <Button
                  type="button" variant="ghost" size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {platform === "facebook"
                  ? "Get from Meta Business Settings → System Users → Generate Token with ads_read permission"
                  : "Get from TikTok Marketing API → App Management → Access Token"}
              </p>
            </div>

            <Button
              className="w-full"
              onClick={() => discoverMutation.mutate()}
              disabled={discoverMutation.isPending || !accessToken.trim()}
              data-testid="button-discover"
            >
              {discoverMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Discovering accounts...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Connect All Accounts
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManualAddDialog() {
  const [platform, setPlatform] = useState("facebook");
  const [accountId, setAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const config = PLATFORM_CONFIG[platform];

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ad-accounts", {
        platform, accountId: accountId.trim(), accountName: accountName.trim(), accessToken: accessToken.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account added" });
      queryClient.invalidateQueries({ queryKey: ["/api/ad-accounts"] });
      setOpen(false);
      setAccountId(""); setAccountName(""); setAccessToken("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-add-manual">
          <Plus className="w-4 h-4 mr-1" /> Add Manually
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Account Manually</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Platform</label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger data-testid="select-platform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLATFORM_CONFIG).map(([key, val]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <PlatformIcon platform={key} className="w-4 h-4" /> {val.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">{config.idLabel}</label>
            <Input placeholder={config.idPlaceholder} value={accountId} onChange={e => setAccountId(e.target.value)} data-testid="input-account-id" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Account Name (optional)</label>
            <Input placeholder="e.g. My Business Account" value={accountName} onChange={e => setAccountName(e.target.value)} data-testid="input-account-name" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">{config.tokenLabel}</label>
            <div className="relative">
              <Input type={showToken ? "text" : "password"} placeholder="Paste your access token" value={accessToken} onChange={e => setAccessToken(e.target.value)} className="pr-10" data-testid="input-access-token" />
              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowToken(!showToken)}>
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{config.tokenHelp}</p>
          </div>
          <Button className="w-full" onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !accountId.trim() || !accessToken.trim()} data-testid="button-save-account">
            {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Connect Account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CampaignView({ account }: { account: AdAccountSafe }) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<CampaignData>({
    queryKey: ["/api/ad-accounts", account.id, "campaigns"],
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-view-campaigns-${account.id}`}>
          <BarChart3 className="w-4 h-4 mr-1" /> Campaigns
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlatformIcon platform={account.platform} />
            {data?.account?.name || account.accountName || account.accountId}
            {data?.account?.currency && <Badge variant="outline">{data.account.currency}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-lg">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Failed to load campaigns</p>
              <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : (
          <>
            {data?.account && (
              <div className="flex gap-4 flex-wrap mb-2">
                {data.account.status && <div className="text-sm"><span className="text-muted-foreground">Status:</span> {data.account.status}</div>}
                {data.account.timezone && <div className="text-sm"><span className="text-muted-foreground">Timezone:</span> {data.account.timezone}</div>}
                {data.account.spend && <div className="text-sm"><span className="text-muted-foreground">Total Spend:</span> ${parseFloat(data.account.spend).toLocaleString()}</div>}
              </div>
            )}
            <ScrollArea className="max-h-[50vh]">
              {data?.campaigns && data.campaigns.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Objective</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Clicks</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">CPC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.campaigns.map(c => (
                      <TableRow key={c.id} data-testid={`row-campaign-${c.id}`}>
                        <TableCell className="font-medium max-w-[200px] truncate">{c.name}</TableCell>
                        <TableCell><CampaignStatusBadge status={c.status} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.objective || "-"}</TableCell>
                        <TableCell className="text-right">{c.spend ? `$${parseFloat(c.spend).toLocaleString()}` : "-"}</TableCell>
                        <TableCell className="text-right">{c.impressions ? parseInt(c.impressions).toLocaleString() : "-"}</TableCell>
                        <TableCell className="text-right">{c.clicks ? parseInt(c.clicks).toLocaleString() : "-"}</TableCell>
                        <TableCell className="text-right">{c.ctr ? `${c.ctr}%` : "-"}</TableCell>
                        <TableCell className="text-right">{c.cpc ? `$${c.cpc}` : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No campaigns found in this account.</p>
              )}
            </ScrollArea>
            <div className="flex justify-between items-center pt-2 border-t">
              <p className="text-xs text-muted-foreground">{data?.campaigns?.length || 0} campaigns</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-campaigns">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FacebookSettingsCard() {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const { data: settings, refetch } = useQuery<{ appId: string; hasSecret: boolean; fromEnv: boolean }>({
    queryKey: ["/api/facebook/settings"],
  });

  useEffect(() => {
    if (settings) {
      setAppId(settings.appId || "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/facebook/settings", {
        appId: appId.trim(),
        appSecret: appSecret.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Facebook credentials saved" });
      setAppSecret("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/facebook/settings");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Facebook credentials removed" });
      setAppId("");
      setAppSecret("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isConfigured = settings?.appId && settings?.hasSecret;

  return (
    <Card>
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SiFacebook className="w-5 h-5 text-[#1877F2]" />
            Facebook App Settings
            {isConfigured && <Badge variant="default" className="bg-green-600 text-xs">Configured</Badge>}
            {!isConfigured && <Badge variant="secondary" className="text-xs">Not Set</Badge>}
          </div>
          <span className="text-muted-foreground text-sm">{expanded ? "▲" : "▼"}</span>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {settings?.fromEnv && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-sm">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <span className="text-blue-800 dark:text-blue-200">Credentials are loaded from environment variables.</span>
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Facebook App ID</label>
            <Input
              placeholder="e.g. 2263228397534581"
              value={appId}
              onChange={e => setAppId(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Facebook App Secret</label>
            <div className="relative">
              <Input
                type={showSecret ? "text" : "password"}
                placeholder={settings?.hasSecret ? "••••••••••••••• (saved)" : "Paste your App Secret"}
                value={appSecret}
                onChange={e => setAppSecret(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button" variant="ghost" size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Get from Meta Developers → Your App → Settings → Basic → App Secret
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !appId.trim() || (!appSecret.trim() && !settings?.hasSecret)}
              className="bg-[#1877F2] hover:bg-[#166FE5] text-white"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Save Credentials
            </Button>
            {isConfigured && (
              <Button
                variant="outline"
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" /> Remove
              </Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
            <p className="font-medium">Setup instructions:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Go to <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="text-blue-600 underline">Meta Developers</a> and create/select your app</li>
              <li>Copy the App ID and App Secret from Settings → Basic</li>
              <li>Under Facebook Login → Settings, add your redirect URI</li>
              <li>Add required permissions: ads_read, ads_management, business_management</li>
            </ol>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function AdAccounts() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fbSuccess = params.get("fb_success");
    const fbError = params.get("fb_error");
    const discovered = params.get("discovered");
    const added = params.get("added");

    if (fbSuccess) {
      toast({
        title: "Facebook connected!",
        description: `Found ${discovered || 0} ad account${discovered !== "1" ? "s" : ""}, ${added || 0} newly added.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ad-accounts"] });
      window.history.replaceState({}, "", "/ad-accounts");
    }
    if (fbError) {
      toast({ title: "Facebook login failed", description: decodeURIComponent(fbError), variant: "destructive" });
      window.history.replaceState({}, "", "/ad-accounts");
    }
  }, []);

  const { data: accounts, isLoading } = useQuery<AdAccountSafe[]>({
    queryKey: ["/api/ad-accounts"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/ad-accounts/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Account removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/ad-accounts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const facebookAccounts = accounts?.filter(a => a.platform === "facebook") || [];
  const googleAccounts = accounts?.filter(a => a.platform === "google") || [];
  const tiktokAccounts = accounts?.filter(a => a.platform === "tiktok") || [];

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="page-ad-accounts">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Ad Accounts</h1>
            <p className="text-sm text-muted-foreground">Connect and manage your advertising platform accounts</p>
          </div>
          <div className="flex items-center gap-2">
            <ManualAddDialog />
            <QuickConnectDialog />
            <FacebookLoginButton />
          </div>
        </div>

        <FacebookSettingsCard />

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" />
          </div>
        ) : !accounts || accounts.length === 0 ? (
          <div className="space-y-6">
            <Card className="border-2 border-[#1877F2]/30 bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/20">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-5">
                <div className="w-20 h-20 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
                  <SiFacebook className="w-10 h-10 text-[#1877F2]" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-xl">Connect your Facebook Ads</h3>
                  <p className="text-sm text-muted-foreground max-w-md mt-2">
                    Log in with your Facebook account and all your ad accounts will be connected automatically. One click, everything synced.
                  </p>
                </div>
                <FacebookLoginButton size="lg" />
              </CardContent>
            </Card>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-sm text-muted-foreground">or connect another way</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-8">
                  <Zap className="w-8 h-8 text-muted-foreground" />
                  <p className="font-medium text-sm">Paste Access Token</p>
                  <p className="text-xs text-muted-foreground text-center">Have a token? Auto-discover all accounts from it.</p>
                  <QuickConnectDialog />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-8">
                  <Plus className="w-8 h-8 text-muted-foreground" />
                  <p className="font-medium text-sm">Add Manually</p>
                  <p className="text-xs text-muted-foreground text-center">Enter account ID and token for any platform.</p>
                  <ManualAddDialog />
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">All ({accounts.length})</TabsTrigger>
              {facebookAccounts.length > 0 && <TabsTrigger value="facebook" data-testid="tab-facebook">Facebook ({facebookAccounts.length})</TabsTrigger>}
              {googleAccounts.length > 0 && <TabsTrigger value="google" data-testid="tab-google">Google ({googleAccounts.length})</TabsTrigger>}
              {tiktokAccounts.length > 0 && <TabsTrigger value="tiktok" data-testid="tab-tiktok">TikTok ({tiktokAccounts.length})</TabsTrigger>}
            </TabsList>

            {["all", "facebook", "google", "tiktok"].map(tab => {
              const filtered = tab === "all" ? accounts : accounts.filter(a => a.platform === tab);
              if (tab !== "all" && filtered.length === 0) return null;
              return (
                <TabsContent key={tab} value={tab} className="space-y-3 mt-4">
                  {filtered.map(account => {
                    const config = PLATFORM_CONFIG[account.platform];
                    return (
                      <Card key={account.id} data-testid={`card-account-${account.id}`}>
                        <CardContent className="flex items-center gap-4 py-4">
                          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-muted">
                            <PlatformIcon platform={account.platform} className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold truncate" data-testid={`text-account-name-${account.id}`}>
                                {account.accountName || account.accountId}
                              </h3>
                              <StatusBadge status={account.status} />
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                              <span>{config?.label}</span>
                              <span>ID: {account.accountId}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <CampaignView account={account} />
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => deleteMutation.mutate(account.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-account-${account.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </ScrollArea>
  );
}

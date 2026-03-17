import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Trash2,
  Pencil,
  Wallet,
  TrendingDown,
  Target,
  ExternalLink,
  FileSpreadsheet,
} from "lucide-react";
import { formatBDT, formatUSD } from "@/lib/format";
import type { Client, Transaction } from "@shared/schema";

const addTransactionSchema = z.object({
  date: z.string().min(1, "Date is required"),
  bdtAmount: z.string().default("0"),
  usdAmount: z.string().default("0"),
  platform: z.string().default("Facebook"),
  remainingBdt: z.string().default("0"),
  platformSpend: z.string().default("0"),
  paymentNote: z.string().optional(),
});

const editClientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  status: z.string(),
  executive: z.string().min(1, "Executive is required"),
  adsAccount: z.string(),
  googleSheetUrl: z.string().optional(),
  balance: z.string().default("0"),
  totalDue: z.string().default("0"),
  campaignDue: z.string().default("0"),
});

function StatusBadge({ status }: { status: string }) {
  if (status === "Active") return <Badge>{status}</Badge>;
  if (status === "Hold") return <Badge variant="secondary">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function BalanceCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: any;
}) {
  const num = parseFloat(value) || 0;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-accent text-accent-foreground">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {title}
            </p>
            <p
              className={`text-lg font-bold font-mono ${num < 0 ? "text-destructive" : ""}`}
            >
              {formatBDT(value)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id || "0");
  const [showAddTxn, setShowAddTxn] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const { toast } = useToast();

  const {
    data: client,
    isLoading: clientLoading,
  } = useQuery<Client>({
    queryKey: ["/api/clients", id],
  });

  const { data: txns = [], isLoading: txnsLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/clients", id, "transactions"],
  });

  const txnForm = useForm<z.infer<typeof addTransactionSchema>>({
    resolver: zodResolver(addTransactionSchema),
    defaultValues: {
      date: new Date().toLocaleDateString("en-GB"),
      bdtAmount: "0",
      usdAmount: "0",
      platform: "Facebook",
      remainingBdt: "0",
      platformSpend: "0",
      paymentNote: "",
    },
  });

  const editForm = useForm<z.infer<typeof editClientSchema>>({
    resolver: zodResolver(editClientSchema),
    values: client
      ? {
          name: client.name,
          status: client.status,
          executive: client.executive,
          adsAccount: client.adsAccount,
          googleSheetUrl: client.googleSheetUrl || "",
          balance: client.balance,
          totalDue: client.totalDue,
          campaignDue: client.campaignDue,
        }
      : undefined,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/clients/${id}/sync`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id] });
      queryClient.invalidateQueries({
        queryKey: ["/api/clients", id, "transactions"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Sync complete",
        description: `${data.transactionsCount} transactions synced`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addTxnMutation = useMutation({
    mutationFn: async (data: z.infer<typeof addTransactionSchema>) => {
      const res = await apiRequest(
        "POST",
        `/api/clients/${id}/transactions`,
        data
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/clients", id, "transactions"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setShowAddTxn(false);
      txnForm.reset();
      toast({ title: "Transaction added" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add transaction",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async (data: z.infer<typeof editClientSchema>) => {
      const res = await apiRequest("PUT", `/api/clients/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setShowEdit(false);
      toast({ title: "Client updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTxnMutation = useMutation({
    mutationFn: async (txnId: number) => {
      await apiRequest("DELETE", `/api/transactions/${txnId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/clients", id, "transactions"],
      });
      toast({ title: "Transaction deleted" });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      navigate("/");
      toast({ title: "Client deleted" });
    },
  });

  if (clientLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full">
        <h2 className="text-lg font-semibold mb-2">Client not found</h2>
        <Button variant="secondary" onClick={() => navigate("/")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-6 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <span className="text-sm text-muted-foreground">Dashboard</span>
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm font-medium">{client.name}</span>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold" data-testid="text-client-name">
                  {client.name}
                </h1>
                <StatusBadge status={client.status} />
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  ID: <span className="font-mono">{client.clientId}</span>
                </span>
                <Separator orientation="vertical" className="h-4" />
                <span>Executive: {client.executive}</span>
                {client.adsAccount && (
                  <>
                    <Separator orientation="vertical" className="h-4" />
                    <span>{client.adsAccount}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {client.googleSheetUrl && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(client.googleSheetUrl!, "_blank")}
                data-testid="button-open-sheet"
              >
                <ExternalLink className="w-4 h-4" />
                Open Sheet
              </Button>
            )}
            {client.googleSheetId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                data-testid="button-sync"
              >
                <RefreshCw
                  className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
                />
                {syncMutation.isPending ? "Syncing..." : "Sync Sheet"}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowEdit(true)}
              data-testid="button-edit-client"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm("Delete this client and all their transactions?")) {
                  deleteClientMutation.mutate();
                }
              }}
              data-testid="button-delete-client"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <BalanceCard title="Current Balance" value={client.balance} icon={Wallet} />
          <BalanceCard title="Total Due" value={client.totalDue} icon={TrendingDown} />
          <BalanceCard title="Campaign Due" value={client.campaignDue} icon={Target} />
        </div>

        {!client.googleSheetId && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <FileSpreadsheet className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground text-center mb-3">
                No Google Sheet linked. Edit this client to add a sheet URL for
                auto-sync.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowEdit(true)}
                data-testid="button-link-sheet"
              >
                Link Google Sheet
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold" data-testid="text-transactions-title">
            Transactions ({txns.length})
          </h2>
          <Button
            size="sm"
            onClick={() => setShowAddTxn(true)}
            data-testid="button-add-transaction"
          >
            <Plus className="w-4 h-4" />
            Add Transaction
          </Button>
        </div>

        {txnsLoading ? (
          <Card>
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </Card>
        ) : txns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground mb-3">
                No transactions yet
              </p>
              {client.googleSheetId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  data-testid="button-sync-empty"
                >
                  <RefreshCw className="w-4 h-4" />
                  Sync from Sheet
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setShowAddTxn(true)}
                  data-testid="button-add-txn-empty"
                >
                  <Plus className="w-4 h-4" />
                  Add First Transaction
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">BDT Amount</TableHead>
                  <TableHead className="text-right">USD Spend</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Platform Spend</TableHead>
                  <TableHead className="hidden md:table-cell">Payment Note</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.map((txn) => {
                  const bdt = parseFloat(txn.bdtAmount) || 0;
                  const usd = parseFloat(txn.usdAmount) || 0;
                  const rem = parseFloat(txn.remainingBdt) || 0;
                  const spend = parseFloat(txn.platformSpend) || 0;
                  return (
                    <TableRow key={txn.id} data-testid={`row-txn-${txn.id}`}>
                      <TableCell className="text-sm">
                        {txn.date || "-"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${bdt > 0 ? "text-green-600 dark:text-green-400" : ""}`}
                      >
                        {bdt !== 0 ? formatBDT(txn.bdtAmount) : "-"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${usd > 0 ? "text-destructive" : ""}`}
                      >
                        {usd !== 0 ? formatUSD(txn.usdAmount) : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {txn.platform}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${rem < 0 ? "text-destructive" : ""}`}
                      >
                        {rem !== 0 ? formatBDT(txn.remainingBdt) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {spend !== 0 ? formatBDT(txn.platformSpend) : "-"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                        {txn.paymentNote || "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteTxnMutation.mutate(txn.id)}
                          data-testid={`button-delete-txn-${txn.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <Dialog open={showAddTxn} onOpenChange={setShowAddTxn}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
            <DialogDescription>
              Add a new transaction for {client.name}. This will also sync to
              their Google Sheet if linked.
            </DialogDescription>
          </DialogHeader>
          <Form {...txnForm}>
            <form
              onSubmit={txnForm.handleSubmit((data) =>
                addTxnMutation.mutate(data)
              )}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={txnForm.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="DD/MM/YYYY"
                          {...field}
                          data-testid="input-txn-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={txnForm.control}
                  name="platform"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platform</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-platform">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Facebook">Facebook</SelectItem>
                          <SelectItem value="TikTok">TikTok</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={txnForm.control}
                  name="bdtAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>BDT Amount (Payment)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0"
                          {...field}
                          data-testid="input-bdt-amount"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={txnForm.control}
                  name="usdAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>USD Amount (Ad Spend)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0"
                          {...field}
                          data-testid="input-usd-amount"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={txnForm.control}
                  name="remainingBdt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remaining (BDT)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0"
                          {...field}
                          data-testid="input-remaining"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={txnForm.control}
                  name="platformSpend"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platform Spend (BDT)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0"
                          {...field}
                          data-testid="input-platform-spend"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={txnForm.control}
                name="paymentNote"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Note</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 01/12/25/cli-1403/lst-bkash/pay-1500"
                        {...field}
                        data-testid="input-payment-note"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={addTxnMutation.isPending}
                data-testid="button-submit-txn"
              >
                {addTxnMutation.isPending
                  ? "Adding..."
                  : "Add Transaction"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update client details.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) =>
                updateClientMutation.mutate(data)
              )}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-status">
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
                  control={editForm.control}
                  name="executive"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Executive</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-executive" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="adsAccount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ads Account</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-ads-account" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="googleSheetUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Sheet URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        {...field}
                        data-testid="input-edit-sheet-url"
                      />
                    </FormControl>
                    <FormMessage />
                    <div className="rounded-md border bg-muted/50 p-2.5 space-y-1.5 mt-2" data-testid="example-client-sheet-edit">
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
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={editForm.control}
                  name="balance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Balance</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-balance" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="totalDue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Due</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-total-due" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="campaignDue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Due</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-campaign-due" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={updateClientMutation.isPending}
                data-testid="button-submit-edit"
              >
                {updateClientMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

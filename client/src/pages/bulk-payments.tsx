import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Upload, CheckCircle2, XCircle, AlertTriangle, Loader2, ClipboardPaste, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBDT } from "@/lib/format";

type PaymentResult = {
  clientId: number;
  name: string;
  amount: string;
  date: string;
  status: string;
  error?: string;
};

type HistoryEntry = {
  id: number;
  clientId: number;
  clientName: string;
  clientCode: number;
  date: string | null;
  bdtAmount: string;
  paymentNote: string | null;
};

type BulkResponse = {
  success: boolean;
  totalLines: number;
  processed: number;
  succeeded: number;
  partial: number;
  failed: number;
  unparsed: Array<{ line: string; error: string }>;
  results: PaymentResult[];
};

export default function BulkPayments() {
  const [notes, setNotes] = useState("");
  const [response, setResponse] = useState<BulkResponse | null>(null);
  const { toast } = useToast();

  const { data: history, isLoading: historyLoading } = useQuery<HistoryEntry[]>({
    queryKey: ["/api/bulk-payments/history"],
  });

  const bulkMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/bulk-payments", { notes: text });
      return res.json() as Promise<BulkResponse>;
    },
    onSuccess: (data) => {
      setResponse(data);
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-payments/history"] });
      toast({
        title: "Payments Processed",
        description: `${data.succeeded} succeeded, ${data.failed} failed out of ${data.processed} payments`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const previewLines = notes
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const match = line.match(
        /(\d{2})\/(\d{2})\/(\d{2,4})\/cli-(\d+)\/lst-([^/]+)\/pay-(\d+(?:\.\d+)?)/
      );
      if (!match) return { raw: line.trim(), valid: false };
      const [, dd, mm, yy, cliId, method, amount] = match;
      return {
        raw: line.trim(),
        valid: true,
        date: `${dd}/${mm}/${yy.length === 2 ? `20${yy}` : yy}`,
        clientId: cliId,
        method,
        amount,
      };
    });

  const validCount = previewLines.filter((p) => p.valid).length;
  const invalidCount = previewLines.filter((p) => !p.valid && p.raw).length;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setNotes(text);
    } catch {
      toast({ title: "Clipboard access denied", description: "Please paste manually using Ctrl+V", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full" data-testid="page-bulk-payments">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Bulk Payment Upload</h1>
        <p className="text-muted-foreground mt-1">
          Paste WhatsApp payment notes to auto-update client balances and Google Sheets
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Payment Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Format: <code className="bg-muted px-1 py-0.5 rounded text-xs">DD/MM/YY/cli-XXXX/lst-method/pay-amount</code>
              </p>
              <Button variant="outline" size="sm" onClick={handlePaste} data-testid="button-paste">
                <ClipboardPaste className="w-4 h-4 mr-1" />
                Paste
              </Button>
            </div>
            <Textarea
              placeholder={`[8:30 pm, 07/03/2026] Ajmine A: 06/03/26/cli-1481/lst-bkash/pay-232\n[9:01 pm, 07/03/2026] Ajmine A: 07/03/26/cli-1400/lst-bkash/pay-850\n[5:03 am, 08/03/2026] Ajmine A: 08/03/26/cli-1439/lst-bank/pay-1500`}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setResponse(null);
              }}
              rows={8}
              className="font-mono text-sm"
              data-testid="textarea-notes"
            />
          </div>

          {notes.trim() && previewLines.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                {validCount} valid
              </span>
              {invalidCount > 0 && (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  {invalidCount} unparseable
                </span>
              )}
            </div>
          )}

          {notes.trim() && validCount > 0 && !response && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client ID</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewLines.map((p, idx) =>
                    p.valid ? (
                      <TableRow key={idx} data-testid={`row-preview-${idx}`}>
                        <TableCell className="font-mono text-sm">{p.date}</TableCell>
                        <TableCell className="font-mono">{p.clientId}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.method}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">৳{p.amount}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">Ready</Badge>
                        </TableCell>
                      </TableRow>
                    ) : p.raw ? (
                      <TableRow key={idx} className="bg-yellow-50 dark:bg-yellow-900/10" data-testid={`row-preview-invalid-${idx}`}>
                        <TableCell colSpan={4} className="font-mono text-sm text-muted-foreground truncate max-w-md">
                          {p.raw}
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive">Invalid</Badge>
                        </TableCell>
                      </TableRow>
                    ) : null
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => bulkMutation.mutate(notes)}
              disabled={bulkMutation.isPending || validCount === 0}
              data-testid="button-process"
            >
              {bulkMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Process {validCount} Payment{validCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
            {notes.trim() && (
              <Button
                variant="outline"
                onClick={() => {
                  setNotes("");
                  setResponse(null);
                }}
                data-testid="button-clear"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {response && (
        <Card data-testid="card-results">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              Results
              <Badge variant={response.failed === 0 ? "default" : "destructive"}>
                {response.succeeded}/{response.processed}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                {response.succeeded} succeeded
              </span>
              {response.partial > 0 && (
                <span className="flex items-center gap-1 text-yellow-600">
                  <AlertTriangle className="w-4 h-4" />
                  {response.partial} partial (DB saved, sheet failed)
                </span>
              )}
              {response.failed > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <XCircle className="w-4 h-4" />
                  {response.failed} failed
                </span>
              )}
              {response.unparsed.length > 0 && (
                <span className="flex items-center gap-1 text-yellow-600">
                  <AlertTriangle className="w-4 h-4" />
                  {response.unparsed.length} unparseable
                </span>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {response.results.map((r, idx) => (
                    <TableRow key={idx} data-testid={`row-result-${idx}`}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{r.name}</span>
                          <span className="text-muted-foreground ml-2 text-sm">#{r.clientId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{r.date}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        +৳{r.amount}
                      </TableCell>
                      <TableCell>
                        {r.status === "success" ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Done
                          </Badge>
                        ) : r.status === "partial" ? (
                          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Partial
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="w-3 h-3 mr-1" />
                            {r.error || "Failed"}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {response.unparsed.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-yellow-600 mb-2">Unparsed Lines:</p>
                <div className="space-y-1">
                  {response.unparsed.map((u, idx) => (
                    <div key={idx} className="text-xs font-mono bg-yellow-50 dark:bg-yellow-900/10 p-2 rounded">
                      {u.line}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <Card data-testid="card-history">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="w-5 h-5" />
            Payment History
            {history && (
              <Badge variant="outline">{history.length} recent</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : history && history.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => {
                    const methodMatch = h.paymentNote?.match(/lst-([^/]+)/);
                    const method = methodMatch ? methodMatch[1] : "-";
                    return (
                      <TableRow key={h.id} data-testid={`row-history-${h.id}`}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{h.clientName}</span>
                            <span className="text-muted-foreground ml-2 text-sm">#{h.clientCode}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{h.date || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{method}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          +৳{h.bdtAmount}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                          {h.paymentNote || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-history">
              No bulk payments recorded yet. Use the form above to process your first batch.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

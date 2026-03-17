import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Settings2, Shield, CheckCircle2, XCircle, Copy, Trash2, Plus } from "lucide-react";

interface GoogleServiceAccountStatus {
  configured: boolean;
  email: string | null;
  source: "database" | "environment" | null;
  allEmails: string[];
  accountCount: number;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [jsonInput, setJsonInput] = useState("");
  const [showJsonInput, setShowJsonInput] = useState(false);
  const [additionalJsonInput, setAdditionalJsonInput] = useState("");
  const [showAdditionalInput, setShowAdditionalInput] = useState(false);

  const { data: googleStatus, isLoading: googleLoading } = useQuery<GoogleServiceAccountStatus>({
    queryKey: ["/api/google/service-account"],
  });

  const saveGoogleMutation = useMutation({
    mutationFn: async (json: string) => {
      const res = await apiRequest("POST", "/api/google/service-account", { json });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Connected", description: `Google Service Account connected: ${data.email}` });
      setJsonInput("");
      setShowJsonInput(false);
      queryClient.invalidateQueries({ queryKey: ["/api/google/service-account"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addAdditionalMutation = useMutation({
    mutationFn: async (json: string) => {
      const res = await apiRequest("POST", "/api/google/service-account/additional", { json });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Added", description: `Additional account added: ${data.email} (${data.totalAccounts} total)` });
      setAdditionalJsonInput("");
      setShowAdditionalInput(false);
      queryClient.invalidateQueries({ queryKey: ["/api/google/service-account"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const removeGoogleMutation = useMutation({
    mutationFn: async (email?: string) => {
      await apiRequest("DELETE", "/api/google/service-account", email ? { email } : {});
    },
    onSuccess: () => {
      toast({ title: "Removed", description: "Service account has been disconnected." });
      queryClient.invalidateQueries({ queryKey: ["/api/google/service-account"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSaveGoogle = () => {
    const trimmed = jsonInput.trim();
    if (!trimmed) {
      toast({ title: "Error", description: "Please paste the service account JSON", variant: "destructive" });
      return;
    }
    saveGoogleMutation.mutate(trimmed);
  };

  const handleAddAdditional = () => {
    const trimmed = additionalJsonInput.trim();
    if (!trimmed) {
      toast({ title: "Error", description: "Please paste the service account JSON", variant: "destructive" });
      return;
    }
    addAdditionalMutation.mutate(trimmed);
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6" data-testid="settings-page">
      <div className="flex items-center gap-3">
        <Settings2 className="w-6 h-6" />
        <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
      </div>

      <Card data-testid="card-google-service-account">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-lg">Google Service Accounts</CardTitle>
            </div>
            {googleLoading ? (
              <Badge variant="secondary">Checking...</Badge>
            ) : googleStatus?.configured ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" data-testid="badge-google-connected">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {googleStatus.accountCount} Connected
              </Badge>
            ) : (
              <Badge variant="destructive" data-testid="badge-google-disconnected">
                <XCircle className="w-3 h-3 mr-1" />
                Not Connected
              </Badge>
            )}
          </div>
          <CardDescription>
            Connect Google Service Accounts to enable Google Sheets sync. Add multiple accounts to speed up sync by distributing API calls across them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {googleStatus?.configured && googleStatus.allEmails && (
            <div className="space-y-2">
              {googleStatus.allEmails.map((email, idx) => (
                <div key={email} className="rounded-md border bg-muted/50 p-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {idx === 0 ? "Primary" : `Account ${idx + 1}`}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono mt-1 truncate" data-testid={`text-service-account-email-${idx}`}>
                      {email}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(email);
                        toast({ title: "Copied", description: "Email copied to clipboard" });
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    {idx > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeGoogleMutation.mutate(email)}
                        disabled={removeGoogleMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {idx === 0 && googleStatus.source === "database" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeGoogleMutation.mutate()}
                        disabled={removeGoogleMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <p className="text-xs text-muted-foreground">
                Share your Google Sheets with these emails to allow access. Each account gets its own API quota (60 reads/min), so multiple accounts = faster sync.
              </p>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowJsonInput(true)}
                >
                  Update Primary
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdditionalInput(true)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Another Account
                </Button>
              </div>
            </div>
          )}

          {showAdditionalInput && googleStatus?.configured && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <p className="text-sm font-medium">Add Additional Service Account</p>
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium">How to create an additional account:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Go to <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Cloud Console &rarr; Service Accounts</a></li>
                  <li>Open the <strong>same project</strong> where your current account lives</li>
                  <li>Click <strong>"+ Create Service Account"</strong> at the top</li>
                  <li>Give it a name (e.g. <code className="bg-muted px-1 rounded">tsa-sync-2</code>) and click <strong>Create and Continue</strong></li>
                  <li>Skip optional permissions, click <strong>Done</strong></li>
                  <li>Click the new account &rarr; <strong>Keys</strong> tab &rarr; <strong>Add Key &rarr; Create New Key &rarr; JSON</strong></li>
                  <li>A JSON file will download — open it in a text editor and copy the entire content</li>
                </ol>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-2">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Don't forget:</strong> Share your Google Sheets with the new account's email too (Editor access), otherwise it won't be able to read them.
                </p>
              </div>
              <Textarea
                placeholder='Paste the JSON key for the additional service account...'
                value={additionalJsonInput}
                onChange={(e) => setAdditionalJsonInput(e.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleAddAdditional}
                  disabled={addAdditionalMutation.isPending || !additionalJsonInput.trim()}
                  size="sm"
                >
                  {addAdditionalMutation.isPending ? "Adding..." : "Add Account"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowAdditionalInput(false); setAdditionalJsonInput(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {(!googleStatus?.configured || showJsonInput) && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <p className="text-sm font-medium">How to get a Service Account:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Cloud Console</a></li>
                  <li>Create a project and enable the <strong>Google Sheets API</strong></li>
                  <li>Go to <strong>Credentials</strong> and create a <strong>Service Account</strong></li>
                  <li>Create a <strong>JSON key</strong> for the service account</li>
                  <li>Paste the entire JSON key content below</li>
                </ol>
              </div>
              <Textarea
                placeholder='Paste the entire JSON key file content here...&#10;&#10;{&#10;  "type": "service_account",&#10;  "project_id": "...",&#10;  "private_key": "...",&#10;  "client_email": "...@....iam.gserviceaccount.com",&#10;  ...&#10;}'
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                rows={8}
                className="font-mono text-xs"
                data-testid="textarea-google-json"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveGoogle}
                  disabled={saveGoogleMutation.isPending || !jsonInput.trim()}
                  data-testid="button-save-google"
                >
                  {saveGoogleMutation.isPending ? "Connecting..." : "Connect Service Account"}
                </Button>
                {showJsonInput && googleStatus?.configured && (
                  <Button
                    variant="outline"
                    onClick={() => { setShowJsonInput(false); setJsonInput(""); }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}

          {googleStatus?.configured && !showJsonInput && !showAdditionalInput && (
            <>
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>Important:</strong> Share each Google Sheet with all service account emails above (Editor access) for the app to read and write data.
                </p>
              </div>

              <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-medium">Speed up sync with multiple accounts</p>
                <p className="text-xs text-muted-foreground">
                  Google limits each service account to 60 API reads per minute. Adding more accounts multiplies this quota:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className={`rounded-md border p-2 text-center ${(googleStatus.accountCount || 1) >= 1 ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' : 'bg-muted/50'}`}>
                    <p className="text-lg font-bold">1</p>
                    <p className="text-xs text-muted-foreground">account</p>
                    <p className="text-xs font-medium mt-1">3 clients/batch</p>
                  </div>
                  <div className={`rounded-md border p-2 text-center ${(googleStatus.accountCount || 1) >= 2 ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' : 'bg-muted/50'}`}>
                    <p className="text-lg font-bold">2</p>
                    <p className="text-xs text-muted-foreground">accounts</p>
                    <p className="text-xs font-medium mt-1">6 clients/batch</p>
                  </div>
                  <div className={`rounded-md border p-2 text-center ${(googleStatus.accountCount || 1) >= 3 ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' : 'bg-muted/50'}`}>
                    <p className="text-lg font-bold">3</p>
                    <p className="text-xs text-muted-foreground">accounts</p>
                    <p className="text-xs font-medium mt-1">9 clients/batch</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Click <strong>"+ Add Another Account"</strong> above to create and add more service accounts. Each new account needs to be shared with all your Google Sheets.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

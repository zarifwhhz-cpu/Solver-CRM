import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Settings2, Shield, CheckCircle2, XCircle, Copy, Trash2 } from "lucide-react";

interface GoogleServiceAccountStatus {
  configured: boolean;
  email: string | null;
  source: "database" | "environment" | null;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [jsonInput, setJsonInput] = useState("");
  const [showJsonInput, setShowJsonInput] = useState(false);

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

  const removeGoogleMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/google/service-account");
    },
    onSuccess: () => {
      toast({ title: "Removed", description: "Google Service Account has been disconnected." });
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
              <CardTitle className="text-lg">Google Service Account</CardTitle>
            </div>
            {googleLoading ? (
              <Badge variant="secondary">Checking...</Badge>
            ) : googleStatus?.configured ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" data-testid="badge-google-connected">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="destructive" data-testid="badge-google-disconnected">
                <XCircle className="w-3 h-3 mr-1" />
                Not Connected
              </Badge>
            )}
          </div>
          <CardDescription>
            Connect a Google Service Account to enable Google Sheets sync for client transactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {googleStatus?.configured && (
            <div className="rounded-md border bg-muted/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Service Account Email</p>
                  <p className="text-sm text-muted-foreground font-mono" data-testid="text-service-account-email">
                    {googleStatus.email}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(googleStatus.email || "");
                    toast({ title: "Copied", description: "Email copied to clipboard" });
                  }}
                  data-testid="button-copy-email"
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Source: {googleStatus.source === "database" ? "Saved in app" : "Environment variable (.env)"}
              </p>
              <p className="text-xs text-muted-foreground">
                Share your Google Sheets with this email address to give the app access.
              </p>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowJsonInput(true)}
                  data-testid="button-update-google"
                >
                  Update Credentials
                </Button>
                {googleStatus.source === "database" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeGoogleMutation.mutate()}
                    disabled={removeGoogleMutation.isPending}
                    data-testid="button-remove-google"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    {removeGoogleMutation.isPending ? "Removing..." : "Remove"}
                  </Button>
                )}
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

          {googleStatus?.configured && !showJsonInput && (
            <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-3">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                <strong>Important:</strong> Share each Google Sheet with <strong className="font-mono">{googleStatus.email}</strong> (Editor access) for the app to read and write data.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  FileX,
  UserX,
  MonitorX,
  DollarSign,
  CheckCircle2,
} from "lucide-react";

type Issue = {
  type: string;
  severity: 'high' | 'medium' | 'low';
  id?: number;
  clientId?: number;
  clientName?: string;
  status?: string;
  message: string;
  action: string;
};

type ActionNeededData = {
  issues: Issue[];
  summary: { high: number; medium: number; low: number; total: number };
};

const severityStyles: Record<string, string> = {
  high: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50',
  medium: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50',
  low: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50',
};

const typeIcons: Record<string, React.ReactNode> = {
  missing_sheet: <FileX className="h-3.5 w-3.5 shrink-0" />,
  missing_executive: <UserX className="h-3.5 w-3.5 shrink-0" />,
  missing_ads_account: <MonitorX className="h-3.5 w-3.5 shrink-0" />,
  high_negative_balance: <DollarSign className="h-3.5 w-3.5 shrink-0" />,
};

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'high') return <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
  if (severity === 'medium') return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
  return <Info className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />;
}

export default function ActionNeededPage() {
  const [, navigate] = useLocation();

  const { data: actionNeeded, isLoading } = useQuery<ActionNeededData>({
    queryKey: ["/api/action-needed"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 h-full overflow-y-auto">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" />
            Action Needed
          </h1>
          <p className="text-muted-foreground mt-1">Loading issues...</p>
        </div>
      </div>
    );
  }

  if (!actionNeeded || actionNeeded.summary.total === 0) {
    return (
      <div className="p-6 space-y-6 h-full overflow-y-auto">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            Action Needed
          </h1>
          <p className="text-muted-foreground mt-1">Everything looks good — no issues found.</p>
        </div>
        <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium">All clients are properly configured</p>
            <p className="text-xs text-muted-foreground mt-1">No missing data, no overdue balances. Your CRM is in great shape.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const groupedByType: Record<string, Issue[]> = {};
  for (const issue of actionNeeded.issues) {
    if (!groupedByType[issue.type]) groupedByType[issue.type] = [];
    groupedByType[issue.type].push(issue);
  }

  const typeLabels: Record<string, { title: string; description: string }> = {
    missing_sheet: {
      title: "Missing Google Sheet",
      description: "These clients have no Google Sheet linked, so their data cannot sync.",
    },
    missing_executive: {
      title: "No Executive Assigned",
      description: "These clients don't have an executive assigned to manage them.",
    },
    missing_ads_account: {
      title: "No Ads Account Assigned",
      description: "These clients are missing an ads account assignment.",
    },
    high_negative_balance: {
      title: "High Negative Balance",
      description: "These active clients have a balance below ৳-500 and may need payment follow-up.",
    },
  };

  const typeOrder = ['missing_sheet', 'missing_executive', 'missing_ads_account', 'high_negative_balance'];

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-action-needed-title">
            <AlertTriangle className={`h-6 w-6 ${actionNeeded.summary.high > 0 ? 'text-red-500' : 'text-amber-500'}`} />
            Action Needed
          </h1>
          <p className="text-muted-foreground mt-1">
            {actionNeeded.summary.total} issue{actionNeeded.summary.total !== 1 ? 's' : ''} need your attention to keep the CRM running properly
          </p>
        </div>
        <div className="flex gap-2">
          {actionNeeded.summary.high > 0 && (
            <Badge variant="destructive" data-testid="badge-urgent-count">{actionNeeded.summary.high} urgent</Badge>
          )}
          {actionNeeded.summary.medium > 0 && (
            <Badge variant="secondary">{actionNeeded.summary.medium} important</Badge>
          )}
          {actionNeeded.summary.low > 0 && (
            <Badge variant="outline">{actionNeeded.summary.low} minor</Badge>
          )}
        </div>
      </div>

      {typeOrder.filter(t => groupedByType[t]).map(type => {
        const issues = groupedByType[type];
        const label = typeLabels[type] || { title: type, description: '' };
        const highCount = issues.filter(i => i.severity === 'high').length;

        return (
          <Card key={type}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                {typeIcons[type]}
                <CardTitle className="text-base">{label.title}</CardTitle>
                <Badge variant={highCount > 0 ? 'destructive' : 'secondary'} className="text-xs ml-auto">
                  {issues.length} client{issues.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <CardDescription className="text-xs">{label.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {issues.map((issue, idx) => (
                <div
                  key={idx}
                  className={`rounded-md border p-3 flex items-start gap-3 ${severityStyles[issue.severity]}`}
                  data-testid={`issue-${issue.type}-${issue.clientId}`}
                >
                  <SeverityIcon severity={issue.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{issue.clientName}</span>
                      {issue.clientId && (
                        <span className="text-xs text-muted-foreground">#{issue.clientId}</span>
                      )}
                      {issue.status && (
                        <Badge
                          variant={issue.status === 'Active' ? 'default' : issue.status === 'Hold' ? 'secondary' : 'outline'}
                          className="text-[10px] h-4"
                        >
                          {issue.status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{issue.message}</p>
                    <p className="text-xs font-medium mt-1 text-foreground/80">→ {issue.action}</p>
                  </div>
                  {issue.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-7 text-xs"
                      onClick={() => navigate(`/clients/${issue.id}`)}
                      data-testid={`button-fix-${issue.clientId}`}
                    >
                      Fix
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

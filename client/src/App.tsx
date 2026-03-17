import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import Dashboard from "@/pages/dashboard";
import ClientDetail from "@/pages/client-detail";
import BulkPayments from "@/pages/bulk-payments";
import AIAssistant from "@/pages/ai-assistant";
import AdAccounts from "@/pages/ad-accounts";
import Campaigns from "@/pages/campaigns";
import SettingsPage from "@/pages/settings";
import ActionNeededPage from "@/pages/action-needed";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/clients/:id" component={ClientDetail} />
      <Route path="/bulk-payments" component={BulkPayments} />
      <Route path="/ai-assistant" component={AIAssistant} />
      <Route path="/ad-accounts" component={AdAccounts} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/action-needed" component={ActionNeededPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <header className="flex items-center p-2 border-b">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
              </header>
              <main className="flex-1 overflow-hidden">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

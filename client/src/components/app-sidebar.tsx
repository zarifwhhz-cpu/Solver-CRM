import { useState } from "react";
import { LayoutDashboard, Megaphone, Upload, Bot, BarChart3, ListFilter } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Bulk Payments", url: "/bulk-payments", icon: Upload },
  { title: "Ad Accounts", url: "/ad-accounts", icon: BarChart3 },
  { title: "Campaigns", url: "/campaigns", icon: ListFilter },
  { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
];

export function AppSidebar() {
  const [location] = useLocation();
  const [logoError, setLogoError] = useState(false);

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {!logoError ? (
            <img
              src="/logo.png"
              alt="Logo"
              className="w-9 h-9 rounded-md object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary text-primary-foreground">
              <Megaphone className="w-5 h-5" />
            </div>
          )}
          <div>
            <h1 className="text-sm font-bold leading-tight" data-testid="text-app-title">Ads CRM</h1>
            <p className="text-xs text-muted-foreground leading-tight">Campaign Manager</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild data-active={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

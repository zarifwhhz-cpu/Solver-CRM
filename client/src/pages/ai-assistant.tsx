import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Bot, Send, Settings, Loader2, User, Wrench, Sparkles, AlertCircle } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  timestamp: Date;
}

interface AISettings {
  configured: boolean;
  provider?: string;
  model?: string;
  hasApiKey?: boolean;
}

const PROVIDER_MODELS: Record<string, { label: string; models: { value: string; label: string }[] }> = {
  deepseek: {
    label: "DeepSeek",
    models: [
      { value: "deepseek-chat", label: "DeepSeek Chat (V3)" },
      { value: "deepseek-reasoner", label: "DeepSeek Reasoner (R1)" },
    ],
  },
  gemini: {
    label: "Google Gemini",
    models: [
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { value: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro" },
    ],
  },
  openai: {
    label: "OpenAI",
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    models: [
      { value: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
      { value: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
      { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
    ],
  },
};

const QUICK_ACTIONS = [
  { label: "Dashboard Summary", prompt: "Give me a quick summary of the dashboard - total clients, balances, active vs inactive" },
  { label: "Negative Balances", prompt: "Show me all clients with negative balances, sorted by amount owed" },
  { label: "Active Clients", prompt: "List all active clients with their current balances" },
  { label: "Recent Payments", prompt: "Show me the most recent payment history" },
  { label: "Jisan's Clients", prompt: "List all clients assigned to Jisan with their statuses" },
  { label: "Saif's Clients", prompt: "List all clients assigned to Saif with their statuses" },
];

function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function SettingsDialog({ settings, onSaved }: { settings: AISettings; onSaved: () => void }) {
  const [provider, setProvider] = useState(settings.provider || "deepseek");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(settings.model || "");
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: any = { provider, model: model || undefined };
      if (apiKey) body.apiKey = apiKey;
      const res = await apiRequest("POST", "/api/ai/settings", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/settings"] });
      onSaved();
      setOpen(false);
      setApiKey("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const providerModels = PROVIDER_MODELS[provider]?.models || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-ai-settings">
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>AI Provider Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Provider</label>
            <Select value={provider} onValueChange={(v) => { setProvider(v); setModel(""); }}>
              <SelectTrigger data-testid="select-ai-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROVIDER_MODELS).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{val.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">API Key</label>
            <Input
              type="password"
              placeholder={settings.hasApiKey ? "••••••••  (saved — enter new to change)" : "Enter your API key"}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              data-testid="input-api-key"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {provider === "deepseek" && "Get your key from platform.deepseek.com"}
              {provider === "gemini" && "Get your key from aistudio.google.com"}
              {provider === "openai" && "Get your key from platform.openai.com"}
              {provider === "openrouter" && "Get your key from openrouter.ai"}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Model</label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger data-testid="select-ai-model">
                <SelectValue placeholder="Default model" />
              </SelectTrigger>
              <SelectContent>
                {providerModels.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || (!apiKey && !settings.hasApiKey && !settings.configured)}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`} data-testid={`chat-message-${message.role}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={`flex-1 max-w-[80%] ${isUser ? "text-right" : ""}`}>
        <div className={`inline-block rounded-lg px-4 py-2.5 text-sm ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
          <div className="whitespace-pre-wrap break-words" style={{ textAlign: "left" }}>{message.content}</div>
        </div>
        {message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1.5 ${isUser ? "justify-end" : ""}`}>
            {[...new Set(message.toolsUsed)].map((tool, i) => (
              <Badge key={i} variant="outline" className="text-xs py-0">
                <Wrench className="w-3 h-3 mr-1" />
                {formatToolName(tool)}
              </Badge>
            ))}
          </div>
        )}
        <p className={`text-[10px] text-muted-foreground mt-1 ${isUser ? "text-right" : ""}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useQuery<AISettings>({
    queryKey: ["/api/ai/settings"],
  });

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const apiMessages = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: userMessage },
      ];
      const res = await apiRequest("POST", "/api/ai/chat", { messages: apiMessages });
      return res.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: data.reply, toolsUsed: data.toolsUsed, timestamp: new Date() },
      ]);
    },
    onError: (err: Error) => {
      setMessages(prev => prev.filter((_, i) => i !== prev.length - 1));
      toast({ title: "AI Error", description: err.message, variant: "destructive" });
    },
  });

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatMutation.isPending) return;

    setMessages(prev => [...prev, { role: "user", content: trimmed, timestamp: new Date() }]);
    setInput("");
    chatMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isConfigured = settings?.configured && settings?.hasApiKey;

  return (
    <div className="flex flex-col h-full" data-testid="page-ai-assistant">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold" data-testid="text-page-title">AI Assistant</h1>
          {isConfigured && (
            <Badge variant="secondary" className="text-xs">
              {PROVIDER_MODELS[settings.provider!]?.label || settings.provider} — {settings.model || "default"}
            </Badge>
          )}
        </div>
        <SettingsDialog settings={settings || { configured: false }} onSaved={() => {}} />
      </div>

      {!isConfigured ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
                <AlertCircle className="w-6 h-6 text-muted-foreground" />
              </div>
              <CardTitle className="text-lg">Configure AI Provider</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect your AI provider to start using the assistant. Supports DeepSeek, Google Gemini, OpenAI, and OpenRouter.
              </p>
              <SettingsDialog settings={settings || { configured: false }} onSaved={() => {}} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center max-w-md">
                  <h2 className="text-xl font-semibold mb-2">How can I help?</h2>
                  <p className="text-sm text-muted-foreground">
                    I have access to all your client data, balances, and transactions. I can look things up, add payments, sync sheets, and give you updates.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg w-full">
                  {QUICK_ACTIONS.map((action, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="text-xs h-auto py-2 px-3 whitespace-normal text-left"
                      onClick={() => sendMessage(action.prompt)}
                      data-testid={`button-quick-action-${i}`}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto pb-4">
                {messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} />
                ))}
                {chatMutation.isPending && (
                  <div className="flex gap-3" data-testid="chat-thinking">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-muted rounded-lg px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Thinking...
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="p-4 border-t">
            <div className="max-w-3xl mx-auto flex gap-2">
              <Textarea
                ref={inputRef}
                placeholder="Ask about clients, balances, payments... or give instructions"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                className="resize-none min-h-[44px] max-h-[120px]"
                disabled={chatMutation.isPending}
                data-testid="input-chat-message"
              />
              <Button
                size="icon"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || chatMutation.isPending}
                className="flex-shrink-0 h-[44px] w-[44px]"
                data-testid="button-send-message"
              >
                {chatMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Navigation, 
  AlertCircle, 
  Loader2,
  Terminal,
  ExternalLink,
  Sparkles,
  HelpCircle,
  Key,
  CheckCircle,
  Activity,
  MessageSquare,
  Send,
  X,
  Bot,
  User
} from "lucide-react";
import { Sidebar } from "../components/Sidebar";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: string;
  status?: "pending" | "executing" | "completed" | "error";
};

function Dashboard() {
  const [url, setUrl] = useState("https://www.google.com");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [status, setStatus] = useState("Disconnected");
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState({ type: "click", selector: "", text: "" });
  const [logs, setLogs] = useState<{ id: string; type: string; message: string; timestamp: string }[]>([]);
  
  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  
  // Human Intervention State
  const [intervention, setIntervention] = useState<{ message: string; type: string } | null>(null);
  const [interventionInput, setInterventionInput] = useState("");
  
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  const socketRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    // Connect to the automation engine via raw WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    
    const onOpen = () => {
      setStatus("Connected");
      addLog("system", "Connected to automation server");
    };

    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "frame") {
          setScreenshot(`data:image/jpeg;base64,${data.base64}`);
        } else if (data.type === "subscribed") {
          setStatus("Session Active");
          addLog("system", `Subscribed to session: ${data.sessionId}`);
        } else if (data.type === "chat-response") {
          setIsTyping(false);
          
          if (data.status === "human-intervention-needed") {
            setIntervention({
              message: data.message,
              type: data.interventionType || 'text'
            });
            setIsChatOpen(true);
            addLog("system", `Human intervention needed: ${data.message}`);
          }
          
          if (data.status === "session-ready" && data.sessionId) {
            setActiveSessionId(data.sessionId);
            socketRef.current?.send(JSON.stringify({ type: "subscribe", sessionId: data.sessionId }));
          }
          
          // Handle specific status updates
          if (data.status === "thinking" || data.status === "executing" || data.status === "creating-session") {
             setIsTyping(true);
          }
          
          const newMessage: Message = {
            id: Math.random().toString(36).substring(7),
            role: "ai",
            content: data.message,
            timestamp: new Date().toLocaleTimeString(),
            status: data.status === "done" ? "completed" : data.status === "executing" ? "executing" : "pending"
          };
          
          setMessages(prev => [...prev, newMessage]);
          addLog("ai", data.message);
        } else if (data.type === "error") {
          setError(data.message || "An unknown error occurred");
          addLog("error", data.message);
        }
      } catch (err) {
        console.error("Failed to parse WS message", err);
      }
    };

    const onClose = () => {
      setStatus("Disconnected");
      addLog("system", "Disconnected from automation server");
    };

    socket.addEventListener('open', onOpen);
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);

    socketRef.current = socket;

    return () => {
      socket.close();
    };
  }, []);

  const addLog = (type: string, message: string) => {
    setLogs(prev => [
      {
        id: Math.random().toString(36).substring(7),
        type,
        message,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...prev.slice(0, 49),
    ]);
  };

  const startSession = async () => {
    setError(null);
    addLog("command", "Starting new browser session...");
    
    try {
      const resp = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { headless: true } })
      });
      const data = await resp.json();
      if (data.sessionId) {
        setActiveSessionId(data.sessionId);
        socketRef.current?.send(JSON.stringify({ type: "subscribe", sessionId: data.sessionId }));
      }
    } catch (err) {
      setError("Failed to start session");
    }
  };

  const navigate = async () => {
    if (!activeSessionId) {
      addLog("error", "No active session to navigate");
      return;
    }
    addLog("command", `Navigating to ${url}`);
    try {
      await fetch(`/api/sessions/${activeSessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "navigate", params: { url } })
      });
    } catch (err) {
      addLog("error", "Navigation failed");
    }
  };

  const runAction = async () => {
    if (!activeSessionId) {
      addLog("error", "No active session to run action");
      return;
    }
    addLog("command", `Running action: ${action.type} ${action.selector}`);
    try {
      await fetch(`/api/sessions/${activeSessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: action.type, params: { selector: action.selector, value: action.text } })
      });
    } catch (err) {
      addLog("error", "Action failed");
    }
  };

  const sendChatMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg: Message = {
      id: Math.random().toString(36).substring(7),
      role: "user",
      content: chatInput,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages(prev => [...prev, userMsg]);
    socketRef.current?.send(JSON.stringify({ 
      type: "chat-send", 
      prompt: chatInput,
      sessionId: activeSessionId
    }));
    setChatInput("");
    setIsTyping(true);
    addLog("command", `AI Command: ${chatInput}`);
  };

  const resumeAutomation = () => {
    if (!activeSessionId || !socketRef.current) return;
    
    // If it's a 2FA/OTP type, send it as a 'code' object property
    // otherwise send the raw input or undefined
    const responseData = (intervention?.type === '2fa' || intervention?.type === 'otp') 
      ? { code: interventionInput } 
      : interventionInput;

    socketRef.current.send(JSON.stringify({
      type: "chat-resume",
      sessionId: activeSessionId,
      data: responseData
    }));
    
    setIntervention(null);
    setInterventionInput("");
    addLog("command", "Resuming automation after human intervention");
  };

  const handleViewerClick = async (e: React.MouseEvent) => {
    if (!activeSessionId || !viewerRef.current) return;

    const rect = viewerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Scale coordinates to 1280x720 (assuming default viewport)
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;

    const targetX = Math.round(x * scaleX);
    const targetY = Math.round(y * scaleY);

    addLog("command", `Direct Click at (${targetX}, ${targetY})`);

    try {
      await fetch(`/api/sessions/${activeSessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type: "click", 
          params: { 
            selector: "body", 
            position: { x: targetX, y: targetY } 
          } 
        })
      });
    } catch (err) {
      addLog("error", "Direct click failed");
    }
  };

  const handleViewerKeyDown = async (e: React.KeyboardEvent) => {
    if (!activeSessionId) return;

    // Ignore modifier keys on their own
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

    // Construct the key string (e.g., "Control+A")
    let key = e.key;
    if (e.ctrlKey) key = `Control+${key}`;
    if (e.shiftKey && e.key.length > 1) key = `Shift+${key}`;
    if (e.altKey) key = `Alt+${key}`;
    if (e.metaKey) key = `Meta+${key}`;

    addLog("command", `Direct Key: ${key}`);
    
    try {
      await fetch(`/api/sessions/${activeSessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type: "pressKey", 
          params: { key } 
        })
      });
    } catch (err) {
      addLog("error", "Key press failed");
    }
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <header className="h-16 border-b border-neutral-800 flex items-center justify-between px-6 bg-neutral-900/20 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-white">Live Viewer</h2>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
              status === 'Session Active' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
              status === 'Connected' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
              'bg-neutral-800 text-neutral-400 border border-neutral-700'
            }`}>
              {status === 'Session Active' && <Activity size={12} className="animate-pulse" />}
              {status}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                isChatOpen ? 'bg-neutral-800 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white'
              }`}
            >
              <MessageSquare size={16} />
              AI Assistant
            </button>
            <button 
              onClick={startSession}
              disabled={status === 'Session Active'}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition shadow-lg shadow-indigo-500/10"
            >
              <Play size={16} fill="currentColor" />
              Start New Session
            </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
          {/* Left Side: Controls & Log */}
          <div className="w-full lg:w-80 border-r border-neutral-800 flex flex-col bg-neutral-900/30">
            {/* Navigation Section */}
            <div className="p-4 space-y-4 border-b border-neutral-800">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-1">Navigation</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={url} 
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none transition"
                    placeholder="https://..."
                  />
                  <button 
                    onClick={navigate}
                    className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-md transition text-neutral-400 hover:text-white"
                  >
                    <Navigation size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-1">Actions</label>
                <select 
                  value={action.type}
                  onChange={(e) => setAction({...action, type: e.target.value})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 transition"
                >
                  <option value="click">Click Element</option>
                  <option value="type">Type Text</option>
                  <option value="press">Press Key</option>
                </select>
                
                <input 
                  type="text" 
                  placeholder="CSS Selector (e.g. #login)" 
                  value={action.selector}
                  onChange={(e) => setAction({...action, selector: e.target.value})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 transition"
                />

                {(action.type === 'type' || action.type === 'press') && (
                  <input 
                    type="text" 
                    placeholder={action.type === 'type' ? "Text to type" : "Key (e.g. Enter)"} 
                    value={action.text}
                    onChange={(e) => setAction({...action, text: e.target.value})}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 transition"
                  />
                )}

                <button 
                  onClick={runAction}
                  disabled={status !== 'Session Active'}
                  className="w-full bg-neutral-100 hover:bg-white text-neutral-950 py-2 rounded-md font-bold text-sm transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Run Action
                </button>
              </div>
            </div>

            {/* Logs Section */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-1 flex items-center gap-2">
                  <Terminal size={14} /> Action Log
                </span>
                <button 
                  onClick={() => setLogs([])}
                  className="text-[10px] text-neutral-600 hover:text-neutral-400 transition"
                >
                  Clear
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-700 italic">
                    <p>No actions logged yet</p>
                  </div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="p-2 rounded hover:bg-neutral-800/50 group border border-transparent hover:border-neutral-800 transition">
                      <div className="flex justify-between mb-1">
                        <span className={`uppercase text-[9px] font-bold ${
                          log.type === 'error' ? 'text-red-500' : 
                          log.type === 'command' ? 'text-indigo-400' :
                          log.type === 'ai' ? 'text-purple-400' :
                          log.type === 'action' ? 'text-green-500' : 'text-neutral-500'
                        }`}>{log.type}</span>
                        <span className="text-neutral-600 group-hover:text-neutral-500 transition">{log.timestamp}</span>
                      </div>
                      <p className="text-neutral-300 break-words">{log.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Side: Preview */}
          <div className="flex-1 bg-neutral-950 flex flex-col p-6">
            <div className="flex-1 bg-black rounded-xl border border-neutral-800 shadow-2xl relative overflow-hidden flex flex-col group">
              {/* Browser Address Bar UI (Decorative) */}
              <div className="h-10 bg-neutral-900 border-b border-neutral-800 flex items-center px-4 gap-4">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-neutral-800"></div>
                  <div className="w-3 h-3 rounded-full bg-neutral-800"></div>
                  <div className="w-3 h-3 rounded-full bg-neutral-800"></div>
                </div>
                <div className="flex-1 h-6 bg-neutral-950 border border-neutral-800 rounded-md px-3 flex items-center gap-2">
                  <Sparkles size={12} className="text-green-500" />
                  <span className="text-[10px] text-neutral-500 truncate">{url}</span>
                </div>
                <ExternalLink size={14} className="text-neutral-600" />
              </div>

              {/* Viewport */}
              <div 
                className="flex-1 relative flex items-center justify-center overflow-auto bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] [background-size:20px_20px] outline-none"
                onClick={handleViewerClick}
                onKeyDown={handleViewerKeyDown}
                tabIndex={0}
              >
                {intervention && (
                  <div 
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 w-full max-w-sm animate-in slide-in-from-bottom-4 duration-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="bg-neutral-900 border-2 border-purple-500 rounded-2xl shadow-[0_0_30px_rgba(168,85,247,0.3)] p-6 flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-500 border border-purple-500/20">
                          {intervention.type === '2fa' || intervention.type === 'otp' ? <Key size={20} /> : <HelpCircle size={20} />}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-sm font-bold text-white leading-tight">Human Intervention</h3>
                          <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">Action Required</p>
                        </div>
                        <Bot size={20} className="text-neutral-700" />
                      </div>
                      
                      <p className="text-xs text-neutral-300 leading-relaxed bg-neutral-950/50 p-3 rounded-xl border border-neutral-800">
                        {intervention.message}
                      </p>

                      <div className="space-y-3">
                        {(intervention.type === '2fa' || intervention.type === 'otp' || intervention.type === 'input') && (
                          <input 
                            type="text" 
                            value={interventionInput}
                            onChange={(e) => setInterventionInput(e.target.value)}
                            placeholder={intervention.type === '2fa' || intervention.type === 'otp' ? "Enter code" : "Type your response..."}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-purple-500 outline-none transition"
                            autoFocus
                          />
                        )}

                        <button 
                          onClick={resumeAutomation}
                          className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2.5 rounded-xl font-bold text-sm transition shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 group"
                        >
                          <CheckCircle size={16} className="group-hover:scale-110 transition" />
                          Resume Automation
                        </button>

                        <p className="text-[10px] text-neutral-500 text-center italic">
                          The browser is active. You can click and type directly in the viewer above to interact.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="absolute inset-0 z-20 bg-red-950/20 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="max-w-md bg-neutral-900 border border-red-500/50 p-6 rounded-xl shadow-2xl flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in duration-300">
                      <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                        <AlertCircle size={32} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">Session Error</h3>
                        <p className="text-sm text-neutral-400">{error}</p>
                      </div>
                      <button 
                        onClick={startSession}
                        className="px-6 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm font-medium transition"
                      >
                        Try Restarting Session
                      </button>
                    </div>
                  </div>
                )}

                {screenshot ? (
                  <img 
                    ref={viewerRef}
                    src={screenshot} 
                    alt="Browser Preview" 
                    className="max-w-full h-auto shadow-2xl animate-in fade-in duration-500 cursor-crosshair" 
                  />
                ) : (
                  <div className="flex flex-col items-center gap-6 text-neutral-600 transition-all duration-700">
                    {status === 'Session Active' ? (
                      <>
                        <div className="relative">
                          <div className="w-16 h-16 border-4 border-neutral-800 border-t-indigo-500 rounded-full animate-spin"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Activity size={24} className="text-indigo-500 animate-pulse" />
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-neutral-300 font-medium">Initializing Stream</p>
                          <p className="text-xs text-neutral-500 mt-1">Waiting for first frame...</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-20 h-20 bg-neutral-900 rounded-2xl flex items-center justify-center border border-neutral-800 group-hover:border-neutral-700 transition-colors">
                          <Play size={32} className="text-neutral-700 group-hover:text-neutral-500 transition-colors" />
                        </div>
                        <div className="text-center max-w-xs">
                          <p className="text-neutral-400 font-medium">Ready to Automate</p>
                          <p className="text-xs text-neutral-500 mt-2">Start a session to see the live browser preview and begin interacting with the web.</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              
              {/* Overlay for session state */}
              {status === 'Connected' && !screenshot && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-indigo-600/90 backdrop-blur-md text-white rounded-full text-xs font-bold shadow-2xl flex items-center gap-2 animate-bounce">
                  <Loader2 size={14} className="animate-spin" />
                  CONNECTING TO BROWSER...
                </div>
              )}
            </div>
            
            {/* Keyboard Shortcuts/Help */}
            <div className="mt-4 flex justify-between items-center text-[10px] text-neutral-600 uppercase tracking-widest px-2">
              <div className="flex gap-4">
                <span className="flex items-center gap-1"><kbd className="bg-neutral-800 px-1 rounded text-neutral-400 font-sans">CMD</kbd> + <kbd className="bg-neutral-800 px-1 rounded text-neutral-400 font-sans">K</kbd> Quick Search</span>
                <span className="flex items-center gap-1"><kbd className="bg-neutral-800 px-1 rounded text-neutral-400 font-sans">ESC</kbd> Stop Action</span>
              </div>
              <div className="flex gap-4">
                <span className="flex items-center gap-1 hover:text-neutral-400 cursor-help transition">View Shortcuts</span>
                <span className="flex items-center gap-1 hover:text-neutral-400 cursor-help transition">API Documentation</span>
              </div>
            </div>
          </div>

          {/* AI Chat Slide-over */}
          <div className={`absolute right-0 top-0 bottom-0 w-80 bg-neutral-900 border-l border-neutral-800 shadow-2xl transform transition-transform duration-300 ease-in-out z-20 flex flex-col ${
            isChatOpen ? 'translate-x-0' : 'translate-x-full'
          }`}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-purple-600 rounded flex items-center justify-center">
                  <Sparkles size={14} className="text-white" />
                </div>
                <span className="font-semibold text-sm">AI Assistant</span>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-neutral-800 rounded transition text-neutral-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-950/30">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                  <div className="space-y-2 opacity-50">
                    <Bot size={40} className="text-neutral-600 mx-auto" />
                    <p className="text-xs px-8 text-neutral-500 font-medium leading-relaxed">
                      Hello! I'm your ASSIX. Automation assistant. How can I help you today?
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2 w-full px-4">
                    {[
                      "Go on Airbnb and send messages",
                      "Check latest news on Google",
                      "Scrape lead data from LinkedIn",
                      "Monitor GitHub notifications"
                    ].map((suggestion) => (
                      <button 
                        key={suggestion}
                        onClick={() => {
                          setChatInput(suggestion);
                          // Auto-send if we want, or just fill
                        }}
                        className="text-left p-3 rounded-xl border border-neutral-800 bg-neutral-900/50 text-[11px] text-neutral-400 hover:border-purple-500/50 hover:text-white transition group flex items-center gap-2"
                      >
                        <Sparkles size={12} className="text-purple-500 opacity-50 group-hover:opacity-100" />
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider ${
                    msg.role === 'user' ? 'text-indigo-400 flex-row-reverse' : 'text-purple-400'
                  }`}>
                    {msg.role === 'user' ? <User size={10} /> : <Bot size={10} />}
                    {msg.role === 'user' ? 'You' : 'ASSIX. AI'}
                  </div>
                  <div className={`max-w-[90%] p-3 rounded-2xl text-sm shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-tr-none' 
                      : 'bg-neutral-800 text-neutral-200 rounded-tl-none border border-neutral-700'
                  }`}>
                    {msg.content}
                    {msg.status === 'executing' && (
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-purple-300 font-medium bg-purple-900/30 px-2 py-1 rounded-md">
                        <Loader2 size={10} className="animate-spin" />
                        Executing browser actions...
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-neutral-600 mt-1 px-1">{msg.timestamp}</span>
                </div>
              ))}
              {isTyping && (
                <div className="flex flex-col items-start animate-in fade-in duration-300">
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-purple-400">
                    <Bot size={10} />
                    ASSIX. AI
                  </div>
                  <div className="bg-neutral-800 text-neutral-200 p-3 rounded-2xl rounded-tl-none border border-neutral-700 flex gap-1">
                    <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce"></div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-neutral-800 bg-neutral-900/50">
              <form onSubmit={sendChatMessage} className="relative">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask AI to automate..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-4 pr-10 py-3 text-sm focus:ring-1 focus:ring-purple-500 outline-none transition placeholder:text-neutral-600"
                />
                <button 
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 text-white rounded-lg transition disabled:text-neutral-600"
                >
                  <Send size={16} />
                </button>
              </form>
              <p className="text-[9px] text-neutral-600 mt-3 text-center uppercase tracking-widest font-medium">
                Powered by ASSIX. AI Orchestrator
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

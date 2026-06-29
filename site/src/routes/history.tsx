import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  History, 
  Search, 
  Filter, 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Calendar,
  Activity,
  ArrowRight,
  X,
  FileText,
  Shield,
  Terminal,
  MousePointer2,
  Users,
  Download,
  ChevronRight,
  ChevronDown
} from "lucide-react";
import { Sidebar } from "../components/Sidebar";

export const Route = createFileRoute("/history")({
  component: HistoryView,
});

type Lead = {
  id: string;
  name: string;
  email: string;
  details: string;
  dataJson: string;
  createdAt: string;
};

type SessionHistory = {
  id: string;
  status: "completed" | "failed" | "running" | "paused";
  createdAt: string;
  endedAt?: string;
  summary: string;
  result?: string;
  actionCount: number;
  screenshot?: string;
  logs?: { timestamp: string; type: string; message: string }[];
  leads?: Lead[];
};

function HistoryView() {
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSession, setSelectedSession] = useState<SessionHistory | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "leads" | "logs">("details");
  const [expandedLead, setExpandedLead] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const resp = await fetch("/api/sessions/history");
        if (resp.ok) {
          const data = await resp.json();
          setSessions(data.history || []);
        } else {
          // Fallback to mock data if API not ready
          setSessions(mockData);
        }
      } catch (err) {
        setSessions(mockData);
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, []);

  useEffect(() => {
    if (selectedSession && !selectedSession.leads) {
      const fetchLeads = async () => {
        try {
          const resp = await fetch(`/api/sessions/${selectedSession.id}/leads`);
          if (resp.ok) {
            const data = await resp.json();
            const leads = data.leads || [];
            
            setSessions(prev => prev.map(s => s.id === selectedSession.id ? { ...s, leads } : s));
            setSelectedSession(prev => prev?.id === selectedSession.id ? { ...prev, leads } : prev);
          }
        } catch (err) {
          console.error("Failed to fetch leads", err);
        }
      };
      fetchLeads();
    }
  }, [selectedSession?.id]);

  const filteredSessions = sessions.filter(s => 
    s.summary.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportLeadsToCsv = (leads: Lead[]) => {
    if (!leads.length) return;
    
    const headers = ["id", "name", "email", "details", "createdAt", "raw_data"];
    const rows = leads.map(l => [
      l.id,
      `"${l.name.replace(/"/g, '""')}"`,
      l.email,
      `"${l.details.replace(/"/g, '""')}"`,
      l.createdAt,
      `"${l.dataJson.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `leads_${selectedSession?.id || "export"}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 border-b border-neutral-800 flex items-center justify-between px-8 bg-neutral-900/20 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <History className="text-indigo-500" size={24} />
              Session History
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
              <input 
                type="text" 
                placeholder="Search sessions..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none transition w-64"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm font-medium transition border border-neutral-700">
              <Filter size={16} />
              Filter
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-neutral-800 border-t-indigo-500 rounded-full animate-spin"></div>
                <p className="text-neutral-500 animate-pulse">Loading history...</p>
              </div>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-600 space-y-4">
              <History size={64} className="opacity-20" />
              <div className="text-center">
                <p className="text-lg font-medium text-neutral-400">No sessions found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-4">
              <div className="grid grid-cols-12 px-6 py-3 text-xs font-bold text-neutral-500 uppercase tracking-widest">
                <div className="col-span-5">Summary & ID</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Started At</div>
                <div className="col-span-2">Duration</div>
                <div className="col-span-1"></div>
              </div>

              {filteredSessions.map((session) => (
                <div 
                  key={session.id} 
                  onClick={() => setSelectedSession(session)}
                  className="grid grid-cols-12 items-center bg-neutral-900/40 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-6 transition group cursor-pointer"
                >
                  <div className="col-span-5 flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      session.status === 'completed' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                      session.status === 'failed' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                      'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                    }`}>
                      {session.status === 'completed' ? <CheckCircle2 size={20} /> : 
                       session.status === 'failed' ? <XCircle size={20} /> : 
                       <Activity size={20} className="animate-pulse" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{session.summary || 'Untitled Automation'}</p>
                      <p className="text-xs text-neutral-500 font-mono mt-1">{session.id}</p>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      session.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                      session.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                      'bg-blue-500/10 text-blue-500'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        session.status === 'completed' ? 'bg-green-500' :
                        session.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                      }`} />
                      {session.status}
                    </span>
                  </div>

                  <div className="col-span-2 flex items-center gap-2 text-xs text-neutral-400">
                    <Calendar size={14} className="text-neutral-600" />
                    {new Date(session.createdAt).toLocaleDateString()}
                  </div>

                  <div className="col-span-2 flex items-center gap-2 text-xs text-neutral-400">
                    <Clock size={14} className="text-neutral-600" />
                    {calculateDuration(session.createdAt, session.endedAt)}
                  </div>

                  <div className="col-span-1 flex justify-end">
                    <button className="p-2 hover:bg-neutral-800 rounded-lg transition text-neutral-500 hover:text-white">
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Session Details Slide-over */}
        {selectedSession && (
          <div className="absolute inset-0 z-50 flex justify-end">
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedSession(null)}
            />
            <div className="relative w-full max-w-2xl bg-neutral-900 border-l border-neutral-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    selectedSession.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                    selectedSession.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                    'bg-blue-500/10 text-blue-500'
                  }`}>
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white leading-tight">Session Details</h3>
                    <p className="text-xs text-neutral-500 font-mono mt-1">{selectedSession.id}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedSession(null)}
                  className="p-2 hover:bg-neutral-800 rounded-lg transition text-neutral-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-neutral-800 px-6 overflow-x-auto no-scrollbar">
                {[
                  { id: 'details', label: 'Overview', icon: FileText },
                  { id: 'leads', label: `Leads ${selectedSession.leads?.length ? `(${selectedSession.leads.length})` : ''}`, icon: Users },
                  { id: 'logs', label: 'Logs', icon: Terminal },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-bold transition-all border-b-2 -mb-[2px] whitespace-nowrap ${
                      activeTab === tab.id 
                        ? 'border-indigo-500 text-white' 
                        : 'border-transparent text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {activeTab === 'details' && (
                  <>
                    {/* Meta Info */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-neutral-950/50 p-4 rounded-2xl border border-neutral-800">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Status</p>
                        <p className={`text-sm font-bold ${
                          selectedSession.status === 'completed' ? 'text-green-500' :
                          selectedSession.status === 'failed' ? 'text-red-500' :
                          'text-blue-500'
                        }`}>{selectedSession.status.toUpperCase()}</p>
                      </div>
                      <div className="bg-neutral-950/50 p-4 rounded-2xl border border-neutral-800">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Duration</p>
                        <p className="text-sm font-bold text-white">{calculateDuration(selectedSession.createdAt, selectedSession.endedAt)}</p>
                      </div>
                      <div className="bg-neutral-950/50 p-4 rounded-2xl border border-neutral-800">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Actions</p>
                        <p className="text-sm font-bold text-white">{selectedSession.actionCount} Steps</p>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                        <Shield size={14} className="text-indigo-500" />
                        Automation Summary
                      </h4>
                      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                        <p className="text-sm text-neutral-200 leading-relaxed font-medium">
                          {selectedSession.summary}
                        </p>
                        {selectedSession.result && (
                          <div className="mt-4 pt-4 border-t border-neutral-800">
                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Outcome</p>
                            <p className="text-sm text-neutral-400 italic">
                              {selectedSession.result}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Last Screenshot */}
                    {selectedSession.screenshot && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                          <MousePointer2 size={14} className="text-indigo-500" />
                          Final State
                        </h4>
                        <div className="relative group">
                          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                          <div className="relative bg-black rounded-2xl border border-neutral-800 overflow-hidden shadow-2xl">
                            <img 
                              src={selectedSession.screenshot} 
                              alt="Final Session State" 
                              className="w-full h-auto"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'leads' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                        <Users size={14} className="text-indigo-500" />
                        Extracted Leads
                      </h4>
                      {selectedSession.leads && selectedSession.leads.length > 0 && (
                        <button 
                          onClick={() => exportLeadsToCsv(selectedSession.leads!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold rounded-lg transition border border-neutral-700 text-white"
                        >
                          <Download size={14} />
                          Export CSV
                        </button>
                      )}
                    </div>

                    {!selectedSession.leads ? (
                      <div className="h-40 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
                      </div>
                    ) : selectedSession.leads.length === 0 ? (
                      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-8 text-center">
                        <Users size={40} className="mx-auto text-neutral-700 mb-4 opacity-20" />
                        <p className="text-sm text-neutral-500">No leads were extracted during this session.</p>
                      </div>
                    ) : (
                      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden divide-y divide-neutral-800">
                        {selectedSession.leads.map((lead) => (
                          <div key={lead.id} className="transition-all hover:bg-white/5">
                            <div 
                              className="p-4 flex items-center justify-between cursor-pointer"
                              onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{lead.name || 'Unnamed Lead'}</p>
                                <p className="text-xs text-neutral-500 truncate">{lead.email || 'No email provided'}</p>
                              </div>
                              <div className="flex items-center gap-3 text-neutral-500">
                                <p className="text-[10px] font-mono">{new Date(lead.createdAt).toLocaleTimeString()}</p>
                                {expandedLead === lead.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </div>
                            </div>
                            {expandedLead === lead.id && (
                              <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="bg-neutral-900 rounded-xl p-4 space-y-3">
                                  {lead.details && (
                                    <div>
                                      <p className="text-[10px] font-bold text-neutral-500 uppercase mb-1">Details</p>
                                      <p className="text-xs text-neutral-300">{lead.details}</p>
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-[10px] font-bold text-neutral-500 uppercase mb-1">Full Data (JSON)</p>
                                    <pre className="text-[10px] text-indigo-400 bg-black/50 p-3 rounded-lg overflow-x-auto font-mono">
                                      {JSON.stringify(JSON.parse(lead.dataJson), null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'logs' && (
                  <div className="space-y-3 pb-8">
                    <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                      <Terminal size={14} className="text-indigo-500" />
                      Execution Log
                    </h4>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl divide-y divide-neutral-800 overflow-hidden">
                      {(selectedSession.logs || mockLogs).map((log, i) => (
                        <div key={i} className="p-4 flex items-start gap-4 hover:bg-white/5 transition">
                          <span className="text-[10px] font-mono text-neutral-600 pt-0.5 shrink-0">{log.timestamp}</span>
                          <div className="min-w-0">
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded mr-2 ${
                              log.type === 'error' ? 'bg-red-500/10 text-red-500' : 
                              log.type === 'action' ? 'bg-green-500/10 text-green-500' :
                              'bg-neutral-800 text-neutral-400'
                            }`}>
                              {log.type}
                            </span>
                            <p className="text-xs text-neutral-300 mt-1.5 break-words">{log.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-neutral-800 bg-neutral-950/50 flex gap-3 mt-auto">
                <button 
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-sm transition shadow-lg shadow-indigo-500/20"
                >
                  Rerun Automation
                </button>
                <button 
                  onClick={() => activeTab === 'leads' && selectedSession.leads ? exportLeadsToCsv(selectedSession.leads) : setActiveTab('leads')}
                  className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold text-sm transition border border-neutral-700"
                >
                  Export Data
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function calculateDuration(start: string, end?: string) {
  if (!end) return "Active";
  const duration = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

const mockLogs = [
  { timestamp: "12:00:01", type: "system", message: "Starting browser session (chromium)" },
  { timestamp: "12:00:04", type: "action", message: "Navigated to https://www.airbnb.com" },
  { timestamp: "12:00:08", type: "action", message: "Typed 'Tokyo' into search input" },
  { timestamp: "12:00:12", type: "action", message: "Clicked 'Search' button" },
  { timestamp: "12:00:25", type: "system", message: "Extracted 18 listings from the page" },
  { timestamp: "12:00:30", type: "system", message: "Session closed successfully" }
];

const mockData: SessionHistory[] = [
  {
    id: "sess_x8k2l9p4",
    status: "completed",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    endedAt: new Date(Date.now() - 3300000).toISOString(),
    summary: "Scraped Airbnb listings in Tokyo for 2026-07-15",
    actionCount: 24,
    result: "Found 18 listings matching criteria",
    screenshot: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&q=80&w=800",
    leads: [
      { id: "lead_1", name: "Modern Studio in Shibuya", email: "host1@example.com", details: "Price: $120/night, Rating: 4.8", createdAt: new Date(Date.now() - 3400000).toISOString(), dataJson: '{"id":"lead_1","name":"Modern Studio in Shibuya","price":"$120","rating":4.8,"host":"Yuki"}' },
      { id: "lead_2", name: "Traditional House in Kyoto", email: "host2@example.com", details: "Price: $200/night, Rating: 4.9", createdAt: new Date(Date.now() - 3350000).toISOString(), dataJson: '{"id":"lead_2","name":"Traditional House in Kyoto","price":"$200","rating":4.9,"host":"Kenji"}' }
    ]
  },
  {
    id: "sess_m1v7n3q9",
    status: "failed",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    endedAt: new Date(Date.now() - 7100000).toISOString(),
    summary: "LinkedIn Lead Generation - Growth Hackers",
    actionCount: 8,
    result: "Error: CAPTCHA detected on login",
    screenshot: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&q=80&w=800",
    logs: [
      { timestamp: "10:30:01", type: "system", message: "Starting session..." },
      { timestamp: "10:30:05", type: "action", message: "Navigated to linkedin.com" },
      { timestamp: "10:30:12", type: "error", message: "Automation paused: CAPTCHA detected. Human intervention required but timed out." }
    ]
  },
  {
    id: "sess_t5y8u2w1",
    status: "completed",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    endedAt: new Date(Date.now() - 86100000).toISOString(),
    summary: "GitHub Repository Activity Monitor",
    actionCount: 42,
    result: "Updated dashboard with latest commit data",
    screenshot: "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: "sess_r0e4f6g7",
    status: "running",
    createdAt: new Date(Date.now() - 600000).toISOString(),
    summary: "Deep research on AI trends in browser automation",
    actionCount: 12
  }
];

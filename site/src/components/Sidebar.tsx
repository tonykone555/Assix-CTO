import { 
  Shield, 
  Layers, 
  ChevronRight, 
  Settings, 
  History 
} from "lucide-react";
import { Link } from "@tanstack/react-router";

export function Sidebar() {
  return (
    <aside className="w-64 border-r border-neutral-800 bg-neutral-900/50 flex flex-col hidden md:flex h-full">
      <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Shield className="text-white" size={20} />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">Assix</span>
        </Link>
      </div>
      
      <nav className="flex-1 overflow-y-auto p-4 space-y-8">
        <div>
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-4 px-2">Workflows</h3>
          <ul className="space-y-1">
            {['Google Search', 'LinkedIn Scraper', 'GitHub Login'].map((item) => (
              <li key={item}>
                <button className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition group">
                  <Layers size={16} />
                  <span>{item}</span>
                  <ChevronRight size={14} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </li>
            ))}
            <li>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md border border-dashed border-neutral-700 text-neutral-500 hover:text-white hover:border-neutral-500 transition">
                <span className="flex-1 text-left">+ New Workflow</span>
              </button>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-4 px-2">Settings</h3>
          <ul className="space-y-1">
            <li>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition">
                <Settings size={16} />
                <span>Config</span>
              </button>
            </li>
            <li>
              <Link 
                to="/history" 
                className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition [&.active]:bg-neutral-800 [&.active]:text-white"
              >
                <History size={16} />
                <span>History</span>
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      <div className="p-4 border-t border-neutral-800">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center text-xs font-medium">JD</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">John Doe</p>
            <p className="text-xs text-neutral-500 truncate text-green-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Pro Plan
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

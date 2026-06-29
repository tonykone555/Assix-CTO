import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";
import { useState, useEffect } from "react";
import { 
  Eye, 
  MousePointer2, 
  Zap, 
  History, 
  ArrowRight,
  Monitor,
  Cpu,
  Lock,
  Play,
  CheckCircle2,
  Sparkles,
  Layers,
  Activity,
  Search,
  Check,
  Loader2,
  MousePointer
} from "lucide-react";

const getBusinessName = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const cfg = JSON.parse(await readFile("site.json", "utf8")) as {
      businessName?: string;
    };
    return cfg.businessName?.trim() ?? "ASSIX.";
  } catch {
    return "ASSIX.";
  }
});

export const Route = createFileRoute("/")({
  loader: () => getBusinessName(),
  component: Home,
});

function VirtualDemo() {
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const fullText = "Find tech leads in San Francisco...";

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % 4);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (step === 0) {
      setText("");
      let i = 0;
      const typing = setInterval(() => {
        if (i < fullText.length) {
          setText(fullText.slice(0, i + 1));
          i++;
        } else {
          clearInterval(typing);
        }
      }, 50);
      return () => clearInterval(typing);
    }
  }, [step]);

  return (
    <div className="relative max-w-4xl mx-auto rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl overflow-hidden group">
      {/* Browser Header */}
      <div className="h-12 bg-neutral-800 flex items-center px-4 gap-3 border-b border-white/5">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/30" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/30" />
          <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/30" />
        </div>
        <div className="flex-1 h-7 bg-neutral-950 rounded-lg border border-white/5 flex items-center px-3 gap-2">
          <Lock className="w-3 h-3 text-neutral-600" />
          <span className="text-[10px] text-neutral-500 font-mono">https://app.assix.ai/orchestrator</span>
        </div>
      </div>

      {/* Browser Content */}
      <div className="aspect-[16/9] bg-neutral-950 p-8 flex flex-col relative overflow-hidden">
        {/* Background Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] [background-size:24px_24px] opacity-50" />
        
        <div className="relative z-10 flex flex-col h-full">
          <div className="mb-8">
            <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4">AI Instruction</h4>
            <div className="bg-neutral-900 border border-indigo-500/30 rounded-xl p-4 shadow-xl">
              <p className="text-sm font-mono text-indigo-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                {text}
                <span className="w-1.5 h-4 bg-indigo-500 animate-pulse" />
              </p>
            </div>
          </div>

          <div className="flex-1 rounded-xl border border-white/5 bg-neutral-900/50 backdrop-blur-sm p-6 flex flex-col gap-4 overflow-hidden relative">
             {/* Simulated Browser Viewport */}
             {step >= 1 && (
               <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700">
                 <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-neutral-800 animate-pulse" />
                      <div className="h-3 w-32 bg-neutral-800 rounded-full animate-pulse" />
                    </div>
                    <div className="flex gap-2">
                      <div className="h-6 w-16 bg-neutral-800 rounded-md animate-pulse" />
                      <div className="h-6 w-6 bg-neutral-800 rounded-md animate-pulse" />
                    </div>
                 </div>
                 
                 <div className="space-y-4">
                   {[1, 2, 3].map((i) => (
                     <div key={i} className={`p-4 rounded-lg border border-white/5 flex items-center justify-between transition-all duration-500 ${step >= 2 && i === 1 ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-neutral-950/50'}`}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-neutral-800" />
                          <div className="space-y-2">
                            <div className="h-3 w-40 bg-neutral-800 rounded-full" />
                            <div className="h-2 w-24 bg-neutral-800 rounded-full opacity-50" />
                          </div>
                        </div>
                        {step >= 2 && i === 1 ? (
                          <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-bold uppercase tracking-tighter">
                            <CheckCircle2 className="w-4 h-4" /> Selected
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded border border-white/10" />
                        )}
                     </div>
                   ))}
                 </div>
               </div>
             )}

             {/* Animated Cursor */}
             {step === 1 && (
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[mouse-move_2s_ease-in-out_forwards]">
                  <MousePointer2 className="w-6 h-6 text-white drop-shadow-xl fill-indigo-600" />
                  <div className="absolute top-full left-full mt-2 bg-indigo-600 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-tighter shadow-xl">Searching...</div>
               </div>
             )}

             {step === 2 && (
               <div className="absolute top-1/4 right-1/4 animate-[mouse-click_1s_ease-in-out_forwards]">
                  <MousePointer2 className="w-6 h-6 text-white drop-shadow-xl fill-indigo-600" />
                  <div className="absolute top-full left-full mt-2 bg-indigo-600 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-tighter shadow-xl">Selecting Lead</div>
                  <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 bg-indigo-500/40 rounded-full animate-ping" />
               </div>
             )}

             {/* Success Overlay */}
             {step === 3 && (
               <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-md flex items-center justify-center animate-in fade-in zoom-in duration-500 z-20">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/20">
                      <Check className="w-10 h-10 text-white" />
                    </div>
                    <div>
                      <h5 className="text-xl font-bold text-white mb-1">Task Completed</h5>
                      <p className="text-sm text-neutral-400">12 tech leads exported to CRM.</p>
                    </div>
                  </div>
               </div>
             )}
          </div>
        </div>

        {/* Footer info */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-6 opacity-30 text-[10px] uppercase tracking-widest font-mono pointer-events-none">
          <span className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Execution Active</span>
          <span className="flex items-center gap-2"><Activity className="w-3 h-3" /> 120 FPS Viewer</span>
        </div>
      </div>

      <style>{`
        @keyframes mouse-move {
          0% { transform: translate(100px, 100px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes mouse-click {
          0% { transform: translate(0, 0); scale: 1; }
          50% { transform: translate(-20px, 10px); scale: 0.9; }
          100% { transform: translate(-20px, 10px); scale: 1; }
        }
      `}</style>
    </div>
  );
}

function Home() {
  const businessName = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-neutral-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-black text-xl tracking-tighter text-white">{businessName}</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors">Features</a>
            <a href="#demo" className="text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors">Demo</a>
            <Link to="/dashboard" className="text-xs font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors">Dashboard</Link>
            <Link to="/history" className="text-xs font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors">History</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link 
              to="/dashboard" 
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/25"
            >
              Start Building
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Abstract Background Elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px] animate-pulse delay-700" />
        </div>

        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">The Future of Web Ops</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-neutral-400">
            Visual Browser Automation <br className="hidden md:block" />
            <span className="text-indigo-500">for the Modern Web</span>
          </h1>
          
          <p className="max-w-2xl mx-auto text-lg md:text-xl text-neutral-400 mb-12 leading-relaxed">
            Build, monitor, and execute web-based tasks in real-time with a visual live-preview. 
            Watching your workflows as they happen is the only way to ensure 100% accuracy.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-24">
            <Link 
              to="/dashboard"
              className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-lg font-bold transition-all hover:scale-105 shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2"
            >
              Get Started <ArrowRight className="w-5 h-5" />
            </Link>
            <Link 
              to="/history"
              className="w-full sm:w-auto px-8 py-4 bg-neutral-900 border border-neutral-800 text-white rounded-xl text-lg font-bold transition-all hover:bg-neutral-800 flex items-center justify-center gap-2"
            >
              View History
            </Link>
          </div>

          {/* Virtual Demo Section */}
          <div id="demo" className="mb-32 scroll-mt-24">
            <div className="text-center mb-12">
              <h3 className="text-2xl font-bold mb-4 flex items-center justify-center gap-2">
                <Play className="w-5 h-5 text-indigo-500" /> See it in action
              </h3>
              <p className="text-neutral-500 text-sm">Automate any web task with simple natural language instructions.</p>
            </div>
            <VirtualDemo />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 relative bg-neutral-900/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Scale your web operations <br/> with precision</h2>
            <p className="text-neutral-400 text-lg">Powerful tools built for reliability and ease of use.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <Eye className="w-6 h-6" />,
                title: "Live Preview Viewer",
                desc: "Watch your automations run in real-time. Catch errors instantly with our low-latency visual stream."
              },
              {
                icon: <MousePointer2 className="w-6 h-6" />,
                title: "Human-in-the-Loop",
                desc: "Intervene manually whenever needed. Handle 2FA, complex CAPTCHAs, or manual logins seamlessly."
              },
              {
                icon: <Cpu className="w-6 h-6" />,
                title: "AI Orchestrator",
                desc: "Convert natural language instructions into robust browser scripts using our specialized LLM layer."
              },
              {
                icon: <History className="w-6 h-6" />,
                title: "Session History",
                desc: "Detailed audit trails for every run. Review screenshots, logs, and action metrics in a professional dashboard."
              }
            ].map((feature, idx) => (
              <div key={idx} className="p-8 rounded-2xl bg-neutral-900 border border-white/5 hover:border-indigo-500/50 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-6 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                <p className="text-neutral-400 leading-relaxed text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-6">
                <Activity className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Streamlined Workflow</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-8 leading-tight">From Natural Language <br/> to Finished Result.</h2>
              <ul className="space-y-6">
                {[
                  { step: "01", title: "Describe your task", desc: "Simply type what you want to do: 'Find all leads on LinkedIn' or 'Log in to Shopify and export sales'." },
                  { step: "02", title: "AI plans the execution", desc: "Our orchestrator breaks down your request into precise browser actions." },
                  { step: "03", title: "Watch it run live", desc: "Open the viewer and monitor the automation. If it hits a snag, you're in control." }
                ].map((item, idx) => (
                  <li key={idx} className="flex gap-6">
                    <span className="text-2xl font-black text-indigo-500/20">{item.step}</span>
                    <div>
                      <h4 className="text-lg font-bold text-white mb-2">{item.title}</h4>
                      <p className="text-neutral-400 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="relative">
              <div className="absolute -inset-4 bg-indigo-500/10 rounded-3xl blur-2xl" />
              <div className="relative rounded-3xl border border-white/5 bg-neutral-900 p-8 shadow-2xl">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-neutral-950 rounded-xl border border-white/5">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="h-2 w-24 bg-neutral-800 rounded-full mb-2" />
                      <div className="h-2 w-48 bg-neutral-700 rounded-full" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-indigo-600/5 rounded-xl border border-indigo-500/20">
                    <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
                      <Monitor className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <div className="h-2 w-32 bg-indigo-400/50 rounded-full mb-2" />
                      <div className="h-2 w-16 bg-indigo-400/30 rounded-full" />
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-neutral-950 rounded-xl border border-white/5">
                    <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
                      <Layers className="w-4 h-4 text-neutral-500" />
                    </div>
                    <div className="flex-1 opacity-20">
                      <div className="h-2 w-20 bg-neutral-800 rounded-full mb-2" />
                      <div className="h-2 w-40 bg-neutral-800 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 relative">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-700 p-12 md:p-20 text-center relative overflow-hidden shadow-2xl shadow-indigo-500/20">
            <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            
            <h2 className="text-4xl md:text-6xl font-black mb-8 text-white tracking-tight leading-tight">Ready to automate the web?</h2>
            <p className="text-xl text-indigo-100 mb-12 max-w-2xl mx-auto font-medium">Join 500+ teams using {businessName} to scale their browser-based workflows without the headache.</p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                to="/dashboard"
                className="w-full sm:w-auto px-10 py-5 bg-white text-indigo-600 hover:bg-neutral-100 rounded-2xl text-xl font-black transition-all hover:scale-105 shadow-xl"
              >
                Get Started Now
              </Link>
              <button className="w-full sm:w-auto px-10 py-5 bg-indigo-900/30 text-white border border-white/20 hover:bg-indigo-900/40 rounded-2xl text-xl font-bold transition-all backdrop-blur-sm">
                Schedule Demo
              </button>
            </div>
            
            <p className="mt-10 text-indigo-200 text-sm font-medium">Free for up to 5 execution hours per month. No credit card required.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-white/5 bg-neutral-950">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-20">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="font-black text-lg text-white tracking-tighter">{businessName}</span>
              </div>
              <p className="text-neutral-500 max-w-xs leading-relaxed">
                The leading platform for visual browser automation and real-time monitoring. Built for scale, designed for humans.
              </p>
            </div>
            <div>
              <h5 className="text-xs font-black uppercase tracking-widest text-white mb-6">Product</h5>
              <ul className="space-y-4 text-neutral-500 text-xs font-bold uppercase tracking-widest">
                <li><a href="#features" className="hover:text-indigo-400 transition-colors">Features</a></li>
                <li><Link to="/dashboard" className="hover:text-indigo-400 transition-colors">Live Viewer</Link></li>
                <li><Link to="/history" className="hover:text-indigo-400 transition-colors">History</Link></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Integrations</a></li>
              </ul>
            </div>
            <div>
              <h5 className="text-xs font-black uppercase tracking-widest text-white mb-6">Company</h5>
              <ul className="space-y-4 text-neutral-500 text-xs font-bold uppercase tracking-widest">
                <li><a href="#" className="hover:text-indigo-400 transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-12 border-t border-white/5">
            <p className="text-neutral-600 text-[10px] uppercase tracking-widest font-bold">© {new Date().getFullYear()} {businessName} Inc. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-neutral-600 hover:text-white transition-colors text-[10px] uppercase tracking-widest font-bold">Twitter</a>
              <a href="#" className="text-neutral-600 hover:text-white transition-colors text-[10px] uppercase tracking-widest font-bold">GitHub</a>
              <a href="#" className="text-neutral-600 hover:text-white transition-colors text-[10px] uppercase tracking-widest font-bold">Discord</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Global CSS for Animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce-horizontal {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(20px); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-fade-in { animation: fade-in 0.8s ease-out forwards; }
        .animate-bounce-horizontal { animation: bounce-horizontal 3s ease-in-out infinite; }
        .animate-float { animation: float 6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

import { Link, useNavigate } from "react-router-dom";
import { useAuth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.svg";
import { LogOut, ShieldCheck, LayoutDashboard, Menu, X } from "lucide-react";
import { useState } from "react";
import CurrencyPicker from "@/components/CurrencyPicker";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const NavLinks = () => (
    <>
      <Link to="/about" className="text-sm font-medium text-foreground/70 hover:text-primary transition-smooth">About</Link>
      <Link to="/levels" className="text-sm font-medium text-foreground/70 hover:text-primary transition-smooth">Levels</Link>
      <Link to="/how-it-works" className="text-sm font-medium text-foreground/70 hover:text-primary transition-smooth">How it works</Link>
      <Link to="/verify" className="text-sm font-medium text-foreground/70 hover:text-primary transition-smooth">Verify Certificate</Link>
      <Link to="/faq" className="text-sm font-medium text-foreground/70 hover:text-primary transition-smooth">FAQ</Link>
      <Link to="/blog" className="text-sm font-medium text-foreground/70 hover:text-primary transition-smooth">Blog</Link>
      <Link to="/contact" className="text-sm font-medium text-foreground/70 hover:text-primary transition-smooth">Contact</Link>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Thin gold letterhead stripe at very top */}
      <div className="h-[3px] bg-gold w-full" />

      <header className="sticky top-0 z-50 bg-background/97 border-b border-border backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between py-3">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="TOEFL Academic" className="h-9 w-9" width={36} height={36} />
            <div className="leading-tight">
              <div className="font-serif text-base font-bold text-foreground">TOEFL Academic</div>
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">English Certification</div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-6"><NavLinks /></nav>

          <div className="hidden lg:flex items-center gap-2">
            <CurrencyPicker />
            {user ? (
              <>
                {isAdmin && (
                  <Button variant="ghost" size="sm" className="text-foreground/70 hover:text-foreground" onClick={() => navigate("/admin")}>
                    <ShieldCheck className="w-4 h-4 mr-1" /> Admin
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="text-foreground/70 hover:text-foreground" onClick={() => navigate("/dashboard")}>
                  <LayoutDashboard className="w-4 h-4 mr-1" /> Dashboard
                </Button>
                <Button variant="outline" size="sm" onClick={signOut}>
                  <LogOut className="w-4 h-4 mr-1" /> Sign out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="text-foreground/70 hover:text-foreground" onClick={() => navigate("/auth")}>Sign in</Button>
                <Button size="sm" className="bg-primary text-primary-foreground font-semibold hover:bg-primary/90" onClick={() => navigate("/auth?mode=signup")}>Book a test</Button>
              </>
            )}
          </div>

          <button className="lg:hidden p-2 text-foreground" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X /> : <Menu />}
          </button>
        </div>

        {open && (
          <div className="lg:hidden border-t border-border bg-background">
            <div className="container mx-auto py-4 flex flex-col gap-3">
              <NavLinks />
              <div className="flex flex-col gap-2 pt-3 border-t border-border">
                <div className="flex justify-start"><CurrencyPicker /></div>
                {user ? (
                  <>
                    {isAdmin && <Button variant="ghost" onClick={() => { navigate("/admin"); setOpen(false); }}>Admin</Button>}
                    <Button variant="ghost" onClick={() => { navigate("/dashboard"); setOpen(false); }}>Dashboard</Button>
                    <Button variant="outline" onClick={signOut}>Sign out</Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => { navigate("/auth"); setOpen(false); }}>Sign in</Button>
                    <Button className="bg-primary text-primary-foreground font-semibold hover:bg-primary/90" onClick={() => { navigate("/auth?mode=signup"); setOpen(false); }}>Book a test</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-[#1C1410] text-[#EEE9DC] mt-16">
        <div className="container mx-auto py-12 grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src={logo} alt="" className="h-9 w-9" width={36} height={36} />
              <div className="font-serif text-lg font-bold">TOEFL Academic</div>
            </div>
            <p className="text-sm text-[#EEE9DC]/60">Globally recognised English language certification, accessible from anywhere in the world.</p>
          </div>
          <div>
            <h4 className="font-serif text-base font-semibold mb-3 text-gold">Test Takers</h4>
            <ul className="space-y-2 text-sm text-[#EEE9DC]/70">
              <li><Link to="/levels" className="hover:text-gold transition-smooth">Choose a level</Link></li>
              <li><Link to="/how-it-works" className="hover:text-gold transition-smooth">How it works</Link></li>
              <li><Link to="/auth?mode=signup" className="hover:text-gold transition-smooth">Book a test</Link></li>
              <li><Link to="/sample-test" className="hover:text-gold transition-smooth">Free sample test</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-serif text-base font-semibold mb-3 text-gold">Organisations</h4>
            <ul className="space-y-2 text-sm text-[#EEE9DC]/70">
              <li><Link to="/verify" className="hover:text-gold transition-smooth">Verify a certificate</Link></li>
              <li><Link to="/for-employers" className="hover:text-gold transition-smooth">For employers</Link></li>
              <li><Link to="/for-schools" className="hover:text-gold transition-smooth">For schools</Link></li>
              <li><Link to="/recognition" className="hover:text-gold transition-smooth">Recognition</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-serif text-base font-semibold mb-3 text-gold">Company</h4>
            <ul className="space-y-2 text-sm text-[#EEE9DC]/70">
              <li><Link to="/about" className="hover:text-gold transition-smooth">About us</Link></li>
              <li><Link to="/contact" className="hover:text-gold transition-smooth">Contact</Link></li>
              <li><Link to="/faq" className="hover:text-gold transition-smooth">FAQ</Link></li>
              <li><Link to="/blog" className="hover:text-gold transition-smooth">Blog</Link></li>
              <li><Link to="/privacy" className="hover:text-gold transition-smooth">Privacy policy</Link></li>
              <li><Link to="/terms" className="hover:text-gold transition-smooth">Terms of service</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="container mx-auto py-5 flex flex-col md:flex-row justify-between gap-3 text-xs text-[#EEE9DC]/40">
            <div>© {new Date().getFullYear()} TOEFL Academic. All rights reserved.</div>
            <div>Issued under CEFR alignment · ISO 17024 oriented framework</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

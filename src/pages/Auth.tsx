import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { z } from "zod";
import { COUNTRIES, COUNTRY_CURRENCY, setStoredCountry } from "@/lib/currency";

const signInSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "At least 6 characters").max(72),
});
const signUpSchema = signInSchema.extend({
  fullName: z.string().trim().min(2, "Name required").max(100),
  country: z.string().trim().min(2, "Please select your country").max(2),
});

export default function Auth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      const lvl = params.get("level");
      navigate(lvl ? `/dashboard?book=${lvl}` : "/dashboard");
    }
  }, [user, navigate, params]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const parsed = signUpSchema.safeParse({ email, password, fullName, country });
        if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { full_name: fullName, country } }
        });
        if (error) throw error;
        setStoredCountry(country);
        const cur = COUNTRY_CURRENCY[country] ?? "USD";
        toast.success(`Account created! Prices will show in ${cur}.`);
      } else {
        const parsed = signInSchema.safeParse({ email, password });
        if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto py-16 max-w-md">
        <Card className="p-8 shadow-elegant">
          <h1 className="font-serif text-3xl font-bold text-primary mb-2">{mode === "signup" ? "Create your account" : "Sign in"}</h1>
          <p className="text-sm text-muted-foreground mb-6">{mode === "signup" ? "Start your English certification journey." : "Continue your certification."}</p>
          <form onSubmit={handle} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={100} />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <select
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Select your country…</option>
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({COUNTRY_CURRENCY[c.code] ?? "USD"})
                      </option>
                    ))}
                  </select>
                  {country && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Prices will be shown in <strong className="text-accent">{COUNTRY_CURRENCY[country] ?? "USD"}</strong>.
                    </p>
                  )}
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={72} />
            </div>
            <Button type="submit" variant="gold" className="w-full" disabled={loading}>
              {loading ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
          <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="text-sm text-accent hover:underline mt-4 block w-full text-center">
            {mode === "signup" ? "Already have an account? Sign in" : "New to TOEFL Academic? Create an account"}
          </button>
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary mt-6 block text-center">← Back to home</Link>
        </Card>
      </div>
    </Layout>
  );
}

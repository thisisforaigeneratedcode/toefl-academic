import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Exam from "./pages/Exam";
import Results from "./pages/Results";
import Certificate from "./pages/Certificate";
import Verify from "./pages/Verify";
import Admin from "./pages/Admin";
import { About, Levels, HowItWorks, Faq, Contact, Privacy, Terms, ForEmployers, ForSchools, Recognition, SampleTest } from "./pages/Info";
import ApiEarnings from "./pages/ApiEarnings";
import NotFound from "./pages/NotFound.tsx";
import SupportChat from "./components/SupportChat";
import { BlogIndex, BlogPost } from "./pages/Blog";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/exam/:id" element={<Exam />} />
          <Route path="/results/:id" element={<Results />} />
          <Route path="/certificate/:number" element={<Certificate />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify/:number" element={<Verify />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/costs" element={<ApiEarnings />} />
          <Route path="/about" element={<About />} />
          <Route path="/levels" element={<Levels />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/for-employers" element={<ForEmployers />} />
          <Route path="/for-schools" element={<ForSchools />} />
          <Route path="/recognition" element={<Recognition />} />
          <Route path="/sample-test" element={<SampleTest />} />
          <Route path="/blog" element={<BlogIndex />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <SupportChat />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

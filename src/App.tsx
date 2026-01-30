import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Webinars from "./pages/Webinars";
import Blogs from "./pages/Blogs";
import BlogPost from "./pages/BlogPost";
import UseCases from "./pages/UseCases";
import UseCasePost from "./pages/UseCasePost";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename="/products/api">
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/webinars" element={<Webinars />} />
          <Route path="/blogs" element={<Blogs />} />
          <Route path="/blogs/:slug" element={<BlogPost />} />
          <Route path="/use-cases" element={<UseCases />} />
          <Route path="/use-cases/:slug" element={<UseCasePost />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);


export default App;

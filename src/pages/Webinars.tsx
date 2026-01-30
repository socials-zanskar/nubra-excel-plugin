import { motion } from "framer-motion";
import { NavBar } from "@/components/NavBar";
import WebinarHero from "@/components/webinars/WebinarHero";
import WebinarMainContent from "@/components/webinars/WebinarMainContent";
import BlogSidebar from "@/components/webinars/BlogSidebar";

const Webinars = () => {
  return (
    <div 
      className="min-h-screen bg-background usecase-font"
      style={{ 
        backgroundImage: "url('/images/bg-2.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      <NavBar />
      <WebinarHero />
      
      <div className="container mx-auto px-4 lg:px-8 pb-20">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content - 70% */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full lg:w-[70%]"
          >
            <WebinarMainContent />
          </motion.div>
          
          {/* Sidebar - 30% */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="w-full lg:w-[30%]"
          >
            <BlogSidebar />
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Webinars;

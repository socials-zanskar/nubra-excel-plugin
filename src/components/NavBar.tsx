import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, X, ChevronDown } from "lucide-react";
import activePill from "@/assets/active-pill.png";
import nubraLogo from "@/assets/Nubra Logo.png";

const developerItems = [
  { label: "API Docs", href: "/products/api/docs/", isExternal: true },
  { label: "Use Case", href: "/use-cases" },
  { label: "NubraAI", href: "https://chatbase.co/CafXmTi_cnvWzagxfBe4_/help", isExternal: true },
];

const communityItems = [
  { label: "Webinar", href: "/webinars" },
  { label: "Blogs", href: "/blogs" },
  { label: "Integrate with Nubra", href: "/integrate" },
];

export const NavBar = () => {
  const location = useLocation();
  const navRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const itemWidth = 120;
  const gap = 4;
  const padding = 6;

  const getActiveIndex = () => {
    if (location.pathname === "/") return 0;
    if (location.pathname.startsWith("/use-cases")) return 1;
    if (
      location.pathname.startsWith("/webinars") ||
      location.pathname.startsWith("/blogs") ||
      location.pathname.startsWith("/integrate")
    ) {
      return 2;
    }
    return 0;
  };

  const calculateLeft = (index: number) => padding + index * (itemWidth + gap);

  const [indicatorLeft, setIndicatorLeft] = useState(() => calculateLeft(getActiveIndex()));

  useEffect(() => {
    const activeIndex = getActiveIndex();
    setIndicatorLeft(calculateLeft(activeIndex));
  }, [location.pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const isDeveloperActive = location.pathname.startsWith("/use-cases");
  const isCommunityActive =
    location.pathname.startsWith("/webinars") ||
    location.pathname.startsWith("/blogs") ||
    location.pathname.startsWith("/integrate");

  const navigate = useNavigate();

  const handlePricingClick = () => {
    setMobileMenuOpen(false);
    if (location.pathname !== '/') {
      navigate('/');
      setTimeout(() => {
        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] md:w-auto">
      {/* Desktop Navigation */}
      <div className="hidden md:flex items-center gap-4">
        {/* Pill container */}
        <div 
          ref={navRef}
          className="relative flex items-center gap-1 px-1.5 py-1.5 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/20"
        >
          {/* Sliding glow indicator */}
          <img
            src={activePill}
            alt=""
            className="absolute top-1.5 bottom-1.5 h-[calc(100%-12px)] transition-all duration-300 ease-out pointer-events-none"
            style={{
              left: indicatorLeft,
              width: itemWidth,
            }}
          />

          <Link
            to="/"
            className={`
              relative z-10 flex items-center justify-center gap-2 w-[120px] py-2 rounded-full text-sm font-medium transition-colors duration-200
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
              ${location.pathname === "/" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}
            `}
          >
            <img src={nubraLogo} alt="" className="w-[18px] h-[18px]" />
            Nubra API
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`
                  relative z-10 flex items-center justify-center gap-2 w-[120px] py-2 rounded-full text-sm font-medium transition-colors duration-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                  ${isDeveloperActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}
                `}
              >
                Developer
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {developerItems.map((item) => (
                <DropdownMenuItem key={item.label} asChild>
                  {item.isExternal ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer">
                      {item.label}
                    </a>
                  ) : (
                    <Link to={item.href}>{item.label}</Link>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`
                  relative z-10 flex items-center justify-center gap-2 w-[120px] py-2 rounded-full text-sm font-medium transition-colors duration-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                  ${isCommunityActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}
                `}
              >
                Community
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {communityItems.map((item) => (
                <DropdownMenuItem key={item.label} asChild>
                  <Link to={item.href}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={handlePricingClick}
            className={`
              relative z-10 flex items-center justify-center gap-2 w-[120px] py-2 rounded-full text-sm font-medium transition-colors duration-200
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
              text-muted-foreground hover:text-foreground
            `}
          >
            Pricing
          </button>
        </div>

        {/* Integrate with Nubra button removed; moved into Community dropdown */}
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden flex items-center justify-between px-4 py-2 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/20">
        <Link to="/" className="flex items-center gap-2">
          <img src={nubraLogo} alt="Nubra" className="w-[18px] h-[18px]" />
          <span className="text-sm font-medium text-foreground">Nubra API</span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-foreground"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/20 overflow-hidden">
          <div className="flex flex-col p-2">
            <Link
              to="/"
              className={`px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                location.pathname === "/" 
                  ? "text-primary bg-white/10" 
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              Nubra API
            </Link>

            <div className="px-4 pt-3 pb-1 text-xs uppercase tracking-widest text-muted-foreground/70">
              Developer
            </div>
            {developerItems.map((item) => (
              item.isExternal ? (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-colors"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  to={item.href}
                  className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
                    location.pathname.startsWith(item.href)
                      ? "text-primary bg-white/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              )
            ))}

            <div className="px-4 pt-3 pb-1 text-xs uppercase tracking-widest text-muted-foreground/70">
              Community
            </div>
            {communityItems.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
                  location.pathname.startsWith(item.href)
                    ? "text-primary bg-white/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {item.label}
              </Link>
            ))}

            <button
              onClick={handlePricingClick}
              className="px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-colors"
            >
              Pricing
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

import nubraLogo from "@/assets/nubra-logo-footer.avif";

const Footer = () => {
  return (
    <footer className="w-full bg-[#080808] border-t border-[#5E5E76]/40">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Quick Links Row */}
        <div className="flex justify-center gap-8 mb-10">
          <a
            href="/products/api/docs/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground/80 transition-colors font-medium"
          >
            API Documentation
          </a>
          <a
            href="https://pypi.org/project/nubra-sdk/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground/80 transition-colors font-medium"
          >
            Python SDK
          </a>
        </div>

        {/* Regulatory Information Block */}
        <div className="text-center mb-10 max-w-3xl mx-auto space-y-2">
          <p className="text-muted-foreground/70 text-sm leading-relaxed">
            Zanskar Securities Private Limited is a SEBI registered stock broker (INZ000316631)
          </p>
          <p className="text-muted-foreground/70 text-sm leading-relaxed">
            Exchange Membership No.: NSE: 90370 | BSE: 6870 | CDSL DP Id: 12102000
          </p>
          <p className="text-muted-foreground/70 text-sm leading-relaxed">
            Address: 4th floor (left wing), Raheja point 17/2, Magarath Road, Ashok Nagar, Opp Garuda Mall, Bengaluru, Karnataka-560025
          </p>
          <p className="text-muted-foreground/70 text-sm leading-relaxed">
            E-mail: Compliance@zanskarsec.com | Telephone No.: +91 86605 00796
          </p>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-border/20 pt-8 flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Left - Logo */}
          <div className="flex items-center">
            <img
              src={nubraLogo}
              alt="Nubra"
              className="h-6 w-auto"
            />
          </div>

          {/* Right - Copyright & Links */}
          <div className="text-center md:text-right space-y-2">
            <p className="text-muted-foreground/60 text-xs">
              © 2025 Zanskar Securities Private Limited. All rights reserved. CIN: U64199KA2023PTC17563
            </p>
            <div className="flex justify-center md:justify-end gap-4">
              <a
                href="#"
                className="text-muted-foreground/60 hover:text-muted-foreground text-xs transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="#"
                className="text-muted-foreground/60 hover:text-muted-foreground text-xs transition-colors"
              >
                Terms of Service
              </a>
              <a
                href="#"
                className="text-muted-foreground/60 hover:text-muted-foreground text-xs transition-colors"
              >
                Disclaimer
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export { Footer };

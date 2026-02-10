import { NavBar } from "@/components/NavBar";
import { IntegrationSection } from "@/components/IntegrationSection";

const Integrate = () => {
  return (
    <div
      className="min-h-screen bg-background"
      style={{
        backgroundImage: "url('/images/bg-2.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <NavBar />
      <IntegrationSection />
    </div>
  );
};

export default Integrate;

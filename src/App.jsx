import { useState } from "react";
import NavigationLearningAppEGO from "./nla-ego-version.jsx";
import NavigationLearningAppALLO from "./nla-allo-version.jsx";
import Dashboard from "./dashboard.jsx";

// Researcher view lives at ?view=dashboard — deliberately not linked from the
// participant UI so nobody stumbles into it mid-experiment.
function wantsDashboard() {
  return new URLSearchParams(window.location.search).get("view") === "dashboard";
}

export default function App() {
  const [version, setVersion] = useState(() => localStorage.getItem('nla_version') || null);

  if (wantsDashboard()) return <Dashboard />;

  const handleSetVersion = (v) => {
    localStorage.setItem('nla_version', v);
    setVersion(v);
  };

  if (version === "ego") return <NavigationLearningAppEGO onSwitchVersion={handleSetVersion} />;
  if (version === "allo") return <NavigationLearningAppALLO onSwitchVersion={handleSetVersion} />;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      gap: "20px",
      fontFamily: "sans-serif",
    }}>
      <h2 style={{ fontSize: "24px" }}>Select Experiment Version</h2>
      <button
        onClick={() => handleSetVersion("ego")}
        style={{ padding: "18px 36px", fontSize: "20px", borderRadius: "8px", border: "1px solid #ccc", cursor: "pointer" }}
      >
        Ego (Egocentric)
      </button>
      <button
        onClick={() => handleSetVersion("allo")}
        style={{ padding: "18px 36px", fontSize: "20px", borderRadius: "8px", border: "1px solid #ccc", cursor: "pointer" }}
      >
        Allo (Allocentric)
      </button>
    </div>
  );
}

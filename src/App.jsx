import { useState } from "react";
import NavigationLearningAppEGO from "./nla-ego-version.jsx";
import NavigationLearningAppALLO from "./nla-allo-version.jsx";

export default function App() {
  const [version, setVersion] = useState(null);

  if (version === "ego") return <NavigationLearningAppEGO />;
  if (version === "allo") return <NavigationLearningAppALLO />;

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
        onClick={() => setVersion("ego")}
        style={{ padding: "18px 36px", fontSize: "20px", borderRadius: "8px", border: "1px solid #ccc", cursor: "pointer" }}
      >
        Ego (Egocentric)
      </button>
      <button
        onClick={() => setVersion("allo")}
        style={{ padding: "18px 36px", fontSize: "20px", borderRadius: "8px", border: "1px solid #ccc", cursor: "pointer" }}
      >
        Allo (Allocentric)
      </button>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";

function clampDeg(d) {
  return (d % 360 + 360) % 360;
}

function computeHeadingFromEvent(e) {
  // iOS Safari may provide this
  if (typeof e.webkitCompassHeading === "number") {
    return clampDeg(e.webkitCompassHeading);
  }
  // fallback: alpha
  if (typeof e.alpha === "number") {
    return clampDeg(360 - e.alpha);
  }
  return null;
}

export default function OrientationDebug() {
  const [perm, setPerm] = useState("unknown");
  const [raw, setRaw] = useState({ alpha: null, beta: null, gamma: null, absolute: null });
  const [heading, setHeading] = useState(null);
  
  const [events, setEvents] = useState(0);
  const hasDOE = typeof window !== "undefined" && "DeviceOrientationEvent" in window;
  

  const rotateStyle = useMemo(() => {
    if (heading == null) return {};
    return { transform: `rotate(${heading}deg)` };
  }, [heading]);

  async function requestPerm() {
    try {
      if (typeof DeviceOrientationEvent?.requestPermission === "function") {
        const res = await DeviceOrientationEvent.requestPermission();
        setPerm(res);
        alert("permission: " + res);
      } else {
        setPerm("not-needed");
        alert("No requestPermission() on this browser.");
      }
    } catch (e) {
      console.error(e);
      setPerm("error: " + (e?.message || String(e)));
      alert("error: " + (e?.message || String(e)));
    }
  }  

  useEffect(() => {
    const handler = (e) => {
      setRaw({
        alpha: e.alpha,
        beta: e.beta,
        gamma: e.gamma,
        absolute: e.absolute,
      });
      setHeading(computeHeadingFromEvent(e));
    };

    window.addEventListener("deviceorientation", handler, true);
    window.addEventListener("deviceorientationabsolute", handler, true);

    return () => {
      window.removeEventListener("deviceorientation", handler, true);
      window.removeEventListener("deviceorientationabsolute", handler, true);
    };
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <h2>Orientation Debug</h2>
      <button onClick={requestPerm} style={{ padding: "10px 14px" }}>
        Enable Orientation
      </button>

      <div style={{ marginTop: 12, fontFamily: "monospace", lineHeight: 1.6 }}>
        perm: {perm}
        <br />
        alpha: {raw.alpha?.toFixed?.(2) ?? String(raw.alpha)}
        <br />
        beta: {raw.beta?.toFixed?.(2) ?? String(raw.beta)}
        <br />
        gamma: {raw.gamma?.toFixed?.(2) ?? String(raw.gamma)}
        <br />
        absolute: {String(raw.absolute)}
        <br />
        heading: {heading?.toFixed?.(2) ?? String(heading)}
      </div>

      <div
        style={{
          marginTop: 18,
          width: 140,
          height: 140,
          border: "1px solid #999",
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "12px solid transparent",
            borderRight: "12px solid transparent",
            borderBottom: "36px solid black",
            ...rotateStyle,
          }}
        />
      </div>

      <p style={{ marginTop: 12, color: "#666" }}>
        Rotate your phone; alpha/heading should change. If all null, it’s permissions/HTTPS.
      </p>
    </div>
  );
}

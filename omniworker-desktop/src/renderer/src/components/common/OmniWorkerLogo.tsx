import React from "react";

function OmniWorkerLogo({ size = 32 }: { size?: number }): React.JSX.Element {
  // SVG original width: 316.00723, height: 110.6771
  // Aspect ratio is 2.855
  const height = size;
  const width = size * 2.855;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 316.00723 110.6771"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <path
        d="m 307.81523,110.6771 h -18.56 v -7.68 h 18.56 V 8.1490873 h -17.408 V 0.46908731 h 17.408 c 6.144,0 8.192,3.07199999 8.192,8.06399999 V 102.6131 c 0,4.992 -2.048,8.064 -8.192,8.064 z"
        fill="var(--neon)"
      />
      <path
        d="M 26.752,110.20799 H 8.1920003 c -6.144,0 -8.19200002383543,-3.072 -8.19200002383543,-8.064 V 8.0639973 C 2.7616457e-7,3.0719973 2.0480003,-2.6961926e-6 8.1920003,-2.6961926e-6 H 25.6 V 7.6799973 H 8.1920003 V 102.52799 H 26.752 Z"
        fill="var(--neon)"
      />
      <text
        xmlSpace="preserve"
        style={{
          fontStyle: "normal",
          fontWeight: "bold",
          fontSize: "100.994px",
          fontFamily: "var(--font-sans), Inter, sans-serif",
          textAnchor: "start",
          fill: "var(--text-primary)",
        }}
        x="24.409439"
        y="90.245857"
      >
        Flux
      </text>
      <text
        xmlSpace="preserve"
        style={{
          fontStyle: "normal",
          fontWeight: 200,
          fontSize: "38.2271px",
          fontFamily: "var(--font-sans), Inter, sans-serif",
          textAnchor: "start",
          fill: "var(--text-primary)",
        }}
        x="203.82901"
        y="75.121979"
      >
        Agent
      </text>
    </svg>
  );
}

export default OmniWorkerLogo;

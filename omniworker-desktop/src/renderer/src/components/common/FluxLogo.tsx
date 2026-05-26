import React from "react";

export function FluxLogo({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 134.88013 134.88013"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <g transform="translate(-528.22167,147.59134)">
        <circle
          style={{ fill: "#0ad062", fillOpacity: 1 }}
          cx="595.66174"
          cy="-80.151283"
          r="67.440063"
        />
        <g transform="matrix(0.72996393,0,0,0.77668143,152.65059,35.658579)">
          <path
            d="m 648.58867,-91.457292 h -18.56 v -7.68 h 18.56 v -94.848018 h -17.408 v -7.68 h 17.408 c 6.144,0 8.192,3.072 8.192,8.064 v 94.080018 c 0,4.992 -2.048,8.064 -8.192,8.064 z"
            fill="#ffffff"
          />
          <path
            d="m 581.52545,-91.926402 h -18.56 c -6.144,0 -8.192,-3.072 -8.192,-8.064 V -194.0704 c 0,-4.992 2.048,-8.064 8.192,-8.064 h 17.408 v 7.68 h -17.408 v 94.847998 h 18.56 z"
            fill="#ffffff"
          />
          <text
            xmlSpace="preserve"
            style={{
              fontStyle: "normal",
              fontVariant: "normal",
              fontWeight: "normal",
              fontStretch: "normal",
              fontSize: "100.994px",
              fontFamily: "Inter, sans-serif",
              textAnchor: "start",
              fill: "#ffffff",
            }}
            x="579.18292"
            y="-111.88854"
          >
            <tspan
              x="579.18292"
              y="-111.88854"
              style={{
                fontStyle: "normal",
                fontVariant: "normal",
                fontWeight: "normal",
                fontStretch: "normal",
                fontSize: "100.994px",
                fontFamily: "Inter, sans-serif",
                fill: "#ffffff",
              }}
            >
              F
            </tspan>
          </text>
        </g>
      </g>
    </svg>
  );
}

export default FluxLogo;

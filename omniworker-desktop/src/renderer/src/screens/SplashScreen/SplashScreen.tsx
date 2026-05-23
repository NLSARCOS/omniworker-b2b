import React, { useEffect, useRef } from "react";
import gsap from "gsap";

interface SplashScreenProps {
  onFinished: () => void;
}

function SplashScreen({ onFinished }: SplashScreenProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const titleBoxRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const flareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Notify onFinished (kept for structure, driven by SPLASH_MIN_MS in App)
    onFinished();

    const tl = gsap.timeline();

    // 1. Initial State resets
    gsap.set(containerRef.current, { opacity: 1 });
    
    // 2. Beautiful cinematic orchestration
    tl.fromTo(
      ringRef.current,
      { scale: 0.3, rotation: -180, opacity: 0, filter: "blur(8px)" },
      { scale: 1, rotation: 0, opacity: 1, filter: "blur(0px)", duration: 1.4, ease: "elastic.out(1, 0.75)" }
    );

    // Continuous smooth rotation for the accent ring
    const rotationTween = gsap.to(ringRef.current, {
      rotation: 360,
      duration: 12,
      repeat: -1,
      ease: "none",
    });

    tl.fromTo(
      titleBoxRef.current,
      { opacity: 0, y: 30, letterSpacing: "-12px", filter: "blur(4px)" },
      { opacity: 1, y: 0, letterSpacing: "5px", filter: "blur(0px)", duration: 1.6, ease: "power4.out" },
      "-=0.9"
    );

    tl.fromTo(
      flareRef.current,
      { left: "-100%" },
      { left: "200%", duration: 1.6, ease: "power3.inOut" },
      "-=1.1"
    );

    tl.fromTo(
      subtitleRef.current,
      { opacity: 0, y: 20 },
      { opacity: 0.7, y: 0, duration: 1.0, ease: "power3.out" },
      "-=1.0"
    );

    // Gorgeous fade-out slide up right before unmounting
    tl.to(
      containerRef.current,
      {
        opacity: 0,
        scale: 0.96,
        y: -10,
        filter: "blur(5px)",
        duration: 0.5,
        ease: "power3.inOut",
      },
      "+=0.2"
    );

    return () => {
      tl.kill();
      rotationTween.kill();
    };
  }, [onFinished]);

  return (
    <div
      style={{
        backgroundColor: "#0e0e11",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Background soft ambient radial lights */}
      <div
        style={{
          position: "absolute",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255, 255, 255, 0.02) 0%, transparent 70%)",
          top: "10%",
          left: "10%",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255, 255, 255, 0.01) 0%, transparent 70%)",
          bottom: "10%",
          right: "10%",
          filter: "blur(50px)",
          pointerEvents: "none",
        }}
      />

      <div
        ref={containerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
        }}
      >
        {/* Glowing Dynamic Ring */}
        <div
          ref={ringRef}
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "transparent",
            position: "relative",
            marginBottom: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 30px rgba(255, 255, 255, 0.1), inset 0 0 15px rgba(255, 255, 255, 0.05)",
          }}
        >
          {/* Circular border wrapper for exact rounded gradients */}
          <div
            style={{
              position: "absolute",
              top: -3,
              left: -3,
              right: -3,
              bottom: -3,
              borderRadius: "50%",
              border: "3px solid transparent",
              background: "linear-gradient(#0e0e11, #0e0e11) padding-box, linear-gradient(135deg, #ffffff, #52525b) border-box",
            }}
          />
          
          {/* Inner Core Bolt Icon */}
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              zIndex: 2,
              filter: "drop-shadow(0 0 6px rgba(255, 255, 255, 0.5))",
            }}
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>

        {/* Text Container with shiny Flare scan overlay */}
        <div
          ref={titleBoxRef}
          style={{
            position: "relative",
            overflow: "hidden",
            padding: "8px 24px",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            borderRadius: "6px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          {/* Shiny flare overlay */}
          <div
            ref={flareRef}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "40%",
              background: "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent)",
              transform: "skewX(-20deg)",
              pointerEvents: "none",
            }}
          />

          <h1
            style={{
              color: "#ffffff",
              fontSize: "36px",
              fontWeight: "900",
              margin: 0,
              fontFamily: "var(--font-sans)",
              textTransform: "uppercase",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            OMNIWORKER
          </h1>
        </div>

        {/* Subtitle */}
        <div
          ref={subtitleRef}
          style={{
            color: "var(--text-secondary, #a1a1aa)",
            marginTop: "16px",
            fontSize: "12px",
            fontWeight: "600",
            fontFamily: "var(--font-mono)",
            letterSpacing: "4px",
            textTransform: "uppercase",
            opacity: 0.7,
            textAlign: "center",
          }}
        >
          AGENT-AS-A-SERVICE · B2B
        </div>
      </div>

      {/* Decorative fine-line border stitch */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          right: "20px",
          bottom: "20px",
          border: "1px dashed rgba(255, 255, 255, 0.03)",
          pointerEvents: "none",
          borderRadius: "16px",
        }}
      />
    </div>
  );
}

export default SplashScreen;

/**
 * SmartEdu LMS — AI-Themed Hero Banner (Visual Concept & Showcase Demo)
 * 
 * NOTE TO REVIEWERS / SUPERVISORS:
 * This component is a visual concept and demo showcase component. It demonstrates
 * modern 2026 motion design, glassmorphic UI, and interactive 3D WebGL visuals using
 * Three.js. It is isolated from core LMS database logic and authentication state.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { useTheme } from "../context/ThemeContext";
import { C } from "../theme";

export default function AIHeroBanner({ onGetStarted }) {
  const mountRef = useRef(null);
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const container = mountRef.current;
    if (!container) return;

    // 1. Motion Preference Check
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 2. Three.js Scene Setup
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.top = "0";
    renderer.domElement.style.left = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.pointerEvents = "none";
    container.appendChild(renderer.domElement);

    // 3. Geometries & Materials (3D Academic LMS AI Knowledge Matrix)
    const coreColor = isDark ? 0x111827 : 0xffffff;
    const accentColor = isDark ? 0xef4444 : 0xd62828;
    const ringColor = isDark ? 0xe2e8f0 : 0x475569;
    const particleColor = isDark ? 0xff2e4c : 0xd62828;

    // Main 3D Group for Academic Knowledge Matrix
    const lmsGroup = new THREE.Group();
    scene.add(lmsGroup);

    // Central 3D AI Gem Core (Octahedron Geometry)
    const coreGeo = new THREE.OctahedronGeometry(1.1, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: coreColor,
      metalness: isDark ? 0.85 : 0.4,
      roughness: isDark ? 0.15 : 0.25,
      flatShading: true,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    lmsGroup.add(coreMesh);

    // Glowing Wireframe Outer Intelligence Shell
    const shellGeo = new THREE.IcosahedronGeometry(1.7, 1);
    const shellMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      wireframe: true,
      transparent: true,
      opacity: isDark ? 0.28 : 0.35,
    });
    const shellMesh = new THREE.Mesh(shellGeo, shellMat);
    lmsGroup.add(shellMesh);

    // Concentric Knowledge Orbital Ring 1 (Course Modules Pipeline)
    const ring1Geo = new THREE.TorusGeometry(2.0, 0.035, 16, 100);
    const ring1Mat = new THREE.MeshStandardMaterial({
      color: accentColor,
      metalness: 0.9,
      roughness: 0.1,
    });
    const ring1Mesh = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1Mesh.rotation.x = Math.PI / 3;
    ring1Mesh.rotation.y = Math.PI / 6;
    lmsGroup.add(ring1Mesh);

    // Concentric Knowledge Orbital Ring 2 (Syllabus & Vector RAG Pipeline)
    const ring2Geo = new THREE.TorusGeometry(2.5, 0.025, 16, 100);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: ringColor,
      metalness: 0.8,
      roughness: 0.2,
    });
    const ring2Mesh = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2Mesh.rotation.x = -Math.PI / 4;
    ring2Mesh.rotation.z = Math.PI / 5;
    lmsGroup.add(ring2Mesh);

    // Orbiting 3D RAG Data Nodes (Lectures, Assignments, Rubrics, Analytics)
    const nodeCount = 6;
    const nodeMeshes = [];
    const nodeAngles = [];
    const nodeRadii = [2.0, 2.0, 2.0, 2.5, 2.5, 2.5];

    const nodeGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      metalness: 0.9,
      roughness: 0.1,
      emissive: accentColor,
      emissiveIntensity: isDark ? 0.6 : 0.2,
    });

    for (let i = 0; i < nodeCount; i++) {
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      lmsGroup.add(node);
      nodeMeshes.push(node);
      nodeAngles.push((i * Math.PI * 2) / nodeCount);
    }

    // Particle Constellation Halo
    const particleCount = 300;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      const radius = 2.8 + Math.random() * 2.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      particlePositions[i] = radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePositions[i + 2] = radius * Math.cos(phi);
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: particleColor,
      size: isDark ? 0.045 : 0.038,
      transparent: true,
      opacity: isDark ? 0.75 : 0.55,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);

    // 4. Duotone Lighting (Crimson Red & Metallic Silver)
    const ambientLight = new THREE.AmbientLight(isDark ? 0x222222 : 0xcccccc, isDark ? 1.2 : 2.0);
    scene.add(ambientLight);

    const crimsonLight = new THREE.PointLight(isDark ? 0xef4444 : 0xd62828, isDark ? 4.5 : 3.5, 20);
    crimsonLight.position.set(4, 3, 5);
    scene.add(crimsonLight);

    const silverLight = new THREE.PointLight(isDark ? 0xffffff : 0x475569, isDark ? 3.0 : 2.5, 20);
    silverLight.position.set(-5, -4, 3);
    scene.add(silverLight);

    // Position adjustment based on aspect ratio
    const updatePosition = () => {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        lmsGroup.position.set(0, 0.4, 0);
        particleSystem.position.set(0, 0.4, 0);
      } else {
        lmsGroup.position.set(2.2, 0, 0);
        particleSystem.position.set(2.2, 0, 0);
      }
    };
    updatePosition();

    // 5. Mouse Parallax & Animation Loop
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    let animId = null;
    let isTabVisible = true;

    const handleMouseMove = (e) => {
      if (prefersReducedMotion) return;
      const windowHalfX = window.innerWidth / 2;
      const windowHalfY = window.innerHeight / 2;
      mouseX = (e.clientX - windowHalfX) / windowHalfX;
      mouseY = (e.clientY - windowHalfY) / windowHalfY;
    };

    window.addEventListener("mousemove", handleMouseMove);

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
      updatePosition();
    };
    window.addEventListener("resize", handleResize);

    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (!isTabVisible) return;

      const elapsedTime = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        // Rotate Central AI Core & Shell
        coreMesh.rotation.x = elapsedTime * 0.4;
        coreMesh.rotation.y = elapsedTime * 0.5;

        shellMesh.rotation.x = -elapsedTime * 0.2;
        shellMesh.rotation.y = -elapsedTime * 0.25;

        // Rotate Knowledge Orbital Rings
        ring1Mesh.rotation.z = elapsedTime * 0.3;
        ring2Mesh.rotation.x = elapsedTime * 0.2;

        // Orbit 3D Data Nodes
        for (let i = 0; i < nodeCount; i++) {
          const speed = i % 2 === 0 ? 0.6 : -0.4;
          const currentAngle = nodeAngles[i] + elapsedTime * speed;
          const r = nodeRadii[i];
          if (i < 3) {
            nodeMeshes[i].position.set(
              r * Math.cos(currentAngle),
              r * Math.sin(currentAngle) * Math.sin(Math.PI / 3),
              r * Math.sin(currentAngle) * Math.cos(Math.PI / 3)
            );
          } else {
            nodeMeshes[i].position.set(
              r * Math.cos(currentAngle) * Math.cos(Math.PI / 4),
              r * Math.sin(currentAngle),
              r * Math.cos(currentAngle) * Math.sin(Math.PI / 4)
            );
          }
        }

        particleSystem.rotation.y = elapsedTime * 0.08;

        // Smooth camera lerp
        targetX += (mouseX * 0.8 - targetX) * 0.05;
        targetY += (-mouseY * 0.8 - targetY) * 0.05;
        camera.position.x = targetX;
        camera.position.y = targetY;
        camera.lookAt(scene.position);
      }

      renderer.render(scene, camera);
    };

    animate();

    // 6. Cleanup on Unmount
    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      coreGeo.dispose();
      coreMat.dispose();
      shellGeo.dispose();
      shellMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();
    };
  }, [isDark]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: "88vh",
        background: isDark ? "#090D16" : "#F8F9FA",
        color: isDark ? "#FFFFFF" : "#0F172A",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        transition: "background 0.2s ease, color 0.2s ease",
      }}
    >
      {/* ── Keyframe Animations String Injection (Scoped to Hero) ── */}
      <style>{`
        @keyframes glowPulse {
          0%, 100% { opacity: ${isDark ? "0.4" : "0.25"}; transform: scale(1); }
          50% { opacity: ${isDark ? "0.7" : "0.45"}; transform: scale(1.08); }
        }
        @keyframes textShimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      {/* Background Ambient Glow Halo (Crimson Red Accent) */}
      <div
        style={{
          position: "absolute",
          top: "-15%",
          right: "-10%",
          width: "55vw",
          height: "55vw",
          maxWidth: "700px",
          maxHeight: "700px",
          background: isDark
            ? "radial-gradient(circle, rgba(239,68,68,0.22) 0%, rgba(255,46,76,0.06) 50%, rgba(0,0,0,0) 75%)"
            : "radial-gradient(circle, rgba(214,40,40,0.12) 0%, rgba(239,68,68,0.04) 50%, rgba(255,255,255,0) 75%)",
          borderRadius: "50%",
          pointerEvents: "none",
          animation: "glowPulse 8s ease-in-out infinite",
          zIndex: 0,
        }}
      />

      {/* ── Glassmorphic Top Navigation Header ── */}
      <header
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 28px",
          borderBottom: `1px solid ${isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"}`,
          background: isDark ? "rgba(9, 13, 22, 0.75)" : "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "7px",
              background: "#EF4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 14px rgba(239, 68, 68, 0.4)",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: "800", color: "#ffffff" }}>SE</span>
          </div>
          <div>
            <span style={{ fontSize: "14px", fontWeight: "700", letterSpacing: "0.04em", color: isDark ? "#FFFFFF" : "#0F172A" }}>
              SmartEdu
            </span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: "700",
                color: "#EF4444",
                background: "rgba(239,68,68,0.15)",
                padding: "2px 6px",
                borderRadius: "4px",
                marginLeft: "8px",
                letterSpacing: "0.06em",
              }}
            >
              AI 2026
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="btn-interactive"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "20px",
              background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"}`,
              color: isDark ? "#FFFFFF" : "#0F172A",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <i className={`ti ${isDark ? "ti-sun" : "ti-moon"}`} style={{ fontSize: "15px", color: isDark ? "#F59E0B" : "#6366F1" }} />
            <span>{isDark ? "Light" : "Dark"}</span>
          </button>

          <button
            onClick={() => navigate("/login")}
            className="btn-interactive"
            style={{
              padding: "7px 16px",
              borderRadius: "7px",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`,
              background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
              color: isDark ? "#ffffff" : "#0F172A",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s ease",
            }}
          >
            Sign In
          </button>
          <button
            onClick={onGetStarted || (() => navigate("/login"))}
            className="btn-interactive"
            style={{
              padding: "8px 18px",
              borderRadius: "7px",
              border: "none",
              background: "#EF4444",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 4px 16px rgba(239, 68, 68, 0.4)",
              transition: "all 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>Get Started</span>
            <i className="ti ti-arrow-right" style={{ fontSize: "14px" }} />
          </button>
        </div>
      </header>

      {/* ── Main Hero Content Grid ── */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          flex: 1,
          maxWidth: "1280px",
          width: "100%",
          margin: "0 auto",
          padding: "clamp(30px, 6vw, 60px) clamp(20px, 5vw, 48px)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "40px",
          alignItems: "center",
        }}
      >
        {/* Left Headline & Content */}
        <div style={{ opacity: isMounted ? 1 : 0, transform: isMounted ? "none" : "translateY(16px)", transition: "opacity 0.6s ease, transform 0.6s ease" }}>
          
          {/* Badge pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 13px",
              borderRadius: "20px",
              background: isDark ? "rgba(239, 68, 68, 0.12)" : "rgba(214, 40, 40, 0.08)",
              border: `1px solid ${isDark ? "rgba(239, 68, 68, 0.3)" : "rgba(214, 40, 40, 0.25)"}`,
              marginBottom: "20px",
            }}
          >
            <i className="ti ti-sparkles" style={{ fontSize: "14px", color: "#EF4444" }} />
            <span style={{ fontSize: "12px", fontWeight: "700", color: isDark ? "#F8FAFC" : "#1E293B", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Next-Gen Academic Intelligence
            </span>
          </div>

          {/* Main Title */}
          <h1
            style={{
              fontSize: "clamp(32px, 5vw, 54px)",
              fontWeight: "800",
              lineHeight: "1.12",
              letterSpacing: "-0.03em",
              margin: "0 0 18px",
              color: isDark ? "#FFFFFF" : "#0F172A",
            }}
          >
            Empowering Higher Ed with{" "}
            <span
              style={{
                display: "inline-block",
                background: isDark
                  ? "linear-gradient(135deg, #FFFFFF 0%, #EF4444 60%, #FF2E4C 100%)"
                  : "linear-gradient(135deg, #D62828 0%, #B91C1C 60%, #991B1B 100%)",
                backgroundSize: "200% 200%",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: isDark ? "#EF4444" : "#D62828",
                animation: "textShimmer 6s ease infinite",
              }}
            >
              Real-Time AI RAG & Analytics
            </span>
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: "clamp(15px, 2vw, 17px)",
              lineHeight: "1.65",
              color: isDark ? "#94A3B8" : "#475569",
              margin: "0 0 32px",
              maxWidth: "540px",
            }}
          >
            Experience automated assignment evaluation, instant course-material Q&A, plagiarism verification, and predictive student analytics in one high-performance platform.
          </p>

          {/* CTA Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/login")}
              className="btn-interactive"
              style={{
                padding: "13px 26px",
                borderRadius: "8px",
                border: "none",
                background: "#EF4444",
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: "700",
                fontFamily: "inherit",
                cursor: "pointer",
                boxShadow: "0 6px 24px rgba(239, 68, 68, 0.45)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <i className="ti ti-rocket" style={{ fontSize: "18px" }} />
              Launch LMS Portal
            </button>

            <button
              onClick={() => navigate("/login")}
              className="btn-interactive"
              style={{
                padding: "13px 22px",
                borderRadius: "8px",
                border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.15)"}`,
                background: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)",
                color: isDark ? "#F8FAFC" : "#0F172A",
                fontSize: "15px",
                fontWeight: "600",
                fontFamily: "inherit",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <i className="ti ti-device-laptop" style={{ fontSize: "18px" }} />
              Sign In to Account
            </button>
          </div>

          {/* Feature Highlights Row */}
          <div style={{ display: "flex", gap: "24px", marginTop: "40px", paddingTop: "24px", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}` }}>
            <div>
              <span style={{ fontSize: "20px", fontWeight: "800", color: isDark ? "#ffffff" : "#0F172A", display: "block" }}>100%</span>
              <span style={{ fontSize: "11px", color: isDark ? "#94A3B8" : "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: "600" }}>Instant RAG Search</span>
            </div>
            <div>
              <span style={{ fontSize: "20px", fontWeight: "800", color: "#EF4444", display: "block" }}>Auto</span>
              <span style={{ fontSize: "11px", color: isDark ? "#94A3B8" : "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: "600" }}>Rubric Evaluation</span>
            </div>
            <div>
              <span style={{ fontSize: "20px", fontWeight: "800", color: isDark ? "#ffffff" : "#0F172A", display: "block" }}>Multi-N-Gram</span>
              <span style={{ fontSize: "11px", color: isDark ? "#94A3B8" : "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: "600" }}>Plagiarism Scan</span>
            </div>
          </div>
        </div>

        {/* Right Canvas Mount Container */}
        <div
          ref={mountRef}
          style={{
            position: "relative",
            width: "100%",
            height: "clamp(320px, 45vw, 480px)",
            borderRadius: "14px",
          }}
        />
      </div>

      {/* Footer Banner Bar */}
      <footer
        style={{
          position: "relative",
          zIndex: 10,
          padding: "12px 24px",
          borderTop: `1px solid ${isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"}`,
          background: isDark ? "rgba(9, 13, 22, 0.8)" : "rgba(255, 255, 255, 0.85)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "12px",
          color: isDark ? "#94A3B8" : "#64748B",
        }}
      >
        <span>SmartEdu LMS Platform 2026</span>
        <span style={{ color: "#EF4444", fontWeight: "600" }}>Powered by Hybrid RAG & Vector Intelligence</span>
      </footer>
    </div>
  );
}

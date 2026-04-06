import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

export const ParticleLock = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // --- Setup Scene ---
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        renderer.setClearColor(0x000000, 0); 
        container.appendChild(renderer.domElement);

        // --- Create Particles ---
        const count = 35000; 
        const spherePositions = new Float32Array(count * 3);
        const finalPositions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            // --- 1. FINAL LOCK POSITIONS ---
            let fx = 0, fy = 0, fz = 0;
            const rLock = Math.random();
            
            // Distribution: 70% body, 30% shackle
            if (rLock < 0.70) {
                const surface = Math.random();
                const edgeBias = Math.random() < 0.25; // 25% chance to stick exactly to an edge/corner

                if (surface < 0.4) {
                    // Front and Back faces
                    fx = (Math.random() - 0.5) * 2.8;
                    fy = (Math.random() - 0.8) * 2.2;
                    fz = edgeBias ? (Math.random() > 0.5 ? 0.4 : -0.4) : (Math.random() > 0.5 ? 0.4 : -0.4);
                    
                    if (edgeBias) {
                        // Snap to rectangle borders
                        if (Math.random() < 0.5) fx = (Math.random() > 0.5 ? 1.4 : -1.4);
                        else fy = (Math.random() < 0.5 ? -1.76 : 0.44);
                    }
                } else if (surface < 0.75) {
                    // Side faces
                    fx = (Math.random() > 0.5 ? 1.4 : -1.4);
                    fy = (Math.random() - 0.8) * 2.2;
                    fz = (Math.random() - 0.5) * 0.8;
                    
                    if (edgeBias) {
                        if (Math.random() < 0.5) fy = (Math.random() < 0.5 ? -1.76 : 0.44);
                        else fz = (Math.random() > 0.5 ? 0.4 : -0.4);
                    }
                } else {
                    // Top and Bottom faces
                    fx = (Math.random() - 0.5) * 2.8;
                    fy = (Math.random() < 0.5 ? -1.76 : 0.44);
                    fz = (Math.random() - 0.5) * 0.8;

                    if (edgeBias) {
                        if (Math.random() < 0.5) fx = (Math.random() > 0.5 ? 1.4 : -1.4);
                        else fz = (Math.random() > 0.5 ? 0.4 : -0.4);
                    }
                }

                // Keyhole subtraction & edge definition
                const ky = fy + 0.7;
                const kx = fx;
                const radius = 0.22;
                const inCircle = (kx*kx + ky*ky) < radius*radius;
                const inFlared = ky < 0 && ky > -0.5 && Math.abs(kx) < (0.08 + Math.abs(ky) * 0.4);
                
                if (inCircle || inFlared) {
                    const angle = Math.random() * Math.PI * 2;
                    const isKeyholeEdge = Math.random() < 0.4;
                    if (isKeyholeEdge) {
                        // More particles exactly on the keyhole outline
                        fx = Math.cos(angle) * (radius + 0.005);
                        fy = Math.sin(angle) * (radius + 0.005) - 0.7;
                    } else {
                        // Push away from volume
                        if (Math.random() > 0.3) {
                            fx = Math.cos(angle) * (radius + 0.02);
                            fy = Math.sin(angle) * (radius + 0.02) - 0.7;
                        } else {
                            const ty = -Math.random() * 0.5;
                            const tw = 0.08 + Math.abs(ty) * 0.4;
                            fx = (Math.random() < 0.5 ? tw + 0.01 : -(tw + 0.01));
                            fy = ty - 0.7;
                        }
                    }
                }
            } else {
                // --- SHACKLE (Arch) ---
                const angle = Math.random() * Math.PI;
                const edgeBias = Math.random() < 0.4; // 40% chance to be on inner or outer edge
                const radius = edgeBias 
                    ? (Math.random() > 0.5 ? 1.0 : 1.3)
                    : 1.0 + (Math.random() * 0.3);
                
                fx = Math.cos(angle) * radius;
                fy = Math.sin(angle) * radius + 0.4;
                fz = (Math.random() - 0.5) * 0.4;
            }
            finalPositions[i * 3] = fx;
            finalPositions[i * 3 + 1] = fy;
            finalPositions[i * 3 + 2] = fz;

            // --- 2. INITIAL SPHERE POSITIONS ---
            let sx = 0, sy = 0, sz = 0;
            if (i < count * 0.70) {
                const phi = Math.acos(-1 + (2 * Math.random()));
                const theta = Math.random() * Math.PI * 2;
                const rad = 0.12 * Math.pow(Math.random(), 0.5);
                sx = rad * Math.sin(phi) * Math.cos(theta);
                sy = rad * Math.sin(phi) * Math.sin(theta);
                sz = rad * Math.cos(phi);
            } else {
                const phi = Math.acos(-1 + (2 * Math.random()));
                const theta = Math.random() * Math.PI * 2;
                const rad = 0.4 + (Math.random() * 0.15);
                sx = rad * Math.sin(phi) * Math.cos(theta);
                sy = rad * Math.sin(phi) * Math.sin(theta);
                sz = rad * Math.cos(phi);
            }
            spherePositions[i * 3] = sx;
            spherePositions[i * 3 + 1] = sy;
            spherePositions[i * 3 + 2] = sz;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(spherePositions), 3));

        const material = new THREE.PointsMaterial({
            size: 0.022,
            color: 0x00f2ff,
            transparent: true,
            opacity: 0.5,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geometry, material);
        points.position.y = 0.25; // Adjusted down slightly (approx 15px) for better centering
        points.scale.set(0.9, 0.9, 0.9); // Reduced slightly (0.9x) to prevent top clipping
        scene.add(points);

        // --- Multi-stage Transition Controls ---
        const timeline = { 
            assemble: 0,
            innerScale: 1,
            outerScale: 1,
            rotationSpeed: 0.003
        };

        const handleMouseEnter = () => {
            const tl = gsap.timeline();
            
            // Step 1: Spin up small spheres (0.5s)
            tl.to(timeline, {
                rotationSpeed: 0.07,
                duration: 0.5,
                ease: "power2.in"
            });

            // Step 2 & 3: Parallel growth (starts at 0.5s)
            tl.add("expansion");

            // Constant (linear) growth for inner sphere (2.0s duration)
            tl.to(timeline, {
                innerScale: 13.75,
                duration: 2.0,
                ease: "none"
            }, "expansion");

            // Outer sphere expansion (0.8s duration)
            tl.to(timeline, {
                outerScale: 3.0,
                duration: 0.8,
                ease: "power2.out"
            }, "expansion");

            // Step 4: Final assembly into Lock (Starts at 2.6s)
            // 0.5s (Step 1) + 2.0s (Expansion) + 0.1s (Pause) = 2.6s
            tl.to(timeline, {
                assemble: 1,
                innerScale: 1,
                outerScale: 1,
                rotationSpeed: 0.003,
                duration: 1.4,
                ease: "power4.inOut"
            }, "expansion+=2.1"); // Total timeline duration = 4.0s
        };

        container.addEventListener('mouseenter', handleMouseEnter, { once: true });

        // --- Resize Observer ---
        const resizeObserver = new ResizeObserver((entries) => {
            if (!entries.length) return;
            const { width, height } = entries[0].contentRect;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        });
        resizeObserver.observe(container);

        // --- Animation Loop ---
        let animationFrameId: number;
        const animate = (time: number) => {
            animationFrameId = requestAnimationFrame(animate);

            const posAttr = geometry.attributes.position;
            const posArray = posAttr.array as Float32Array;
            
            const a = timeline.assemble;
            const is = timeline.innerScale;
            const os = timeline.outerScale;

            for (let i = 0; i < count; i++) {
                const i3 = i * 3;
                
                // Which sphere?
                const s = (i < count * 0.8) ? is : os;

                // Base drift
                const drift = Math.sin(time * 0.001 + i) * (1 - a) * 0.02;

                // Lerp from Scaled Sphere to Final Lock
                posArray[i3] = (spherePositions[i3] * s) * (1 - a) + finalPositions[i3] * a + drift;
                posArray[i3+1] = (spherePositions[i3+1] * s) * (1 - a) + finalPositions[i3+1] * a + drift;
                posArray[i3+2] = (spherePositions[i3+2] * s) * (1 - a) + finalPositions[i3+2] * a;
            }
            posAttr.needsUpdate = true;

            points.rotation.y += timeline.rotationSpeed;
            renderer.render(scene, camera);
        };
        animate(0);

        // --- Cleanup ---
        return () => {
            container.removeEventListener('mouseenter', handleMouseEnter);
            resizeObserver.disconnect();
            cancelAnimationFrame(animationFrameId);
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            geometry.dispose();
            material.dispose();
            renderer.dispose();
        };
    }, []);

    return (
        <div ref={containerRef} className="w-full h-full cursor-none" />
    );
};
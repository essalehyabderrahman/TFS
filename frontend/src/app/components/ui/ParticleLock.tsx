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
        renderer.domElement.style.outline = 'none';
        renderer.domElement.style.border = 'none';
        container.appendChild(renderer.domElement);

        // --- Create Particles ---
        const count = 35000;
        const spherePositions = new Float32Array(count * 3);
        const finalPositions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            // --- 1. FINAL LOCK POSITIONS ---
            let fx = 0, fy = 0, fz = 0;
            const rLock = Math.random();

            if (rLock < 0.70) {
                // --- BODY (70%) ---
                const pType = Math.random();
                let tx = 0, ty = 0, tz = 0;

                if (pType < 0.15) {
                    // 15% sparse interior
                    tx = (Math.random() - 0.5) * 2.8;      // ±1.4
                    ty = -1.4 + Math.random() * 1.84;      // -1.4 to 0.44
                    tz = (Math.random() - 0.5) * 0.60;     // ±0.30
                } else if (pType < 0.45) {
                    // 30% on edges
                    const face = Math.random();
                    if (face < 0.33) {
                        // Front/Back vertical edges
                        tx = Math.random() > 0.5 ? 1.4 : -1.4;
                        ty = -1.4 + Math.random() * 1.84;
                        tz = Math.random() > 0.5 ? 0.35 : -0.35;
                    } else if (face < 0.66) {
                        // Top/Bottom horizontal edges
                        tx = (Math.random() - 0.5) * 2.8;
                        ty = Math.random() > 0.5 ? 0.44 : -1.4;
                        tz = Math.random() > 0.5 ? 0.35 : -0.35;
                    } else {
                        // Side horizontal edges
                        tx = Math.random() > 0.5 ? 1.4 : -1.4;
                        ty = Math.random() > 0.5 ? 0.44 : -1.4;
                        tz = (Math.random() - 0.5) * 0.70;
                    }
                } else {
                    // 55% outer surface faces
                    const face = Math.random();
                    if (face < 0.40) {
                        // Front and Back faces
                        tx = (Math.random() - 0.5) * 2.8;
                        ty = -1.4 + Math.random() * 1.84;
                        tz = Math.random() > 0.5 ? 0.35 : -0.35;
                    } else if (face < 0.75) {
                        // Side faces
                        tx = Math.random() > 0.5 ? 1.4 : -1.4;
                        ty = -1.4 + Math.random() * 1.84;
                        tz = (Math.random() - 0.5) * 0.70;
                    } else {
                        // Top and Bottom faces
                        tx = (Math.random() - 0.5) * 2.8;
                        ty = Math.random() > 0.5 ? 0.44 : -1.4;
                        tz = (Math.random() - 0.5) * 0.70;
                    }
                }

                fx = tx; fy = ty; fz = tz;

                // Keyhole Subtraction
                const kc_y = -0.55;
                const kc_r = 0.18;
                const slot_w = 0.07;
                const slot_y_top = -0.55;
                const slot_y_bot = -1.05;

                const inCircle = (fx * fx + Math.pow(fy - kc_y, 2)) < (kc_r * kc_r);
                const inSlot = Math.abs(fx) < slot_w && fy <= slot_y_top && fy >= slot_y_bot;

                if (inCircle || inSlot) {
                    const placement = Math.random();
                    if (placement < 0.35) {
                        // Circle outline
                        const angle = Math.random() * Math.PI * 2;
                        fx = Math.cos(angle) * (kc_r + 0.006);
                        fy = kc_y + Math.sin(angle) * (kc_r + 0.006);
                        fz = Math.random() < 0.5 ? 0.34 : -0.34;
                    } else if (placement < 0.55) {
                        // Slot vertical edges — both front and back faces
                        fx = Math.random() < 0.5 ? (slot_w + 0.004) : -(slot_w + 0.004);
                        fy = slot_y_bot + Math.random() * (slot_y_top - slot_y_bot);
                        fz = Math.random() < 0.5 ? 0.34 : -0.34;
                    } else if (placement < 0.65) {
                        // Slot bottom edge — both faces
                        fx = -slot_w + Math.random() * (2 * slot_w);
                        fy = slot_y_bot - 0.004;
                        fz = Math.random() < 0.5 ? 0.34 : -0.34;
                    } else {
                        // Relocate via rejection sampling
                        const excl_r = kc_r + 0.04;
                        const excl_slot_w = slot_w + 0.04;
                        const excl_slot_y_top = slot_y_top + 0.02;
                        const excl_slot_y_bot = slot_y_bot - 0.04;

                        let placed = false;
                        for (let attempt = 0; attempt < 20; attempt++) {
                            const bx = (Math.random() - 0.5) * 2.8;
                            const by = -1.4 + Math.random() * 1.84;
                            const bz = Math.random() > 0.5 ? 0.35 : -0.35;
                            const tInCircle = (bx * bx + Math.pow(by - kc_y, 2)) < (excl_r * excl_r);
                            const tInSlot = Math.abs(bx) < excl_slot_w && by <= excl_slot_y_top && by >= excl_slot_y_bot;
                            if (!tInCircle && !tInSlot) {
                                fx = bx; fy = by; fz = bz;
                                placed = true;
                                break;
                            }
                        }
                        if (!placed) {
                            fx = (Math.random() - 0.5) * 2.0;
                            fy = 0.15 + Math.random() * 0.2;
                            fz = 0.35;
                        }
                    }
                }

                // Corner Rounding
                const RX = 1.4;
                const RY_TOP = 0.44;
                const RY_BOT = -1.4;
                const CR = 0.30;

                const nearXEdge = Math.abs(fx) > RX - CR;
                const nearTopEdge = fy > RY_TOP - CR;
                const nearBotEdge = fy < RY_BOT + CR;

                if (nearXEdge && (nearTopEdge || nearBotEdge)) {
                    const signX = fx > 0 ? 1 : -1;
                    const ccx = signX * (RX - CR);
                    const ccy = nearTopEdge ? (RY_TOP - CR) : (RY_BOT + CR);
                    const dx = fx - ccx;
                    const dy = fy - ccy;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > CR) {
                        const angle = Math.atan2(dy, dx);
                        fx = ccx + Math.cos(angle) * (CR - Math.random() * 0.02);
                        fy = ccy + Math.sin(angle) * (CR - Math.random() * 0.02);
                    }
                }
            } else {
                // --- SHACKLE (30%) ---
                // Base tube shape parameters (cross-section)
                const angleTube = Math.random() * Math.PI * 2;
                const rTube = Math.sqrt(Math.random()) * 0.15;
                const offsetR = Math.cos(angleTube) * rTube;
                const offsetZ = Math.sin(angleTube) * rTube;

                if (Math.random() < 0.06) {
                    // Extra density at entry points (joint overlap)
                    const xSign = Math.random() < 0.5 ? 1 : -1;
                    fx = xSign * (1.0 + offsetR);
                    fy = 0.44 + (Math.random() * 0.04 - 0.02);
                    fz = offsetZ;
                } else if (Math.random() < 0.82) {
                    // Arch (upper semicircle)
                    const archAng = Math.random() * Math.PI;
                    const R = 1.0 + offsetR;
                    fx = Math.cos(archAng) * R;
                    fy = Math.sin(archAng) * R + 0.79;
                    fz = offsetZ;
                } else {
                    // Legs (straight descending into body)
                    const xSign = Math.random() < 0.5 ? 1 : -1;
                    const R = 1.0 + offsetR;
                    fx = xSign * R;
                    fy = 0.44 + Math.random() * 0.35; // 0.44 to 0.79
                    fz = offsetZ;
                }
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

        // Two-layer lock materials
        const material1 = new THREE.PointsMaterial({
            size: 0.018,
            color: 0x00f2ff,
            transparent: true,
            opacity: 0.5,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const material2 = new THREE.PointsMaterial({
            size: 0.008,
            color: 0x00f2ff,
            transparent: true,
            opacity: 0.25,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points1 = new THREE.Points(geometry, material1);
        const points2 = new THREE.Points(geometry, material2);

        const pointsGroup = new THREE.Group();
        pointsGroup.add(points1);
        pointsGroup.add(points2);
        pointsGroup.position.y = -0.20;
        pointsGroup.scale.set(0.9, 0.9, 0.9);
        scene.add(pointsGroup);

        // --- 3. STRAY PARTICLES LOGIC ---
        const strayCount = 200;
        const strayPositions = new Float32Array(strayCount * 3);
        const strayOffsets = new Float32Array(strayCount);
        const strayInitialY = new Float32Array(strayCount);

        for (let i = 0; i < strayCount; i++) {
            const phi = Math.acos(-1 + (2 * Math.random()));
            const theta = Math.random() * Math.PI * 2;
            const rad = 2.5 + Math.random() * 1.0;
            strayPositions[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
            strayPositions[i * 3 + 1] = rad * Math.sin(phi) * Math.sin(theta);
            strayPositions[i * 3 + 2] = rad * Math.cos(phi);

            strayOffsets[i] = Math.random() * Math.PI * 2;
            strayInitialY[i] = strayPositions[i * 3 + 1];
        }

        const strayGeo = new THREE.BufferGeometry();
        strayGeo.setAttribute('position', new THREE.BufferAttribute(strayPositions, 3));
        const strayMat = new THREE.PointsMaterial({
            size: 0.012,
            color: 0x00f2ff,
            transparent: true,
            opacity: 0.15,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const strayPoints = new THREE.Points(strayGeo, strayMat);
        scene.add(strayPoints);

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
            tl.to(timeline, {
                assemble: 1,
                innerScale: 1,
                outerScale: 1,
                rotationSpeed: 0.003,
                duration: 1.4,
                ease: "power4.inOut"
            }, "expansion+=2.1");
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
                const s = (i < count * 0.70) ? is : os;

                // Base drift for initial spheres
                const drift = Math.sin(time * 0.001 + i) * (1 - a) * 0.02;

                // Lerp from Scaled Sphere to Final Lock
                posArray[i3] = (spherePositions[i3] * s) * (1 - a) + finalPositions[i3] * a + drift;
                posArray[i3 + 1] = (spherePositions[i3 + 1] * s) * (1 - a) + finalPositions[i3 + 1] * a + drift;
                posArray[i3 + 2] = (spherePositions[i3 + 2] * s) * (1 - a) + finalPositions[i3 + 2] * a;
            }
            posAttr.needsUpdate = true;

            // Group transform & opacity animations
            if (timeline.assemble >= 0.99) {
                material1.opacity = 0.55 + Math.sin(time * 0.0007) * 0.10;
                pointsGroup.position.y = Math.sin(time * 0.0005) * 0.04 - 0.20;
            } else {
                pointsGroup.position.y = -0.20;
                material1.opacity = 0.5;
            }

            pointsGroup.rotation.y += timeline.rotationSpeed;

            // Fixed drifting stray particles update
            const sgPos = strayGeo.attributes.position;
            const sgArr = sgPos.array as Float32Array;
            for (let i = 0; i < strayCount; i++) {
                const driftY = Math.sin(time * 0.001 + strayOffsets[i]) * 0.1;
                sgArr[i * 3 + 1] = strayInitialY[i] + driftY;
            }
            sgPos.needsUpdate = true;

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
            strayGeo.dispose();
            material1.dispose();
            material2.dispose();
            strayMat.dispose();
            renderer.dispose();
        };
    }, []);

    return (
        <div ref={containerRef} className="w-full h-full cursor-none" />
    );
};
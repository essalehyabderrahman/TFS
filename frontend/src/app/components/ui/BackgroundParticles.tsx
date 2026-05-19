import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const BackgroundParticles = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.style.outline = 'none';
        renderer.domElement.style.border = 'none';
        container.appendChild(renderer.domElement);

        // --- Create Ambient Particles ---
        const isMobileOrTablet = window.innerWidth < 1024;
        const count = isMobileOrTablet ? 2500 : 5000;
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);

        const getRandomZ = () => {
            const r = Math.random();
            if (r < 0.10) {
                // Far/high boundary of this range (10% probability): Z between 4.4 and 4.7
                return 4.4 + Math.random() * 0.3;
            } else if (r < 0.30) {
                // Medium boundary of this range (20% probability): Z between 4 and 4.4
                return 4 + Math.random() * 0.4;
            } else {
                // Remaining range (70% probability): Z between 3 and 4
                return 3.7 + Math.random() * 1.0;
            }
        };

        for (let i = 0; i < count; i++) {
            // Distribute across a large 3D area to cover full viewport
            positions[i * 3] = (Math.random() - 0.5) * 35;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
            positions[i * 3 + 2] = getRandomZ();

            // Subtle random velocities
            velocities[i * 3] = (Math.random() - 0.5) * 0.012;
            velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.012;
            velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            size: 0.018,
            color: 0x00f2ff,
            transparent: true,
            opacity: 0.2, // Increased for global background
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geometry, material);
        scene.add(points);

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

            for (let i = 0; i < count; i++) {
                const i3 = i * 3;
                
                // Move based on velocity + slight time-based noise for "randomness"
                posArray[i3] += velocities[i3] + Math.sin(time * 0.0005 + i) * 0.001;
                posArray[i3+1] += velocities[i3+1] + Math.cos(time * 0.0005 + i) * 0.001;
                posArray[i3+2] += velocities[i3+2];

                // Boundary recycling for depth (Z)
                // If particles go out of the active depth field, recycle them at a new random position
                if (posArray[i3+2] < 3 || posArray[i3+2] > 4.7) {
                    posArray[i3] = (Math.random() - 0.5) * 35;
                    posArray[i3+1] = (Math.random() - 0.5) * 20;
                    posArray[i3+2] = getRandomZ();
                    
                    // Re-randomize velocity so it behaves differently
                    velocities[i3] = (Math.random() - 0.5) * 0.012;
                    velocities[i3+1] = (Math.random() - 0.5) * 0.012;
                    velocities[i3+2] = (Math.random() - 0.5) * 0.01;
                }

                // Boundary wrapping for horizontal and vertical space (X & Y)
                if (posArray[i3] > 17.5) posArray[i3] = -17.5;
                if (posArray[i3] < -17.5) posArray[i3] = 17.5;
                if (posArray[i3+1] > 10) posArray[i3+1] = -10;
                if (posArray[i3+1] < -10) posArray[i3+1] = 10;
            }
            posAttr.needsUpdate = true;

            renderer.render(scene, camera);
        };
        animate(0);

        return () => {
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

    return <div ref={containerRef} className="w-full h-full" />;
};

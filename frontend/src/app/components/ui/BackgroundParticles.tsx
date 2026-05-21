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
        container.appendChild(renderer.domElement);

        // --- Create Ambient Particles ---
        const isMobileOrTablet = window.innerWidth < 1024;
        const count = isMobileOrTablet ? 5000 : 15000;
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            // Distribute across a large 3D area to cover full viewport
            positions[i * 3] = (Math.random() - 0.5) * 35;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 15;

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

                // Boundary wrapping (X)
                if (posArray[i3] > 10) posArray[i3] = -10;
                if (posArray[i3] < -10) posArray[i3] = 10;
                // Boundary wrapping (Y)
                if (posArray[i3+1] > 6) posArray[i3+1] = -6;
                if (posArray[i3+1] < -6) posArray[i3+1] = 6;
            }
            posAttr.needsUpdate = true;

            points.rotation.y += 0.0005; // Extremely slow overall rotation
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

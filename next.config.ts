/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // 🚫 No interrumpir el build por errores de ESLint
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 🚫 No interrumpir el build por errores de tipo TypeScript
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;

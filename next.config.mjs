/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Gera .next/standalone com só o necessário para rodar (imagem Docker enxuta)
  output: 'standalone',
};

export default nextConfig;

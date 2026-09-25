/** @type {import('next').NextConfig} */
/** const nextConfig = {}; */

/** export default nextConfig; */

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Предупреждение: это позволяет успешно завершить сборку, 
    // даже если есть ошибки ESLint.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
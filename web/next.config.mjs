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
  experimental: {
    // Default Server Action body limit is 1MB, too small for a
    // spreadsheet-shaped compatibility import (TASK-039's
    // previewImport(file) passes the file straight through a Server
    // Action, not via a Vercel Blob token). Matches this file's own
    // MAX_FILE_SIZE_BYTES.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
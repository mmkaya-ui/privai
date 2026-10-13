/** @type {import('next').NextConfig} */
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
    swSrc: "src/app/sw.ts",
    swDest: "public/sw.js",
    disable: process.env.NODE_ENV === "development",
    maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
});

const nextConfig = {
    // Other config...
};

export default withSerwist(nextConfig);
